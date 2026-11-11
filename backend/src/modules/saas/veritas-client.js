'use strict';
const {bankCodes,receiptInput}=require('./subscription-banks');

// Only application-owned messages leave this adapter. Never echo provider HTML,
// receipt data, exception messages or authentication headers to the customer.
const messages = {
  not_configured: 'Payment verification is not configured. Contact platform support.',
  authentication: 'The verification service rejected its API credentials. Contact platform support.',
  credits: 'The verification service has no available credits or access. Contact platform support.',
  rate_limited: 'The verification service is busy. Try again later. Do not pay again.',
  upstream: 'Payment verification is temporarily unavailable at the verification service. Try again later. Do not pay again.',
  reference_unconfirmed: 'The payment provider could not confirm this reference. Check the reference or contact support if you already paid.',
  invalid_input: 'Check the payment reference and any required account suffix.',
  invalid_response: 'The verification service returned an unreadable response. Your payment remains pending. Do not pay again.',
  image_unreadable: 'We could not read the receipt. Try a clearer screenshot or enter the receipt details.',
  timeout: 'The verification service did not respond in time. Your payment remains pending. Do not pay again.',
  transport: 'The verification service could not be reached. Your payment remains pending. Do not pay again.',
  mismatch: 'The receipt details could not be matched to this payment’s amount, currency, recipient, reference and date. Your payment remains pending for review.',
  name_amount_mismatch: 'The verified receipt does not match the configured account-holder name and payable amount. Your payment remains pending for review.',
};
const messageFor = code => messages[code] || 'Payment is pending operator review.';
const failure = (code, httpStatus) => ({available:false,code,httpStatus,retryable:['upstream','rate_limited','timeout','transport','invalid_response'].includes(code),reason:messageFor(code)});

async function readJson(response) {
  if (!response.body?.getReader) return response.json(); // injected test transports
  const reader = response.body.getReader();
  const chunks=[];let size=0;
  try {
    for (;;) {
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>262144){await reader.cancel();throw new Error('Response too large');}
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { reader.releaseLock(); }
}

async function postVeritas(path, body, contentType, options, timeout) {
  const key=options.apiKey??process.env.VERITAS_API_KEY;
  if(!key?.trim())return failure('not_configured');
  try {
    const url=new URL(path,options.baseUrl??process.env.VERITAS_API_URL??'https://verifyapi.leulzenebe.pro');
    if(url.protocol!=='https:' && !(process.env.NODE_ENV==='test'&&url.hostname==='localhost'))return failure('not_configured');
    const response=await (options.fetch??global.fetch)(url,{
      method:'POST',headers:{'x-api-key':key,accept:'application/json',...(contentType?{'content-type':contentType}:{})},
      body,signal:AbortSignal.timeout(timeout),redirect:'error',
    });
    if(!response.ok){
      await response.body?.cancel?.();
      const status=response.status;
      return failure([401,403].includes(status)?'authentication':status===402?'credits':status===429?'rate_limited':status>=500?'upstream':'reference_unconfirmed',status);
    }
    let result;
    try { result=await readJson(response); } catch(error) {
      return failure(['TimeoutError','AbortError'].includes(error.name)?'timeout':'invalid_response',response.status);
    }
    return {available:true,result,httpStatus:response.status};
  } catch(error) { return failure(['TimeoutError','AbortError'].includes(error.name)?'timeout':'transport'); }
}

async function lookupVeritas(input, options={}) {
  if(!bankCodes.includes(input.provider))return failure('invalid_input');
  let body;
  try { body=receiptInput(input.provider,input.reference,input.suffix); } catch { return failure('invalid_input'); }
  const check=await postVeritas(`/verify-${input.provider}`,JSON.stringify(body),'application/json',options,20000);
  if(check.available&&check.result?.success!==true)return failure('reference_unconfirmed',check.httpStatus);
  return check;
}

async function extractVeritasReceipt(image, options={}) {
  const form=new FormData();
  form.append('file',new Blob([image.bytes],{type:image.type}),image.type==='image/png'?'receipt.png':'receipt.jpg');
  const check=await postVeritas('/verify-image?autoVerify=false',form,null,options,25000);
  if(!check.available)return check.code==='reference_unconfirmed'?failure('image_unreadable',check.httpStatus):check;
  const result=check.result;
  const data=result?.data??result;
  if(result?.success===false||data?.success===false||!bankCodes.includes(data?.type??data?.provider)||typeof data.reference!=='string'){
    return failure('image_unreadable',check.httpStatus);
  }
  return {available:true,provider:data.type??data.provider,reference:data.reference,suffix:data.accountSuffix??data.suffix};
}

module.exports={lookupVeritas,extractVeritasReceipt,messageFor};
