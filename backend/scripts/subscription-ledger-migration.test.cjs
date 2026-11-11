'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {withCurrentDatabase} = require('./helpers/auth-test-database.cjs');
const migration = require('../src/db/migrations/047_subscription_reference_ledger');

test('ledger migration refuses conflicting historical claims and preserves verified evidence', async () => {
  await withCurrentDatabase(async ({db}) => {
    // Recreate the immediate pre-047 state only inside this owned disposable DB.
    await db.schema.dropTable('subscription_payment_attempts');
    await db.schema.dropTable('subscription_payment_references');
    await db.schema.alterTable('subscription_payment_intents',t=>{t.dropColumn('created_by');t.dropColumn('restart_authorization_id');});
    await db.schema.alterTable('daycares',t=>t.dropColumn('renewal_restart_authorization'));
    await db.raw(`CREATE UNIQUE INDEX subscription_payment_reference_unique
      ON subscription_payment_intents(provider,payment_reference) WHERE payment_reference IS NOT NULL`);
    const first=randomUUID(), second=randomUUID(), legacyWithoutProvider=randomUUID();
    const base={email:'synthetic@example.invalid',secret_hash:'hash',terms:{},status:'verified',amount:100,
      currency:'ETB',recipient:'000000',expires_at:new Date(Date.now()+86400000),payment_reference:'SHARED-REF'};
    await db('subscription_payment_intents').insert([{...base,id:first,provider:'cbe'},{...base,id:second,provider:'telebirr'}]);
    await db('subscription_payment_intents').insert({...base,id:legacyWithoutProvider,provider:null,payment_reference:'LEGACY-NULL-PROVIDER'});
    await assert.rejects(db.transaction(trx=>migration.up(trx)),/Confirmed payment references conflict/);
    assert.equal((await db.raw("SELECT to_regclass('subscription_payment_references') AS name")).rows[0].name,null);
    await db('subscription_payment_intents').where({id:second}).update({payment_reference:'DIFFERENT-REF'});
    await db.transaction(trx=>migration.up(trx));
    const rows=await db('subscription_payment_references').orderBy('reference');
    assert.deepEqual(rows.map(row=>[row.reference,row.intent_id,row.source]),[
      ['DIFFERENT-REF',second,'historical'],['LEGACY-NULL-PROVIDER',legacyWithoutProvider,'historical'],['SHARED-REF',first,'historical'],
    ]);
    await assert.rejects(db('subscription_payment_references').insert({reference:'SHARED-REF',provider:'dashen',intent_id:second,source:'test'}),error=>error.code==='23505');
  });
});

test('ledger migration refuses confirmed historical payments without a reference', async () => {
  await withCurrentDatabase(async ({db}) => {
    await db.schema.dropTable('subscription_payment_attempts');
    await db.schema.dropTable('subscription_payment_references');
    await db.schema.alterTable('subscription_payment_intents',t=>{t.dropColumn('created_by');t.dropColumn('restart_authorization_id');});
    await db.schema.alterTable('daycares',t=>t.dropColumn('renewal_restart_authorization'));
    await db('subscription_payment_intents').insert({
      id:randomUUID(),email:'missing-reference@example.invalid',secret_hash:'hash',terms:{},status:'verified',amount:100,
      currency:'ETB',recipient:'000000',expires_at:new Date(Date.now()+86400000),payment_reference:null,provider:null,
    });
    await assert.rejects(db.transaction(trx=>migration.up(trx)),/reference/i);
    assert.equal((await db.raw("SELECT to_regclass('subscription_payment_references') AS name")).rows[0].name,null);
  });
});

