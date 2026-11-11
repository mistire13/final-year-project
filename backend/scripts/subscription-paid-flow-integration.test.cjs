'use strict';

// All writes occur in the generated disposable database owned by this test.
const test = require('node:test');
const assert = require('node:assert/strict');
const { withCurrentDatabase } = require('./helpers/auth-test-database.cjs');
const { createPaymentService } = require('../src/modules/saas/subscription-payments.service');
const { createSubscriptions, addBillingPeriod } = require('../src/modules/saas/subscriptions.service');

const email = 'paid-flow-director@example.invalid';
const password = 'synthetic-only-password-192!';
const denied = code => error => (error.statusCode || error.status) === code;

test('paid signup, approval and verified renewal use durable isolated records', async () => {
  await withCurrentDatabase(async ({ db, pool }) => {
    await db('roles').insert([{id:0,name:'super_admin'},{id:1,name:'admin'},{id:2,name:'caregiver'},{id:3,name:'parent'}]).onConflict('id').ignore();
    const [owner] = await db('users').insert({name:'Synthetic operator',email:'paid-flow-owner@example.invalid',role_id:0,status:'active',password_hash:'synthetic'}).returning('*');
    await db('subscription_packages').where({code:'premium'}).update({monthly_price:'100.00',six_month_price:'500.00',annual_price:'900.00'});
    const initialDaycareCount = (await db('daycares').count('* as total'))[0].total;

    let receiver = '0911234567';
    const payments = createPaymentService(pool, {
      apiKey:'synthetic-test-key', accounts:{cbe:{enabled:true,account_holder:'Synthetic account',account_number:'0911234567'}},
      fetch:async (_url, options) => {
        const input = JSON.parse(options.body);
        return {ok:true,json:async()=>({success:true,data:{status:'success',reference:input.reference,amount:'500.00',currency:'ETB',receiverName:'Synthetic account',receiverAccount:receiver,transactionDate:new Date().toISOString()}})};
      },
    });
    const subscriptions = createSubscriptions(pool);
    const dbPath = require.resolve('../src/config/db');
    const saasPath = require.resolve('../src/modules/saas/saas.service');
    const oldDb = require.cache[dbPath], oldSaas = require.cache[saasPath];
    require.cache[dbPath] = {id:dbPath,filename:dbPath,loaded:true,exports:pool};
    delete require.cache[saasPath];
    const saas = require(saasPath);
    try {
      const payment = await payments.create({provider:'cbe',package_code:'premium',billing_cycle:'six_month',email});
      assert.equal(payment.status,'pending');
      const application = {daycareName:'Synthetic paid flow',contactEmail:'paid-flow-office@example.invalid',adminName:'Synthetic director',adminEmail:email,adminPassword:password,payment_intent_id:payment.id,payment_token:payment.token};
      await assert.rejects(saas.registerDaycare(application),denied(409));

      // New catalog prices do not overwrite the amount accepted when this session began.
      await db('subscription_packages').where({code:'premium'}).update({six_month_price:'600.00'});
      receiver = 'wrong-account';
      let checked = await payments.verify(payment.id,{token:payment.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/SYNTHETIC-TYPO-1'});
      assert.equal(checked.status,'verification_pending');
      await assert.rejects(saas.registerDaycare(application),denied(409));
      receiver = '0911234567';
      checked = await payments.verify(payment.id,{token:payment.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/SYNTHETIC-INITIAL-1'});
      assert.equal(checked.status,'verified');
      // Restore the synthetic offer so the same verified receipt would match
      // the second session's amount absent the confirmed-reference ledger.
      await db('subscription_packages').where({code:'premium'}).update({six_month_price:'500.00'});
      const duplicate = await payments.create({provider:'cbe',package_code:'premium',billing_cycle:'six_month',email:'paid-flow-other@example.invalid'});
      await assert.rejects(payments.verify(duplicate.id,{token:duplicate.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/SYNTHETIC-INITIAL-1'}),denied(409));

      // Two different providers and sessions racing for the same confirmed
      // reference must have one winner, even without the old pending lock.
      const raceA=await payments.create({provider:'cbe',package_code:'premium',billing_cycle:'six_month',email:'race-a@example.invalid'});
      const raceB=await payments.create({provider:'cbe',package_code:'premium',billing_cycle:'six_month',email:'race-b@example.invalid'});
      const race=await Promise.allSettled([
        payments.verify(raceA.id,{token:raceA.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/SYNTHETIC-RACE-001'}),
        payments.verify(raceB.id,{token:raceB.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/SYNTHETIC-RACE-001'}),
      ]);
      assert.equal(race.filter(item=>item.status==='fulfilled').length,1);
      assert.equal(race.find(item=>item.status==='rejected').reason.statusCode,409);
      const winner=race[0].status==='fulfilled'?raceA:raceB;
      assert.equal((await payments.verify(winner.id,{token:winner.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/SYNTHETIC-RACE-001'})).status,'verified');

      // An unverified claim must not reserve a valid reference; it can also
      // be corrected and retried without erasing the original attempt.
      const blocker=await payments.create({provider:'cbe',package_code:'premium',billing_cycle:'six_month',email:'pending-a@example.invalid'});
      const rightful=await payments.create({provider:'cbe',package_code:'premium',billing_cycle:'six_month',email:'pending-b@example.invalid'});
      receiver='wrong-account';
      assert.equal((await payments.verify(blocker.id,{token:blocker.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/SYNTHETIC-PENDING-1'})).status,'verification_pending');
      receiver='0911234567';
      assert.equal((await payments.verify(rightful.id,{token:rightful.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/SYNTHETIC-PENDING-1'})).status,'verified');
      assert.equal((await payments.verify(blocker.id,{token:blocker.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/SYNTHETIC-CORRECT-1'})).status,'verified');

      // Recording a refund does not free a confirmed reference for reuse.
      const refund=await payments.create({provider:'cbe',package_code:'premium',billing_cycle:'six_month',email:'refund-a@example.invalid'});
      const paidRefund=await payments.verify(refund.id,{token:refund.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/SYNTHETIC-REFUND-1'});
      await payments.resolve(refund.id,{version:paidRefund.version,outcome:'refund_recorded',reason:'Synthetic external refund confirmed',evidence_reference:'SYNTHETIC-REFUND-EVIDENCE'},owner.id);
      const reuse=await payments.create({provider:'cbe',package_code:'premium',billing_cycle:'six_month',email:'refund-b@example.invalid'});
      await assert.rejects(payments.verify(reuse.id,{token:reuse.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/SYNTHETIC-REFUND-1'}),denied(409));
      const registered = await saas.registerDaycare(application);
      assert.equal(registered.application.status,'pending');
      assert.equal((await db('daycares').count('* as total'))[0].total,initialDaycareCount);
      await assert.rejects(saas.registerDaycare(application),denied(409));

      const approved = await saas.approveApplication(registered.application.id,{},owner.id);
      const daycare = approved.daycare;
      assert.equal(daycare.subscription_plan,'premium');
      assert.equal(daycare.billing_cycle,'six_month');
      assert.equal(Number(daycare.subscription_terms.price),500);
      assert.equal(daycare.trial_ends_at,null);
      assert.equal(new Date(daycare.subscription_ends_at).getTime(),addBillingPeriod(daycare.subscription_started_at,'six_month').getTime());
      assert.equal((await saas.approveApplication(registered.application.id,{},owner.id)).replayed,true);
      const admin = (await db('users').where({daycare_id:daycare.id,role_id:1}).first());
      assert.ok(admin);

      // Cancellation does not end the paid period or permit changing its terms early.
      let current = await subscriptions.summary(daycare.id);
      await subscriptions.action(daycare.id,{action:'cancel',version:current.version,request_key:'paid_test_cancel_00001',reason:'Customer requested cancellation at period end'},owner.id);
      current = await subscriptions.summary(daycare.id);
      const standard = await db('subscription_packages').where({code:'standard'}).first();
      await assert.rejects(subscriptions.action(daycare.id,{action:'change_package',version:current.version,request_key:'stale_test_change_0001',reason:'Attempt to use out of date package terms',package_code:'standard',billing_cycle:'monthly',terms_version:standard.version+1},owner.id),denied(409));
      await assert.rejects(subscriptions.action(daycare.id,{action:'change_package',version:current.version,request_key:'paid_test_change_00001',reason:'Attempt to change an active paid period',package_code:'standard',billing_cycle:'monthly',terms_version:standard.version},owner.id),denied(409));
      await subscriptions.action(daycare.id,{action:'resume',version:current.version,request_key:'paid_test_resume_0001',reason:'Customer requested subscription resumption'},owner.id);

      const renewal = await payments.createRenewal(daycare.id,admin.id,{provider:'cbe'});
      assert.equal(Number(renewal.terms.price),500);
      await assert.rejects(subscriptions.applyVerifiedRenewal(daycare.id,renewal.id,admin.id),denied(409));
      await assert.rejects(payments.resumeRenewal(daycare.id+1,renewal.id,{token:renewal.token}),denied(404));
      checked = await payments.verify(renewal.id,{token:renewal.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/SYNTHETIC-RENEWAL-1'});
      assert.equal(checked.status,'consumed');
      const results = await Promise.all([
        subscriptions.applyVerifiedRenewal(daycare.id,renewal.id,admin.id),
        subscriptions.applyVerifiedRenewal(daycare.id,renewal.id,admin.id),
      ]);
      assert.equal(results.filter(result=>result.replayed).length,2);
      const after = await subscriptions.summary(daycare.id);
      assert.equal(new Date(after.subscription_ends_at).getTime(),addBillingPeriod(daycare.subscription_ends_at,'six_month',daycare.subscription_started_at).getTime());
      assert.equal(after.history.filter(event=>event.action==='renew').length,1);
      await db('daycares').where({id:daycare.id}).update({subscription_ends_at:db.raw("NOW() - INTERVAL '2 years'")});
      await assert.rejects(payments.createRenewal(daycare.id,admin.id,{provider:'cbe'}),denied(409));
    } finally {
      delete require.cache[saasPath];
      if (oldSaas) require.cache[saasPath] = oldSaas;
      if (oldDb) require.cache[dbPath] = oldDb; else delete require.cache[dbPath];
    }
  });
});
