'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {withCurrentDatabase} = require('./helpers/auth-test-database.cjs');
const {createPaymentService} = require('../src/modules/saas/subscription-payments.service');
const {createSubscriptions} = require('../src/modules/saas/subscriptions.service');
const {createSubscriptionAccess} = require('../src/middleware/subscription-access');

const rejected = code => error => (error.statusCode || error.status) === code;
async function restricted(pool, daycareId) {
  const req={method:'POST',originalUrl:'/api/children',user:{daycare_id:daycareId}};
  const res={status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
  let allowed=false;
  await createSubscriptionAccess(pool)(req,res,error=>{if(error)throw error;allowed=true;});
  return {allowed,status:res.statusCode};
}

test('overdue restart is bound to one tenant and stays restricted until payment',async()=>{
  await withCurrentDatabase(async({db,pool})=>{
    await db('roles').insert([{id:0,name:'super_admin'},{id:1,name:'admin'}]).onConflict('id').ignore();
    const [owner]=await db('users').insert({name:'Synthetic owner',email:'restart-owner@example.invalid',role_id:0,status:'active',password_hash:'synthetic'}).returning('*');
    const terms={code:'standard',name:'Standard',version:1,max_children:50,billing_cycle:'monthly',price:'100.00',currency:'ETB'};
    const [daycare,other]=await db('daycares').insert([
      {name:'Overdue daycare',slug:'restart-a',status:'active',contact_email:'restart-a@example.invalid',subscription_plan:'standard',billing_cycle:'monthly',subscription_status:'active',subscription_terms:terms,max_children:50,subscription_started_at:db.raw("NOW() - INTERVAL '3 years'"),subscription_ends_at:db.raw("NOW() - INTERVAL '2 years'")},
      {name:'Other daycare',slug:'restart-b',status:'active',contact_email:'restart-b@example.invalid',subscription_plan:'standard',billing_cycle:'monthly',subscription_status:'active',subscription_terms:terms,max_children:50,subscription_started_at:db.raw("NOW() - INTERVAL '3 years'"),subscription_ends_at:db.raw("NOW() - INTERVAL '2 years'")},
    ]).returning('*');
    const [admin]=await db('users').insert({name:'Daycare admin',email:'restart-admin@example.invalid',role_id:1,status:'active',daycare_id:daycare.id,password_hash:'synthetic'}).returning('*');
    const subscriptions=createSubscriptions(pool);
    let receiverAccount='0911234567';
    const payments=createPaymentService(pool,{
      apiKey:'synthetic',accounts:{cbe:{enabled:true,account_holder:'Synthetic receiver',account_number:'0911234567'}},
      fetch:async(_url,options)=>({ok:true,json:async()=>({success:true,data:{status:'success',reference:JSON.parse(options.body).reference,amount:'100.00',currency:'ETB',receiverName:'Synthetic receiver',receiverAccount,transactionDate:new Date().toISOString()}})}),
    });
    await assert.rejects(payments.createRenewal(daycare.id,admin.id,{provider:'cbe'}),rejected(409));
    let current=await subscriptions.summary(daycare.id);
    await assert.rejects(subscriptions.authorizeRenewalRestart(daycare.id,{version:current.version,reason:'Synthetic operator agreement'},owner.id),rejected(422));
    await assert.rejects(subscriptions.authorizeRenewalRestart(daycare.id,{version:current.version+1,reason:'Synthetic operator agreement',acknowledge_restart:true},owner.id),rejected(409));
    const authorization=await subscriptions.authorizeRenewalRestart(daycare.id,{version:current.version,reason:'Synthetic operator agreement',acknowledge_restart:true},owner.id);
    assert.ok(authorization.authorization.id);
    assert.equal((await restricted(pool,daycare.id)).status,403);
    await assert.rejects(payments.createRenewal(other.id,admin.id,{provider:'cbe'}),rejected(409));

    // Expired unconsumed authorizations cannot start checkout, but can be replaced.
    await db('daycares').where({id:daycare.id}).update({renewal_restart_authorization:JSON.stringify({...authorization.authorization,expires_at:new Date(Date.now()-1000).toISOString()})});
    await assert.rejects(payments.createRenewal(daycare.id,admin.id,{provider:'cbe'}),rejected(409));
    current=await subscriptions.summary(daycare.id);
    const replacement=await subscriptions.authorizeRenewalRestart(daycare.id,{version:current.version,reason:'Synthetic replacement agreement',acknowledge_restart:true},owner.id);
    assert.notEqual(replacement.authorization.id,authorization.authorization.id);
    const payment=await payments.createRenewal(daycare.id,admin.id,{provider:'cbe'});
    await assert.rejects(payments.resumeRenewal(other.id,payment.id,{token:payment.token}),rejected(404));
    await assert.rejects(payments.createRenewal(daycare.id,admin.id,{provider:'cbe'}),rejected(409));
    current=await subscriptions.summary(daycare.id);
    await assert.rejects(subscriptions.authorizeRenewalRestart(daycare.id,{version:current.version,reason:'Attempt duplicate restart authorization',acknowledge_restart:true},owner.id),rejected(409));
    assert.equal((await restricted(pool,daycare.id)).status,403);
    await assert.rejects(subscriptions.applyVerifiedRenewal(daycare.id,payment.id,admin.id),rejected(409));

    // A submitted but inconclusive reference can represent a real payment; its
    // expiry must not invite another payment until the operator resolves it.
    receiverAccount='mismatch';
    const pending=await payments.verify(payment.id,{token:payment.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/SYNTHETIC-RESTART-PENDING'});
    assert.equal(pending.status,'verification_pending');
    const bound=(await db('daycares').where({id:daycare.id}).first()).renewal_restart_authorization;
    await db('daycares').where({id:daycare.id}).update({renewal_restart_authorization:JSON.stringify({...bound,expires_at:new Date(Date.now()-1000).toISOString()})});
    await db('subscription_payment_intents').where({id:payment.id}).update({expires_at:new Date(Date.now()-1000)});
    current=await subscriptions.summary(daycare.id);
    await assert.rejects(subscriptions.authorizeRenewalRestart(daycare.id,{version:current.version,reason:'Attempt restart with unresolved payment',acknowledge_restart:true},owner.id),rejected(409));
    const pendingRow=await db('subscription_payment_intents').where({id:payment.id}).first();
    await payments.review(payment.id,{version:pendingRow.version,decision:'reject',reason:'Synthetic bank records confirm no payment'},owner.id);
    current=await subscriptions.summary(daycare.id);
    await subscriptions.authorizeRenewalRestart(daycare.id,{version:current.version,reason:'No prior payment; restart agreed',acknowledge_restart:true},owner.id);
    const retry=await payments.createRenewal(daycare.id,admin.id,{provider:'cbe'});
    receiverAccount='0911234567';
    const confirmed=await payments.verify(retry.id,{token:retry.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/SYNTHETIC-RESTART-REF'});
    assert.equal(confirmed.status,'consumed');
    assert.equal((await restricted(pool,daycare.id)).allowed,true);
    current=await subscriptions.summary(daycare.id);
    assert.equal(current.renewal_restart_authorization,null);
    assert.equal(current.history.filter(event=>event.action==='renew').length,1);
    assert.equal(current.history.find(event=>event.action==='renew').details.restarted_overdue,true);
    assert.equal((await subscriptions.applyVerifiedRenewal(daycare.id,retry.id,admin.id)).replayed,true);
  });
});
