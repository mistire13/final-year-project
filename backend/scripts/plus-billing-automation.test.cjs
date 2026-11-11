'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {withCurrentDatabase}=require('./helpers/auth-test-database.cjs');
const {createBillingAutomation,discountedFee,localDay}=require('../src/modules/billing-automation/service');
const {createBillingWorker,fromEnvironment}=require('../src/modules/billing-automation/worker');
const config={enabled:true,generate_day:1,due_day:10,default_fee:2000,discount_percent:10,discount_reason:'Synthetic recurring family discount',reminder_before_days:3,reminder_after_days:3,in_app_reminders:true,email_reminders:true,version:0,reason:'Configure synthetic monthly billing rules'};
test('billing fee calculations use exact cents, require positive fees and Addis Ababa calendar dates',()=>{
  assert.equal(discountedFee('3500.00','10.00'),'3150.00');assert.equal(discountedFee('0.05','10.00'),'0.05');
  assert.throws(()=>discountedFee('0',0),/positive/);assert.throws(()=>discountedFee('0.01',99.99),/zero-value/);
  assert.equal(localDay(new Date('2026-10-31T21:01:00Z')),'2026-11-01');
  const previous=process.env.BILLING_AUTOMATION_ENABLED;delete process.env.BILLING_AUTOMATION_ENABLED;
  try{assert.equal(fromEnvironment({},console),null);}finally{if(previous!==undefined)process.env.BILLING_AUTOMATION_ENABLED=previous;}
});

