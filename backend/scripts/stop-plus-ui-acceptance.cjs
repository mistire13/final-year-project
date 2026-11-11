'use strict';
// Prefer the fixture's stop marker. --recover-interrupted is only for an exact
// locally verified fixture process from this script, never a discovered app DB.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {Client}=require('pg');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});
const dir=path.resolve(__dirname,'../../tmp/subscription-backups/plus-ui-acceptance');
async function run(){
  const artifact=path.join(dir,'fixture.json'),f=JSON.parse(fs.readFileSync(artifact,'utf8'));
  assert.equal(f.purpose,'Disposable local acceptance ONLY');assert.ok(Number.isSafeInteger(f.pid)&&f.pid>0&&f.pid!==process.pid);
  assert.match(f.database,new RegExp(`^ankelba_auth_test_${f.pid}_\\d+_[a-f0-9]{8}$`));
  assert.notEqual(f.database,process.env.DB_NAME||'ankelba_dev');
  if(!process.argv.includes('--recover-interrupted')){fs.writeFileSync(path.join(dir,'stop.json'),JSON.stringify({pid:f.pid}));console.log('Requested graceful cleanup of the exact disposable fixture.');return;}
  const proc=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',`Get-CimInstance Win32_Process -Filter 'ProcessId=${f.pid}' | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true}));
  assert.equal(proc.ProcessId,f.pid);assert.match(proc.CommandLine,/node\.exe[" ]+scripts[\\/]plus-ui-acceptance-fixture\.cjs/);
  const url=new URL(f.api);assert.equal(url.hostname,'localhost');assert.equal(url.protocol,'http:');
  const auth=await fetch(f.api+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:f.accounts.parent,password:f.password})});assert.equal(auth.status,200);assert.equal((await auth.json()).user.daycare_name,'Disposable Plus acceptance center');
  const host=process.env.DB_HOST||'localhost';assert.ok(['localhost','127.0.0.1','::1'].includes(host));
  const c=new Client({host,port:Number(process.env.DB_PORT||5432),user:process.env.DB_USER||'postgres',password:process.env.DB_PASSWORD,database:'postgres'});await c.connect();
  try{
    const exists=await c.query('SELECT 1 FROM pg_database WHERE datname=$1',[f.database]);assert.equal(exists.rows.length,1);
    const roles=(await c.query("SELECT DISTINCT usename FROM pg_stat_activity WHERE datname=$1 AND usename ~ '^plus_ui_[tc]_[a-f0-9]{12}$'",[f.database])).rows.map(row=>row.usename);assert.equal(roles.length,2);
    for(const role of roles)assert.match(role,/^plus_ui_[tc]_[a-f0-9]{12}$/);
    execFileSync('powershell.exe',['-NoProfile','-Command',`Stop-Process -Id ${f.pid} -ErrorAction Stop`],{windowsHide:true});
    for(let i=0;i<30;i++){if(!(await c.query('SELECT 1 FROM pg_stat_activity WHERE datname=$1',[f.database])).rows.length)break;await new Promise(resolve=>setTimeout(resolve,100));}
    await c.query(`DROP DATABASE "${f.database}"`);
    for(const role of roles)await c.query(`DROP ROLE "${role}"`);
    fs.rmSync(artifact);if(fs.existsSync(path.join(dir,'stop.json')))fs.rmSync(path.join(dir,'stop.json'));
    console.log('Removed the verified interrupted disposable fixture, exact owned database and temporary runtime logins.');
  }finally{await c.end();}
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
