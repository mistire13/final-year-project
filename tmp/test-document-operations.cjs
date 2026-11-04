'use strict';
const fs=require('node:fs'),path=require('node:path'),{promisify}=require('node:util'),{execFile}=require('node:child_process'),{once}=require('node:events');
const run=promisify(execFile),root=path.resolve(__dirname,'..'),out=path.join(root,'docs/evidence/test-plan-rerun-20261031');
const {withCurrentDatabase}=require('../backend/scripts/helpers/auth-test-database.cjs');
const bcrypt=require('../backend/node_modules/bcryptjs');const results=[];
withCurrentDatabase(async({db,pool,name})=>{
 const version=(await pool.query('SHOW server_version')).rows[0].server_version;
 await db('roles').insert({id:1,name:'admin'}).onConflict('id').ignore();
 const [center]=await db('daycares').insert({name:'Synthetic backup sentinel',slug:'synthetic-backup-sentinel',contact_email:'backup@example.invalid',status:'active'}).returning('*');
 await db('users').insert({name:'Synthetic administrator',email:'admin@performance.invalid',password_hash:await bcrypt.hash('Synthetic-perf-only-123!',4),role_id:1,daycare_id:center.id,status:'active'});
 await db('children').insert([{full_name:'Synthetic first child',dob:'2023-01-01',daycare_id:center.id},{full_name:'Synthetic second child',dob:'2024-01-01',daycare_id:center.id}]);
 process.env.NODE_ENV='test';process.env.DAYCARE_AUTH_ENABLED='false';
 const key=require.resolve('../backend/src/config/db');require.cache[key]={id:key,filename:key,loaded:true,exports:pool};
 const app=require('../backend/src/app'),server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 try{
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@performance.invalid',password:'Synthetic-perf-only-123!'})});const token=(await login.json()).token;
  const request=async url=>{const r=await fetch(base+url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});await r.text();return r.status;};
  const durations=[];let ok=0;for(let i=0;i<50;i++){const start=performance.now();if(await request('/api/children')===200)ok++;durations.push(performance.now()-start);}
  const avg=durations.reduce((a,b)=>a+b,0)/50,max=Math.max(...durations);results.push({id:'TC-PERF-001',status:ok===50&&avg<500&&max<2000?'PASS':'FAIL',ok,requests:50,averageMs:avg,maxMs:max});
  const start=performance.now(),statuses=await Promise.all(Array.from({length:20},()=>request('/api/portal/snapshot'))),elapsed=performance.now()-start;
  results.push({id:'TC-PERF-002',status:statuses.every(s=>s===200)&&elapsed<5000?'PASS':'FAIL',requests:20,successful:statuses.filter(s=>s===200).length,totalMs:elapsed});
 }finally{await new Promise(resolve=>server.close(resolve));}
 const bin='C:/Program Files/PostgreSQL/18/bin',dump=path.join(out,'synthetic-backup.dump');
 const connection=['--host',process.env.DB_HOST||'localhost','--port',process.env.DB_PORT||'5432','--username',process.env.DB_USER||'postgres'];
 const env={...process.env,PGPASSWORD:process.env.DB_PASSWORD};
 await run(path.join(bin,'pg_dump.exe'),[...connection,'--dbname',name,'--format=custom','--no-owner','--no-acl','--file',dump],{env,timeout:45000});
 await withCurrentDatabase(async({db:targetDb,name:target})=>{
  await run(path.join(bin,'pg_restore.exe'),[...connection,'--dbname',target,'--clean','--if-exists','--no-owner','--no-acl',dump],{env,timeout:45000});
  const centers=await targetDb('daycares').where({slug:'synthetic-backup-sentinel'}),children=await targetDb('children').where({daycare_id:center.id});
  results.push({id:'TC-DB-008',status:centers.length===1&&children.length===2?'PASS':'FAIL',restoredSentinelCenters:centers.length,restoredChildren:children.length,scope:'fresh disposable source and target; schema/data restore, not production recovery certification'});
 });
 fs.writeFileSync(path.join(out,'operations-replay.json'),JSON.stringify({executed:new Date().toISOString(),postgresVersion:version,performanceScope:'small synthetic data; local HTTP; provisioning-pool fixture, not restricted-runtime production load',results},null,2));console.log(JSON.stringify(results));
}).catch(e=>{fs.writeFileSync(path.join(out,'operations-error.json'),JSON.stringify({error:e.message},null,2));console.error(e.message);process.exitCode=1;});
