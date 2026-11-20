'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { withCurrentDatabase } = require('./helpers/auth-test-database.cjs');
const { createEmailAuth } = require('../src/modules/email/auth-codes');
const { createEmailWorker } = require('../src/modules/email/worker');
const { open } = require('../src/modules/email/outbox');
const { createMailer } = require('../src/modules/email/transport');
const secret = 'synthetic-email-test-secret-more-than-32-characters';
test('SMTP requires TLS, uses server sender, and rejects unaccepted mail', async () => {
  const env = { NODE_ENV:'test',EMAIL_DELIVERY_ENABLED:'true',SMTP_HOST:'smtp.invalid',SMTP_PORT:'587',SMTP_USER:'test',SMTP_PASSWORD:'synthetic',SMTP_FROM:'sender@example.invalid' };
  assert.equal(createMailer(env), null);
  let config, sent;
  const transport = createMailer({ ...env, NODE_ENV:'development' }, options => { config=options; return { sendMail: async message => { sent=message; return { accepted:[],rejected:['recipient@example.invalid'] }; } }; });
  await assert.rejects(transport.sendMail({ to:'recipient@example.invalid',from:'wrong@example.invalid' }), { code:'EMAIL_REJECTED' });
  assert.equal(config.requireTLS,true); assert.equal(config.secure,false); assert.equal(sent.from,env.SMTP_FROM);
});
test('Email codes, transactional events, recipient authorization, retries and restricted roles', async t => withCurrentDatabase(async ({ db, pool }) => {
  await db('roles').insert([{id:0,name:'super_admin'},{id:1,name:'admin'},{id:2,name:'caregiver'},{id:3,name:'parent'}]).onConflict('id').ignore();
  const [center] = await db('daycares').insert({name:'Email test',slug:'email-test',contact_email:'center@example.invalid',status:'active',subscription_plan:'standard'}).returning('*');
  const [admin,parent,unverified] = await db('users').insert([
    { name:'Admin',email:'admin@example.invalid',role_id:1 },{ name:'Parent',email:'parent@example.invalid',role_id:3 },{ name:'Unverified',email:'unverified@example.invalid',role_id:3 },
  ].map(u => ({ ...u,daycare_id:center.id,password_hash:bcrypt.hashSync('Initial-password!',4),status:'active' }))).returning('*');
  const service = createEmailAuth({ pool,enabled:true,secret });
  async function codeFor(id) { const row=await db('email_outbox').where({challenge_id:id}).first(); return open(row.protected_payload,row.id,secret).text.match(/code is: (\d{6})/)[1]; }
  const reset = await service.request({email:parent.email});
  const code = await codeFor(reset.request_id);
  assert.equal(JSON.stringify(reset).includes(code),false);
  await t.test('Codes are encrypted, unknown accounts are indistinguishable, requests are throttled', async () => {
    const row=await db('email_outbox').where({challenge_id:reset.request_id}).first();
    assert.equal(row.protected_payload.includes(code),false);
    assert.throws(()=>open(row.protected_payload,'different-id',secret));
    const unknown=await service.request({email:'unknown@example.invalid'});
    assert.equal(unknown.message,reset.message);
    assert.equal(await db('email_outbox').where({challenge_id:unknown.request_id}).first(),undefined);
    await service.request({email:parent.email});
    assert.equal(Number((await db('email_challenges').where({email:parent.email}).count('* AS count').first()).count),1);
  });
  await t.test('Wrong codes persist attempts, correct reset verifies email, invalidates prior tokens and prevents reuse', async () => {
    const wrong=code==='000000'?'111111':'000000';
    await assert.rejects(service.confirm({request_id:reset.request_id,code:wrong,new_password:'New-password-123!'}));
    assert.equal((await db('email_challenges').where({id:reset.request_id}).first()).attempts,1);
    await service.confirm({request_id:reset.request_id,code,new_password:'New-password-123!'});
    const updated=await db('users').where({id:parent.id}).first();
    assert.ok(updated.email_verified_at); assert.ok(await bcrypt.compare('New-password-123!',updated.password_hash));
    await assert.rejects(service.confirm({request_id:reset.request_id,code,new_password:'Reused-password!'}));
  });
  await t.test('Five failed guesses lock a code; expired and changed-account codes cannot be used', async () => {
    const challenge=await service.request({email:unverified.email,purpose:'verify'}),correct=await codeFor(challenge.request_id);
    for(let i=0;i<5;i++)await assert.rejects(service.confirm({request_id:challenge.request_id,code:correct==='000000'?'111111':'000000'}));
    await assert.rejects(service.confirm({request_id:challenge.request_id,code:correct}));
    const verify=await service.request({email:admin.email,purpose:'verify'}),adminCode=await codeFor(verify.request_id);
    await db('email_challenges').where({id:verify.request_id}).update({expires_at:new Date(Date.now()-1)});
    await assert.rejects(service.confirm({request_id:verify.request_id,code:adminCode}));
    await db('users').where({id:parent.id}).update({email:'changed@example.invalid'});
    assert.equal((await db('users').where({id:parent.id}).first()).email_verified_at,null);
    await db('users').where({id:parent.id}).update({email:parent.email,email_verified_at:new Date()});
    await db('users').where({id:parent.id}).update({email_verified_at:new Date()});
  });
  await db('email_outbox').del();
  await t.test('Tenant writes enqueue atomically without queue-reading access', async () => {
    const c=await pool.connect();
    try {
      await c.query('BEGIN'); await c.query('SET LOCAL ROLE ankelba_tenant');
      await c.query("SELECT set_config('app.daycare_id',$1,true)",[String(center.id)]);
      await c.query('INSERT INTO messages(daycare_id,sender_id,recipient_id,body) VALUES($1,$2,$3,$4)',[center.id,admin.id,parent.id,'Private message content']);
      await assert.rejects(c.query('SELECT protected_payload FROM email_outbox'),/permission denied/);
      await c.query('ROLLBACK');
    } finally { await c.query('ROLLBACK'); c.release(); }
    assert.equal(Number((await db('email_outbox').count('* AS count').first()).count),0);
  });
  await db('messages').insert([{daycare_id:center.id,sender_id:admin.id,recipient_id:parent.id,body:'Private child detail'},
    {daycare_id:center.id,sender_id:admin.id,recipient_id:unverified.id,body:'Do not email unverified'}]);
  const sent=[];
  const worker=createEmailWorker({pool,secret,portalUrl:'https://example.invalid',transport:{sendMail:async m=>{sent.push(m);return {accepted:true,messageId:'synthetic-message-id'};}},logger:{error:()=>{}}});
  await t.test('Only verified recipients receive generic notices; reruns do not duplicate accepted mail', async () => {
    await worker.run(); await worker.run();
    assert.equal(sent.length,1); assert.equal(sent[0].to,parent.email); assert.equal(JSON.stringify(sent).includes('Private child detail'),false);
    const statuses=(await db('email_outbox').select('status')).map(r=>r.status).sort();assert.deepEqual(statuses,['accepted','cancelled']);
  });
  await t.test('Preferences suppress updates; temporary failures retry and relay rejection never becomes accepted', async () => {
    await db('users').where({id:parent.id}).update({ui_preferences:JSON.stringify({notifications:{email:false}})});
    await db('messages').insert({daycare_id:center.id,sender_id:admin.id,recipient_id:parent.id,body:'Muted'});
    await worker.run();assert.equal(sent.length,1);
    await db('users').where({id:parent.id}).update({ui_preferences:JSON.stringify({notifications:{email:true}})});
    const [message]=await db('messages').insert({daycare_id:center.id,sender_id:admin.id,recipient_id:parent.id,body:'Retry'}).returning('*');
    const failed=createEmailWorker({pool,secret,portalUrl:'https://example.invalid',transport:{sendMail:async()=>{throw Object.assign(new Error('temporary'),{code:'ETIMEDOUT'});}},logger:{error:()=>{}}});
    await failed.run();const row=await db('email_outbox').where({kind:'message',event_id:message.id}).first();
    assert.equal(row.status,'pending');assert.equal(row.attempts,1);assert.equal(row.last_error,'ETIMEDOUT');
    await db('email_outbox').where({id:row.id}).update({next_attempt_at:new Date(Date.now()-1000)});
    await worker.run();assert.equal((await db('email_outbox').where({id:row.id}).first()).status,'accepted');
  });
  await t.test('Restricted control role verifies codes and resets platform passwords', async () => {
    const { Pool } = require('pg');
    const control = new Pool({ ...pool.options, password:pool.options.password, options:'-c role=ankelba_control',max:1 });
    try {
      const restricted = createEmailAuth({pool:control,enabled:true,secret});
      const [owner]=await db('platform_accounts').insert({name:'Owner',email:'owner@example.invalid',status:'active',password_hash:bcrypt.hashSync('Owner-password!',4)}).returning('*');
      const [session]=await db('auth_sessions').insert({platform_account_id:owner.id,token_hash:'1'.repeat(64),expires_at:new Date(Date.now()+3600000)}).returning('*');
      const [pending]=await db('auth_challenges').insert({platform_account_id:owner.id,purpose:'login_mfa',token_hash:'2'.repeat(64),expires_at:new Date(Date.now()+3600000)}).returning('*');
      const result=await restricted.request({email:owner.email,account_type:'platform'});
      const value=await codeFor(result.request_id);
      await restricted.confirm({request_id:result.request_id,code:value,new_password:'Updated-owner-password!'});
      assert.ok(await bcrypt.compare('Updated-owner-password!',(await db('platform_accounts').where({id:owner.id}).first()).password_hash));
      assert.ok((await db('auth_sessions').where({id:session.id}).first()).revoked_at);
      assert.ok((await db('auth_challenges').where({id:pending.id}).first()).revoked_at);
      // Verification changes mailbox state, never the password or session revision.
      await db('email_challenges').where({email:admin.email}).update({created_at:new Date(Date.now()-120000)});
      const verification=await restricted.request({email:admin.email,purpose:'verify'}),verifyCode=await codeFor(verification.request_id);
      const before=await db('users').where({id:admin.id}).first();
      await restricted.confirm({request_id:verification.request_id,code:verifyCode});
      const after=await db('users').where({id:admin.id}).first();
      assert.ok(after.email_verified_at); assert.equal(after.password_hash,before.password_hash);assert.equal(after.security_revision,before.security_revision);
    } finally { await control.end(); }
  });
  await t.test('Child events queue for linked parents and are cancelled if the guardian link is removed', async () => {
    await db('email_outbox').del();
    const [caregiver]=await db('users').insert({name:'Caregiver',email:'caregiver@example.invalid',role_id:2,daycare_id:center.id,status:'active',password_hash:bcrypt.hashSync('Caregiver-password!',4)}).returning('*');
    const [child]=await db('children').insert({full_name:'Child',dob:'2023-01-01',gender:'female',daycare_id:center.id,caregiver_id:caregiver.id,enrollment_status:'active'}).returning('*');
    await db('guardian_links').insert({child_id:child.id,user_id:parent.id,daycare_id:center.id,relationship:'Mother',pickup_authorized:true,created_by:admin.id});
    await db('email_outbox').del();
    await db('daily_reports').insert({child_id:child.id,caregiver_id:caregiver.id,daycare_id:center.id,report_date:'2026-11-18'});
    await db('health_records').insert({child_id:child.id,recorded_by:caregiver.id,daycare_id:center.id,record_type:'incident',description:'Private incident detail',severity:'low'});
    await db('attendance').insert([{child_id:child.id,recorded_by:admin.id,daycare_id:center.id,event_type:'checkin'},{child_id:child.id,recorded_by:admin.id,daycare_id:center.id,event_type:'checkout'}]);
    const [invoice]=await db('child_invoices').insert({daycare_id:center.id,child_id:child.id,parent_id:parent.id,billing_period:'2026-11',title:'Care fees',amount:1200,due_date:'2026-11-30'}).returning('*');
    await db('child_payments').insert({daycare_id:center.id,invoice_id:invoice.id,amount_paid:100,payment_method:'cash_at_daycare',receipt_number:'EMAIL-TEST-1',recorded_by:admin.id});
    const jobs=await db('email_outbox').select('*');
    assert.deepEqual(jobs.map(j=>j.kind).sort(),['care_receipt','checkin','health_record','invoice','pickup','report']);
    for(const job of jobs) {assert.equal(job.user_id,parent.id); assert.ok(await worker.resolve(job));}
    await db('guardian_links').where({child_id:child.id,user_id:parent.id}).del();
    for(const job of jobs)assert.equal(await worker.resolve(job),null);
  });
  await t.test('Announcement and urgent alert emails reuse the same audience rules as the app', async () => {
    const dbPath=require.resolve('../src/config/db');const prior=require.cache[dbPath];
    const servicePath=require.resolve('../src/modules/communication/communication.service');
    require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:pool};delete require.cache[servicePath];
    try {
      await db('email_outbox').del();
      const [allowed]=await db('announcements').insert({daycare_id:center.id,author_id:admin.id,title:'Parents',body:'Private announcement',audience:'parents'}).returning('*');
      const [blocked]=await db('announcements').insert({daycare_id:center.id,author_id:admin.id,title:'Staff',body:'Staff-only',audience:'staff'}).returning('*');
      const [alert]=await db('alerts').insert({daycare_id:center.id,author_id:admin.id,title:'Private alert',urgency:'high',recipient_scope:'individual',target_user_id:unverified.id}).returning('*');
      for(const job of await db('email_outbox').where({user_id:parent.id})){
        const result=await worker.resolve(job);
        if(job.kind==='announcement'&&job.event_id===allowed.id)assert.ok(result);
        if(job.kind==='announcement'&&job.event_id===blocked.id)assert.equal(result,null);
        if(job.kind==='alert'&&job.event_id===alert.id)assert.equal(result,null);
      }
    } finally { delete require.cache[servicePath];if(prior)require.cache[dbPath]=prior;else delete require.cache[dbPath]; }
  });
}));
