'use strict';
// Optional setup for the synthetic server only. It refuses a normal daycare.
const assert=require('node:assert/strict');
const base='http://localhost:5000/api';
async function run(){
 const login=async email=>{
  const response=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'Synthetic-ui-test-only-123!'})});
  assert.equal(response.status,200);const session=await response.json();
  assert.equal(session.user.daycare_name,'Acceptance test center');return session;
 };
 const admin=await login('admin@example.invalid'),caregiver=await login('caregiver@example.invalid');
 const request=async(method,url,body)=>{
  const response=await fetch(base+url,{method,headers:{Authorization:`Bearer ${admin.token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status<300,true,`${method} ${url}: ${response.status}`);return response.json();
 };
 const children=await request('GET','/children');const child=children.data.find(c=>c.full_name==='Test child');assert.ok(child);
 await request('POST','/portal/assignments',{staff_id:caregiver.user.id,group_id:child.group_id,starts_at:new Date(Date.now()-3600000).toISOString(),ends_at:new Date(Date.now()+3600000).toISOString(),can_attendance:true,can_pickup:true});
 await request('POST','/finances/invoices',{child_id:child.id,title:'Synthetic care invoice',amount:100,billing_period:'2026-11',due_date:'2026-11-15',invoice_type:'custom'});
 console.log('Synthetic pickup duty and parent bill prepared.');
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
