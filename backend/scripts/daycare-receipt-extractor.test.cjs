'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const QRCode=require('qrcode');
const sharp=require('sharp');
const {extractDaycareReceipt,receiptFromText}=require('../src/modules/daycare-payments/receipt-extractor');

test('CBE reads the complete official QR link, including an embedded legacy suffix',async()=>{
  for(const reference of ['https://mbreciept.cbe.com.et/v2-SyntheticScreenshot01','https://apps.cbe.com.et:100/receipt?id=FT0123456789-12345678']){
    const bytes=await QRCode.toBuffer(reference,{width:450});
    assert.deepEqual(await extractDaycareReceipt({bytes},{provider:'cbe'}),{
      available:true,provider:'cbe',reference,suffix:undefined,
    });
  }
});

test('CBE QR pointing to a different domain and invalid image data produce no proof',async()=>{
  const bytes=await QRCode.toBuffer('https://mbreciept.cbe.com.et.invalid/v2-SyntheticScreenshot01',{width:450});
  for(const image of [bytes,Buffer.from('89504e470d0a1a0a','hex')]){
    assert.equal((await extractDaycareReceipt({bytes:image},{provider:'cbe'})).code,'image_unreadable');
  }
});

test('Telebirr transaction reference is read by local OCR from a JPEG screenshot',async()=>{
  const bytes=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="360">
    <rect width="100%" height="100%" fill="white"/>
    <g font-family="sans-serif" font-size="40" fill="black">
      <text x="50" y="80">Telebirr Payment Receipt</text>
      <text x="50" y="180">Transaction Number: ZX73PQ29LK</text>
      <text x="50" y="280">Total paid: 100.00 ETB</text>
    </g></svg>`)).jpeg().toBuffer();
  assert.deepEqual(await extractDaycareReceipt({bytes},{provider:'telebirr'}),{
    available:true,provider:'telebirr',reference:'ZX73PQ29LK',suffix:undefined,
  });
});

test('OCR prioritizes labelled references and leaves ambiguous receipts for manual entry',()=>{
  assert.equal(receiptFromText('AB12CD34EF\nTransaction Reference:\nZX73PQ29LK',{provider:'telebirr'}).reference,'ZX73PQ29LK');
  assert.equal(receiptFromText('Reference: AB12CD34EF\nReceipt No: ZX73PQ29LK',{provider:'telebirr'}).code,'image_unreadable');
  assert.equal(receiptFromText('https://bad.invalid/v2-SyntheticScreenshot01',{provider:'cbe'}).code,'image_unreadable');
  assert.equal(receiptFromText('Receipt: v2-SyntheticScreenshot01',{provider:'cbe'}).reference,'https://mbreciept.cbe.com.et/v2-SyntheticScreenshot01');
});

test('Abyssinia uses an explicitly labelled or entered suffix, never an unrelated number',()=>{
  const text='Receipt Number: FT0123456789\nCashier code: 12345';
  assert.equal(receiptFromText(text,{provider:'abyssinia'}).code,'image_unreadable');
  assert.equal(receiptFromText(text+'\nLast 5 digits: 54321',{provider:'abyssinia'}).suffix,'54321');
  assert.equal(receiptFromText(text,{provider:'abyssinia',suffix:'65432'}).suffix,'65432');
});