test('Plus billing previews, concurrent invoice runs, reminders, opt-in, retries and isolation persist correctly',async()=>{
  await withCurrentDatabase(async({db,pool})=>{
    await db('roles').insert([{id:1,name:'admin'},{id:3,name:'parent'}]).onConflict('id').ignore();
    const [center,other]=await db('daycares').insert([
      {name:'Synthetic Plus Billing',slug:'synthetic-plus-billing',contact_email:'plus-billing-office@example.invalid',status:'active',subscription_plan:'premium',subscription_status:'active',subscription_ends_at:'2028-01-01T00:00:00Z',subscription_terms:JSON.stringify({code:'premium',features:{billing_automation:true},feature_policy_version:1})},
      {name:'Synthetic Standard Billing',slug:'synthetic-standard-billing',contact_email:'standard-billing-office@example.invalid',status:'active',subscription_plan:'standard'},
    ]).returning('*');
    const [admin,parent,otherAdmin,otherParent]=await db('users').insert([
      {name:'Billing Admin',email:'billing-admin@example.invalid',password_hash:'synthetic',role_id:1,daycare_id:center.id,status:'active'},
      {name:'Billing Parent',email:'billing-parent@example.invalid',password_hash:'synthetic',role_id:3,daycare_id:center.id,status:'active'},
      {name:'Other Admin',email:'other-billing-admin@example.invalid',password_hash:'synthetic',role_id:1,daycare_id:other.id,status:'active'},
      {name:'Other Parent',email:'other-billing-parent@example.invalid',password_hash:'synthetic',role_id:3,daycare_id:other.id,status:'active'},
    ]).returning('*');
    const user={...admin,role:'admin'},parentUser={...parent,role:'parent'};
    const children=await db('children').insert([
      {full_name:'Synthetic Billing Child A',dob:'2023-01-01',daycare_id:center.id,enrollment_status:'active',monthly_care_fee:'1000.00'},
      {full_name:'Synthetic Billing Child B',dob:'2023-02-01',daycare_id:center.id,enrollment_status:'active',monthly_care_fee:null},
    ]).returning('*');
    await db('guardian_links').insert(children.map(child=>({child_id:child.id,user_id:parent.id,relationship:'parent',pickup_authorized:false,created_by:admin.id,daycare_id:center.id})));
    let now=new Date('2026-11-10T09:00:00Z');const service=createBillingAutomation(pool,{now:()=>now});
    assert.deepEqual(await service.parentPreferences(parentUser),{billing_email:false});
    await assert.rejects(service.parentPreferences({...parentUser,daycare_id:other.id}),error=>error.statusCode===403);
    assert.equal((await service.settings(user)).version,0);
    await assert.rejects(service.save(config,user),error=>error.statusCode===409);
    const preview=await service.preview(config,user);assert.equal(preview.generated_count,2);assert.equal(preview.total_amount,'2700.00');
    assert.equal((await db('child_invoices')).length,0,'preview never creates invoices');
    await assert.rejects(service.save({...config,preview_id:preview.preview_id,default_fee:2100},user),error=>error.statusCode===409);
    const saved=await service.save({...config,preview_id:preview.preview_id},user);assert.equal(saved.enabled,true);assert.equal(saved.version,1);
    await assert.rejects(service.save({...config,preview_id:preview.preview_id},user),error=>error.statusCode===409);
    const outcomes=await Promise.all([service.generate(center.id),service.generate(center.id)]);
    assert.equal(outcomes.filter(row=>row.generated_count===2).length,1);
    let invoices=await db('child_invoices').where({daycare_id:center.id}).orderBy('child_id');assert.equal(invoices.length,2);assert.deepEqual(invoices.map(row=>row.amount),['900.00','1800.00']);
    assert.equal((await db('billing_automation_runs')).length,1);
    const changed={...config,default_fee:3000,version:saved.version,reason:'Adjust future synthetic monthly billing only'};
    const nextPreview=await service.preview(changed,user);assert.equal(nextPreview.generated_count,0);assert.equal(nextPreview.skipped_count,2);
    const changedSettings=await service.save({...changed,preview_id:nextPreview.preview_id},user);
    assert.equal((await service.generate(center.id)).skipped,true);
    assert.deepEqual((await db('child_invoices').orderBy('child_id')).map(row=>row.amount),['900.00','1800.00']);
    now=new Date('2026-11-13T09:00:00Z');
    assert.equal(await service.enqueue(center.id),2);assert.equal(await service.enqueue(center.id),0);
    assert.equal((await db('billing_automation_reminders').where({channel:'email'})).length,0,'email is not opted in by default');
    const log={error(){}};const worker=createBillingWorker({pool,now:()=>now,logger:log});
    assert.equal(await worker.deliver(center.id),2);assert.equal(await worker.deliver(center.id),0);
    assert.equal((await db('messages').where({daycare_id:center.id,recipient_id:parent.id})).length,2);
    const inbox=await service.parentReminders(parentUser);assert.equal(inbox.reminders.length,2);
    await service.readReminder(inbox.reminders[0].id,parentUser);assert.ok((await service.parentReminders(parentUser)).reminders[0].read_at);
    assert.equal((await service.parentReminders({...otherParent,role:'parent'})).reminders.length,0);
    await assert.rejects(service.readReminder(inbox.reminders[0].id,{...otherParent,role:'parent'}),error=>error.statusCode===404);
    await service.emailPreference(true,parentUser);
    assert.deepEqual(await service.parentPreferences(parentUser),{billing_email:true});
    assert.deepEqual(await service.parentPreferences({...otherParent,role:'parent'}),{billing_email:false});
    await db('child_invoices').where({id:invoices[0].id}).update({amount_paid:invoices[0].amount,status:'paid'});
    assert.equal(await service.enqueue(center.id),1,'only the unpaid invoice receives the newly opted-in email');
    let deliveries=0;const mailWorker=createBillingWorker({pool,now:()=>now,logger:log,emailEnabled:true,from:'billing@example.invalid',transporter:{sendMail:async message=>{deliveries++;assert.equal(message.to,parent.email);if(deliveries===1)throw Error('Synthetic SMTP failure');}}});
    await mailWorker.deliver(center.id);let email=(await db('billing_automation_reminders').where({channel:'email'}))[0];assert.equal(email.status,'pending');assert.equal(email.attempts,1);
    await db('billing_automation_reminders').where({id:email.id}).update({next_attempt_at:new Date(Date.now()-1000)});
    await mailWorker.deliver(center.id);email=await db('billing_automation_reminders').where({id:email.id}).first();assert.equal(email.status,'sent');assert.equal(email.attempts,2);
    const [past]=await db('child_invoices').insert({daycare_id:center.id,child_id:children[0].id,parent_id:parent.id,invoice_type:'custom',billing_period:'2026-10',title:'Synthetic old balance',amount:'100.00',amount_paid:0,due_date:'2026-10-01',status:'pending'}).returning('*');
    await db('users').where({id:parent.id}).update({ui_preferences:JSON.stringify({notifications:{messages:false,billing_email:true}})});
    await service.enqueue(center.id);assert.equal((await db('billing_automation_reminders').where({invoice_id:past.id,channel:'in_app'})).length,0);
    await db('child_invoices').where({id:past.id}).update({amount_paid:100,status:'paid'});
    const previousDeliveries=deliveries;await mailWorker.deliver(center.id);assert.equal(deliveries,previousDeliveries,'paid invoices are rechecked before delivery');
    assert.equal((await db('billing_automation_reminders').where({invoice_id:past.id,channel:'email'}).first()).status,'cancelled');
    const aging=(await service.history(user)).aging;assert.equal(aging.days_1_30,'1800.00');
    // Tenant RLS isolation and platform-control privacy remain intact.
    const client=await pool.connect();try{
      await client.query('BEGIN');await client.query('SET LOCAL ROLE ankelba_tenant');await client.query("SELECT set_config('app.daycare_id',$1,true)",[String(other.id)]);
      assert.equal((await client.query('SELECT * FROM billing_automation_settings')).rows.length,0);await client.query('ROLLBACK');
      await client.query('BEGIN');await client.query('SET LOCAL ROLE ankelba_control');await client.query('SAVEPOINT private_billing');
      await assert.rejects(client.query('SELECT * FROM billing_automation_settings'),error=>error.code==='42501');await client.query('ROLLBACK TO SAVEPOINT private_billing');
      assert.deepEqual((await client.query('SELECT * FROM public.billing_automation_tenants()')).fields.map(field=>field.name),['daycare_id']);await client.query('ROLLBACK');
      await client.query('SET ROLE ankelba_tenant');
      const tenant=require('../src/db/tenant-pool').createTenantPool({connect:async()=>({query:(...args)=>client.query(...args),release(){}})});
      await tenant.withTenant(center.id,async()=>{
        const actual=createBillingAutomation(tenant,{now:()=>now});
        assert.equal((await actual.settings(user)).version,changedSettings.version);
        const tenantPreview=await actual.preview({...changed,version:changedSettings.version},user);assert.equal(tenantPreview.skipped_count,2);
      });
      await client.query('RESET ROLE');
    }finally{client.release();}
    await assert.rejects(service.settings({...otherAdmin,role:'admin'}),error=>error.statusCode===403);
    await assert.rejects(service.settings({...otherAdmin,daycare_id:center.id,role:'admin'}),error=>error.statusCode===403);
    await db('daycares').where({id:center.id}).update({subscription_plan:'standard',subscription_terms:JSON.stringify({code:'standard',features:{billing_automation:false}})});
    assert.equal((await service.generate(center.id)).blocked,true);
    await assert.rejects(service.save({...changed,version:changedSettings.version,enabled:false},user),error=>error.statusCode===403);
    assert.equal((await service.history(user)).runs.length,1,'history remains readable after downgrade');
    assert.deepEqual(await service.parentPreferences(parentUser),{billing_email:true},'preferences remain readable after downgrade');
    await service.emailPreference(false,parentUser);
    assert.deepEqual(await service.parentPreferences(parentUser),{billing_email:false});
    assert.equal((await db('child_invoices')).length,3,'downgrade never deletes existing invoices');
    // Recover exhausted retries via reviewed settings without rewriting issued
    // invoices or reopening completed monthly runs.
    await db('daycares').where({id:center.id}).update({subscription_plan:'premium',subscription_terms:JSON.stringify({code:'premium',features:{billing_automation:true}})});
    now=new Date('2026-12-10T09:00:00Z');
    const [exhausted]=await db('billing_automation_runs').insert({daycare_id:center.id,billing_period:'2026-12',status:'failed',attempts:5,configuration:config,last_error:'Synthetic exhausted generation failure',next_attempt_at:'2026-12-11T00:00:00Z'}).returning('*');
    assert.equal((await service.generate(center.id)).skipped,true);
    const corrected={...changed,default_fee:3100,version:changedSettings.version,reason:'Correct fee and retry failed December generation'};
    const correctedPreview=await service.preview(corrected,user);
    await service.save({...corrected,preview_id:correctedPreview.preview_id},user);
    const reset=await db('billing_automation_runs').where({id:exhausted.id}).first();
    assert.equal(reset.attempts,0);assert.equal(reset.next_attempt_at,null);assert.equal(reset.last_error,'Synthetic exhausted generation failure','failure evidence survives until successful retry');
    assert.equal((await service.generate(center.id)).generated_count,2);
    assert.equal((await service.generate(center.id)).skipped,true);
    assert.deepEqual((await db('child_invoices').where({daycare_id:center.id,billing_period:'2026-12'}).orderBy('child_id')).map(row=>row.amount),['900.00','2790.00']);
    assert.deepEqual((await db('child_invoices').where({daycare_id:center.id,billing_period:'2026-11'}).orderBy('child_id')).map(row=>row.amount),['900.00','1800.00']);
    const retryAudit=await db('audit_logs').where({daycare_id:center.id,action:'BILLING_AUTOMATION_UPDATED'}).orderBy('id','desc').first();
    assert.deepEqual(retryAudit.metadata.retried_run_ids,[String(exhausted.id)]);
  });
});
