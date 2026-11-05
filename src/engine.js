'use strict';
const {BrowserWindow,session,app,safeStorage}=require('electron');
const {EventEmitter}=require('events');
const os=require('os'),fs=require('fs'),path=require('path'),dns=require('dns');
const DEVICES=require('./devices');
const PROXY=/^(https?|socks4|socks5):\/\/[\w.-]+:\d{1,5}$/;
const pad=i=>String(i).padStart(3,'0');
const DEF={maxActive:Math.max(2,Math.min(10,Math.floor(os.cpus().length/2))),concurrency:3,minFreeMb:1024,thumbMs:3000};
class Queue{constructor(l){this.l=l;this.n=0;this.q=[]}
 add(f){return new Promise((a,b)=>{this.q.push({f,a,b});this.p();});}
 p(){while(this.n<this.l()&&this.q.length){const{f,a,b}=this.q.shift();this.n++;f().then(a,b).finally(()=>{this.n--;this.p();});}}
 get pending(){return this.q.length;}}

class Engine extends EventEmitter{
 constructor(db,dir){super();this.db=db;this.dir=dir;this.wins=new Map();this.byWc=new Map();this.S=new Map();this.retry={};
  this.cfg={...DEF};for(const r of db.prepare('SELECT key,value FROM settings').all())if(r.key in DEF)this.cfg[r.key]=+r.value;
  this.q=new Queue(()=>this.cfg.concurrency);
  const rows=new Map(db.prepare('SELECT * FROM sessions').all().map(r=>[r.id,r]));
  for(let i=1;i<=100;i++)this.S.set(i,this.blank(i,rows.get(i)));
  setInterval(()=>this.thumbs(),this.cfg.thumbMs).unref();
  setInterval(()=>this.metrics(),2000).unref();}
 blank(i,r={}){const dk=DEVICES[r.device]?r.device:'win11',d=DEVICES[dk];
  return{id:i,status:'idle',url:r.url||'',title:'',http:null,loading:false,consoleErrors:[],netErrors:[],errCount:0,device:dk,
   w:r.w||d.w,h:r.h||d.h,dpr:r.dpr||d.dpr,touch:r.touch!=null?!!r.touch:d.touch,ua:r.ua||d.ua,proxy:r.proxy||'',
   ip:null,ipv6:null,latency:null,cpu:0,memMb:0,last:null,thumb:null};}
 list(){return[...this.S.values()];}
 running(){return this.wins.size;}
 part(id){return 'persist:omni-'+pad(id);}
 wc(id){return this.wins.get(id)?.webContents;}
 idOf(wc){return this.byWc.get(wc.id);}
 push(s){s.last=new Date().toISOString();this.emit('update',s);}
 err(s,k,m){m=String(m).slice(0,240);s[k]=[...s[k],m].slice(-20);s.errCount++;
  this.db.prepare('INSERT INTO logs(session,level,msg) VALUES(?,?,?)').run(s.id,k==='netErrors'?'net':'console',m);this.push(s);}
 persist(s){this.db.prepare(`INSERT INTO sessions(id,device,w,h,dpr,touch,ua,proxy,url) VALUES(?,?,?,?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET device=excluded.device,w=excluded.w,h=excluded.h,dpr=excluded.dpr,touch=excluded.touch,ua=excluded.ua,proxy=excluded.proxy,url=excluded.url,updated_at=CURRENT_TIMESTAMP`)
  .run(s.id,s.device,s.w,s.h,s.dpr,s.touch?1:0,s.ua,s.proxy,s.url);}
 proxyCreds(id){const r=this.db.prepare('SELECT proxy_auth FROM sessions WHERE id=?').get(id);
  try{return r?.proxy_auth?JSON.parse(safeStorage.decryptString(r.proxy_auth)):null;}catch{return null;}}
 run(id,a,p={}){return this.q.add(()=>this.do(id,a,p));}

