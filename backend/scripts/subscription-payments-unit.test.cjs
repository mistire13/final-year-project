'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createPaymentService, verifySecret, secretHash, canonicalReference, matchesVerifiedPayment, lookupVeritas } = require('../src/modules/saas/subscription-payments.service');
const ocr = require('../src/modules/saas/subscription-payments.ocr');

test('payment session secret is a high entropy bearer checked against its hash', () => {
  const token = crypto.randomBytes(32).toString('base64url');
  assert.equal(verifySecret(token, secretHash(token)), true);
  assert.equal(verifySecret(crypto.randomBytes(32).toString('base64url'), secretHash(token)), false);
  assert.equal(verifySecret('', secretHash(token)), false);
});

test('preserves case sensitive CBE receipt tokens and URLs', () => {
  assert.equal(canonicalReference('https://mbreciept.cbe.com.et/AbCd12', 'cbe'), 'https://mbreciept.cbe.com.et/AbCd12');
  assert.equal(canonicalReference('AbC123xY', 'cbe'), 'AbC123xY');
  assert.equal(canonicalReference('ft12ab34', 'cbe'), 'FT12AB34');
  assert.equal(canonicalReference('ab12345678', 'telebirr'), 'AB12345678');
});

test('only complete matching provider evidence can verify a payment', () => {
  const intent = { created_at: new Date(Date.now()-60000), provider:'telebirr', amount:'100.00', currency:'ETB', recipient:'0911-123-456',terms:{recipient_name:'Ankelba Account'} };
  const data = { success:true, data:{ status:'completed', reference:'AB12345678', amount:'100.00', currency:'ETB',
    receiverAccount:'0911123456', receiverName:'  ANKELBA   Account  ', transactionDate:new Date().toISOString() } };
  assert.equal(matchesVerifiedPayment(data,intent,'AB12345678'),true);
  for (const change of [{amount:'100.01'},{currency:'USD'},{receiverAccount:'0911000000'}, {receiverName:'Wrong recipient'}, {receiverName:undefined},
    {status:'pending'},{reference:'WRONG'},{transactionDate:'2020-01-01'},{currency:undefined}]) {
    assert.equal(matchesVerifiedPayment({ ...data,data:{...data.data,...change} },intent,'AB12345678'),false);
  }
  assert.equal(matchesVerifiedPayment({ ...data,success:false },intent,'AB12345678'),false);
});

test('Veritas uses provider-specific endpoint and failed envelopes stay unverified', async () => {
  let sent;
  const fetch = async (url, init) => { sent={url:String(url),body:JSON.parse(init.body),headers:init.headers}; return {ok:true,json:async()=>({success:false})}; };
  const result = await lookupVeritas({provider:'cbe',reference:'https://mbreciept.cbe.com.et/AbCdToken'}, {apiKey:'secret',fetch});
  assert.equal(sent.url,'https://verifyapi.leulzenebe.pro/verify-cbe');
  assert.deepEqual(sent.body,{reference:'https://mbreciept.cbe.com.et/AbCdToken'});
  assert.equal(result.available,false);
});

test('receipt OCR provides candidate references, never treats them as verified', async () => {
  assert.deepEqual(ocr.candidates('Payment receipt\nReference: FT1234567890\nAmount ETB 100.00'), ['FT1234567890']);
  await assert.rejects(ocr.extract(Buffer.alloc(20),'image/png'), /valid PNG or JPEG/);
  const png = Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.alloc(16)]);
  await assert.rejects(ocr.extract(png,'image/png',{command:'nonexistent-ankelba-ocr-binary'}), /unavailable/);
});

function intentPool(item, appStatus) {
  const calls=[];
  const client={
    async query(sql,params=[]) {
      calls.push({sql,params});
      if (sql.includes('SELECT application_id,daycare_id FROM subscription_payment_intents')) return {rows:[{application_id:item.application_id,daycare_id:item.daycare_id}]};
      if (sql.includes('SELECT status FROM daycare_applications')) return {rows:[{status:appStatus}]};
      if (sql.includes('SELECT * FROM subscription_payment_intents')) return {rows:[{...item}]};
      if (sql.includes('INSERT INTO subscription_payment_resolutions')) return {rows:[{outcome:params[1],reason:params[2],evidence_reference:params[3],actor_id:params[4]}]};
      return {rows:[]};
    },release() {},
  };
  return {calls,connect:async()=>client};
}

