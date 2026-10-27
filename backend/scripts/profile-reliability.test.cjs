'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {withIsolatedDatabase}=require('./helpers/auth-test-database.cjs');
const bcrypt=require('bcryptjs');
test('Backend phase 1: security revisions and atomic profile saves',async t=>withIsolatedDatabase(async({db,pool})=>{
 process.env.JWT_SECRET='synthetic-profile-repair-test-secret';
 const dbFile=require.resolve('../src/config/db');
 require.cache[dbFile]={id:dbFile,filename:dbFile,loaded:true,exports:pool};
 await db('roles').insert([{id:3,name:'parent'}]).onConflict('id').ignore();
 const [dc]=await db('daycares').insert({name:'Test daycare',slug:'profile-repair',contact_email:'dc@example.invalid',status:'active'}).returning('*');
 const [user]=await db('users').insert({name:'Test parent',email:'parent@example.invalid',role_id:3,daycare_id:dc.id,status:'active',password_hash:await bcrypt.hash('Synthetic-password-123!',4)}).returning('*');
 const [child]=await db('children').insert({full_name:'Child original',dob:'2022-01-01',daycare_id:dc.id,enrollment_status:'active'}).returning('*');
 await db('guardian_links').insert({child_id:child.id,user_id:user.id,created_by:user.id,relationship:'Parent',pickup_authorized:false});
 await db('care_instructions').insert({child_id:child.id,category:'allergy',instruction_text:'Original safety note'});
 await db('emergency_contacts').insert({child_id:child.id,name:'Original contact',relationship:'Aunt',phone:'0900000000'});
 const actor={id:user.id,daycare_id:dc.id,role:'parent'};
 const security=require('../src/modules/auth/legacy-security');
 const state=async()=>security.authState(await security.findAccount(pool,{id:user.id}));
 const before=await state();
 const migration=require('../src/db/migrations/018_profile_security_revisions');
 await migration.up(db);
 const service=require('../src/modules/children/children.profile-save');
 await t.test('upgrade preserves fingerprints and normal profile changes preserve login',async()=>{
  assert.equal(await state(),before);
  await db('users').where({id:user.id}).update({name:'Renamed parent',profile_complete:true,updated_at:db.fn.now()});
  await db('daycares').where({id:dc.id}).update({name:'Renamed daycare',updated_at:db.fn.now()});
  assert.equal(await state(),before);
 });
 await t.test('atomic save preserves omitted data and requires fresh version',async()=>{
  const current=await service.execute(actor,child.id);
  const saved=await service.execute(actor,child.id,{version:current.version,profile:{full_name:'Updated child'},parent_name:'Updated parent',complete_profile:true});
  assert.equal(saved.child.care_instructions[0].instruction_text,'Original safety note');
  assert.equal(saved.child.emergency_contacts.length,1);
  assert.equal(saved.parent.profile_complete,true);
  assert.equal(await state(),before);
  await assert.rejects(service.execute(actor,child.id,{version:current.version,care_instructions:[]}),{statusCode:409});
  assert.equal((await service.execute(actor,child.id)).child.care_instructions.length,1);
 });
 await t.test('failure rolls back identity, care, contacts and completion together',async()=>{
  const current=await service.execute(actor,child.id);
  await assert.rejects(service.execute(actor,child.id,{version:current.version,profile:{full_name:'Must roll back'},care_instructions:[],emergency_contacts:[],complete_profile:true}),{statusCode:422});
  assert.deepEqual(await service.execute(actor,child.id),current);
  const cleared=await service.execute(actor,child.id,{version:current.version,care_instructions:[]});
  assert.equal(cleared.child.care_instructions.length,0);
  assert.equal(cleared.child.emergency_contacts.length,1);
 });
 await t.test('forbidden fields, malformed data, wrong tenant and unlinked parent fail',async()=>{
  const current=await service.execute(actor,child.id);
  for(const data of [{profile:{pickup_authorized:true}},{profile:{dob:'2026-02-30'}},{emergency_contacts:null}])
   await assert.rejects(service.execute(actor,child.id,{version:current.version,...data}),{statusCode:422});
  await assert.rejects(service.execute({...actor,daycare_id:dc.id+1},child.id),{statusCode:403});
  await db('guardian_links').where({child_id:child.id}).delete();
  await assert.rejects(service.execute(actor,child.id),{statusCode:403});
  await db('guardian_links').insert({child_id:child.id,user_id:user.id,created_by:user.id,relationship:'Parent',pickup_authorized:false});
 });
 await t.test('two simultaneous saves cannot overwrite one another',async()=>{
  const current=await service.execute(actor,child.id);
  const results=await Promise.allSettled(['First','Second'].map(name=>service.execute(actor,child.id,{version:current.version,profile:{full_name:name}})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.statusCode,409);
 });
 await t.test('HTTP login survives legacy wizard saves and atomic endpoint saves',async()=>{
  process.env.NODE_ENV='test';process.env.DAYCARE_AUTH_ENABLED='false';
  const server=require('../src/app').listen(0,'127.0.0.1');
  await require('node:events').once(server,'listening');
  try {
   const base=`http://127.0.0.1:${server.address().port}/api`;let token;
   const request=async(method,route,body)=>{
    const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json()};
   };
   const login=await request('POST','/auth/login',{email:user.email,password:'Synthetic-password-123!'});assert.equal(login.status,200);token=login.body.token;
   assert.equal((await request('PUT',`/parent/children/${child.id}/profile`,{full_name:'HTTP child',parent_name:'HTTP parent'})).status,428);
   assert.equal((await request('PUT',`/parent/children/${child.id}/care`,{instructions:[{category:'allergy',instruction_text:'Retained allergy'}]})).status,428);
   assert.equal((await request('PATCH','/parent/profile-complete',{})).status,428);
   const loaded=await request('GET',`/parent/children/${child.id}/care-profile`);assert.equal(loaded.status,200);
   assert.equal((await request('PATCH',`/parent/children/${child.id}/care-profile`,{version:loaded.body.version,profile:{full_name:'Atomic HTTP child'}})).status,200);
   assert.equal((await request('GET','/auth/me')).status,200);
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 });
 await t.test('suspend/reactivate and password changes cannot revive old sessions',async()=>{
  let previous=await state();
  for(const status of ['inactive','active']) await db('users').where({id:user.id}).update({status});
  assert.notEqual(await state(),previous);
  previous=await state();
  for(const status of ['suspended','active']) await db('daycares').where({id:dc.id}).update({status});
  assert.notEqual(await state(),previous);
  previous=await state();
  await db('users').where({id:user.id}).update({password_hash:await bcrypt.hash('Another-synthetic-password',4)});
  assert.notEqual(await state(),previous);
 });
 await t.test('migration rollback and reapply work',async()=>{
  const previous=await state();await migration.down(db);assert.notEqual(await state(),previous);
  await migration.up(db);assert.ok(await db.schema.hasColumn('users','security_revision'));
 });
}));