 async do(id,a,p){const s=this.S.get(id);if(!s)throw new Error('Unknown session');
  switch(a){
   case'start':return this.start(id);
   case'stop':case'close':return this.stop(id);
   case'restart':this.stop(id);return this.start(id);
   case'delete':return this.deleteSession(id);
   case'clearData':return this.clearData(id);
   case'proxy':return this.setProxy(s,p);
  }
  const wc=this.wc(id);if(!wc)throw new Error(`Session ${id} is not running`);
  switch(a){
   case'navigate':wc.loadURL(p.url).catch(()=>{});return;
   case'reload':wc.reload();return;
   case'stopLoad':wc.stop();return;
   case'back':if(wc.canGoBack())wc.goBack();return;
   case'forward':if(wc.canGoForward())wc.goForward();return;
   case'viewport':Object.assign(s,{w:p.w,h:p.h,dpr:p.dpr||s.dpr});s.device='custom'in DEVICES?s.device:s.device;this.applyDevice(s);break;
   case'device':{const d=DEVICES[p.device];Object.assign(s,{device:p.device,w:d.w,h:d.h,dpr:d.dpr,touch:d.touch,ua:d.ua});this.applyDevice(s);if(s.url)wc.reload();break;}
   case'touch':s.touch=!!p.touch;this.applyDevice(s);break;
   case'ua':s.ua=p.ua;this.applyDevice(s);break;
   case'scroll':await wc.executeJavaScript(`window.scrollTo(0,${Number(p.y)||0})`);break;
   case'screenshot':return this.shot(id,p);
   case'qa':return this.qa(id,p);
  }
  this.persist(s);this.push(s);}

