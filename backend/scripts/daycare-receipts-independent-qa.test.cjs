'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {withCurrentDatabase}=require('./helpers/auth-test-database.cjs');
const {createDaycarePayments}=require('../src/modules/daycare-payments/service');
const disabled={enabled:false,account_holder:'',account_number:''};
const accounts={cbe:{enabled:true,account_holder:'QA Daycare Receiver',account_number:'1000000001'},abyssinia:disabled,telebirr:disabled};
const body={version:0,accounts,reason:'Independently reviewed synthetic daycare receiving account'};
async function fixture(db){
  await db('roles').insert([{id:1,name:'admin'},{id:3,name:'parent'}]).onConflict('id').ignore();
  const [center]=await db('daycares').insert({name:'Independent receipt QA',slug:'independent-receipt-qa',contact_email:'independent-receipt@example.invalid',status:'active',subscription_plan:'standard',subscription_status:'active',subscription_ends_at:new Date(Date.now()-1000)}).returning('*');
  const [a,p]=await db('users').insert([{name:'QA Receiving Admin',email:'qa-receiving-admin@example.invalid',role_id:1},{name:'QA Billing Parent',email:'qa-billing-parent@example.invalid',role_id:3}].map(row=>({...row,daycare_id:center.id,password_hash:'synthetic',status:'active'}))).returning('*');
  const admin={...a,role:'admin'},parent={...p,role:'parent'};
  const [child]=await db('children').insert({full_name:'Independent receipt child',dob:'2023-01-01',daycare_id:center.id}).returning('*');
  await db('guardian_links').insert({child_id:child.id,user_id:p.id,daycare_id:center.id,created_by:a.id,relationship:'Parent',pickup_authorized:true});
  const makeInvoice=async(n,paid=0)=>(await db('child_invoices').insert({daycare_id:center.id,child_id:child.id,parent_id:p.id,invoice_type:'custom',billing_period:'2026-'+String(n).padStart(2,'0'),title:'Independent QA obligation '+n,amount:100,amount_paid:paid,due_date:'2026-12-01',status:paid?'partially_paid':'pending',created_at:new Date(Date.now()-2*86400000)}).returning('*'))[0];
  return {center,admin,parent,child,makeInvoice};
}
function success(reference,{amount=100,payer='QA Billing Parent',receiver='QA Daycare Receiver',account='1000000001',date=new Date(Date.now()-86400000).toISOString()}={}){
  const actual=reference.startsWith('https://')?new URL(reference).pathname.slice(1):reference;
  return {available:true,result:{success:true,data:{status:'completed',reference:actual,amount,currency:'ETB',receiverName:receiver,receiverAccount:account,transactionDate:date,payerName:payer}}};
}