test('reconciliation records evidence and does not process a transfer', async () => {
  const pool=intentPool({id:'test',application_id:12,daycare_id:null,status:'consumed',payment_reference:'ABC123',version:2},'rejected');
  const service=createPaymentService(pool);
  const result=await service.resolve('test',{version:2,outcome:'refund_recorded',reason:'Refund checked independently',evidence_reference:'BANK-1234'},7);
  assert.equal(result.status,'resolved');
  assert.equal(result.resolution.outcome,'refund_recorded');
  assert.ok(pool.calls.some(call=>call.sql.includes("SET status='resolved'")));
  assert.ok(pool.calls.some(call=>call.sql.includes('SUBSCRIPTION_PAYMENT_RESOLVED')));
  assert.ok(pool.calls.some(call=>call.sql === 'COMMIT'));
});

test('reconciliation refuses payments on active applications', async () => {
  const pool=intentPool({id:'test',application_id:12,daycare_id:null,status:'consumed',payment_reference:'ABC123',version:2},'pending');
  await assert.rejects(createPaymentService(pool).resolve('test',{version:2,outcome:'credit_recorded',reason:'Credit checked independently',evidence_reference:'CREDIT-123'},7), /unapplied confirmed payment or rejected application/);
  assert.ok(pool.calls.some(call=>call.sql === 'ROLLBACK'));
  assert.equal(pool.calls.some(call=>call.sql.includes('INSERT INTO subscription_payment_resolutions')),false);
});

test('recovery sends the secret only to the stored email and does not return it to the operator', async () => {
  const oldToken=crypto.randomBytes(32).toString('base64url');
  const pool=intentPool({id:'test',email:'customer@example.com',status:'verified',secret_hash:secretHash(oldToken),version:1},null);
  let sent;
  const service=createPaymentService(pool,{recoverySender:async message=>{sent=message;}});
  const response=await service.recover('test',{version:1,reason:'Customer identity checked offline'},7);
  assert.equal(sent.email,'customer@example.com');
  assert.equal(response.token,undefined);
  assert.ok(verifySecret(sent.token,pool.calls.find(c=>c.sql.includes('SET secret_hash=')).params[1]));
  assert.ok(pool.calls.some(call=>call.sql === 'COMMIT'));
});

test('failed recovery email rolls back the secret rotation', async () => {
  const pool=intentPool({id:'test',email:'customer@example.com',status:'verified',version:1},null);
  const service=createPaymentService(pool,{recoverySender:async()=>{throw new Error('unavailable');}});
  await assert.rejects(service.recover('test',{version:1,reason:'Customer identity checked offline'},7),/could not be sent/);
  assert.ok(pool.calls.some(call=>call.sql === 'ROLLBACK'));
  assert.equal(pool.calls.some(call=>call.sql === 'COMMIT'),false);
});

test('payment sessions snapshot the operator-configured account and package terms', async () => {
  let inserted;
  const pool={ async query(sql,params) {
    if (sql.includes('FROM subscription_payment_settings')) return {rows:[{bank_accounts:{cbe:{enabled:true,account_holder:'Ankelba',account_number:'0911234567'}}}]};
    if (sql.includes('FROM users WHERE')) return {rows:[]};
    if (sql.includes('FROM subscription_packages')) return {rows:[{code:'standard',name:'Standard',version:2,max_children:50,monthly_price:'100.00'}]};
    if (sql.includes('INSERT INTO subscription_payment_intents')) {
      inserted=params;
      return {rows:[{id:params[0],email:params[2],terms:JSON.parse(params[3]),amount:params[4],recipient:params[5],status:'pending',version:1}]};
    }
    throw new Error('unexpected query');
  }};
  const result=await createPaymentService(pool,{apiKey:'test-key'}).create({provider:'cbe',package_code:'standard',billing_cycle:'monthly',email:'ADMIN@example.com'});
  assert.equal(result.email,'admin@example.com');
  assert.equal(result.recipient,'0911234567');
  assert.equal(result.recipient_institution,'Commercial Bank of Ethiopia');
  assert.equal(result.recipient_name,'Ankelba');
  assert.equal(result.terms.price,'100.00');
  assert.ok(verifySecret(result.token,inserted[1]));
});

test('renewal recovery requires the original token and matching daycare', async () => {
  const token=crypto.randomBytes(32).toString('base64url');
  const pool={async query(sql,params) {
    return {rows:params[0]==='intent' && params[1]===42 ? [{id:'intent',daycare_id:42,email:'admin@example.com',secret_hash:secretHash(token),status:'verified'}] : []};
  }};
  const service=createPaymentService(pool);
  assert.equal((await service.resumeRenewal(42,'intent',{token})).status,'verified');
  await assert.rejects(service.resumeRenewal(43,'intent',{token}),/could not be found/);
  await assert.rejects(service.resumeRenewal(42,'intent',{token:crypto.randomBytes(32).toString('base64url')}),/could not be found/);
});
