'use strict';
const {app,BrowserWindow,safeStorage}=require('electron');
const path=require('path'),fs=require('fs'),crypto=require('crypto');
// Own data directory. OmniBrowser Pro never reads Chrome/Edge/Firefox profiles, Windows or Microsoft accounts, or saved passwords.
app.setPath('userData',path.join(app.getPath('appData'),'OmniBrowserPro'));
app.commandLine.appendSwitch('disable-features','PasswordImport,AutofillServerCommunication');
if(!app.requestSingleInstanceLock())app.quit();

function loadTokens(dir){const f=path.join(dir,'tokens.bin');
 try{if(fs.existsSync(f))return JSON.parse(safeStorage.decryptString(fs.readFileSync(f)));}catch{}
 const t={admin:crypto.randomBytes(32).toString('hex'),viewer:crypto.randomBytes(32).toString('hex')};
 if(safeStorage.isEncryptionAvailable())fs.writeFileSync(f,safeStorage.encryptString(JSON.stringify(t)));   // Windows DPAPI
 return t;}

app.whenReady().then(async()=>{
 const dir=app.getPath('userData');fs.mkdirSync(dir,{recursive:true});
 const db=require('./db')(path.join(dir,'omnibrowser.db'));
 const {Engine}=require('./engine');const engine=new Engine(db,dir);
 const tokens=loadTokens(dir);
 const port=await require('./server')(engine,db,tokens,dir,path.join(__dirname,'..','ui'));
 app.on('login',(e,wc,req,info,cb)=>{if(!info.isProxy)return;const id=engine.idOf(wc),c=id&&engine.proxyCreds(id);if(c){e.preventDefault();cb(c.user,c.pass);}});
 const win=new BrowserWindow({width:1500,height:950,backgroundColor:'#0b0f17',title:'OmniBrowser Pro',autoHideMenuBar:true,
  webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 const base=`http://127.0.0.1:${port}`;
 win.webContents.on('will-navigate',(e,u)=>{if(!u.startsWith(base))e.preventDefault();});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.loadURL(`${base}/#${tokens.admin}`);   // hash is never sent to the server; UI moves it to sessionStorage
 app.on('before-quit',()=>engine.shutdown());
 app.on('window-all-closed',()=>app.quit());
});
