'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {withCurrentDatabase}=require('./helpers/auth-test-database.cjs');
test('private invoices require child-linked parents and cannot cross daycare/database boundaries',async()=>{
 await withCurrentDatabase(async({db,pool})=>{
  await db('roles').insert([{id:1,name:'admin'},{id:3,name:'parent'}]).onConflict('id').ignore();
  const [a,b]=await db('daycares').insert(['a','b'].map(name=>({name,slug:`financial-${name}`,contact_email:`${name}@financial.invalid`,status:'active'}))).returning('*');
  const [admin,parent,unlinked,foreign]=await db('users').insert([
   {name:'Admin',role_id:1,daycare_id:a.id},{name:'Parent',role_id:3,daycare_id:a.id},
   {name:'Unlinked',role_id:3,daycare_id:a.id},{name:'Foreign',role_id:3,daycare_id:b.id},
  ].map((u,i)=>({...u,email:`u${i}@financial.invalid`,password_hash:'synthetic-unused'}))).returning('*');
  const [child]=await db('children').insert({full_name:'Synthetic child',dob:'2023-01-01',daycare_id:a.id}).returning('*');
  await db('guardian_links').insert({child_id:child.id,user_id:parent.id,relationship:'Parent',created_by:admin.id});
  const key=require.resolve('../src/config/db');require.cache[key]={id:key,filename:key,loaded:true,exports:pool};
  const svc=require('../src/modules/finances/finances.service');
  const payload={child_id:child.id,title:'Synthetic invoice',amount:100,due_date:'2026-12-01',billing_period:'2026-12'};
  for(const wrong of [unlinked.id,foreign.id,admin.id])await assert.rejects(svc.createInvoice(a.id,{...payload,parent_id:wrong},admin.id),{statusCode:422});
  const invoice=await svc.createInvoice(a.id,{...payload,parent_id:parent.id},admin.id);
  assert.equal((await svc.listParentInvoices(unlinked.id,a.id)).length,0);
  assert.equal((await svc.listParentInvoices(parent.id,a.id)).length,1);
  assert.equal((await svc.listParentInvoices(foreign.id,b.id)).length,0);
  await assert.rejects(db('child_invoices').insert({...payload,daycare_id:b.id,invoice_type:'custom',parent_id:foreign.id}));
  for(const table of ['child_invoices','child_payments']){
   await assert.rejects(db.transaction(async trx=>{await trx.raw('SET LOCAL ROLE ankelba_control');await trx(table).select('*');}),e=>e.code==='42501');
   await db.transaction(async trx=>{await trx.raw('SET LOCAL ROLE ankelba_tenant');assert.equal((await trx(table).select('*')).length,0);});
  }
 });
});
