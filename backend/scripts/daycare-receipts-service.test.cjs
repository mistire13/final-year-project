'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {withCurrentDatabase}=require('./helpers/auth-test-database.cjs');
const {createDaycarePayments}=require('../src/modules/daycare-payments/service');
const base=()=>({telebirr:{enabled:true,account_holder:'Synthetic Receiver',account_number:'0911234567'},cbe:{enabled:true,account_holder:'Synthetic Receiver',account_number:'1000000000001'},abyssinia:{enabled:true,account_holder:'Synthetic Receiver',account_number:'2000000000001'}});
test('daycare receipts use strict evidence, preserve money through races and share permanent claims',async t=>{
 await withCurrentDatabase(async({db,pool})=>{
  await db('roles').insert([{id:0,name:'super_admin'},{id:1,name:'admin'},{id:3,name:'parent'}]).onConflict('id').ignore();
  const [dc,foreign]=(await db('daycares').insert([{name:'Receipt center',slug:'receipt-center',contact_email:'receipts@example.invalid',status:'active',subscription_plan:'standard',subscription_ends_at:new Date(Date.now()-86400000)},{name:'Foreign receipts',slug:'receipt-foreign',contact_email:'receipt-foreign@example.invalid',status:'active'}]).returning('*'));
  const addUser=async(center,role,label)=>({...((await db('users').insert({daycare_id:center.id,role_id:role==='admin'?1:3,name:label,email:label.replaceAll(' ','-')+'@example.invalid',status:'active',password_hash:'synthetic'}).returning('*'))[0]),role});
  const admin=await addUser(dc,'admin','Receipt Admin'),parent=await addUser(dc,'parent','Receipt Parent'),other=await addUser(foreign,'admin','Other Receipt Admin');
  const [child]=await db('children').insert({daycare_id:dc.id,full_name:'Synthetic Receipt Child',dob:'2023-01-01'}).returning('*');await db('guardian_links').insert({daycare_id:dc.id,child_id:child.id,user_id:parent.id,relationship:'Parent',created_by:admin.id,pickup_authorized:true});
  let serial=0,result={},calls=0,hook=async()=>{};
  const svc=createDaycarePayments(pool,{lookup:async input=>{calls++;await hook(input);const token=input.provider==='cbe'?new URL(input.reference).pathname.slice(1):input.reference;return {available:true,result:{success:true,data:{status:'completed',reference:token,amount:100,currency:'ETB',receiverName:'Synthetic Receiver',receiverAccount:input.provider==='telebirr'?'251911234567':input.provider==='abyssinia'?'2000000000001':'1000000000001',transactionDate:new Date(Date.now()-3600000).toISOString(),payerName:parent.name,...result}}};}});
  await svc.saveSettings({version:0,accounts:base(),reason:'Configure independently checked synthetic daycare receiver'},admin);
  async function request(provider='cbe') {serial++;const [invoice]=await db('child_invoices').insert({daycare_id:dc.id,child_id:child.id,parent_id:parent.id,invoice_type:'custom',billing_period:'2026-'+String(serial).padStart(2,'0'),title:'Synthetic fee '+serial,amount:100,amount_paid:0,due_date:'2026-11-01',status:'pending',created_at:new Date(Date.now()-86400000)}).returning('*');return {invoice,request:await svc.create({purpose:'invoice',target_id:invoice.id,provider,request_key:crypto.randomUUID()},parent)};}
  const proof=(r,token)=>({version:r.version,reference:r.provider==='cbe'?'https://mbreciept.cbe.com.et/'+token:token,...(r.provider==='abyssinia'?{suffix:'12345'}:{})});
  await t.test('expired Standard fee applies exact full balance and replays safely without touching SaaS',async()=>{
    const {invoice,request:r}=await request();const paid=await svc.verify(r.id,proof(r,'ReceiptCaseA'),parent);assert.equal(paid.status,'applied');assert.equal(paid.verification_source,'provider_verified');assert.equal((await db('child_invoices').where({id:invoice.id}).first()).amount_paid,'100.00');
    const before=calls;assert.equal((await svc.verify(r.id,proof(r,'ReceiptCaseA'),parent)).status,'applied');assert.equal(calls,before);assert.equal((await db('child_payments').where({daycare_payment_request_id:r.id}).count('* as n').first()).n,'1');
    assert.equal((await db('daycares').where({id:dc.id}).first()).subscription_ends_at.getTime(),dc.subscription_ends_at.getTime());
    await assert.rejects(svc.get(r.id,other),e=>e.statusCode===404);
  });
  await t.test('missing/wrong payer requires evidenced independent review, not a weak development bypass',async()=>{
    const {request:r}=await request('telebirr');result={payerName:'Unexpected Payer'};
    const pending=await svc.verify(r.id,proof(r,'SYNTHETICREFPAYER'),parent);assert.equal(pending.status,'review_pending');assert.equal(pending.verification.code,'payer_review');
    const body={version:pending.version,decision:'approve',reason:'Independently confirmed the payer and allocation from bank evidence',evidence_reference:'INDEPENDENT-BANK-CHECK-001',verified_reference:'SYNTHETICREFPAYER',confirmed_amount:100,confirmed_recipient_name:'Synthetic Receiver',confirmed_recipient_account:'0911234567',payment_date:new Date(Date.now()-3600000).toISOString(),payer_confirmed:true,timing_confirmed:true,amount_and_receiver_confirmed:true};
    await assert.rejects(svc.review(r.id,{...body,confirmed_amount:99},admin),e=>e.statusCode===422);
    assert.equal((await svc.review(r.id,body,admin)).verification_source,'independent_review');result={};
  });
  await t.test('changed balance retains verified money for immutable resolution; claims cannot be reused by SaaS',async()=>{
    const {invoice,request:r}=await request();hook=async()=>{await db('child_invoices').where({id:invoice.id}).update({amount_paid:50,status:'partially_paid'});};
    const held=await svc.verify(r.id,proof(r,'HeldTransferReceipt'),parent);assert.equal(held.status,'verified_unapplied');hook=async()=>{};
    const intent=crypto.randomUUID();await db('subscription_payment_intents').insert({id:intent,email:'synthetic-reuse@example.invalid',secret_hash:'synthetic',terms:{},status:'verified',amount:100,currency:'ETB',recipient:'1000000000001',expires_at:new Date(Date.now()+86400000)});
    await assert.rejects(db('subscription_payment_references').insert({provider:'cbe',reference:'HeldTransferReceipt',intent_id:intent,source:'qa'}),e=>e.code==='23505');
    await assert.rejects(svc.review(r.id,{version:held.version,decision:'reject',reason:'Cannot discard actual independently confirmed money',evidence_reference:'REJECT-ATTEMPT'},admin),e=>e.statusCode===409);
    const resolved=await svc.resolve(r.id,{version:held.version,outcome:'refund_recorded',reason:'Independent full transfer return confirmed outside this application',evidence_reference:'SYNTHETIC-REFUND-EVIDENCE',amount_confirmed:true},admin);assert.equal(resolved.status,'resolved');assert.equal((await svc.get(r.id,parent)).resolution.outcome,'refund_recorded');
    const resolution=await db('daycare_payment_resolutions').where({request_id:r.id}).first();await assert.rejects(db('daycare_payment_resolutions').where({id:resolution.id}).update({reason:'Attempt to change immutable refund evidence'}),e=>e.code==='23514');
    await assert.rejects(db('subscription_payment_references').insert({provider:'cbe',reference:'HeldTransferReceipt',intent_id:intent,source:'qa'}),e=>e.code==='23505');
  });
  await t.test('removed guardianship during lookup preserves confirmed money for tenant admin review',async()=>{
    const {request:r}=await request();hook=async()=>{await db('guardian_links').where({daycare_id:dc.id,child_id:child.id,user_id:parent.id}).delete();};
    const held=await svc.verify(r.id,proof(r,'GuardianChangedTransfer'),parent);assert.equal(held.status,'verified_unapplied');assert.equal((await svc.get(r.id,admin)).status,'verified_unapplied');assert.ok((await svc.list({},admin)).items.some(item=>item.id===r.id));hook=async()=>{};
    await db('guardian_links').insert({daycare_id:dc.id,child_id:child.id,user_id:parent.id,relationship:'Parent',created_by:admin.id,pickup_authorized:true});
  });
  await t.test('no active receipt administrator preserves confirmed money and its permanent claims',async()=>{
    const {invoice,request:r}=await request();
    await db('users').where({id:admin.id}).update({status:'inactive'});
    let held;
    try{
      held=await svc.verify(r.id,proof(r,'ReceiptAdministratorUnavailable'),parent);
      assert.equal(held.status,'verified_unapplied');assert.equal(held.verification.code,'receipt_admin_unavailable');
      assert.equal(held.verification_source,'provider_verified');assert.ok(held.verified_at);
      const stored=await db('daycare_payment_requests').where({id:r.id}).first();
      assert.equal(stored.authoritative_reference,'ReceiptAdministratorUnavailable');assert.equal(stored.lease_until,null);
      assert.equal((await db('payment_reference_claims').where({owner_kind:'daycare',owner_id:r.id})).length,2);
      assert.equal((await db('child_payments').where({daycare_payment_request_id:r.id})).length,0);
      assert.equal((await db('child_invoices').where({id:invoice.id}).first()).amount_paid,'0.00');
    }finally{await db('users').where({id:admin.id}).update({status:'active'});}
    assert.equal((await svc.get(r.id,admin)).status,'verified_unapplied');
    await assert.rejects(svc.review(r.id,{version:held.version,decision:'reject',reason:'Cannot discard confirmed funds when receipt administrator is unavailable',evidence_reference:'SYNTHETIC-ADMIN-UNAVAILABLE'},admin),e=>e.statusCode===409);
  });
  await t.test('case-sensitive modern CBE tokens remain separate; other receipt providers retain strict evidence',async()=>{
    for(const [provider,token]of [['cbe','DistinctCaseToken'],['cbe','distinctcasetoken'],['abyssinia','SYNTHETICBOAREF']]){const {request:r}=await request(provider);assert.equal((await svc.verify(r.id,proof(r,token),parent)).status,'applied');}
  });

  await t.test('a screenshot pays an order only after a bank lookup, and its reference cannot pay tuition again',async()=>{
    const [order]=await db('orders').insert({
      daycare_id:dc.id,parent_id:parent.id,total:100,order_status:'pending',payment_status:'unpaid',created_at:new Date(Date.now()-86400000),
    }).returning('*');
    await db('payments').insert({order_id:order.id,method:'pay_at_daycare',status:'unpaid'});
    const r=await svc.create({purpose:'order',target_id:order.id,provider:'cbe',request_key:crypto.randomUUID()},parent);
    const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSU0AAAAASUVORK5CYII=';
    const token='v2-SyntheticScreenshot01';
    let extracted=0,lookups=0;
    const imageService=createDaycarePayments(pool,{
      extract:async file=>{
        extracted++;assert.equal(file.type,'image/png');
        return {available:true,provider:'cbe',reference:token,amount:9999};
      },
      lookup:async ({reference})=>{
        lookups++;assert.equal(reference,`https://mbreciept.cbe.com.et/${token}`);
        return {available:true,result:{
          success:true,payer:parent.name,receiver:'Synthetic Receiver',receiverAccount:'1000000000001',
          amount:100,date:new Date(Date.now()-3600000).toISOString(),reference:token,
        }};
      },
    });
    await assert.rejects(imageService.verify(r.id,{version:r.version,image:'Ynl0ZXM='},parent),e=>e.statusCode===422);
    assert.equal(extracted,0);
    const applied=await imageService.verify(r.id,{version:r.version,image},parent);
    assert.equal(applied.status,'applied');
    assert.equal(applied.submitted_reference,`https://mbreciept.cbe.com.et/${token}`);
    assert.equal(applied.verification_source,'provider_verified');
    assert.ok(!JSON.stringify(applied).includes(image));
    assert.equal((await db('payments').where({order_id:order.id}).first()).gateway_ref,token);
    assert.equal((await db('orders').where({id:order.id}).first()).payment_status,'paid');
    assert.equal((await imageService.verify(r.id,{version:r.version,image},parent)).status,'applied');
    assert.equal(extracted,1);
    const {invoice,request:tuition}=await request();
    const duplicate=await imageService.verify(tuition.id,{version:tuition.version,image},parent);
    assert.equal(duplicate.verification.code,'duplicate_reference');
    assert.equal(duplicate.status,'review_pending');
    assert.equal(lookups,1);
    assert.equal((await db('child_invoices').where({id:invoice.id}).first()).amount_paid,'0.00');
  });

  await t.test('Telebirr receipt formatting still requires the correct destination and settled amount',async()=>{
    const {request:r}=await request('telebirr');
    const asAddis=new Date(Date.now()-3600000+10800000).toISOString();
    const date=`${asAddis.slice(8,10)}-${asAddis.slice(5,7)}-${asAddis.slice(0,4)} ${asAddis.slice(11,19)}`;
    const telebirr=createDaycarePayments(pool,{lookup:async ({reference})=>({
      available:true,result:{success:true,data:{
        payerName:parent.name,creditedPartyName:'Synthetic Receiver',creditedPartyAccountNo:'251911234567',
        settledAmount:'100.00 Birr',totalPaidAmount:'102.00 Birr',transactionStatus:'Completed',receiptNo:reference,paymentDate:date,
      }},
    })});
    assert.equal((await telebirr.verify(r.id,proof(r,'SyntheticLocalDate'),parent)).status,'applied');
  });
 });
});
