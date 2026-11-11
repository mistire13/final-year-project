'use strict';
const { withCurrentDatabase }=require('../backend/scripts/helpers/auth-test-database.cjs');
const bcrypt=require('../backend/node_modules/bcryptjs');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const password='Synthetic-expiry-password-123!';
withCurrentDatabase(async({db,pool})=>{
  await db('roles').insert([{id:1,name:'admin'},{id:2,name:'caregiver'},{id:3,name:'parent'}]).onConflict('id').ignore();
  const [d]=await db('daycares').insert({name:'Expiry fixture',slug:'expiry-fixture',contact_email:'expiry@example.invalid',status:'active',subscription_status:'active',subscription_ends_at:new Date(Date.now()-86400000)}).returning('*');
  const hash=await bcrypt.hash(password,4);
  const [admin,caregiver,parent]=await db('users').insert([{name:'Admin',email:'expiry-admin@example.invalid',role_id:1,daycare_id:d.id,password_hash:hash,status:'active'},{name:'Caregiver',email:'expiry-care@example.invalid',role_id:2,daycare_id:d.id,password_hash:hash,status:'active'},{name:'Parent',email:'expiry-parent@example.invalid',role_id:3,daycare_id:d.id,password_hash:hash,status:'active'}]).returning('*');
  const [child]=await db('children').insert({full_name:'Child',dob:'2022-01-01',caregiver_id:caregiver.id,enrollment_status:'active',daycare_id:d.id}).returning('*');
  await db('guardian_links').insert({child_id:child.id,user_id:parent.id,relationship:'Parent',pickup_authorized:true,created_by:admin.id});
  const dbfile=require.resolve('../backend/src/config/db');require.cache[dbfile]={id:dbfile,filename:dbfile,loaded:true,exports:pool};
  process.env.JWT_SECRET='synthetic-expiry-test-secret';process.env.NODE_ENV='test';process.env.DAYCARE_AUTH_ENABLED='false';
  const server=require('../backend/src/app').listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const base=`http://127.0.0.1:${server.address().port}/api`;
    async function req(method,url,body,token){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
    const a=await req('POST','/auth/login',{email:admin.email,password});assert.equal(a.status,200,JSON.stringify(a.body));const at=a.body.token;
    const c=await req('POST','/auth/login',{email:caregiver.email,password});assert.equal(c.status,200,JSON.stringify(c.body));const ct=c.body.token;
    const now=Date.now();let r=await req('POST','/portal/assignments',{staff_id:caregiver.id,group_id:null,starts_at:new Date(now-60000).toISOString(),ends_at:new Date(now+3600000).toISOString(),can_attendance:true,can_pickup:true},at);assert.equal(r.status,200,JSON.stringify(r.body));
    r=await req('POST','/portal/attendance',{child_id:child.id,event_type:'checkin'},ct);assert.equal(r.status,200,JSON.stringify(r.body));
    r=await req('POST','/health',{child_id:child.id,record_type:'incident',description:'Synthetic minor incident',severity:'low'},ct);assert.equal(r.status,201,JSON.stringify(r.body));
    r=await req('POST','/portal/checkout',{child_id:child.id,guardian_user_id:parent.id,method:'manual',identity_confirmed:true,reason:'Identity confirmed in person'},ct);assert.equal(r.status,200,JSON.stringify(r.body));
    r=await req('POST','/groups',{name:'Blocked group'},at);assert.equal(r.status,403,JSON.stringify(r.body));assert.equal(r.body.code,'SUBSCRIPTION_EXPIRED');
    console.log('PASS: expired daycare login, duty assignment, attendance, incident and pickup succeed; group creation blocked.');
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}).catch(e=>{console.error(e.stack);process.exitCode=1;});
