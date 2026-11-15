'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const sharp=require('sharp');
const jsQR=require('jsqr');
const {receiptFromText,cbeCandidate}=require('./receipt-extractor');

async function extract({bytes,input}) {
  let png;
  try{
    const source=sharp(Buffer.from(bytes),{limitInputPixels:24_000_000,failOn:'error'})
      .autoOrient().flatten({background:'#fff'}).resize(2000,2000,{fit:'inside',withoutEnlargement:true});
    if(input.provider==='cbe'){
      const {data,info}=await source.clone().toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
      const pixels=new Uint8ClampedArray(data.buffer,data.byteOffset,data.byteLength);
      const qr=jsQR(pixels,info.width,info.height);
      const proof=qr&&cbeCandidate(qr.data.trim());
      if(proof)return proof;
    }
    png=await source.greyscale().png().toBuffer();
  }catch{return {available:false,code:'image_unreadable'};}

  const {createWorker}=require('tesseract.js');
  const {langPath}=require('@tesseract.js-data/eng');
  const ocr=await createWorker('eng',1,{langPath,cacheMethod:'none',errorHandler:()=>{}});
  try{
    const {data}=await ocr.recognize(png);
    return receiptFromText(data.text,input);
  }finally{await ocr.terminate();}
}

extract(workerData).then(
  result=>parentPort.postMessage(result),
  ()=>parentPort.postMessage({available:false,code:'image_unavailable'}),
);
