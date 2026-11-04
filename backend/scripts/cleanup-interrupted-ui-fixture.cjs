'use strict';
// Recovery only for a locally running instance of our disposable UI fixture.
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {Client}=require('pg');
require('dotenv').config();
async function run(){
 const pid=Number(process.argv[2]);assert.ok(Number.isSafeInteger(pid)&&pid>0&&pid!==process.pid);
 const proc=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',`Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true}));
 assert.equal(proc.ProcessId,pid);assert.match(proc.CommandLine,/node\.exe.*scripts[\\/]ui-acceptance-fixture\.cjs/);
 assert.ok(['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST||'localhost'));
 const client=new Client({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||5432),user:process.env.DB_USER||'postgres',password:process.env.DB_PASSWORD,database:'postgres'});
 await client.connect();
 try{
  const candidates=(await client.query('SELECT datname FROM pg_database WHERE datname LIKE $1',[`ankelba_auth_test_${pid}_%`])).rows;
  assert.equal(candidates.length,1);
  const name=candidates[0].datname;
  assert.match(name,new RegExp(`^ankelba_auth_test_${pid}_\\d+_[a-f0-9]{8}$`));assert.notEqual(name,process.env.DB_NAME||'ankelba_dev');
  // Wake the fixture's idle pools so their exact login identities can be verified.
  const port=Number(process.argv[3]||5100);assert.ok(Number.isSafeInteger(port)&&port>0&&port<65536);
  const response=await fetch(`http://localhost:${port}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'parent@example.invalid',password:'Synthetic-ui-test-only-123!'})});
  assert.equal(response.status,200);assert.equal((await response.json()).user.daycare_name,'Acceptance test center');
  const roles=(await client.query("SELECT DISTINCT usename FROM pg_stat_activity WHERE datname=$1 AND usename ~ '^ui_[tc]_[a-f0-9]{12}$'",[name])).rows.map(row=>row.usename);
  assert.equal(roles.length,2);for(const role of roles)assert.match(role,/^ui_[tc]_[a-f0-9]{12}$/);
  execFileSync('powershell.exe',['-NoProfile','-Command',`Stop-Process -Id ${pid} -ErrorAction Stop`],{windowsHide:true});
  await client.query(`DROP DATABASE "${name}"`);
  for(const role of roles)await client.query(`DROP ROLE "${role}"`);
  console.log('Interrupted disposable UI fixture database and its two temporary logins removed.');
 }finally{await client.end();}
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
