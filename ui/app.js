const $=i=>document.getElementById(i);
if(location.hash.length>10){sessionStorage.omni=location.hash.slice(1);history.replaceState(null,'',location.pathname);}
const token=sessionStorage.omni||(sessionStorage.omni=prompt('Access token'));
const S={},sel=new Set();let focus=1,count=10,DEV={};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=(p,o={})=>fetch('/api'+p,{...o,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token}}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error||r.status);return j;});
const post=(p,b)=>api(p,{method:'POST',body:JSON.stringify(b)});
async function cmd(action,params={},ids=[...sel]){if(!ids.length){alert('Select sessions first');return[];}
 try{const r=await post('/commands',{ids,action,params});const bad=r.filter(x=>!x.ok);if(bad.length)alert(bad.slice(0,3).map(b=>`#${b.id}: ${b.error}`).join('\n'));return r;}catch(e){alert(e.message);return[];}}
const dl=s=>DEV[s.device]?.label||'Custom';
function build(){const g=$('grid');g.innerHTML='';g.style.gridTemplateColumns=`repeat(auto-fill,minmax(${count>25?170:230}px,1fr))`;
 for(let i=1;i<=count;i++){const c=document.createElement('div');c.className='card';c.id='c'+i;
  c.innerHTML=`<label><input type=checkbox data-i=${i} ${sel.has(i)?'checked':''}> <b>#${String(i).padStart(3,'0')}</b> <span class=st></span></label><img data-f=${i}><div class="u url"></div><div class="m"></div>`;g.append(c);paint(i);}
 $('nsess').innerHTML=Array.from({length:count},(_,k)=>`<option value=${k+1}>Session ${k+1}</option>`).join('');sync();}
function paint(i){const s=S[i],c=$('c'+i);if(i===focus)info();if(!s||!c)return;
 c.classList.toggle('sel',sel.has(i));c.classList.toggle('foc',i===focus);
 c.querySelector('.st').innerHTML=`<span class="dot ${s.loading?'load':s.status}"></span>${s.status}${s.loading?' · loading':''}`;
 c.querySelector('.url').textContent=s.url||'—';c.querySelector('img').src=s.thumb?'data:image/jpeg;base64,'+s.thumb:'';
 c.querySelector('.m').innerHTML=`${esc(dl(s))} (emulated)<br>HTTP ${s.http??'—'} · IP ${esc(s.ip||'unchecked')}${s.proxy?' · proxy':''}<br>CPU ${s.cpu}% · ${s.memMb} MB<br><span class=err>${s.consoleErrors.length} console / ${s.netErrors.length} net</span> · ${s.last?new Date(s.last).toLocaleTimeString():''}`;}
function sync(){$('sel').textContent=sel.size+' selected';}
function info(){const s=S[focus];if(!s)return;$('mt').textContent=`Main browser: #${String(focus).padStart(3,'0')}`;if(document.activeElement!==$('murl'))$('murl').value=s.url||'';
 $('minfo').innerHTML=`<small>${esc(s.status)} · ${esc(dl(s))} (emulated) ${s.w}×${s.h} @${s.dpr}x touch:${s.touch} · HTTP ${s.http??'—'} · ${esc(s.title)}</small><br><small class=err>${[...s.consoleErrors,...s.netErrors].slice(-3).map(esc).join(' | ')}</small>`;}
const ws=new WebSocket(`ws://${location.host}`,[token]);
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.t==='update')for(const s of m.s){const first=!S[s.id];S[s.id]=s;if(s.id<=count&&!first)paint(s.id);else if(first&&s.id===100)build();}};
ws.onclose=()=>{$('stat').textContent='disconnected';};
setInterval(async()=>{if(!$('t-b').classList.contains('on'))return;try{const r=await fetch(`/api/sessions/${focus}/frame`,{headers:{Authorization:'Bearer '+token}});
 if(r.ok){const o=$('main').src;$('main').src=URL.createObjectURL(await r.blob());if(o.startsWith('blob:'))URL.revokeObjectURL(o);}else $('main').removeAttribute('src');}catch{}},1000);