 async start(id){const s=this.S.get(id);if(this.wins.has(id))return;
  if(this.running()>=this.cfg.maxActive)throw new Error(`Max active sessions (${this.cfg.maxActive}) reached`);
  const free=os.freemem()/1048576;if(free<this.cfg.minFreeMb)throw new Error(`Low memory: ${Math.round(free)} MB free < ${this.cfg.minFreeMb} MB limit`);
  const win=new BrowserWindow({show:false,width:s.w,height:s.h,useContentSize:true,
   webPreferences:{partition:this.part(id),offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const wc=win.webContents;wc.setFrameRate(2);
  wc.session.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
  wc.setWindowOpenHandler(({url})=>{wc.loadURL(url).catch(()=>{});return{action:'deny'};});
  await wc.session.setProxy(s.proxy?{proxyRules:s.proxy}:{mode:'direct'});
  const wid=wc.id;this.wins.set(id,win);this.byWc.set(wid,id);
  Object.assign(s,{status:'running',consoleErrors:[],netErrors:[],errCount:0,http:null,loading:false,thumb:null});
  wc.on('did-start-loading',()=>{s.loading=true;this.push(s);});
  wc.on('did-stop-loading',()=>{s.loading=false;s.title=wc.getTitle();this.push(s);});
  wc.on('did-navigate',(e,url,code)=>{s.url=url;s.http=code;this.persist(s);this.push(s);});
  wc.on('did-navigate-in-page',(e,url)=>{s.url=url;this.push(s);});
  wc.on('page-title-updated',(e,t)=>{s.title=t;});
  wc.on('did-fail-load',(e,code,desc,url,main)=>{if(code!==-3)this.err(s,'netErrors',`${desc} (${code}) ${url}`);});
  wc.on('console-message',(e,level,msg)=>{if(level===3)this.err(s,'consoleErrors',msg);});
  wc.on('render-process-gone',(e,d)=>{this.cleanup(id,wid);s.status='crashed';this.err(s,'consoleErrors','Renderer crashed: '+d.reason);this.recover(id);});
  win.on('closed',()=>{if(this.wins.get(id)===win)this.cleanup(id,wid);});
  this.applyDevice(s);
  if(s.url)wc.loadURL(s.url).catch(()=>{});
  this.push(s);}
 cleanup(id,wid){this.wins.delete(id);this.byWc.delete(wid);}
 recover(id){const n=this.retry[id]=(this.retry[id]||0)+1;
  if(n<=3)setTimeout(()=>this.run(id,'start').catch(()=>{}),2000*n);}
 stop(id){const s=this.S.get(id),w=this.wins.get(id);
  if(w){const wid=w.webContents.id;this.cleanup(id,wid);w.destroy();}
  Object.assign(s,{status:'idle',loading:false,thumb:null,cpu:0,memMb:0});this.retry[id]=0;this.push(s);}
 applyDevice(s){const w=this.wins.get(s.id);if(!w)return;const wc=w.webContents;
  wc.setUserAgent(s.ua);w.setContentSize(s.w,s.h);
  wc.enableDeviceEmulation({screenPosition:s.touch?'mobile':'desktop',screenSize:{width:s.w,height:s.h},viewPosition:{x:0,y:0},deviceScaleFactor:s.dpr,viewSize:{width:s.w,height:s.h},scale:1});}
 async setProxy(s,p){const px=(p.proxy||'').trim();if(px&&!PROXY.test(px))throw new Error('Proxy must look like http://host:port or socks5://host:port');
  s.proxy=px;this.persist(s);
  const enc=px&&p.user?safeStorage.encryptString(JSON.stringify({user:p.user,pass:p.pass||''})):null;
  this.db.prepare('UPDATE sessions SET proxy_auth=? WHERE id=?').run(enc,s.id);
  const w=this.wins.get(s.id);if(w){await w.webContents.session.setProxy(px?{proxyRules:px}:{mode:'direct'});await w.webContents.session.closeAllConnections();}
  this.push(s);}
 async network(id){const s=this.S.get(id),wc=this.wc(id);if(!wc)throw new Error('Start the session first');
  const ses=wc.session,o={proxy:s.proxy?'Configured: '+s.proxy:'None (direct connection)',dns:dns.getServers(),local:[],verifiedAt:new Date().toISOString()};
  const get=async u=>{const r=await ses.fetch(u,{signal:AbortSignal.timeout(8000)});return r.json();};
  const t=Date.now();
  try{o.ipv4=(await get('https://api.ipify.org?format=json')).ip;o.latencyMs=Date.now()-t;}catch(e){o.ipv4=null;o.error='IPv4 check failed: '+e.message;}
  try{o.ipv6=(await get('https://api6.ipify.org?format=json')).ip;}catch{o.ipv6=null;}
  if(o.ipv4)try{const g=await get('https://ipwho.is/'+o.ipv4);o.geo=g.success===false?null:{country:g.country,region:g.region,city:g.city,isp:g.connection?.isp,estimate:true};}catch{o.geo=null;}
  for(const[n,l]of Object.entries(os.networkInterfaces()))for(const a of l||[])if(!a.internal&&a.family==='IPv4')o.local.push({iface:n,address:a.address});
  s.ip=o.ipv4;s.ipv6=o.ipv6;s.latency=o.latencyMs??null;this.push(s);return o;}
 metrics(){if(!this.wins.size)return;const m=app.getAppMetrics();
  for(const[id,w]of this.wins){const s=this.S.get(id),pid=w.webContents.getOSProcessId(),x=m.find(k=>k.pid===pid);
   if(x){s.cpu=+x.cpu.percentCPUUsage.toFixed(1);s.memMb=Math.round(x.memory.workingSetSize/1024);}}}
 thumbs(){for(const[id,w]of this.wins){const s=this.S.get(id);
  this.q.add(async()=>{try{const img=await w.webContents.capturePage();s.thumb=img.resize({width:320}).toJPEG(40).toString('base64');this.push(s);}catch{}}).catch(()=>{});}}
 async frame(id){const wc=this.wc(id);if(!wc)return null;try{return(await wc.capturePage()).resize({width:960}).toJPEG(70);}catch{return null;}}
 async shot(id,p){const wc=this.wc(id),day=new Date().toISOString().slice(0,10);
  const dir=path.join(this.dir,'screenshots',p.project||'default',day,'session-'+pad(id));fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,`${p.testCase||'manual'}-${Date.now()}.png`);fs.writeFileSync(file,(await wc.capturePage()).toPNG());return{file};}
 async qa(id,p){const s=this.S.get(id),wc=this.wc(id),c0=s.errCount,t=Date.now();let loadError=null;
  try{await wc.loadURL(p.url);}catch(e){loadError=e.message;}
  const loadMs=Date.now()-t;let found=null;
  if(p.selector)found=await wc.executeJavaScript(`!!document.querySelector(${JSON.stringify(p.selector)})`).catch(()=>null);
  const shot=await this.shot(id,{testCase:'qa',project:p.project}).catch(()=>null);
  return{id,device:s.device,title:wc.getTitle(),http:s.http,loadMs,loadError,selector:p.selector||null,found,newErrors:s.errCount-c0,screenshot:shot?.file};}
 async clearData(id){const ses=session.fromPartition(this.part(id));await ses.clearStorageData();await ses.clearCache();}
 async deleteSession(id){this.stop(id);await this.clearData(id);this.db.prepare('DELETE FROM sessions WHERE id=?').run(id);
  this.S.set(id,this.blank(id));this.push(this.S.get(id));}
 setSettings(o){for(const k of Object.keys(DEF)){if(o[k]==null)continue;const v=Math.round(+o[k]);
   const lim={maxActive:[1,100],concurrency:[1,20],minFreeMb:[256,65536],thumbMs:[1000,30000]}[k];
   if(!(v>=lim[0]&&v<=lim[1]))throw new Error(`${k} must be ${lim[0]}-${lim[1]}`);
   this.cfg[k]=v;this.db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,String(v));}
  return this.cfg;}
 exportConfig(){return{app:'OmniBrowserPro',version:1,settings:this.cfg,
  sessions:this.db.prepare('SELECT id,device,w,h,dpr,touch,ua,proxy,url FROM sessions').all()}; /* credentials are never exported */}
 importConfig(o){if(o?.app!=='OmniBrowserPro'||!Array.isArray(o.sessions))throw new Error('Not an OmniBrowser Pro config');
  this.setSettings(o.settings||{});
  for(const r of o.sessions){if(!(r.id>=1&&r.id<=100)||this.wins.has(r.id))continue;
   if(r.proxy&&!PROXY.test(r.proxy))continue;if(!DEVICES[r.device])continue;
   const s=Object.assign(this.S.get(r.id),{device:r.device,w:Math.min(4000,Math.max(200,+r.w||1366)),h:Math.min(4000,Math.max(200,+r.h||768)),dpr:Math.min(4,Math.max(1,+r.dpr||1)),touch:!!r.touch,ua:String(r.ua||DEVICES[r.device].ua).slice(0,400),proxy:r.proxy||'',url:/^https?:\/\//.test(r.url||'')?r.url:''});
   this.persist(s);this.push(s);}}
 async reset(){for(let i=1;i<=100;i++){this.stop(i);await this.clearData(i);}
  for(const t of['sessions','logs','settings'])this.db.exec('DELETE FROM '+t);
  fs.rmSync(path.join(this.dir,'screenshots'),{recursive:true,force:true});
  this.cfg={...DEF};for(let i=1;i<=100;i++){this.S.set(i,this.blank(i));this.push(this.S.get(i));}}
 shutdown(){for(const id of[...this.wins.keys()])this.stop(id);}
 stats(){return{cpuLoad1m:os.loadavg()[0],cpus:os.cpus().length,freeMb:Math.round(os.freemem()/1048576),totalMb:Math.round(os.totalmem()/1048576),active:this.running(),queued:this.q.pending,limits:this.cfg};}
}
module.exports={Engine,DEVICES};
