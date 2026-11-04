'use strict';
// Seed review inputs through real APIs, only against the named disposable fixture.
const assert=require('node:assert/strict'),base='http://localhost:5000/api';
async function main(){
 const login=async name=>{const r=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:name+'@example.invalid',password:'Synthetic-ui-test-only-123!'})});assert.equal(r.status,200);const s=await r.json();assert.equal(s.user.daycare_name,'Acceptance test center');return s;};
 const admin=await login('admin'),staff=await login('caregiver'),parent=await login('parent');
 const request=async(actor,method,url,body)=>{const r=await fetch(base+url,{method,headers:{Authorization:'Bearer '+actor.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const result=await r.json();assert.ok(r.ok,`${url}: ${r.status} ${result.error||''}`);return result;};
 const child=(await request(admin,'GET','/children')).data.find(c=>c.full_name==='Test child');
 const report=await request(staff,'POST','/reports/daily',{child_id:child.id,mood:'calm',sleep_duration_min:45,sleep_notes:'Synthetic rest notes',behavior_notes:'Synthetic shared play',general_observations:'Synthetic rich report',meals:[{meal_type:'breakfast',description:'Porridge',portion:'good'},{meal_type:'lunch',description:'Vegetables',portion:'fair'}],activities:[{activity_type:'learning',description:'Story time',location:'indoor'},{activity_type:'play',description:'Ball play',location:'outdoor'}]});
 const health=await request(staff,'POST','/health',{child_id:child.id,record_type:'incident',severity:'low',description:'Synthetic incident for administrator review.'});
 await request(staff,'PATCH',`/health/${health.id}/notify`);
 await request(staff,'POST','/messages',{recipient_id:parent.user.id,subject:'Acceptance caregiver parent conversation',body:'Synthetic care update for message oversight testing.'});
 const products=await request(parent,'GET','/store/products');const book=(products.data||products).find(p=>p.name==='Test classroom book');
 const order=await request(parent,'POST','/store/orders',{idempotency_key:'admin-acceptance-order-20261031',note:'Synthetic pickup order',items:[{product_id:book.id,quantity:1}]});
 console.log(JSON.stringify({report:report.id,health:health.id,order:order.id||order.order?.id}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
