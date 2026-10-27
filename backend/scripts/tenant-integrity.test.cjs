'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {withIsolatedDatabase}=require('./helpers/auth-test-database.cjs');
const integrity=require('../src/db/tenant-integrity');
const migration=require('../src/db/migrations/019_tenant_relationship_integrity');
test('Tenant relationship constraints reject direct SQL cross-tenant writes',async t=>withIsolatedDatabase(async({db,pool})=>{
 await require('../src/db/migrations/023_runtime_profile_fields').up(db);
 await db('roles').insert({id:3,name:'parent'}).onConflict('id').ignore();
 const [a,b]=await db('daycares').insert([{name:'A',slug:'integrity-a',contact_email:'a@example.invalid'},{name:'B',slug:'integrity-b',contact_email:'b@example.invalid'}]).returning('*');
 const [ua,ub]=await db('users').insert([{name:'A',email:'a@example.invalid',role_id:3,daycare_id:a.id,password_hash:'synthetic'},{name:'B',email:'b@example.invalid',role_id:3,daycare_id:b.id,password_hash:'synthetic'}]).returning('*');
 const [ga,gb]=await db('groups').insert([{name:'A',daycare_id:a.id},{name:'B',daycare_id:b.id}]).returning('*');
 const [ca,cb]=await db('children').insert([{full_name:'A',dob:'2022-01-01',daycare_id:a.id,group_id:ga.id},{full_name:'B',dob:'2022-01-01',daycare_id:b.id,group_id:gb.id}]).returning('*');
 await t.test('preflight refuses unresolved ownership without guessing',async()=>{
  const [bad]=await db('groups').insert({name:'Unowned'}).returning('*');
  assert.ok((await integrity.inspect(sql=>db.raw(sql))).length);
  await assert.rejects(db.transaction(tx=>migration.up(tx)),/preflight failed/);
  assert.equal((await db('groups').where({id:bad.id}).first()).daycare_id,null);
  await db('groups').where({id:bad.id}).delete();
 });
 await db.transaction(tx=>migration.up(tx));
 await t.test('ownership required and child references constrained',async()=>{
  await assert.rejects(db('groups').insert({name:'No owner'}),{code:'23514'});
  await assert.rejects(db('children').where({id:ca.id}).update({group_id:gb.id}),{code:'23503'});
  await assert.rejects(db('children').where({id:ca.id}).update({caregiver_id:ub.id}),{code:'23503'});
  await assert.rejects(db('attendance').insert({child_id:ca.id,recorded_by:ua.id,daycare_id:b.id,event_type:'checkin'}),{code:'23503'});
  await db('attendance').insert({child_id:ca.id,recorded_by:ua.id,daycare_id:a.id,event_type:'checkin'});
 });
 await t.test('guardians and orders cannot bridge tenants',async()=>{
  await assert.rejects(db('guardian_links').insert({child_id:ca.id,user_id:ub.id,relationship:'Parent',created_by:ua.id}),{code:'23503'});
  const [link]=await db('guardian_links').insert({child_id:ca.id,user_id:ua.id,relationship:'Parent',created_by:ua.id}).returning('*');assert.equal(link.daycare_id,a.id);
  const [product]=await db('products').insert({name:'B product',price:1,created_by:ub.id,daycare_id:b.id}).returning('*');
  const [order]=await db('orders').insert({parent_id:ua.id,total:1,daycare_id:a.id}).returning('*');
  await assert.rejects(db('order_items').insert({order_id:order.id,product_id:product.id,quantity:1,unit_price:1}),{code:'23503'});
  await assert.rejects(db('users').where({id:ua.id}).update({daycare_id:b.id}),{code:'23503'});
 });
 await t.test('categories have tenant-owned CRUD, scoped counts and immutable shared templates',async()=>{
  const categoryMigration=require('../src/db/migrations/020_tenant_product_categories');
  await db.transaction(tx=>categoryMigration.up(tx));
  const dbFile=require.resolve('../src/config/db');require.cache[dbFile]={id:dbFile,filename:dbFile,loaded:true,exports:pool};
  const store=require('../src/modules/store/store.service');
  const actorA={id:ua.id,role:'admin',daycare_id:a.id},actorB={id:ub.id,role:'admin',daycare_id:b.id};
  const categoryA=await store.createCategory({name:'Supplies'},actorA);
  const categoryB=await store.createCategory({name:'Supplies'},actorB);
  await assert.rejects(store.updateCategory(categoryB.id,{name:'Wrong'},actorA),{statusCode:404});
  await assert.rejects(store.deleteCategory(categoryB.id,actorA),{statusCode:404});
  await assert.rejects(store.createProduct({name:'Wrong',price:1,category_id:categoryB.id},actorA),{statusCode:404});
  await assert.rejects(db('products').insert({name:'Wrong direct SQL',price:1,category_id:categoryB.id,created_by:ua.id,daycare_id:a.id}),{code:'23503'});
  const [shared]=await db('product_categories').insert({name:'Shared template'}).returning('*');
  await assert.rejects(store.updateCategory(shared.id,{name:'Wrong'},actorA),{statusCode:404});
  const product=await store.createProduct({name:'Tenant B item',price:1,category_id:shared.id},actorB);
  const listed=await store.listCategories(actorA);
  assert.ok(!listed.data.some(row=>row.id===categoryB.id));
  assert.equal(listed.data.find(row=>row.id===shared.id).product_count,0);
  await db('products').where({id:product.id}).delete();
  await store.deleteCategory(categoryA.id,actorA);await store.deleteCategory(categoryB.id,actorB);
  await db.transaction(tx=>categoryMigration.down(tx));
 });
 await t.test('rollback and reapply retain valid records',async()=>{
  await db.transaction(tx=>migration.down(tx));await db.transaction(tx=>migration.up(tx));
  assert.deepEqual(await integrity.inspect(sql=>db.raw(sql)),[]);
 });
}));