$('grid').addEventListener('change',e=>{const i=+e.target.dataset.i;if(!i)return;e.target.checked?sel.add(i):sel.delete(i);paint(i);sync();});
$('grid').addEventListener('click',e=>{const i=+e.target.dataset.f;if(i){const o=focus;focus=i;paint(o);paint(i);}});
$('layout').onchange=e=>{count=+e.target.value;build();};
$('all').onclick=()=>{for(let i=1;i<=count;i++)sel.add(i);build();};$('none').onclick=()=>{sel.clear();build();};
const all=()=>Array.from({length:count},(_,i)=>i+1);
document.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>cmd(b.dataset.a,b.dataset.a==='screenshot'?{project:'default'}:{}).then(r=>{if(b.dataset.a==='screenshot'&&r[0]?.ok)alert('Saved: '+r[0].result.file);}));
$('startall').onclick=()=>cmd('start',{},all());$('stopall').onclick=()=>cmd('stop',{},all());$('restartall').onclick=()=>cmd('restart',{},all());
$('go').onclick=()=>cmd('navigate',{url:$('url').value});$('scr').onclick=()=>cmd('scroll',{y:+$('sy').value||0});
$('vp').onclick=()=>cmd('viewport',{w:+$('vw').value,h:+$('vh').value});
$('mgo').onclick=()=>cmd('navigate',{url:$('murl').value},[focus]);$('murl').onkeydown=e=>{if(e.key==='Enter')$('mgo').click();};
$('back').onclick=()=>cmd('back',{},[focus]);$('fwd').onclick=()=>cmd('forward',{},[focus]);$('rl').onclick=()=>cmd('reload',{},[focus]);$('stp').onclick=()=>cmd('stopLoad',{},[focus]);
$('mshot').onclick=async()=>{const r=await cmd('screenshot',{project:'default'},[focus]);if(r[0]?.ok)alert('Saved: '+r[0].result.file);};$('mfs').onclick=()=>$('main').requestFullscreen?.();
$('tabs').onclick=e=>{const t=e.target.dataset.t;if(!t)return;document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b===e.target));document.querySelectorAll('section').forEach(s=>s.classList.toggle('on',s.id==='t-'+t));if(t==='s')loadSettings();};
$('ncheck').onclick=async()=>{$('nout').textContent='Checking…';try{const o=await api(`/sessions/${$('nsess').value}/network`);
 $('nout').textContent=`Public IPv4: ${o.ipv4??'unavailable'}\nPublic IPv6: ${o.ipv6??'not available'}\nLatency: ${o.latencyMs??'—'} ms\nGeo (estimate): ${o.geo?[o.geo.city,o.geo.region,o.geo.country].filter(Boolean).join(', ')+' · '+(o.geo.isp||''):'unavailable'}\nProxy: ${o.proxy}\nDNS servers (host): ${o.dns.join(', ')||'n/a'}\nLocal: ${o.local.map(x=>x.address).join(', ')||'—'}\n${o.error?'Error: '+o.error+'\n':''}Verified at ${o.verifiedAt}`;}catch(e){$('nout').textContent=e.message;}};
$('papply').onclick=()=>cmd('proxy',{proxy:$('px').value,user:$('pu').value,pass:$('pp').value});$('pclear').onclick=()=>cmd('proxy',{proxy:''});
api('/devices').then(d=>{DEV=d;$('dev').innerHTML=Object.entries(d).map(([k,v])=>`<option value=${k}>${esc(v.label)} (emulated)</option>`).join('');
 $('dinfo').textContent=Object.values(d).map(v=>`${v.label}: ${v.w}×${v.h} @${v.dpr}x, touch ${v.touch}, ${v.engine} (emulated)`).join('\n');});
$('applydev').onclick=()=>cmd('device',{device:$('dev').value});$('applytouch').onclick=()=>cmd('touch',{touch:$('touch').checked});
$('dvp').onclick=()=>cmd('viewport',{w:+$('dw').value,h:+$('dh').value,dpr:+$('ddpr').value||null});$('dapua').onclick=()=>cmd('ua',{ua:$('dua').value});
$('qrun').onclick=async()=>{const r=await cmd('qa',{url:$('qurl').value,selector:$('qsel').value||null,project:'default'});
 $('qtab').tBodies[0].innerHTML=r.map(x=>x.ok?`<tr><td>${x.id}</td><td>${esc(x.result.device)}</td><td>${esc(x.result.title)}</td><td>${x.result.http??'—'}</td><td>${x.result.loadMs}</td><td>${x.result.selector?(x.result.found?'found':'MISSING'):'—'}</td><td>${x.result.newErrors}</td><td class=u>${esc(x.result.screenshot||'')}</td></tr>`:`<tr><td>${x.id}</td><td colspan=7 class=err>${esc(x.error)}</td></tr>`).join('');};
async function loadSettings(){const c=await api('/settings');[c.maxActive,c.concurrency,c.minFreeMb,c.thumbMs].forEach((v,i)=>$('s'+(i+1)).value=v);
 $('webinfo').textContent=`Local only: ${location.origin}\nRole: ${(await api('/me')).role}\nAccess token is stored in this window session. The app never exposes ports beyond 127.0.0.1.`;
 $('audit').textContent=(await api('/audit')).map(a=>`${a.ts} ${a.role} ${a.action} ${a.detail}`).join('\n');
 $('logs').textContent=(await api('/logs')).map(a=>`${a.ts} #${a.session} ${a.level} ${a.msg}`).join('\n');}
$('ssave').onclick=()=>post('/settings',{maxActive:$('s1').value,concurrency:$('s2').value,minFreeMb:$('s3').value,thumbMs:$('s4').value}).then(()=>alert('Saved')).catch(e=>alert(e.message));
$('exp').onclick=async()=>{const j=await api('/config/export');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(j,null,2)],{type:'application/json'}));a.download='omnibrowser-config.json';a.click();};
$('imp').onchange=async e=>{try{await post('/config/import',JSON.parse(await e.target.files[0].text()));alert('Restored');}catch(x){alert(x.message);}};
$('clear').onclick=()=>confirm('Clear cookies, storage and cache of selected sessions?')&&cmd('clearData');
$('del').onclick=()=>confirm('Delete selected sessions and their data?')&&cmd('delete');
$('reset').onclick=()=>{if(prompt('Type RESET to erase ALL sessions, browser data, settings and screenshots')==='RESET')post('/reset',{confirm:'RESET'}).then(()=>alert('Done')).catch(e=>alert(e.message));};
setInterval(async()=>{try{const s=await api('/system');$('stat').textContent=`active ${s.active}/${s.limits.maxActive} · queued ${s.queued} · CPU load ${s.cpuLoad1m.toFixed(1)}/${s.cpus} · RAM free ${s.freeMb}/${s.totalMb} MB`;}catch{}},3000);
build();