test('legacy references are protected across formatting while modern CBE identifiers remain case sensitive', async () => {
  await withCurrentDatabase(async ({db,pool}) => {
    await db.schema.dropTable('subscription_payment_attempts');
    await db.schema.dropTable('subscription_payment_references');
    await db.schema.alterTable('subscription_payment_intents',t=>{t.dropColumn('created_by');t.dropColumn('restart_authorization_id');});
    await db.schema.alterTable('daycares',t=>t.dropColumn('renewal_restart_authorization'));
    const id=randomUUID(), cbeToken=randomUUID(), cbeUrl=randomUUID(), cbeLegacy=randomUUID();
    const base={email:'migration-alias@example.invalid',secret_hash:'hash',terms:{},status:'verified',amount:100,currency:'ETB',recipient:'000000',expires_at:new Date(Date.now()+86400000)};
    await db('subscription_payment_intents').insert([
      {...base,id,provider:null,payment_reference:'abc 123'},
      {...base,id:cbeToken,provider:'cbe',payment_reference:'AbC987xY'},
      {...base,id:cbeUrl,provider:'cbe',payment_reference:'https://mbreciept.cbe.com.et/CaseSensitiveToken'},
      {...base,id:cbeLegacy,provider:'cbe',payment_reference:'ft1234'},
    ]);
    const [owner]=await db('users').insert({name:'Synthetic operator',email:'migration-owner@example.invalid',role_id:0,status:'active',password_hash:'synthetic'}).returning('*');
    const daycare=await db('daycares').first();
    await db('subscription_events').insert({daycare_id:daycare.id,actor_id:owner.id,action:'renew',reason:'Synthetic manual historic payment',details:JSON.stringify({payment_reference:'xyz 789'}),request_key:'historical-alias-fixture-01'});
    await db.transaction(trx=>migration.up(trx));
    const rows=await db('subscription_payment_references');
    const refs=rows.map(row=>row.reference);
    for(const expected of ['abc 123','ABC123','xyz 789','XYZ789','ft1234','FT1234','AbC987xY','https://mbreciept.cbe.com.et/CaseSensitiveToken']) assert.ok(refs.includes(expected),expected);
    assert.equal(refs.includes('ABC987XY'),false,'Modern CBE token casing must not change');
    assert.equal(refs.includes('HTTPS://MBRECIEPT.CBE.COM.ET/CASESENSITIVETOKEN'),false);
    await assert.rejects(db('subscription_payment_references').insert({reference:'ABC123',provider:'telebirr',intent_id:cbeToken,source:'test'}),error=>error.code==='23505');
    await assert.rejects(db('subscription_payment_references').insert({reference:'XYZ789',provider:'telebirr',intent_id:cbeToken,source:'test'}),error=>error.code==='23505');
    await assert.rejects(db('subscription_payment_references').insert({reference:'FT1234',provider:'cbe',intent_id:cbeToken,source:'test'}),error=>error.code==='23505');
    await db('subscription_packages').where({code:'standard'}).update({monthly_price:'100.00'});
    const {createPaymentService}=require('../src/modules/saas/subscription-payments.service');
    const service=createPaymentService(pool,{
      apiKey:'synthetic',accounts:{cbe:{enabled:true,account_holder:'Synthetic receiver',account_number:'0911234567'}},
      fetch:async(_url,options)=>({ok:true,json:async()=>({success:true,data:{status:'success',reference:new URL(JSON.parse(options.body).reference).pathname.slice(1),amount:'100.00',currency:'ETB',receiverName:'Synthetic receiver',receiverAccount:'0911234567',transactionDate:new Date().toISOString()}})}),
    });
    const attempt=await service.create({provider:'cbe',package_code:'standard',billing_cycle:'monthly',email:'migration-attempt@example.invalid'});
    await assert.rejects(service.verify(attempt.id,{token:attempt.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/AbC123'}),error=>error.statusCode===409);
    await assert.rejects(service.verify(attempt.id,{token:attempt.token,provider:'cbe',reference:'https://mbreciept.cbe.com.et/XyZ789'}),error=>error.statusCode===409);
  });
});

for(const [label,details] of [
  ['missing',{}],
  ['inconsistent',{payment_reference:'SYNTHETIC-UNKNOWN',payment_intent_id:'00000000-0000-4000-8000-000000000001'}],
]) test(`ledger migration refuses ${label} historical renewal evidence`, async () => {
  await withCurrentDatabase(async ({db}) => {
    await db.schema.dropTable('subscription_payment_attempts');
    await db.schema.dropTable('subscription_payment_references');
    await db.schema.alterTable('subscription_payment_intents',t=>{t.dropColumn('created_by');t.dropColumn('restart_authorization_id');});
    await db.schema.alterTable('daycares',t=>t.dropColumn('renewal_restart_authorization'));
    const [owner]=await db('users').insert({name:'Synthetic operator',email:`migration-${label}@example.invalid`,role_id:0,status:'active',password_hash:'synthetic'}).returning('*');
    const daycare=await db('daycares').first();
    await db('subscription_events').insert({daycare_id:daycare.id,actor_id:owner.id,action:'renew',reason:'Synthetic incomplete historical evidence',details:JSON.stringify(details),request_key:`historical-${label}-evidence`});
    await assert.rejects(db.transaction(trx=>migration.up(trx)),/evidence/i);
    assert.equal((await db.raw("SELECT to_regclass('subscription_payment_references') AS name")).rows[0].name,null);
  });
});

test('ambiguous normalized historical aliases abort migration instead of selecting a payment', async () => {
  await withCurrentDatabase(async ({db}) => {
    await db.schema.dropTable('subscription_payment_attempts');
    await db.schema.dropTable('subscription_payment_references');
    await db.schema.alterTable('subscription_payment_intents',t=>{t.dropColumn('created_by');t.dropColumn('restart_authorization_id');});
    await db.schema.alterTable('daycares',t=>t.dropColumn('renewal_restart_authorization'));
    await db('subscription_payment_intents').insert({id:randomUUID(),email:'collision@example.invalid',secret_hash:'hash',terms:{},status:'verified',amount:100,currency:'ETB',recipient:'000000',expires_at:new Date(Date.now()+86400000),payment_reference:'abc 123',provider:null});
    const [owner]=await db('users').insert({name:'Synthetic operator',email:'migration-collision@example.invalid',role_id:0,status:'active',password_hash:'synthetic'}).returning('*');
    const daycare=await db('daycares').first();
    await db('subscription_events').insert({daycare_id:daycare.id,actor_id:owner.id,action:'renew',reason:'Synthetic conflicting reference',details:JSON.stringify({payment_reference:'ABC123'}),request_key:'historical-collision-fixture'});
    await assert.rejects(db.transaction(trx=>migration.up(trx)));
    assert.equal((await db.raw("SELECT to_regclass('subscription_payment_references') AS name")).rows[0].name,null);
  });
});
