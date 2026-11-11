'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {withCurrentDatabase}=require('./helpers/auth-test-database.cjs');
const {createSubscriptions,termsFor,addBillingPeriod}=require('../src/modules/saas/subscriptions.service');
const {createPaymentService,secretHash}=require('../src/modules/saas/subscription-payments.service');
const {createSubscriptionChangeWorker}=require('../src/modules/saas/subscription-change-worker');
const denied=code=>error=>error.statusCode===code;

test('next-period terms preserve paid access, bind verified money, and activate once with current capacity/status checks',async()=>{
 await withCurrentDatabase(async({db,pool})=>{
  await db('roles').insert([{id:0,name:'super_admin'},{id:1,name:'admin'}]).onConflict('id').ignore();
  const [operator]=await db('users').insert({name:'Scheduling operator',email:'schedule-operator@example.invalid',role_id:0,status:'active',password_hash:'synthetic'}).returning('*');
  await db('subscription_packages').where({code:'standard'}).update({monthly_price:'100.00',six_month_price:'500.00',annual_price:'900.00',max_children:2});
  await db('subscription_packages').where({code:'premium'}).update({monthly_price:'200.00',six_month_price:'1000.00',annual_price:'1800.00',max_children:10});
  const offers=await db('subscription_packages'),offer=code=>offers.find(row=>row.code===code),ends=new Date(Date.now()+2*86400000);
  const center=async(code,name)=>(await db('daycares').insert({name,slug:name,contact_email:name+'@example.invalid',status:'active',subscription_plan:code,subscription_status:'active',subscription_started_at:new Date(Date.now()-20*86400000),subscription_ends_at:ends,billing_cycle:'monthly',max_children:offer(code).max_children,subscription_terms:termsFor(offer(code),'monthly')}).returning('*'))[0];
  const plus=await center('premium','future-downgrade'),standard=await center('standard','future-upgrade'),cancelled=await center('standard','future-cancel');
  const [admin]=await db('users').insert({name:'Scheduling administrator',email:'schedule-admin@example.invalid',role_id:1,status:'active',password_hash:'synthetic',daycare_id:plus.id}).returning('*');
  const subscriptions=createSubscriptions(pool);
  const action=async(daycare,code,key,overrides={})=>subscriptions.action(daycare.id,{action:'change_package',version:daycare.version,request_key:key,reason:'Reviewed next-period package agreement',package_code:code,billing_cycle:'monthly',terms_version:offer(code).version,...overrides},operator.id);
  const children=await db('children').insert([1,2,3].map(n=>({full_name:'Scheduled child '+n,dob:'2022-01-01',daycare_id:plus.id,enrollment_status:'active'}))).returning('*');
  const scheduled=await action(plus,'standard','scheduled-downgrade-request');
  assert.equal(scheduled.scheduled_change.status,'awaiting_payment');
  assert.equal(await createSubscriptions(pool,{now:()=>new Date(ends.getTime()+1000)}).activateDueChange(plus.id),null,'unpaid future terms cannot activate when due');
  assert.equal((await subscriptions.action(plus.id,{action:'change_package',version:plus.version,request_key:'scheduled-downgrade-request',reason:'Reviewed next-period package agreement',package_code:'standard',billing_cycle:'monthly',terms_version:offer('standard').version},operator.id)).replayed,true);
  await assert.rejects(action(plus,'standard','stale-schedule-request'),denied(409));
  let current=await subscriptions.summary(plus.id);assert.equal(current.subscription_plan,'premium');assert.equal(current.max_children,10);assert.equal(current.features.shop,true);assert.equal(current.scheduled_change.terms.price,'100.00');
  await assert.rejects(action(current,'premium','conflicting-schedule-request'),denied(409));
  await db('subscription_packages').where({code:'standard'}).update({monthly_price:'125.00',max_children:1});
  await assert.rejects(db('subscription_package_changes').where({id:scheduled.scheduled_change.id}).update({terms:{code:'premium'}}),error=>error.code==='23514');
  let amount='100.00';
  const payments=createPaymentService(pool,{apiKey:'synthetic-test-key',accounts:{cbe:{enabled:true,account_holder:'Synthetic receiver',account_number:'1234567890'}},fetch:async(_url,options)=>{const input=JSON.parse(options.body);return {ok:true,json:async()=>({success:true,data:{status:'success',reference:input.reference,amount,currency:'ETB',receiverName:'Synthetic receiver',receiverAccount:'1234567890',transactionDate:new Date().toISOString()}})};}});
  const payment=await payments.createRenewal(plus.id,admin.id,{provider:'cbe'});assert.equal(payment.terms.price,'100.00');assert.equal(payment.terms.max_children,2);assert.equal(payment.subscription_change_id,scheduled.scheduled_change.id);
  await assert.rejects(payments.createRenewal(plus.id,admin.id,{provider:'cbe'}),denied(409));
  await assert.rejects(subscriptions.applyVerifiedRenewal(standard.id,payment.id,operator.id),denied(404));
  const verified=await payments.verify(payment.id,{token:payment.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/SYNTHETIC-SCHEDULED-001'});
  assert.equal(verified.status,'verified');assert.equal(verified.renewal_applied,false);
  current=await subscriptions.summary(plus.id);assert.equal(current.scheduled_change.status,'paid');assert.equal(current.subscription_plan,'premium');assert.equal(current.features.shop,true);
  assert.equal((await subscriptions.applyVerifiedRenewal(plus.id,payment.id,admin.id)).scheduled,true);
  await assert.rejects(subscriptions.action(plus.id,{action:'cancel_package_change',version:current.version,reason:'Attempt cancellation of confirmed future money',request_key:'cancel-paid-package-request'},operator.id),denied(409));
  await assert.rejects(subscriptions.action(plus.id,{action:'cancel',version:current.version,reason:'Attempt cancelling renewal with paid future terms',request_key:'cancel-paid-renewal-request'},operator.id),denied(409));
  const due=new Date(ends.getTime()+1000),worker=createSubscriptionChangeWorker(pool,{error(){}},{now:()=>due});
  await db('daycares').where({id:plus.id}).update({status:'suspended'});
  assert.equal((await worker.run()).blocked,1);assert.equal((await db('subscription_payment_intents').where({id:payment.id}).first()).status,'verified');
  await db('daycares').where({id:plus.id}).update({status:'active'});
  assert.equal((await worker.run()).blocked,1);
  let change=await db('subscription_package_changes').where({id:scheduled.scheduled_change.id}).first();assert.match(change.blocked_reason,/enrollment/);
  const blockedEvents=await db('subscription_events').where({daycare_id:plus.id,action:'package_change_blocked'}).count('* AS n').first();
  await worker.run();assert.deepEqual(await db('subscription_events').where({daycare_id:plus.id,action:'package_change_blocked'}).count('* AS n').first(),blockedEvents,'unchanged blocked retries do not spam audit events');
  await db('children').where({id:children[2].id}).update({enrollment_status:'inactive'});
  const outcomes=await Promise.all([worker.run(),createSubscriptionChangeWorker(pool,{error(){}},{now:()=>due}).run()]);
  assert.equal(outcomes.reduce((sum,row)=>sum+(row.activated||0),0),1);
  current=await subscriptions.summary(plus.id);assert.equal(current.subscription_plan,'standard');assert.equal(current.max_children,2);assert.equal(current.features.shop,false);assert.equal(current.subscription_terms.price,'100.00');assert.equal(current.scheduled_change,null);
  assert.equal(new Date(current.subscription_ends_at).getTime(),addBillingPeriod(scheduled.scheduled_change.effective_at,'monthly',scheduled.scheduled_change.effective_at).getTime());
  assert.equal((await db('subscription_payment_intents').where({id:payment.id}).first()).status,'consumed');
  assert.equal((await subscriptions.applyVerifiedRenewal(plus.id,payment.id,admin.id)).replayed,true);
  assert.equal((await db('subscription_events').where({daycare_id:plus.id,action:'package_change_activated'})).length,1);

  // Cancellation rejects the old token, preserves evidence, and permits a new agreement.
  const cancelledChange=await action(cancelled,'premium','scheduled-cancel-request');
  const unpaid=await payments.createRenewal(cancelled.id,operator.id,{provider:'cbe'});
  const cancelSummary=await subscriptions.summary(cancelled.id);
  const cancellation={action:'cancel_package_change',version:cancelSummary.version,reason:'Daycare withdrew the unpaid future package agreement',request_key:'cancel-unpaid-package-request'};
  await subscriptions.action(cancelled.id,cancellation,operator.id);assert.equal((await subscriptions.action(cancelled.id,cancellation,operator.id)).replayed,true);
  await assert.rejects(payments.verify(unpaid.id,{token:unpaid.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/SYNTHETIC-CANCELLED-001'}),denied(409));
  assert.equal((await db('subscription_package_changes').where({id:cancelledChange.scheduled_change.id}).first()).status,'cancelled');
  const fresh=await subscriptions.summary(cancelled.id);await action(fresh,'premium','scheduled-after-cancel-request');
  const accounts={telebirr:{enabled:true,account_holder:'Original scheduled receiver',account_number:'0911234567'}};
  const wallets=createPaymentService(pool,{accounts});
  const wallet=await wallets.createRenewal(cancelled.id,operator.id,{provider:'telebirr'});
  accounts.telebirr={enabled:true,account_holder:'New receiving account',account_number:'0922334455'};
  const walletStatus=await wallets.status(wallet.id,{token:wallet.token});
  assert.equal(walletStatus.recipient,wallet.recipient);assert.equal(walletStatus.recipient_name,'Original scheduled receiver','status reads cannot rewrite a scheduled payment destination');

  // A submitted renewal prevents a competing package agreement; paid-period
  // anchors stop two old normal renewals from extending overlapping periods.
  const normal=await payments.createRenewal(standard.id,operator.id,{provider:'cbe'});
  await assert.rejects(action(standard,'premium','change-with-payment-request'),denied(409));
  const token=crypto.randomBytes(32).toString('base64url');
  const [older]=await db('subscription_payment_intents').insert({id:crypto.randomUUID(),secret_hash:secretHash(token),email:standard.contact_email,terms:termsFor(offer('standard'),'monthly'),amount:'100.00',currency:'ETB',recipient:'1234567890',provider:'cbe',payment_reference:'SYNTHETIC-OLD-NORMAL',status:'verified',daycare_id:standard.id,renewal_period_start:standard.subscription_ends_at,expires_at:new Date(Date.now()+86400000)}).returning('*');
  assert.equal((await payments.verify(normal.id,{token:normal.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/SYNTHETIC-NORMAL-001'})).status,'consumed');
  await assert.rejects(subscriptions.applyVerifiedRenewal(standard.id,older.id,operator.id),denied(409));
  assert.equal((await db('subscription_payment_intents').where({id:older.id}).first()).status,'verified');assert.ok(normal.id);

  // A verified period which entirely elapsed cannot silently restart from now.
  // External reconciliation retains its evidence before cancellation is allowed.
  const late=await center('standard','future-late-resolution');
  const lateAgreement=await action(late,'premium','scheduled-late-resolution');amount='200.00';
  const latePayment=await payments.createRenewal(late.id,operator.id,{provider:'cbe'});
  assert.equal((await payments.verify(latePayment.id,{token:latePayment.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/SYNTHETIC-LATE-001'})).status,'verified');
  const longAfter=()=>new Date(addBillingPeriod(lateAgreement.scheduled_change.effective_at,'monthly').getTime()+86400000);
  assert.equal((await createSubscriptions(pool,{now:longAfter}).activateDueChange(late.id)).blocked,true);
  assert.equal((await db('subscription_payment_intents').where({id:latePayment.id}).first()).status,'verified');
  const lateIntent=await db('subscription_payment_intents').where({id:latePayment.id}).first();
  await payments.resolve(latePayment.id,{version:lateIntent.version,outcome:'refund_recorded',reason:'Synthetic external refund already completed and checked',evidence_reference:'SYNTHETIC-EXTERNAL-REFUND'},operator.id);
  const lateSummary=await subscriptions.summary(late.id);
  await subscriptions.action(late.id,{action:'cancel_package_change',version:lateSummary.version,request_key:'cancel-resolved-package-change',reason:'Cancel agreement after recording the external payment resolution'},operator.id);
  assert.equal((await db('subscription_payment_intents').where({id:latePayment.id}).first()).status,'resolved');assert.equal((await db('subscription_payment_resolutions').where({intent_id:latePayment.id})).length,1);

  const c=await pool.connect();try{
    await c.query('BEGIN');await c.query('SET LOCAL ROLE ankelba_tenant');await c.query("SELECT set_config('app.daycare_id',$1,true)",[String(standard.id)]);
    assert.equal((await c.query('SELECT id FROM subscription_package_changes')).rows.length,0);
    await assert.rejects(c.query("UPDATE subscription_package_changes SET status='cancelled'"),error=>error.code==='42501');await c.query('ROLLBACK');
    await c.query('BEGIN');await c.query('SET LOCAL ROLE ankelba_control');assert.ok((await c.query('SELECT id FROM subscription_package_changes')).rows.length>=2);await c.query('ROLLBACK');
  }finally{c.release();}
 });
});
