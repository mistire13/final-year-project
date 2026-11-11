'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/utils/billingDates.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports,Intl,Date});
const {invoiceIsOverdue,addisCalendarDay}=m.exports;
test('care fees remain payable through their Addis due day and turn overdue at the next Addis midnight',()=>{
  const before=new Date('2026-11-10T20:59:59Z'),after=new Date('2026-11-10T21:00:00Z');
  assert.equal(addisCalendarDay(before),'2026-11-10');assert.equal(addisCalendarDay(after),'2026-11-11');
  assert.equal(invoiceIsOverdue('2026-11-10','pending',before),false);
  assert.equal(invoiceIsOverdue('2026-11-10','partially_paid',after),true);
  assert.equal(invoiceIsOverdue('2026-11-09','pending',before),true);
  assert.equal(invoiceIsOverdue('2026-11-11','pending',before),false);
  for(const status of ['paid','cancelled'])assert.equal(invoiceIsOverdue('2026-11-09',status,after),false);
  assert.equal(invoiceIsOverdue('','pending',after),false);
});
