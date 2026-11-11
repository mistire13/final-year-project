'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
const {withOperationalDatabase}=require('./helpers/auth-test-database.cjs');
const directory=path.resolve(__dirname,'../src/db/migrations');
class Through55{
  async getMigrations(){return fs.readdirSync(directory).filter(file=>/^\d{3}[a-z]?_.+\.js$/.test(file)&&Number(file.slice(0,3))<=55).sort();}
  getMigrationName(file){return file;}
  getMigration(file){return require(path.join(directory,file));}
}
async function oldFixture(db,{conflict=false}={}){
  await db.migrate.latest({migrationSource:new Through55()});
  await db('roles').insert([{id:1,name:'admin'},{id:3,name:'parent'}]).onConflict('id').ignore();
  const [center]=await db('daycares').insert({name:'Legacy receipt QA',slug:'legacy-receipt-qa',contact_email:'legacy-receipt@example.invalid',status:'active'}).returning('*');
  const [admin,parent]=await db('users').insert([{name:'Legacy receipt admin',email:'legacy-receipt-admin@example.invalid',role_id:1},{name:'Legacy receipt parent',email:'legacy-receipt-parent@example.invalid',role_id:3}].map(row=>({...row,daycare_id:center.id,password_hash:'synthetic',status:'active'}))).returning('*');
  const [child]=await db('children').insert({full_name:'Legacy receipt child',dob:'2023-01-01',daycare_id:center.id}).returning('*');
  const [invoice]=await db('child_invoices').insert({daycare_id:center.id,child_id:child.id,parent_id:parent.id,invoice_type:'custom',billing_period:'2026-11',title:'Historical care obligation',amount:100,amount_paid:50,due_date:'2026-11-30',status:'partially_paid'}).returning('*');
  const reference=conflict?'QA-SHARED-HISTORICAL-COLLISION':'QA-LEGACY-CARE-TRANSFER';
  const care=await db('child_payments').insert([
    {daycare_id:center.id,invoice_id:invoice.id,amount_paid:25,payment_method:'cbe_transfer',reference_code:reference,receipt_number:'LEGACY-QA-BANK-01',recorded_by:admin.id,verified_at:'2026-11-01T09:00:00Z',notes:'Historically manually entered transfer; never provider checked'},
    {daycare_id:center.id,invoice_id:invoice.id,amount_paid:25,payment_method:'cash_at_daycare',reference_code:'CASH-LEGACY-QA',receipt_number:'LEGACY-QA-CASH-01',recorded_by:admin.id,verified_at:'2026-11-02T09:00:00Z',notes:'Historical manual cash record'},
  ]).returning('*');
  const [order]=await db('orders').insert({daycare_id:center.id,parent_id:parent.id,total:100,order_status:'confirmed',payment_status:'paid'}).returning('*');
  const [shop]=await db('payments').insert({order_id:order.id,method:'digital',gateway_ref:'QA-LEGACY-SHOP-TRANSFER',status:'paid',verified_at:'2026-11-03T09:00:00Z'}).returning('*');
  const intentId=crypto.randomUUID();
  await db('subscription_payment_intents').insert({id:intentId,email:'legacy-saas@example.invalid',secret_hash:'synthetic-unused',terms:{},status:'verified',amount:100,currency:'ETB',recipient:'1000000000',provider:'cbe',payment_reference:conflict?reference:'QaModernCaseToken',expires_at:new Date(Date.now()+86400000)});
  await db('subscription_payment_references').insert({reference:conflict?reference:'QaModernCaseToken',provider:'cbe',intent_id:intentId,source:'legacy_qa'});
  const legacyIntentId=crypto.randomUUID(),caseIntentId=crypto.randomUUID();
  if(!conflict){
    for(const [id,provider,payment_reference]of [[legacyIntentId,null,'legacy saaS 789'],[caseIntentId,'cbe','qamoderncasetoken']]){
      await db('subscription_payment_intents').insert({id,email:'legacy-additional@example.invalid',secret_hash:'synthetic-unused',terms:{},status:'verified',amount:100,currency:'ETB',recipient:'1000000000',provider,payment_reference,expires_at:new Date(Date.now()+86400000)});
      await db('subscription_payment_references').insert({reference:payment_reference,provider:provider||'legacy',intent_id:id,source:'legacy_qa'});
    }
  }
  return {center,care,shop,reference,intentId,legacyIntentId,caseIntentId};
}
test('shared-ledger migration preserves legacy manual provenance and hides cross-purpose claims from runtime roles',async()=>{
  await withOperationalDatabase(async({db,pool})=>{
    const f=await oldFixture(db);
    await db.transaction(trx=>require('../src/db/migrations/056_daycare_receipt_verification').up(trx));
    for(const original of f.care){
      const stored=await db('child_payments').where({id:original.id}).first();
      assert.equal(stored.verification_source,'manual_recorded','historical transfer timestamp must not imply provider verification');
      for(const [key,value]of Object.entries(original))assert.deepEqual(stored[key],value,'legacy care '+key);
      assert.equal(stored.daycare_payment_request_id,null);
    }
    const shop=await db('payments').where({id:f.shop.id}).first();assert.equal(shop.verification_source,'manual_recorded');
    for(const [key,value]of Object.entries(f.shop))assert.deepEqual(shop[key],value,'legacy shop '+key);
    const claims=await db('payment_reference_claims');
    assert.ok(claims.some(row=>row.owner_kind==='legacy_care'&&row.owner_id===String(f.care[0].id)));
    assert.ok(claims.some(row=>row.owner_kind==='legacy_shop'&&row.owner_id===String(f.shop.id)));
    assert.ok(claims.some(row=>row.owner_kind==='subscription'&&row.owner_id===f.intentId));
    assert.ok(claims.some(row=>row.owner_kind==='subscription'&&row.owner_id===f.legacyIntentId),'unknown historical provider claims remain protected');
    const modern=claims.filter(row=>row.owner_kind==='subscription'&&[f.intentId,f.caseIntentId].includes(row.owner_id));
    assert.equal(modern.length,2,'genuine modern CBE case-distinct tokens must not be merged');
    assert.equal(new Set(modern.map(row=>row.reference_key)).size,2);
    assert.equal(claims.some(row=>row.owner_kind==='legacy_care'&&row.owner_id===String(f.care[1].id)),false,'cash receipt numbers are not bank transaction claims');
    for(const role of ['ankelba_tenant','ankelba_control']){
      const c=await pool.connect();try{await c.query('BEGIN');await c.query('SET LOCAL ROLE '+role);await assert.rejects(c.query('SELECT * FROM payment_reference_claims'),error=>error.code==='42501');await c.query('ROLLBACK');}finally{c.release();}
    }
    assert.equal((await db('child_invoices').where({id:f.care[0].invoice_id}).first()).amount_paid,'50.00');
  });
});
test('shared-ledger migration refuses cross-purpose historical reuse and rolls back without rewriting payment evidence',async()=>{
  await withOperationalDatabase(async({db})=>{
    const f=await oldFixture(db,{conflict:true});
    await assert.rejects(db.transaction(trx=>require('../src/db/migrations/056_daycare_receipt_verification').up(trx)),/Historical.*(?:conflict|reconcil)/i);
    assert.equal(await db.schema.hasTable('payment_reference_claims'),false,'failed migration must roll back its new claim ledger');
    assert.equal(await db.schema.hasColumn('child_payments','verification_source'),false);
    assert.deepEqual(await db('child_payments').whereIn('id',f.care.map(row=>row.id)).orderBy('id'),f.care);
    assert.deepEqual(await db('payments').where({id:f.shop.id}).first(),f.shop);
    assert.equal((await db('subscription_payment_references').where({intent_id:f.intentId})).length,1);
  });
});
