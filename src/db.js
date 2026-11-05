const Database=require('better-sqlite3');
module.exports=p=>{const d=new Database(p);d.pragma('journal_mode=WAL');
d.exec(`CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(id INTEGER PRIMARY KEY,device TEXT,w INT,h INT,dpr REAL,touch INT,ua TEXT,proxy TEXT,proxy_auth BLOB,url TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,ts TEXT DEFAULT CURRENT_TIMESTAMP,role TEXT,action TEXT,detail TEXT);
CREATE TABLE IF NOT EXISTS logs(id INTEGER PRIMARY KEY AUTOINCREMENT,ts TEXT DEFAULT CURRENT_TIMESTAMP,session INT,level TEXT,msg TEXT);`);
return d;};
