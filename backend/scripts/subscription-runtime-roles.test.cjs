'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { withCurrentDatabase } = require('./helpers/auth-test-database.cjs');
const { createPaymentService } = require('../src/modules/saas/subscription-payments.service');

test('restricted runtime roles enforce child capacity and record subscription payment reviews', async () => {
  await withCurrentDatabase(async ({db,pool}) => {
    await db('roles').insert([{id:0,name:'super_admin'},{id:1,name:'admin'}]).onConflict('id').ignore();
    const [owner] = await db('users').insert({name:'Test operator',email:'roles-owner@example.invalid',role_id:0,status:'active',password_hash:'fixture'}).returning('*');
    const [center] = await db('daycares').insert({name:'Runtime quota',slug:'runtime-quota',contact_email:'roles-center@example.invalid',status:'active',max_children:1}).returning('*');
    await db('subscription_packages').where({code:'standard'}).update({monthly_price:'100.00'});

    const tenant=await pool.connect();
    try {
      await tenant.query('BEGIN');
      await tenant.query('SET LOCAL ROLE ankelba_tenant');
      await tenant.query("SELECT set_config('app.daycare_id',$1,true)",[String(center.id)]);
      await tenant.query("INSERT INTO children(full_name,dob,daycare_id,enrollment_status) VALUES('First','2022-01-01',$1,'active')",[center.id]);
      await tenant.query('SAVEPOINT quota_check');
      await assert.rejects(tenant.query("INSERT INTO children(full_name,dob,daycare_id,enrollment_status) VALUES('Second','2022-01-01',$1,'active')",[center.id]),
        error => error.code==='23514' && error.constraint==='daycare_active_child_quota');
      await tenant.query('ROLLBACK TO SAVEPOINT quota_check');
      await tenant.query('SAVEPOINT payment_check');
      await assert.rejects(tenant.query('SELECT * FROM subscription_payment_intents'), error => error.code==='42501');
      await tenant.query('ROLLBACK TO SAVEPOINT payment_check');
      await tenant.query('ROLLBACK');
    } finally { tenant.release(); }

    const control=await pool.connect();
    try {
      await control.query('SET ROLE ankelba_control');
      const runtime = {query:(...args)=>control.query(...args), connect:async()=>({query:(...args)=>control.query(...args),release(){}})};
      const payments=createPaymentService(runtime,{apiKey:'synthetic-key',fetch:async()=>({ok:false,json:async()=>({success:false})})});
      const settings=await payments.getSettings();
      await payments.updateSettings({version:settings.version,accounts:{cbe:{enabled:true,account_holder:'Test owner',account_number:'0911234567'},abyssinia:{enabled:false,account_holder:'',account_number:''}},reason:'Configure test subscription payment account'},owner.id);
      const intent=await payments.create({provider:'cbe',package_code:'standard',billing_cycle:'monthly',email:'roles-customer@example.invalid'});
      const pending=await payments.verify(intent.id,{token:intent.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/SYNTHETIC-ROLES-001'});
      assert.equal(pending.status,'verification_pending');
      const reviewed=await payments.review(intent.id,{version:pending.version,decision:'approve',reason:'Confirmed using synthetic bank evidence',verified_reference:'SYNTHETIC-ROLES-001',evidence_reference:'SYNTHETIC-EVIDENCE-001',amount_and_receiver_confirmed:true},owner.id);
      assert.equal(reviewed.status,'verified');
      const audit=(await control.query("SELECT action FROM audit_logs WHERE actor_id=$1 AND action IN ('SUBSCRIPTION_PAYMENT_SETTINGS_CHANGED','SUBSCRIPTION_PAYMENT_REVIEWED') ORDER BY action",[owner.id])).rows;
      assert.deepEqual(audit.map(row=>row.action),['SUBSCRIPTION_PAYMENT_REVIEWED','SUBSCRIPTION_PAYMENT_SETTINGS_CHANGED']);
    } finally { await control.query('RESET ROLE'); control.release(); }
  });
});