test('new physical cash receipts preserve cash provenance and cannot impersonate bank evidence',async()=>{
  await withCurrentDatabase(async({db,pool})=>{
    const f=await fixture(db),invoice=await f.makeInvoice(1);
    const dbPath=require.resolve('../src/config/db'),servicePath=require.resolve('../src/modules/finances/finances.service');
    const oldDb=require.cache[dbPath],oldService=require.cache[servicePath];
    require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:pool};delete require.cache[servicePath];
    try{
      const service=require(servicePath);
      for(const method of ['cbe_transfer','telebirr_transfer'])await assert.rejects(service.recordPayment(f.center.id,invoice.id,{amount_paid:100,payment_method:method,reference_code:'QA-MANUAL-NOT-BANK-PROOF'},f.admin.id),e=>e.statusCode===422);
      assert.equal((await db('child_payments').where({invoice_id:invoice.id})).length,0);
      const recorded=await service.recordPayment(f.center.id,invoice.id,{amount_paid:100,payment_method:'cash_at_daycare',notes:'Synthetic physical cash received by administrator'},f.admin.id);
      assert.equal(recorded.receipt.verification_source,'cash_confirmed','immediate receipt response must preserve the persisted cash provenance');
      assert.equal(recorded.payment.verification_source,'cash_confirmed');
      const payment=await db('child_payments').where({invoice_id:invoice.id}).first();
      assert.equal(payment.verification_source,'cash_confirmed');assert.equal(payment.daycare_payment_request_id,null);
      assert.equal(payment.payment_method,'cash_at_daycare');assert.ok(payment.verified_at);
      assert.equal((await db('child_invoices').where({id:invoice.id}).first()).amount_paid,'100.00');
      assert.equal((await db('daycare_payment_requests')).length,0,'physical cash creates no bank verification claim');
    }finally{if(oldDb)require.cache[dbPath]=oldDb;else delete require.cache[dbPath];if(oldService)require.cache[servicePath]=oldService;else delete require.cache[servicePath];}
  });
});
test('concurrent first receiving settings saves preserve one reviewed version instead of silently overwriting',async()=>{
  await withCurrentDatabase(async({db,pool})=>{
    const f=await fixture(db),svc=createDaycarePayments(pool);
    const changed={...body,accounts:{...accounts,cbe:{...accounts.cbe,account_holder:'Other QA Receiver',account_number:'1000000002'}}};
    const results=await Promise.allSettled([svc.saveSettings(body,f.admin),svc.saveSettings(changed,f.admin)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.statusCode===409).length,1);
    const current=await svc.settings(f.admin);assert.equal(current.version,1);
    assert.deepEqual(current.accounts.cbe,results.find(r=>r.status==='fulfilled').value.accounts.cbe);
  });
});
test('Standard existing care fees use captured daycare receiver and invoice timing; local SaaS test mode cannot weaken receipt checks',async()=>{
  await withCurrentDatabase(async({db,pool})=>{
    const f=await fixture(db),responses=[];
    const svc=createDaycarePayments(pool,{lookup:async input=>responses.shift()(input)});
    await svc.saveSettings(body,f.admin);
    const invoice=await f.makeInvoice(1,25);
    const request=await svc.create({purpose:'invoice',target_id:invoice.id,provider:'cbe',request_key:crypto.randomUUID()},f.parent);
    assert.equal(request.amount,'75.00');assert.equal(request.expected.account_number,'1000000001');
    await svc.saveSettings({...body,version:1,accounts:{...accounts,cbe:{enabled:true,account_holder:'New QA Receiver',account_number:'1000000002'}}},f.admin);
    responses.push(input=>success(input.reference,{amount:75}));
    const applied=await svc.verify(request.id,{version:request.version,reference:'https://mbreciept.cbe.com.et/QA-INVOICE-OLDER-THAN-REQUEST'},f.parent);
    assert.equal(applied.status,'applied','a real receipt after invoice issue but before opening the app is accepted');
    const payment=await db('child_payments').where({daycare_payment_request_id:request.id}).first();assert.equal(payment.verification_source,'provider_verified');assert.equal(payment.amount_paid,'75.00');
    assert.equal((await db('child_invoices').where({id:invoice.id}).first()).amount_paid,'100.00');
    assert.equal((await db('daycares').where({id:f.center.id}).first()).subscription_status,'active','care settlement does not renew or alter the expired SaaS period');
    const mismatch=await f.makeInvoice(2),wrong=await svc.create({purpose:'invoice',target_id:mismatch.id,provider:'cbe',request_key:crypto.randomUUID()},f.parent);
    const previousEnv=process.env.NODE_ENV,previousMode=process.env.SUBSCRIPTION_NAME_AMOUNT_TEST_MODE;
    try{
      process.env.NODE_ENV='development';process.env.SUBSCRIPTION_NAME_AMOUNT_TEST_MODE='true';
      responses.push(input=>success(input.reference,{receiver:'New QA Receiver',account:'9999999999'}));
      const pending=await svc.verify(wrong.id,{version:wrong.version,reference:'https://mbreciept.cbe.com.et/QA-INVOICE-STRICT-WRONG-ACCOUNT'},f.parent);
      assert.equal(pending.status,'review_pending');assert.equal(pending.verified_at,null);
      assert.equal((await db('child_invoices').where({id:mismatch.id}).first()).amount_paid,'0.00');
      assert.equal((await db('child_payments').where({daycare_payment_request_id:wrong.id})).length,0);
    }finally{if(previousEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousEnv;if(previousMode===undefined)delete process.env.SUBSCRIPTION_NAME_AMOUNT_TEST_MODE;else process.env.SUBSCRIPTION_NAME_AMOUNT_TEST_MODE=previousMode;}
  });
});
test('a concurrent cash balance change preserves confirmed bank money for reconciliation without double settlement or claim reuse',async()=>{
  await withCurrentDatabase(async({db,pool})=>{
    const f=await fixture(db);let invoice;
    const svc=createDaycarePayments(pool,{lookup:async input=>{await db('child_invoices').where({id:invoice.id}).update({amount_paid:25,status:'partially_paid'});return success(input.reference);}});
    await svc.saveSettings(body,f.admin);invoice=await f.makeInvoice(1);
    const request=await svc.create({purpose:'invoice',target_id:invoice.id,provider:'cbe',request_key:crypto.randomUUID()},f.parent);
    const result=await svc.verify(request.id,{version:request.version,reference:'https://mbreciept.cbe.com.et/QA-VERIFIED-BALANCE-CHANGED'},f.parent);
    assert.equal(result.status,'verified_unapplied');assert.ok(result.verified_at);assert.equal(result.verification_source,'provider_verified');
    assert.equal((await db('child_invoices').where({id:invoice.id}).first()).amount_paid,'25.00');
    assert.equal((await db('child_payments').where({daycare_payment_request_id:request.id})).length,0);
    await assert.rejects(svc.review(request.id,{version:result.version,decision:'reject',reason:'Cannot discard independently confirmed received money',evidence_reference:'QA-RECONCILIATION-001'},f.admin),e=>e.statusCode===409);
    const intent=crypto.randomUUID();await db('subscription_payment_intents').insert({id:intent,email:'qa-other-purpose@example.invalid',secret_hash:'synthetic-unused',terms:{},status:'verified',amount:100,currency:'ETB',recipient:'1000000001',provider:'cbe',payment_reference:'QA-VERIFIED-BALANCE-CHANGED',expires_at:new Date(Date.now()+86400000)});
    await assert.rejects(db('subscription_payment_references').insert({provider:'cbe',reference:'QA-VERIFIED-BALANCE-CHANGED',intent_id:intent,source:'independent_qa'}),e=>e.code==='23505');
    assert.equal((await db('daycare_payment_requests').where({id:request.id}).first()).status,'verified_unapplied');
  });
});
