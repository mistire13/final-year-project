'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {lookupVeritas,extractVeritasReceipt}=require('../src/modules/saas/veritas-client');
const input={provider:'cbe',reference:'https://mbreciept.cbe.com.et/SYNTHETIC0'};

test('HTTP failures are classified before parsing HTML and never expose secrets',async()=>{
  for(const [status,code,retryable] of [[502,'upstream',true],[503,'upstream',true],[401,'authentication',false],[403,'authentication',false],[402,'credits',false],[429,'rate_limited',true],[404,'reference_unconfirmed',false]]){
    let parsed=false,canceled=false;
    const result=await lookupVeritas(input,{apiKey:'synthetic-secret',fetch:async()=>({ok:false,status,body:{cancel:async()=>{canceled=true;}},json:async()=>{parsed=true;throw Error('HTML synthetic-secret');}})});
    assert.equal(parsed,false);assert.equal(canceled,true);assert.equal(result.available,false);
    assert.equal(result.httpStatus,status);assert.equal(result.code,code);assert.equal(result.retryable,retryable);
    assert.ok(!JSON.stringify(result).includes('synthetic-secret'));
  }
});
test('successful JSON needs explicit success; malformed responses remain unverified',async()=>{
  for(const body of [null,{success:false},{data:{status:'paid'}}]){
    const result=await lookupVeritas(input,{apiKey:'synthetic',fetch:async()=>({ok:true,status:200,json:async()=>body})});
    assert.equal(result.available,false);
  }
  const malformed=await lookupVeritas(input,{apiKey:'synthetic',fetch:async()=>new Response('<html>Bad gateway</html>',{status:200})});
  assert.equal(malformed.code,'invalid_response');
  const large=await lookupVeritas(input,{apiKey:'synthetic',fetch:async()=>new Response('x'.repeat(262145),{status:200})});
  assert.equal(large.code,'invalid_response');
});
test('client retains complete provider evidence and does not retry or follow redirects',async()=>{
  let calls=0;
  const body={success:true,data:{transactionStatus:'Completed'}};
  const result=await lookupVeritas(input,{apiKey:'synthetic',fetch:async(url,init)=>{
    calls++;assert.equal(String(url),'https://verifyapi.leulzenebe.pro/verify-cbe');
    assert.equal(init.headers['x-api-key'],'synthetic');assert.equal(init.redirect,'error');
    assert.deepEqual(JSON.parse(init.body),{reference:'https://mbreciept.cbe.com.et/SYNTHETIC0'});
    return new Response(JSON.stringify(body),{status:200});
  }});
  assert.equal(calls,1);assert.equal(result.available,true);assert.deepEqual(result.result,body);
});
test('timeouts and connection errors are distinct, safe failures',async()=>{
  for(const [name,code] of [['TimeoutError','timeout'],['TypeError','transport']]){
    const result=await lookupVeritas(input,{apiKey:'synthetic',fetch:async()=>{throw Object.assign(new Error('private transport details'),{name});}});
    assert.equal(result.available,false);assert.equal(result.code,code);assert.equal(result.retryable,true);
    assert.ok(!JSON.stringify(result).includes('private transport details'));
  }
});

test('receipt images go to Veritas multipart extraction and return a candidate only',async()=>{
  const bytes=Buffer.from('89504e470d0a1a0a','hex');
  const result=await extractVeritasReceipt({bytes,type:'image/png'},{apiKey:'synthetic',fetch:async(url,init)=>{
    assert.equal(url.pathname,'/verify-image');
    assert.equal(url.searchParams.get('autoVerify'),'false');
    assert.equal(init.headers['x-api-key'],'synthetic');
    assert.equal(init.headers['content-type'],undefined);
    const file=init.body.get('file');
    assert.equal(file.type,'image/png');
    assert.deepEqual(Buffer.from(await file.arrayBuffer()),bytes);
    return Response.json({type:'telebirr',reference:'SyntheticReceipt',verified:true,amount:100});
  }});
  assert.deepEqual(result,{available:true,provider:'telebirr',reference:'SyntheticReceipt',suffix:undefined});
});
