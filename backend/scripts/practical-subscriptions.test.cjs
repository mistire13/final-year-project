'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const bcrypt=require('bcryptjs');
const express=require('express');
const {once}=require('node:events');
const {withCurrentDatabase}=require('./helpers/auth-test-database.cjs');
const {createSubscriptions,stateOf}=require('../src/modules/saas/subscriptions.service');
const denied=n=>e=>(e.statusCode||e.status)===n;
const password='Synthetic-subscription-password-714!';
test('subscription phase derives expiry independently of package and preserves cancellation',()=>{
 assert.equal(stateOf({subscription_status:'trialing',trial_ends_at:'2020-01-01'}),'expired');
 assert.equal(stateOf({subscription_status:'active',subscription_ends_at:'2099-01-01',subscription_plan:'premium'}),'active');
 assert.equal(stateOf({subscription_status:'cancelled',subscription_ends_at:'2099-01-01'}),'cancelled');
});
test('real subscription and application lifecycle, retries, boundaries and scoped history',async t=>{
 await withCurrentDatabase(async({db,pool})=>{
  const svc=createSubscriptions(pool);
  await db('roles').insert([{id:0,name:'super_admin'},{id:1,name:'admin'},{id:2,name:'caregiver'},{id:3,name:'parent'}]).onConflict('id').ignore();
  const [owner]=await db('users').insert({name:'Synthetic operator',email:'owner@subscription.invalid',role_id:0,status:'active',password_hash:await bcrypt.hash(password,4)}).returning('*');
  // Install the isolated pool before loading production services and HTTP middleware.
  const dbFile=require.resolve('../src/config/db'),oldDb=require.cache[dbFile];
  require.cache[dbFile]={id:dbFile,filename:dbFile,loaded:true,exports:pool};
  const files=['../src/modules/saas/saas.service','../src/modules/saas/saas.controller','../src/modules/saas/saas.routes','../src/modules/auth/auth.service','../src/middleware/auth'];
  for(const f of files)delete require.cache[require.resolve(f)];
  const oldSecret=process.env.JWT_SECRET;process.env.JWT_SECRET='synthetic-subscription-test-secret-for-isolated-database';
  const saas=require('../src/modules/saas/saas.service'),auth=require('../src/modules/auth/auth.service');
  const app=express();app.use(express.json());app.use('/api/saas',require('../src/modules/saas/saas.routes'));app.use(require('../src/middleware/errorHandler'));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}/api/saas`;
  const request=async(method,path,token,body)=>{const r=await fetch(origin+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
  let center,adminToken,ownerToken;
  const input={daycareName:'Synthetic package daycare',contactEmail:'office@subscription.invalid',adminName:'Synthetic administrator',adminEmail:'admin@subscription.invalid',adminPassword:password,requestedPlan:'premium',billingCycle:'annual',termsVersion:1};
  try{
   await t.test('public catalog, package selection, application status and pending access',async()=>{
    assert.equal((await request('GET','/packages')).body.length,2);
    await assert.rejects(saas.registerDaycare({...input,requestedPlan:'trial'}),denied(422));
    await assert.rejects(saas.registerDaycare({...input,termsVersion:999}),denied(409));
    center=(await saas.registerDaycare(input)).daycare;
    assert.equal(center.subscription_terms.code,'premium');assert.equal(center.subscription_terms.billing_cycle,'annual');assert.equal(center.subscription_terms.max_children,150);
    assert.equal((await svc.applicationStatus({email:input.adminEmail,password})).status,'pending');
    await assert.rejects(svc.applicationStatus({email:input.adminEmail,password:'wrong'}),denied(401));
    await assert.rejects(auth.login(input.adminEmail,password),denied(403));
    await assert.rejects(saas.approveDaycare(center.id,{plan:'standard'},owner.id),denied(422));
    const approved=await saas.approveDaycare(center.id,{},owner.id);assert.equal(approved.subscription_plan,'premium');assert.ok(new Date(approved.trial_ends_at)>new Date());
    await assert.rejects(saas.approveDaycare(center.id,{},owner.id),denied(409));
    adminToken=(await auth.login(input.adminEmail,password)).token;ownerToken=(await auth.login(owner.email,password)).token;
   });
   await t.test('operator roles, tenant-owned summary and protected application status',async()=>{
    assert.equal((await request('GET','/super-admin/packages',adminToken)).status,403);
    assert.equal((await request('GET','/super-admin/packages')).status,401);
    const own=await request('GET','/subscription',adminToken);assert.equal(own.status,200);assert.equal(own.body.id,center.id);
    assert.equal((await request('GET',`/super-admin/daycares/${center.id}/subscription`,adminToken)).status,403);
    assert.equal((await request('POST','/application-status',null,{email:input.adminEmail,password})).body.password_hash,undefined);
    assert.equal((await request('PATCH',`/super-admin/daycares/${center.id}/plan`,ownerToken,{plan:'standard',version:1})).status,409);
   });
   await t.test('catalog version checks and accepted price snapshots',async()=>{
    const premium=(await svc.catalog(true)).find(p=>p.code==='premium');
    const {code,updated_at,...draft}=premium;draft.reason='Set agreed synthetic project prices';draft.monthly_price=100;draft.annual_price=1000;
    await svc.updatePackage('premium',draft,owner.id);
    await assert.rejects(svc.updatePackage('premium',draft,owner.id),denied(409));
    const old=await svc.summary(center.id);assert.equal(old.subscription_terms.price,null);
    await assert.rejects(svc.action(center.id,{action:'renew',version:old.version,request_key:'unconfigured_price_001',reason:'Attempt renewal before agreement',amount:1000,payment_reference:'SUB-TEST-0001'},owner.id),denied(422));
    await svc.action(center.id,{action:'change_package',version:old.version,request_key:'agree_package_terms_001',reason:'Daycare agreed the configured annual price',package_code:'premium',billing_cycle:'annual'},owner.id);
    assert.equal(Number((await svc.summary(center.id)).subscription_terms.price),1000);
   });
   await t.test('manual renewal commits once under simultaneous retries and rejects mismatches',async()=>{
    const current=await svc.summary(center.id),body={action:'renew',version:current.version,request_key:'manual_renewal_retry_001',reason:'Verified synthetic receipt for lifecycle test',amount:1000,payment_reference:'SUB-TEST-0001'};
    const results=await Promise.all([svc.action(center.id,body,owner.id),svc.action(center.id,body,owner.id)]);assert.equal(results.filter(r=>r.replayed).length,1);
    const after=await svc.summary(center.id);assert.equal(after.effective_status,'active');assert.equal(after.history.filter(e=>e.action==='renew').length,1);
    assert.ok(new Date(after.subscription_ends_at)>new Date(after.trial_ends_at));
    await assert.rejects(svc.action(center.id,{...body,amount:999},owner.id),denied(409));
    await assert.rejects(svc.action(center.id,{...body,request_key:'stale_manual_renewal_001'},owner.id),denied(409));
    await assert.rejects(svc.action(center.id,{...body,version:after.version,request_key:'wrong_price_renewal_001',amount:1,payment_reference:'NEW-REF-0001'},owner.id),denied(422));
    await assert.rejects(svc.action(center.id,{action:'change_package',version:after.version,request_key:'paid_package_change_001',reason:'Attempt to change existing paid period',package_code:'standard',billing_cycle:'monthly'},owner.id),denied(409));
   });
   await t.test('cancellation, resume and trial-only extension have durable history',async()=>{
    let current=await svc.summary(center.id);await svc.action(center.id,{action:'cancel',version:current.version,request_key:'cancel_subscription_001',reason:'Daycare requests no future renewal'},owner.id);
    current=await svc.summary(center.id);assert.equal(current.effective_status,'cancelled');
    await assert.rejects(svc.action(center.id,{action:'renew',version:current.version,request_key:'cancelled_renewal_001',reason:'Attempt renewal while cancelled',amount:1000,payment_reference:'CANCELLED-REF'},owner.id),denied(409));
    await svc.action(center.id,{action:'resume',version:current.version,request_key:'resume_subscription_001',reason:'Daycare requests resumption of subscription'},owner.id);
    current=await svc.summary(center.id);assert.equal(current.effective_status,'active');
    await assert.rejects(svc.action(center.id,{action:'extend_trial',version:current.version,request_key:'paid_trial_extension_001',reason:'Attempt extension of a paid account',days:14},owner.id),denied(409));
   });
   await t.test('second tenant, payment reference uniqueness, expired trial and rejected status',async()=>{
    const second=(await saas.registerDaycare({...input,daycareName:'Synthetic second daycare',adminEmail:'second@subscription.invalid',termsVersion:2})).daycare;
    await saas.approveDaycare(second.id,{},owner.id);
    let current=await svc.summary(second.id);
    await assert.rejects(svc.action(second.id,{action:'renew',version:current.version,request_key:'duplicate_reference_001',reason:'Attempt reuse of another daycare receipt',amount:1000,payment_reference:'SUB-TEST-0001'},owner.id),denied(409));
    await db('daycares').where({id:second.id}).update({trial_ends_at:new Date(Date.now()-86400000)});
    current=await svc.summary(second.id);assert.equal(current.effective_status,'expired');
    await svc.action(second.id,{action:'extend_trial',version:current.version,request_key:'extend_expired_trial_001',reason:'Approve additional setup time for daycare',days:7},owner.id);
    assert.equal((await svc.summary(second.id)).effective_status,'trialing');
    const secondToken=(await auth.login('second@subscription.invalid',password)).token;
    const own=await request('GET','/subscription',secondToken);assert.equal(own.body.id,second.id);assert.ok(!own.body.history.some(e=>e.action==='renew'));
    const third=(await saas.registerDaycare({...input,daycareName:'Synthetic rejected daycare',adminEmail:'rejected@subscription.invalid',termsVersion:2})).daycare;
    await saas.rejectDaycare(third.id,'Synthetic license information needs correction',owner.id);
    const status=await svc.applicationStatus({email:'rejected@subscription.invalid',password});assert.equal(status.status,'rejected');assert.match(status.review_reason,/license/);
    await assert.rejects(auth.login('rejected@subscription.invalid',password),denied(403));
    // Exercise actual database roles, not only HTTP route filtering.
    const c=await pool.connect();try{await c.query('BEGIN');await c.query('SET LOCAL ROLE ankelba_tenant');await c.query("SELECT set_config('app.daycare_id',$1,true)",[String(second.id)]);const rows=(await c.query('SELECT daycare_id FROM subscription_events')).rows;assert.ok(rows.length>0&&rows.every(r=>r.daycare_id===second.id));await c.query('ROLLBACK');}finally{c.release();}
   });
  } finally {
   await new Promise(resolve=>server.close(resolve));
   for(const f of files)delete require.cache[require.resolve(f)];
   if(oldDb)require.cache[dbFile]=oldDb;else delete require.cache[dbFile];
   if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;
  }
 });
});
