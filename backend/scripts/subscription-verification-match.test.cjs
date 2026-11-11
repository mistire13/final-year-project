'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {matchesVerifiedPayment} = require('../src/modules/saas/subscription-payments.service');

test('automatic verification requires trusted success, amount, receiver name, account, reference and date', () => {
  const intent = {provider:'telebirr', amount:'500.00', currency:'ETB', recipient:'0911-123-456',
    created_at:new Date(Date.now()-60000),terms:{recipient_name:'Ankelba Daycare'}};
  const details={transactionStatus:'Completed',receiptNo:'AB12345678',settledAmount:'500.00',currency:'ETB',
    creditedPartyName:'  ANKELBA   Daycare ',creditedPartyAccountNo:'0911123456',paymentDate:new Date().toISOString()};
  const match=overrides=>matchesVerifiedPayment({success:true,data:{...details,...overrides}},intent,'AB12345678');
  assert.equal(match({}),true);
  for (const change of [
    {settledAmount:'500.01'},{creditedPartyName:'Other daycare'},{creditedPartyName:undefined},
    {creditedPartyAccountNo:undefined},{creditedPartyAccountNo:'09****3456'},
    {currency:undefined},{transactionStatus:'pending'},{receiptNo:'WRONG123456'},
    {creditedPartyName:'Ankelba Daycare Other'}, {creditedPartyAccountNo:'0911000000'},
  ]) assert.equal(match(change),false,JSON.stringify(change));
  assert.equal(matchesVerifiedPayment({success:true,data:{success:false,data:details}},intent,'AB12345678'),false);
  assert.equal(match({creditedPartyAccountNo:'+251 911 123 456'}),true);
});

test('name-and-amount testing is explicit, development-only and never accepts provider failure',()=>{
  const intent={provider:'cbe',amount:'200.00',currency:'ETB',recipient:'1000000000001',created_at:new Date(),terms:{recipient_name:'Test Receiver'}};
  const result={success:true,receiverName:'  TEST   Receiver ',transactionAmount:'200.00'};
  const policy={nameAmountOnly:true,environment:'development'};
  const reference='https://mbreciept.cbe.com.et/SyntheticReceipt';
  assert.equal(matchesVerifiedPayment(result,intent,reference,policy),true);
  for(const environment of ['production','test',undefined])assert.equal(matchesVerifiedPayment(result,intent,reference,{...policy,environment}),false);
  assert.equal(matchesVerifiedPayment(result,intent,reference),false);
  assert.equal(matchesVerifiedPayment(result,intent,reference,{...policy,nameAmountOnly:false}),false);
  for(const change of [{transactionAmount:'199.99'},{transactionAmount:undefined},{receiverName:'Test Receiver Other'},{receiverName:undefined},{status:'pending'},{status:'failed'},{success:false}]){
    assert.equal(matchesVerifiedPayment({...result,...change},intent,reference,policy),false);
  }
  assert.equal(matchesVerifiedPayment({success:true,data:{...result,success:false}},intent,reference,policy),false);
});

test('modern CBE receiver/amount fields match without inventing missing status or currency',()=>{
  // Anonymized shape observed from the live modern-CBE receipt endpoint.
  const result={success:true,payer:'Synthetic Payer',payerAccount:'100****001',receiver:'Synthetic Receiver',receiverAccount:'100****002',amount:120,
    date:'2026-11-08T10:00:00Z',reference:'FT1234567890',reason:'Synthetic payment'};
  const intent={provider:'cbe',amount:'120.00',currency:'ETB',recipient:'1000000000002',created_at:new Date(),terms:{recipient_name:'Synthetic Receiver'}};
  const link='https://mbreciept.cbe.com.et/v2-SyntheticReceipt';
  const policy={nameAmountOnly:true,environment:'development'};
  assert.equal(matchesVerifiedPayment(result,intent,link,policy),true);
  for(const change of [{receiver:'Other Receiver'},{receiver:undefined},{amount:119.99},{success:false}])assert.equal(matchesVerifiedPayment({...result,...change},intent,link,policy),false);
  assert.equal(matchesVerifiedPayment({...result,receiverName:'Conflicting Receiver'},intent,link,policy),false);
  assert.equal(matchesVerifiedPayment(result,intent,link),false,'strict mode still requires complete evidence');
});
