'use strict';
const {receiptInput}=require('../saas/subscription-banks');

const MAX_IMAGE_BYTES=4*1024*1024;
const MAX_IMAGE_BASE64=Math.ceil(MAX_IMAGE_BYTES/3)*4;

function readReceiptImage(value) {
  const bytes=Buffer.from(value,'base64');
  if(bytes.length>MAX_IMAGE_BYTES||bytes.toString('base64')!==value)return null;
  if(bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return {bytes,type:'image/png'};
  if(bytes.subarray(0,3).equals(Buffer.from('ffd8ff','hex')))return {bytes,type:'image/jpeg'};
  return null;
}

function extractedReceipt(proof, provider, suppliedSuffix) {
  if(!proof?.available||proof.provider!==provider||typeof proof.reference!=='string')return null;
  let reference=proof.reference.trim();
  let suffix;
  if(provider==='cbe'&&!/^https:/i.test(reference)){
    const legacy=/^(FT[A-Z0-9]{10})[-&+ ]?(\d{8})?$/i.exec(reference);
    if(legacy){
      const digits=legacy[2]??proof.suffix;
      if(!/^\d{8}$/.test(digits??''))return null;
      reference=`https://mbreciept.cbe.com.et/${legacy[1]}-${digits}`;
    }else if(/^(?:v2-[A-Za-z0-9]{10,100}|[A-Za-z0-9]{15,25})$/.test(reference)){
      reference=`https://mbreciept.cbe.com.et/${reference}`;
    }else return null;
  }
  if(provider==='abyssinia')suffix=suppliedSuffix??proof.suffix;
  try { receiptInput(provider,reference,suffix); } catch { return null; }
  return {reference,suffix};
}

function telebirrDate(value) {
  if(typeof value!=='string')return value;
  const parts=/^(\d{2})-(\d{2})-(\d{4}) (\d{2}:\d{2}:\d{2})$/.exec(value.trim());
  if(!parts)return value;
  const [,day,month,year,time]=parts;
  const local=`${year}-${month}-${day}T${time}`;
  const timestamp=Date.parse(local+'+03:00');
  return Number.isFinite(timestamp)&&new Date(timestamp+10800000).toISOString().startsWith(local)
    ? local+'+03:00' : null;
}

function providerReceipt(result, provider) {
  if(result?.success!==true)return null;
  let data=result;
  for(let depth=0;depth<3&&data.data&&typeof data.data==='object'&&!Array.isArray(data.data);depth++){
    if(data.success===false)return null;
    data=data.data;
  }
  if(data.success===false)return null;
  // The dedicated domestic bank endpoints also emit a native success shape
  // with a numeric transfer amount and no separate status or currency fields.
  const nativeBankReceipt=['cbe','abyssinia'].includes(provider)&&data.success===true
    &&typeof data.amount==='number'&&[data.payer,data.receiver,data.receiverAccount,data.date,data.reference].every(value=>typeof value==='string'&&value.trim());
  const normalized={...data};
  if(nativeBankReceipt){
    normalized.status=data.status??data.transactionStatus??'completed';
    normalized.currency=data.currency??data.currencyCode??'ETB';
  }
  if(provider==='telebirr'){
    const settled=typeof data.settledAmount==='string'&&/^([\d,]+(?:\.\d{1,2})?)\s+(?:birr|ETB)$/i.exec(data.settledAmount.trim());
    if(settled&&/^\d+(?:\.\d{1,2})?$|^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(settled[1])){
      normalized.settledAmount=settled[1].replaceAll(',','');
      normalized.currency=data.currency??data.currencyCode??'ETB';
    }
    if(data.paymentDate!=null)normalized.paymentDate=telebirrDate(data.paymentDate);
  }
  const currency=normalized.currency??normalized.currencyCode;
  if(typeof currency==='string'&&/^(etb|birr)$/i.test(currency.trim()))normalized.currency='ETB';
  return normalized;
}

module.exports={MAX_IMAGE_BASE64,readReceiptImage,extractedReceipt,providerReceipt};
