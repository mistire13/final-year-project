'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {withCurrentDatabase}=require('./helpers/auth-test-database.cjs');
const {createPaymentService,secretHash,matchesVerifiedPayment,canonicalReference}=require('../src/modules/saas/subscription-payments.service');
const {receiptInput}=require('../src/modules/saas/subscription-banks');
const {lookupVeritas}=require('../src/modules/saas/veritas-client');
const disabled={enabled:false,account_holder:'',account_number:''};
const accounts={cbe:{enabled:true,account_holder:'Synthetic CBE Receiver',account_number:'1000000000001'},abyssinia:{enabled:true,account_holder:'Synthetic BOA Receiver',account_number:'2000000000002'}};

test('bank adapter uses correct suffix fields, preserves case, and rejects unsafe receipt URLs',async()=>{
  const sent=[];
  for(const input of [{provider:'cbe',reference:'https://apps.cbe.com.et:100/?id=FT123456789012345678'},{provider:'cbe',reference:'https://mbreciept.cbe.com.et/CaseSensitiveToken'},{provider:'abyssinia',reference:'FT1234567890',suffix:'12345'}]){
    await lookupVeritas(input,{apiKey:'synthetic',fetch:async(url,init)=>{sent.push({url:String(url),body:JSON.parse(init.body)});return {ok:true,status:200,json:async()=>({success:true})};}});
  }
  assert.deepEqual(sent.map(value=>value.body),[{reference:'FT1234567890',accountSuffix:'12345678'},{reference:'https://mbreciept.cbe.com.et/CaseSensitiveToken'},{reference:'FT1234567890',suffix:'12345'}]);
  assert.ok(sent[2].url.endsWith('/verify-abyssinia'));
  for(const reference of ['http://mbreciept.cbe.com.et/token','https://example.invalid/token','https://mbreciept.cbe.com.et.evil.invalid/token','https://user:pass@mbreciept.cbe.com.et/token','https://mbreciept.cbe.com.et:444/token'])assert.throws(()=>receiptInput('cbe',reference),/CBE/);
  for(const reference of ['FT1234567890','CaseSensitiveToken','https://mbreciept.cbe.com.et/','https://apps.cbe.com.et:100/?id=FT1234567890','https://apps.cbe.com.et:100/?id=TokenOne&id=TokenTwo'])assert.throws(()=>receiptInput('cbe',reference),/complete HTTPS CBE/);
  assert.throws(()=>receiptInput('cbe','https://mbreciept.cbe.com.et/CaseSensitiveToken','12345678'),/only requires/);
  assert.deepEqual(receiptInput('cbe','https://mbreciept.cbe.com.et/FT1234567890-12345678'),{reference:'FT1234567890',accountSuffix:'12345678'});
  assert.deepEqual(receiptInput('cbe','https://apps.cbe.com.et:100/BranchReceipt/FT1234567890&12345678'),{reference:'FT1234567890',accountSuffix:'12345678'});
  assert.throws(()=>receiptInput('abyssinia','FT1234567890','12345678'),/five-digit/);
});

test('each bank requires complete matching evidence and CBE URLs must bind the returned reference',()=>{
  const intent={provider:'cbe',amount:'200.00',currency:'ETB',recipient:'1000000000001',created_at:new Date(Date.now()-60000),terms:{recipient_name:'Synthetic Receiver'}};
  const data={status:'completed',reference:'CaseSensitiveToken',amount:'200.00',currency:'ETB',receiverName:'Synthetic Receiver',receiverAccount:'1000000000001',transactionDate:new Date().toISOString()};
  const result=overrides=>({success:true,data:{...data,...overrides}});
  assert.equal(matchesVerifiedPayment(result({}),intent,'https://mbreciept.cbe.com.et/CaseSensitiveToken'),true);
  assert.equal(matchesVerifiedPayment(result({reference:'WrongToken'}),intent,'https://mbreciept.cbe.com.et/CaseSensitiveToken'),false);
  assert.equal(matchesVerifiedPayment(result({reference:'WrongToken'}),intent,'https://mbreciept.cbe.com.et/CaseSensitiveToken?unrelated=WrongToken'),false);
  assert.equal(matchesVerifiedPayment(result({reference:'FT1234567890'}),intent,'https://apps.cbe.com.et:100/?id=FT123456789012345678'),true);
  for(const field of ['amount','currency','receiverName','receiverAccount','reference','transactionDate','status'])assert.equal(matchesVerifiedPayment(result({[field]:undefined}),intent,'CaseSensitiveToken'),false,field);
  for(const provider of ['cbe','abyssinia']){
    const reference=canonicalReference('CaseSensitiveToken',provider);
    assert.equal(matchesVerifiedPayment(result({}),{...intent,provider},reference),true);
    for(const change of [{amount:'200.01'},{receiverName:'Synthetic Receiver Other'},{receiverAccount:'1000000000009'},{receiverAccount:'100****001'},{transactionDate:'2000-01-01'}])assert.equal(matchesVerifiedPayment(result(change),{...intent,provider},reference),false);
  }
});

