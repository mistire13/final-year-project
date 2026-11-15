'use strict';
const path=require('node:path');
const {Worker}=require('node:worker_threads');
const {extractedReceipt}=require('./receipt-evidence');

const MAX_SCANS=2;
const SCAN_TIMEOUT_MS=20000;
const unreadable={available:false,code:'image_unreadable'};
const unavailable={available:false,code:'image_unavailable'};
const referenceLabel=/(?:\b(?:transaction|txn|trans\.?|receipt|payment|transfer)\s*(?:reference(?:\s*(?:number|no\.?))?|ref\.?(?:\s*(?:number|no\.?))?|number|no\.?|id|#)|\b(?:reference|ref\.?)(?:\s*(?:number|no\.?))?|የክፍያ ቁጥር|የደረሰኝ ቁጥር)\s*[:#=-]?\s*(.*)$/i;
const suffixLabel=/\b(?:account suffix|last (?:5|five) digits(?: of (?:the )?account(?: number)?)?)\s*[:#=-]?\s*(.*)$/i;
const telebirrReference=/^(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{10}$/i;
const abyssiniaReference=/^FT[A-Z0-9]{10}$/i;
let activeScans=0;

function labelledValues(lines,label,pattern) {
  return lines.flatMap((line,index)=>{
    const match=label.exec(line);
    const value=match&&(match[1].trim()||lines[index+1]);
    return value&&pattern.test(value)?[value]:[];
  });
}

function unique(values) {
  const candidates=[...new Set(values)];
  return candidates.length===1?candidates[0]:null;
}

function candidate(provider,reference,suffix) {
  const proof=extractedReceipt({available:true,provider,reference,suffix},provider,suffix);
  return proof?{available:true,provider,...proof}:null;
}

function cbeCandidate(value) {
  if(!/^https:\/\//i.test(value)&&!/^v2-[A-Za-z0-9]{10,100}$/.test(value))return null;
  return candidate('cbe',value);
}

function receiptFromText(text,{provider,suffix}) {
  if(provider==='cbe'){
    const candidates=[...text.matchAll(/https:\/\/[^\s<>"']+|\bv2-[A-Za-z0-9]{10,100}\b/gi)]
      .map(([value])=>cbeCandidate(value)?.reference).filter(Boolean);
    return cbeCandidate(unique(candidates)??'')??unreadable;
  }
  const pattern=provider==='telebirr'?telebirrReference:provider==='abyssinia'?abyssiniaReference:null;
  if(!pattern)return unreadable;
  const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const labelled=labelledValues(lines,referenceLabel,pattern);
  const tokens=text.match(/[\p{L}\p{N}_-]+/gu)??[];
  const reference=unique(labelled.length?labelled:tokens.filter(token=>pattern.test(token)));
  if(!reference)return unreadable;
  if(provider==='abyssinia')suffix??=unique(labelledValues(lines,suffixLabel,/^\d{5}$/));
  return candidate(provider,reference,suffix)??unreadable;
}

async function extractDaycareReceipt(image,input) {
  if(activeScans>=MAX_SCANS)return unavailable;
  activeScans++;
  let worker,timer;
  try{
    // Keep image decoding and OCR off the API event loop, and cap the entire scan,
    // including OCR initialization, within the payment's verification lease.
    worker=new Worker(path.join(__dirname,'receipt-extractor-worker.js'),{workerData:{bytes:image.bytes,input}});
    return await new Promise(resolve=>{
      worker.once('message',resolve);
      worker.once('error',()=>resolve(unavailable));
      worker.once('exit',()=>resolve(unavailable));
      timer=setTimeout(()=>resolve(unavailable),SCAN_TIMEOUT_MS);
    });
  }catch{return unavailable;}
  finally{
    clearTimeout(timer);
    try{await worker?.terminate();}finally{activeScans--;}
  }
}

module.exports={extractDaycareReceipt,receiptFromText,cbeCandidate};
