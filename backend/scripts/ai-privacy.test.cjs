'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {withCurrentDatabase}=require('./helpers/auth-test-database.cjs');
test('AI external context honors consent and excludes child/classroom identifiers',async()=>{
 await withCurrentDatabase(async({db,pool})=>{
  await db('roles').insert([{id:1,name:'admin'},{id:3,name:'parent'}]).onConflict('id').ignore();
  const [center]=await db('daycares').insert({name:'Privacy fixture',slug:'privacy-fixture',contact_email:'privacy@example.invalid',status:'active'}).returning('*');
  const [admin,parent]=await db('users').insert([{name:'Admin',role_id:1},{name:'Parent',role_id:3}].map((u,i)=>({...u,email:`privacy${i}@example.invalid`,daycare_id:center.id,password_hash:'unused-synthetic'}))).returning('*');
  const [group]=await db('groups').insert({name:'Private classroom identity',daycare_id:center.id}).returning('*');
  const [child]=await db('children').insert({full_name:'Privatechild Identity',dob:'2023-01-01',group_id:group.id,daycare_id:center.id}).returning('*');
  await db('guardian_links').insert({child_id:child.id,user_id:parent.id,created_by:admin.id,relationship:'Parent'});
  await db('care_instructions').insert({child_id:child.id,category:'dietary',instruction_text:'Synthetic vegetarian preference'});
  const key=require.resolve('../src/config/db');require.cache[key]={id:key,filename:key,loaded:true,exports:pool};
  const svc=require('../src/modules/ai-guide/ai-guide.service');
  const oldFetch=global.fetch,oldKey=process.env.NVIDIA_API_KEY;let prompt='';
  process.env.NVIDIA_API_KEY='synthetic-provider-key-only';
  global.fetch=async(url,options)=>{prompt=options.body;return {ok:true,json:async()=>({choices:[{message:{content:'Synthetic guidance'}}]})};};
  const actor={id:parent.id,daycare_id:center.id,role:'parent'};
  try{
   await svc.getGuidance({question:'What play activities are suitable?',child_id:child.id},actor);
   assert.ok(!prompt.includes('Synthetic vegetarian preference'));assert.ok(!prompt.includes('Privatechild'));
   await db('users').where('id',parent.id).update({ui_preferences:{food:{ai_consent:true}}});
   await svc.getGuidance({question:'What play activities are suitable?',child_id:child.id},actor);
   assert.ok(prompt.includes('Synthetic vegetarian preference'));assert.ok(!prompt.includes('Privatechild'));assert.ok(!prompt.includes('Private classroom identity'));
   prompt='';await svc.getGuidance({question:'What medicine dosage should I give?',child_id:child.id},actor);assert.equal(prompt,'');
   global.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:'Fill a sensory bin with rice and small toys.'}}]})});
   assert.equal((await svc.getGuidance({question:'Suggest a toddler activity',child_id:child.id},actor)).source,'prepared_guidance');
   global.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:'Suggestion '.repeat(131)}}]})});
   assert.equal((await svc.getGuidance({question:'Suggest an activity',child_id:child.id},actor)).source,'prepared_guidance');
   global.fetch=async(url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('Synthetic provider timeout'),{name:'AbortError'})),{once:true}));
   const started=Date.now();const fallback=await svc.getGuidance({question:'What play activities are suitable?',child_id:child.id},actor);
   assert.equal(fallback.source,'prepared_guidance');assert.ok(Date.now()-started<12000,'Fallback must beat the 15-second app timeout');
  }finally{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.NVIDIA_API_KEY;else process.env.NVIDIA_API_KEY=oldKey;}
 });
});