test('separate bank settings, immutable sessions, legacy review and reference reuse work in persisted records',async()=>{
  await withCurrentDatabase(async({db,pool})=>{
    const [owner]=await db('users').insert({name:'Synthetic bank operator',email:'bank-owner@example.invalid',role_id:0,status:'active',password_hash:'synthetic'}).returning('*');
    await db('subscription_packages').where({code:'standard'}).update({monthly_price:'200.00'});
    const legacySettings=await db('subscription_payment_settings').first();
    let requests=0,failTransport=false;
    const service=createPaymentService(pool,{apiKey:'synthetic',fetch:async(url,init)=>{
      requests++;if(failTransport)return new Response('<html>Bad gateway</html>',{status:502});
      const provider=String(url).endsWith('/verify-cbe')?'cbe':'abyssinia';
      const input=JSON.parse(init.body),account=accounts[provider];
      const reference=provider==='cbe'&&input.reference.startsWith('https:')?new URL(input.reference).pathname.slice(1):input.reference;
      return new Response(JSON.stringify({success:true,data:{status:'completed',reference,amount:'200.00',currency:'ETB',receiverName:account.account_holder,receiverAccount:account.account_number,transactionDate:new Date().toISOString()}}),{status:200});
    }});
    const initial=await service.getSettings();assert.equal((await service.publicSettings()).accounts.length,0);
    await assert.rejects(service.create({provider:'cbe',package_code:'standard',billing_cycle:'monthly',email:'not-configured@example.invalid'}),error=>error.statusCode===503);
    await assert.rejects(service.updateSettings({version:initial.version,accounts:{...accounts,cbe:{...accounts.cbe,account_number:''}},reason:'Synthetic invalid account change'},owner.id),error=>error.statusCode===422);
    const configured=await service.updateSettings({version:initial.version,accounts,reason:'Configure separate synthetic bank accounts'},owner.id);
    assert.equal((await service.publicSettings()).accounts.length,2);
    await assert.rejects(service.updateSettings({version:initial.version,accounts,reason:'Stale synthetic bank account update'},owner.id),error=>error.statusCode===409);
    const create=(provider,email)=>service.create({provider,package_code:'standard',billing_cycle:'monthly',email});
    const cbe=await create('cbe','bank-cbe@example.invalid'),boa=await create('abyssinia','bank-boa@example.invalid');
    await assert.rejects(service.verify(cbe.id,{token:cbe.token,provider:'cbe',reference:'FT1234567890'}),error=>error.statusCode===422);
    await assert.rejects(service.verify(cbe.id,{token:cbe.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/CaseSensitiveToken',suffix:'12345678'}),error=>error.statusCode===422);
    assert.equal(cbe.provider,'cbe');assert.equal(cbe.recipient,accounts.cbe.account_number);assert.equal(boa.recipient,accounts.abyssinia.account_number);
    await assert.rejects(service.verify(cbe.id,{token:cbe.token,provider:'abyssinia',reference:'WrongBankToken',suffix:'12345'}),error=>error.statusCode===409);
    assert.equal(requests,0);
    const long=await create('cbe','bank-long-url@example.invalid'),url='https://mbreciept.cbe.com.et/'+('T'.repeat(300));
    assert.equal((await service.verify(long.id,{token:long.token,provider:'cbe',reference:url})).status,'verified');
    assert.equal((await db('subscription_payment_references').where({reference:url}).first()).intent_id,long.id);
    const legacyLink=await create('cbe','bank-embedded-suffix@example.invalid');
    const fullLink='https://apps.cbe.com.et:100/?id=FT123456789012345678';
    assert.equal((await service.verify(legacyLink.id,{token:legacyLink.token,provider:'cbe',reference:fullLink})).status,'verified');
    assert.equal((await db('subscription_payment_references').where({reference:'FT1234567890'}).first()).intent_id,legacyLink.id);
    const reusedLegacy=await create('cbe','bank-embedded-suffix-reuse@example.invalid');
    await assert.rejects(service.verify(reusedLegacy.id,{token:reusedLegacy.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/FT1234567890-12345678'}),error=>error.statusCode===409);
    await service.updateSettings({version:configured.version,accounts:{cbe:{...accounts.cbe,account_number:'1000000000099'},abyssinia:accounts.abyssinia},reason:'Change only new synthetic payment destinations'},owner.id);
    assert.equal((await service.status(cbe.id,{token:cbe.token})).recipient,accounts.cbe.account_number);
    const paid=await service.verify(cbe.id,{token:cbe.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/SHAREDBANKTOKEN'});assert.equal(paid.status,'verified');
    const alias=await create('cbe','bank-link-alias@example.invalid');
    const beforeAlias=requests;
    await assert.rejects(service.verify(alias.id,{token:alias.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/SHAREDBANKTOKEN?view=receipt'}),error=>error.statusCode===409);
    assert.equal(requests,beforeAlias,'a known receipt alias is rejected before spending verification credits');
    await assert.rejects(service.verify(boa.id,{token:boa.token,provider:'abyssinia',reference:'SharedBankToken',suffix:'12345'}),error=>error.statusCode===409);
    failTransport=true;
    const pending=await service.verify(boa.id,{token:boa.token,provider:'abyssinia',reference:'DifferentBankToken',suffix:'12345'});
    assert.equal(pending.status,'verification_pending');assert.match(pending.message,/temporarily unavailable/);
    const stored=await db('subscription_payment_intents').where({id:boa.id}).first();assert.equal(stored.verification.code,'upstream');assert.equal(stored.verification.http_status,502);
    assert.equal((await service.status(boa.id,{token:boa.token})).message,pending.message);
    failTransport=false;assert.equal((await service.verify(boa.id,{token:boa.token,provider:'abyssinia',reference:'DifferentBankToken',suffix:'12345'})).status,'verified');
    const legacyId=randomUUID(),token='A'.repeat(43),terms={recipient_name:'Legacy receiver',recipient_institution:'Telebirr'};
    await db('subscription_payment_intents').insert({id:legacyId,email:'legacy-telebirr@example.invalid',secret_hash:secretHash(token),terms:JSON.stringify(terms),provider:'telebirr',status:'pending',amount:'200.00',currency:'ETB',recipient:'0911234567',expires_at:new Date(Date.now()+600000)});
    assert.deepEqual((await service.status(legacyId,{token})).terms,terms);
    const count=requests;
    await assert.rejects(service.verify(legacyId,{token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/LegacyToken'}),/previous payment method/);assert.equal(requests,count);
    await assert.rejects(service.review(legacyId,{version:1,decision:'approve',reason:'Review previous Telebirr receipt independently',verified_reference:'LegacyToken',evidence_reference:'BANK-EVIDENCE-001'},owner.id),error=>error.statusCode===422);
    const reviewed=await service.review(legacyId,{version:1,decision:'approve',reason:'Review previous Telebirr receipt independently',verified_reference:'LegacyToken',evidence_reference:'BANK-EVIDENCE-001',amount_and_receiver_confirmed:true},owner.id);
    assert.equal(reviewed.status,'verified');assert.equal(reviewed.provider,'telebirr');assert.deepEqual(reviewed.terms,terms);
    assert.equal((await db('subscription_payment_references').where({reference:'LEGACYTOKEN'}).first()).intent_id,legacyId);
    const after=await db('subscription_payment_settings').first();assert.equal(after.account_number,legacySettings.account_number);assert.equal(after.institution,legacySettings.institution);
    await service.updateSettings({version:after.version,accounts:{cbe:disabled,abyssinia:disabled},reason:'Disable both synthetic receiving accounts'},owner.id);
    assert.equal((await service.publicSettings()).accounts.length,0);
  });
});

test('SaaS verification preserves distinct modern CBE case while blocking exact and historical aliases before lookup',async()=>{
  await withCurrentDatabase(async({db,pool})=>{
    await db('subscription_packages').where({code:'standard'}).update({monthly_price:'200.00'});
    let calls=0;
    const service=createPaymentService(pool,{accounts,apiKey:'synthetic',matchingPolicy:{environment:'production',nameAmountOnly:false},
      fetch:async(url,init)=>{
        calls++;const reference=new URL(JSON.parse(init.body).reference).pathname.slice(1);
        return new Response(JSON.stringify({success:true,data:{status:'completed',reference,amount:'200.00',currency:'ETB',
          receiverName:accounts.cbe.account_holder,receiverAccount:accounts.cbe.account_number,transactionDate:new Date().toISOString()}}),{status:200});
      }});
    const create=label=>service.create({provider:'cbe',package_code:'standard',billing_cycle:'monthly',email:label+'@example.invalid'});
    const proof=(intent,reference)=>({token:intent.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/'+reference});
    const first=await create('case-upper'),second=await create('case-lower');
    assert.equal((await service.verify(first.id,proof(first,'DistinctModernCase'))).status,'verified');
    assert.equal((await service.verify(second.id,proof(second,'distinctmoderncase'))).status,'verified');
    assert.equal(calls,2,'both independent case-sensitive receipts reach authoritative verification');
    assert.equal((await db('subscription_payment_references').where({reference:'DistinctModernCase'}).first()).intent_id,first.id);
    assert.equal((await db('subscription_payment_references').where({reference:'distinctmoderncase'}).first()).intent_id,second.id);
    const duplicate=await create('case-duplicate'),before=calls;
    await assert.rejects(service.verify(duplicate.id,proof(duplicate,'DistinctModernCase?view=receipt')),e=>e.statusCode===409);
    assert.equal(calls,before,'an exact known token alias spends no verification credits');
    const historical=await create('case-historical-owner');
    await db('subscription_payment_intents').where({id:historical.id}).update({status:'verified',payment_reference:'legacy receipt 12'});
    await db('subscription_payment_references').insert({provider:'legacy',reference:'legacy receipt 12',intent_id:historical.id,source:'synthetic_historical'});
    const legacyReuse=await create('case-historical-reuse');
    await assert.rejects(service.verify(legacyReuse.id,proof(legacyReuse,'LegacyReceipt12')),e=>e.statusCode===409);
    assert.equal(calls,before,'unknown historical provider retains conservative case/space protection');
    assert.equal((await db('subscription_payment_intents').where({id:legacyReuse.id}).first()).status,'pending');
  });
});

test('Telebirr remains configurable with a normalized phone and strict receipt matching',async()=>{
  await withCurrentDatabase(async({db,pool})=>{
    const [owner]=await db('users').insert({name:'Synthetic Telebirr operator',email:'telebirr-owner@example.invalid',role_id:0,status:'active',password_hash:'synthetic'}).returning('*');
    await db('subscription_packages').where({code:'standard'}).update({monthly_price:'200.00'});
    let evidence={},sent;
    const service=createPaymentService(pool,{apiKey:'synthetic',fetch:async(url,init)=>{
      sent={url:String(url),body:JSON.parse(init.body)};
      return new Response(JSON.stringify({success:true,data:{status:'completed',reference:sent.body.reference,settledAmount:'200.00',currency:'ETB',receiverName:'Synthetic Telebirr Receiver',receiverAccount:'0911234567',transactionDate:new Date().toISOString(),...evidence}}),{status:200});
    }});
    const initial=await service.getSettings();
    const input={version:initial.version,accounts:{...accounts,telebirr:{enabled:true,account_holder:'Synthetic Telebirr Receiver',account_number:'0911234567'}},reason:'Enable synthetic Telebirr alongside both banks'};
    await assert.rejects(service.updateSettings({...input,accounts:{...input.accounts,telebirr:{...input.accounts.telebirr,account_number:'1000000000001'}}},owner.id),error=>error.statusCode===422);
    const saved=await service.updateSettings(input,owner.id);
    assert.equal(saved.accounts.telebirr.account_number,'251911234567');
    assert.deepEqual((await service.publicSettings()).accounts.map(account=>account.provider),['telebirr','cbe','abyssinia']);
    const intent=await service.create({provider:'telebirr',package_code:'standard',billing_cycle:'monthly',email:'telebirr-new@example.invalid'});
    assert.equal(intent.terms.recipient_provider,'telebirr');assert.equal(intent.recipient,'251911234567');
    for(const mismatch of [{settledAmount:'199.00'},{receiverName:'Other Receiver'},{receiverAccount:'0911234568'},{reference:'DIFFERENT-REF'}]){
      evidence=mismatch;
      assert.equal((await service.verify(intent.id,{token:intent.token,provider:'telebirr',reference:'DK-SYNTHETIC-001'})).status,'verification_pending');
    }
    evidence={};assert.equal((await service.verify(intent.id,{token:intent.token,provider:'telebirr',reference:'DK-SYNTHETIC-001'})).status,'verified');
    assert.ok(sent.url.endsWith('/verify-telebirr'));assert.deepEqual(sent.body,{reference:'DK-SYNTHETIC-001'});
    const duplicate=await service.create({provider:'cbe',package_code:'standard',billing_cycle:'monthly',email:'telebirr-duplicate@example.invalid'});
    await assert.rejects(service.verify(duplicate.id,{token:duplicate.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/DK-SYNTHETIC-001'}),error=>error.statusCode===409);
    await service.updateSettings({version:saved.version,accounts:{...input.accounts,telebirr:{...input.accounts.telebirr,account_number:'0911234568'}},reason:'Change Telebirr for future sessions only'},owner.id);
    assert.equal((await service.status(intent.id,{token:intent.token})).recipient,'251911234567');
  });
});

test('local name-and-amount matching still claims receipt aliases and prevents transaction reuse',async()=>{
  await withCurrentDatabase(async({db,pool})=>{
    await db('subscription_packages').where({code:'standard'}).update({monthly_price:'200.00'});
    let transactionReference,wrongName=true;
    const service=createPaymentService(pool,{accounts,apiKey:'synthetic',matchingPolicy:{nameAmountOnly:true,environment:'development'},
      fetch:async()=>new Response(JSON.stringify({success:true,receiver:wrongName?'Different Receiver':accounts.cbe.account_holder,amount:200,...(transactionReference?{reference:transactionReference}:{})}),{status:200})});
    const create=email=>service.create({provider:'cbe',package_code:'standard',billing_cycle:'monthly',email});
    const first=await create('name-amount-first@example.invalid');
    const link='https://mbreciept.cbe.com.et/SyntheticTestReceipt';
    const mismatch=await service.verify(first.id,{token:first.token,provider:'cbe',reference:link});
    assert.equal(mismatch.status,'verification_pending');assert.match(mismatch.message,/account-holder name and payable amount/);
    assert.equal((await service.status(first.id,{token:first.token})).message,mismatch.message);
    wrongName=false;
    assert.equal((await service.verify(first.id,{token:first.token,provider:'cbe',reference:link})).status,'verified');
    assert.equal((await db('subscription_payment_intents').where({id:first.id}).first()).verification.matching_mode,'name_amount_test');
    assert.equal((await db('subscription_payment_references').where({reference:'SyntheticTestReceipt'}).first()).intent_id,first.id);
    const duplicate=await create('name-amount-duplicate@example.invalid');
    await assert.rejects(service.verify(duplicate.id,{token:duplicate.token,provider:'cbe',reference:link+'?view=receipt'}),error=>error.statusCode===409);
    transactionReference='FT1234567890';
    const second=await create('name-amount-second@example.invalid');
    assert.equal((await service.verify(second.id,{token:second.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/OtherTestReceipt'})).status,'verified');
    const reusedTransaction=await create('name-amount-third@example.invalid');
    await assert.rejects(service.verify(reusedTransaction.id,{token:reusedTransaction.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/DifferentTestReceipt'}),error=>error.statusCode===409);
  });
});
