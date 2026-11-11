'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {withCurrentDatabase} = require('./helpers/auth-test-database.cjs');
const {createReminderWorker} = require('../src/modules/saas/subscription-reminders');
const {createPaymentService} = require('../src/modules/saas/subscription-payments.service');
const ocr = require('../src/modules/saas/subscription-payments.ocr');

test('numeric receipt references are extracted for independent verification', () => {
  assert.ok(ocr.candidates('Transaction reference 1234567890123456').includes('1234567890123456'));
});

test('reminder queue and platform statistics use persisted subscription state', async () => {
  await withCurrentDatabase(async ({db,pool}) => {
    await db('roles').insert({id:1,name:'admin'}).onConflict('id').ignore();
    const [standard,premium] = await db('daycares').insert([
      {name:'Synthetic Standard',slug:'reminder-standard',contact_email:'standard@example.invalid',status:'active',subscription_plan:'standard',subscription_status:'active',subscription_ends_at:db.raw("NOW() + INTERVAL '2 days'")},
      {name:'Synthetic Premium',slug:'reminder-premium',contact_email:'premium@example.invalid',status:'active',subscription_plan:'premium',subscription_status:'active',subscription_ends_at:db.raw("NOW() + INTERVAL '2 days'")},
    ]).returning('*');
    const [adminA,adminB] = await db('users').insert([
      {name:'Standard admin',email:'reminder-a@example.invalid',role_id:1,status:'active',daycare_id:standard.id,password_hash:'synthetic'},
      {name:'Premium admin',email:'reminder-b@example.invalid',role_id:1,status:'active',daycare_id:premium.id,password_hash:'synthetic'},
    ]).returning('*');

    // Simulate a reminder cancelled while the center was cancelled, then
    // resumption during the same paid period. A conflict must requeue it.
    await pool.query(`INSERT INTO subscription_reminders(daycare_id,user_id,period_end,status)
      SELECT d.id,$2,d.subscription_ends_at,'cancelled' FROM daycares d WHERE d.id=$1`,[standard.id,adminA.id]);
    const delivered = [];
    const options = {pool,from:'sender@example.invalid',portalUrl:'https://example.invalid',transporter:{async sendMail(message){await new Promise(resolve=>setTimeout(resolve,20));delivered.push(message.to);}}};
    await Promise.all([createReminderWorker(options).run(),createReminderWorker(options).run()]);
    assert.deepEqual([...delivered].sort(),[adminA.email,adminB.email].sort());
    const rows = await db('subscription_reminders').whereIn('daycare_id',[standard.id,premium.id]).orderBy('daycare_id');
    assert.equal(rows.length,2);
    assert.ok(rows.every(row=>row.status==='sent' && row.attempts===1));

    // Ensure a stale worker cannot overwrite a successful retry's result.
    const [third] = await db('daycares').insert({name:'Synthetic retry',slug:'reminder-retry',contact_email:'retry@example.invalid',status:'active',subscription_plan:'premium',subscription_status:'active',subscription_ends_at:db.raw("NOW() + INTERVAL '2 days'")}).returning('*');
    await db('users').insert({name:'Retry admin',email:'reminder-c@example.invalid',role_id:1,status:'active',daycare_id:third.id,password_hash:'synthetic'});
    let releaseFirst, firstStarted;
    const started = new Promise(resolve=>{firstStarted=resolve;});
    const workerA=createReminderWorker({...options,logger:{error(){}},transporter:{async sendMail(){firstStarted();await new Promise(resolve=>{releaseFirst=resolve;});throw new Error('stale send failure');}}});
    const runA=workerA.run();
    await started;
    await db('subscription_reminders').where({daycare_id:third.id}).update({lease_until:db.raw("NOW() - INTERVAL '1 second'")});
    await createReminderWorker(options).run();
    releaseFirst(); await runA;
    const retried=await db('subscription_reminders').where({daycare_id:third.id}).first();
    assert.equal(retried.status,'sent');
    assert.equal(retried.attempts,2);

    // Older review items stay reachable through pagination and search.
    const seed=Array.from({length:205},(_,index)=>({id:randomUUID(),secret_hash:'synthetic',email:`queue-${String(index).padStart(3,'0')}@example.invalid`,
      terms:'{}',status:'pending',amount:'100.00',currency:'ETB',recipient:'synthetic',expires_at:db.raw("NOW() + INTERVAL '30 days'")}));
    await db.batchInsert('subscription_payment_intents',seed,100);
    const payments=createPaymentService(pool);
    const page=await payments.list({limit:10,offset:200});
    assert.equal(page.total,205);assert.equal(page.items.length,5);
    const found=await payments.list({search:'queue-000@example.invalid'});
    assert.equal(found.total,1);assert.equal(found.items[0].email,'queue-000@example.invalid');

    const dbFile=require.resolve('../src/config/db'),serviceFile=require.resolve('../src/modules/saas/saas.service');
    const oldDb=require.cache[dbFile],oldService=require.cache[serviceFile];
    require.cache[dbFile]={id:dbFile,filename:dbFile,loaded:true,exports:pool};delete require.cache[serviceFile];
    try {
      const stats=await require(serviceFile).getPlatformStats();
      const expected=(await pool.query(`SELECT COUNT(*) FILTER (WHERE status='active' AND subscription_plan='standard')::int AS standard,
        COUNT(*) FILTER (WHERE status='active' AND subscription_plan='premium')::int AS premium,
        COUNT(*) FILTER (WHERE status='active' AND subscription_status='trialing' AND trial_ends_at>NOW())::int AS trial FROM daycares`)).rows[0];
      assert.deepEqual(stats.plans,expected);
      assert.equal(stats.active_trials,expected.trial);
    } finally {delete require.cache[serviceFile];if(oldService)require.cache[serviceFile]=oldService;if(oldDb)require.cache[dbFile]=oldDb;else delete require.cache[dbFile];}
  });
});
