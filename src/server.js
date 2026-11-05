'use strict';
const express=require('express'),http=require('http'),crypto=require('crypto'),path=require('path');
const {WebSocketServer}=require('ws');
const {DEVICES}=require('./engine');
const ACTIONS=['start','stop','restart','close','delete','clearData','navigate','reload','stopLoad','back','forward','viewport','device','touch','ua','scroll','screenshot','qa','proxy'];
const int=(v,a,b,n)=>{v=Math.round(+v);if(!(v>=a&&v<=b))throw new Error(n+` must be ${a}-${b}`);return v;};
const word=(v,n)=>{if(v!=null&&!/^[\w-]{1,40}$/.test(v))throw new Error(n+' invalid');return v;};
function url(u){let x;try{x=new URL(u);}catch{throw new Error('Invalid URL');}if(!/^https?:$/.test(x.protocol))throw new Error('Only http(s) URLs');return x.href;}
function clean(a,p={}){switch(a){
 case'navigate':return{url:url(p.url)};
 case'qa':return{url:url(p.url),selector:p.selector?String(p.selector).slice(0,200):null,project:word(p.project,'project')};
 case'viewport':return{w:int(p.w,200,4000,'width'),h:int(p.h,200,4000,'height'),dpr:p.dpr?Math.min(4,Math.max(1,+p.dpr)):null};
 case'device':if(!DEVICES[p.device])throw new Error('Unknown device');return{device:p.device};
 case'touch':return{touch:!!p.touch};
 case'ua':return{ua:String(p.ua||'').slice(0,400)};
 case'scroll':return{y:int(p.y||0,0,1e7,'y')};
 case'screenshot':return{project:word(p.project,'project'),testCase:word(p.testCase,'testCase')};
 case'proxy':return{proxy:String(p.proxy||''),user:p.user?String(p.user).slice(0,200):'',pass:p.pass?String(p.pass).slice(0,200):''};
 default:return{};}}

module.exports=async function(engine,db,tokens,dir,uiDir){
 const eq=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);};
 const role=t=>{t=String(t||'');return eq(t,tokens.admin)?'admin':eq(t,tokens.viewer)?'viewer':null;};
 const audit=(r,a,d)=>db.prepare('INSERT INTO audit(role,action,detail) VALUES(?,?,?)').run(r,a,JSON.stringify(d||{}).slice(0,500));
 const app=express();app.disable('x-powered-by');app.use(express.json({limit:'1mb'}));
 app.use((q,r,n)=>{r.set({'Content-Security-Policy':"default-src 'self'; img-src 'self' data: blob:; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});n();});
 app.use(express.static(uiDir));
 const hits=new Map();setInterval(()=>hits.clear(),60000).unref();
 const api=express.Router();
 api.use((q,r,n)=>{const c=(hits.get(q.ip)||0)+1;hits.set(q.ip,c);if(c>900)return r.status(429).json({error:'rate limited'});
  q.role=role((q.get('authorization')||'').replace('Bearer ',''));
  if(!q.role){audit('none','auth_failed',{path:q.path});return r.status(401).json({error:'unauthorized'});}
  if(q.method!=='GET'&&q.role!=='admin')return r.status(403).json({error:'admin role required'});n();});
 const wrap=f=>async(q,r)=>{try{await f(q,r);}catch(e){r.status(400).json({error:e.message});}};
 api.get('/me',(q,r)=>r.json({role:q.role}));
 api.get('/sessions',(q,r)=>r.json(engine.list().map(({thumb,...s})=>s)));
 api.get('/devices',(q,r)=>r.json(DEVICES));
 api.get('/system',(q,r)=>r.json(engine.stats()));
 api.get('/sessions/:id/frame',wrap(async(q,r)=>{const b=await engine.frame(int(q.params.id,1,100,'id'));b?r.type('jpeg').send(b):r.status(404).end();}));
 api.get('/sessions/:id/network',wrap(async(q,r)=>r.json(await engine.network(int(q.params.id,1,100,'id')))));
 api.get('/audit',(q,r)=>r.json(db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 50').all()));
 api.get('/logs',(q,r)=>r.json(db.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT 100').all()));
 api.get('/settings',(q,r)=>r.json(engine.cfg));
 api.post('/settings',wrap((q,r)=>{audit(q.role,'settings',q.body);r.json(engine.setSettings(q.body||{}));}));
 api.get('/config/export',(q,r)=>{audit(q.role,'config_export');r.json(engine.exportConfig());});
 api.post('/config/import',wrap((q,r)=>{audit(q.role,'config_import');engine.importConfig(q.body);r.json({ok:true});}));
 api.post('/reset',wrap(async(q,r)=>{if(q.body?.confirm!=='RESET')throw new Error('Send {"confirm":"RESET"}');audit(q.role,'reset');await engine.reset();r.json({ok:true});}));
 api.post('/commands',wrap(async(q,r)=>{
  const{ids,action}=q.body||{};if(!Array.isArray(ids)||!ids.length||ids.length>100)throw new Error('ids required');
  if(!ACTIONS.includes(action))throw new Error('Unknown action');
  const list=ids.map(i=>int(i,1,100,'id')),params=clean(action,q.body.params);
  audit(q.role,action,{ids:list.length});
  const res=await Promise.allSettled(list.map(id=>engine.run(id,action,params)));
  r.json(res.map((x,i)=>({id:list[i],ok:x.status==='fulfilled',result:x.value,error:x.reason?.message})));}));
 app.use('/api',api);

 const srv=http.createServer(app);
 const wss=new WebSocketServer({server:srv,handleProtocols:ps=>[...ps][0]||false,verifyClient:(i,cb)=>{
  const o=i.req.headers.origin||'';const okOrigin=/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(o);   // blocks cross-site WebSocket hijacking
  const tok=String(i.req.headers['sec-websocket-protocol']||'').split(',')[0].trim();
  cb(okOrigin&&!!role(tok),401,'unauthorized');}});
 const dirty=new Set();engine.on('update',s=>dirty.add(s.id));
 setInterval(()=>{if(!dirty.size||!wss.clients.size)return dirty.clear();const u=[...dirty].map(i=>engine.S.get(i));dirty.clear();
  const m=JSON.stringify({t:'update',s:u});for(const c of wss.clients)if(c.readyState===1)c.send(m);},250).unref();
 wss.on('connection',ws=>ws.send(JSON.stringify({t:'update',s:engine.list()})));
 return new Promise(res=>{const go=p=>srv.listen(p,'127.0.0.1');   // localhost only
  srv.once('error',()=>go(0));srv.once('listening',()=>res(srv.address().port));go(17870);});
};
