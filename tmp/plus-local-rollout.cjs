'use strict';
const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),backend=path.join(root,'backend');
require(path.join(backend,'node_modules/dotenv')).config({path:path.join(backend,'.env'),quiet:true});
const knex=require(path.join(backend,'node_modules/knex'));
const config=require(path.join(backend,'src/config/knexfile'));
const {Client}=require(path.join(backend,'node_modules/pg'));
const bin='C:/Program Files/PostgreSQL/18/bin';
const completion=process.argv.includes('--completion');
const receipts=process.argv.includes('--receipts');
const tables=['subscription_packages','subscription_payment_settings','subscription_payment_intents','subscription_payment_references','subscription_payments','daycares',...(completion?['orders','order_items','payments','shop_stock_movements','shop_order_refunds','subscription_package_changes','child_invoices','child_payments']:[])];
const originalColumns={};
async function fingerprint(db){const out={};for(const table of tables){
  let rows=await db.schema.hasTable(table)?await db(table).select(receipts?originalColumns[table]:'*'):[];
  // Plus migration intentionally changes only the live package name/description
  // and adds a grandfathering column; accepted financial terms stay immutable.
  rows=rows.map(row=>{const copy={...row};if(completion){if(table==='subscription_payment_intents'){delete copy.subscription_change_id;delete copy.renewal_period_start;}}else{if(table==='subscription_packages'){delete copy.name;delete copy.description;}if(table==='daycares')delete copy.legacy_shop_access_until;if(['subscription_packages','daycares'].includes(table)){delete copy.version;delete copy.updated_at;}}return copy;});
  out[table]=crypto.createHash('sha256').update(JSON.stringify(rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))).digest('hex');
}return out;}
async function checkReceiptMigration(db){
  for(const table of ['daycare_payment_settings','daycare_payment_requests','daycare_payment_resolutions']){
    if(Number((await db(table).count('* as n').first()).n)!==0)throw Error('Migration unexpectedly created receiving settings or payment activity');
  }
  for(const table of ['payments','child_payments']){
    if(Number((await db(table).whereNot('verification_source','manual_recorded').orWhereNotNull('daycare_payment_request_id').count('* as n').first()).n)!==0)throw Error('Migration relabeled historical payments');
  }
  const uncovered=await db.raw(`SELECT count(*)::int AS n FROM subscription_payment_references r LEFT JOIN payment_reference_claims c ON c.reference_key=public.payment_reference_key(r.reference,r.provider) WHERE c.reference_key IS NULL OR c.owner_kind<>CASE WHEN r.intent_id IS NOT NULL THEN 'subscription' ELSE 'subscription_event' END OR c.owner_id<>COALESCE(r.intent_id::text,r.subscription_event_id::text)`);
  if(uncovered.rows[0].n!==0)throw Error('Confirmed subscription references were not fully reserved');
  return {historical_subscription_claims_preserved:true,new_payment_activity_created:false};
}
async function main(){
  const source=knex(config);let admin,copy,created=false;
  const testDb=`ankelba_plus_rollout_${Date.now()}`;
  try{
    const [_,pending]=await source.migrate.list();console.log(JSON.stringify({pending:pending.map(x=>x.file??x.name??x)}));
    if(!pending.length){console.log('No pending migrations.');return;}
    if(receipts){
      if(!completion||pending.some(x=>(x.file??x.name??x)!=='056_daycare_receipt_verification.js'))throw Error('Receipt rollout expects only migration 056 and --completion');
      for(const table of tables)originalColumns[table]=Object.keys(await source(table).columnInfo());
    }
    const before=await fingerprint(source);
    const folder=path.join(root,'tmp/subscription-backups');fs.mkdirSync(folder,{recursive:true});
    const backup=path.join(folder,`before-plus-${Date.now()}.dump`);
    const connection=config.connection,env={...process.env,PGPASSWORD:connection.password};
    const args=['-h',connection.host,'-p',String(connection.port),'-U',connection.user];
    execFileSync(path.join(bin,'pg_dump.exe'),[...args,'-Fc','-f',backup,connection.database],{env,stdio:'pipe'});
    const listing=execFileSync(path.join(bin,'pg_restore.exe'),['--list',backup],{env,encoding:'utf8'});
    if(fs.statSync(backup).size<1000||!listing.includes('subscription_payment_references'))throw Error('Backup validation failed');
    console.log('Private custom-format backup created and archive list verified.');
    admin=new Client({...connection,database:'postgres'});await admin.connect();
    await admin.query(`CREATE DATABASE "${testDb}"`);created=true;
    execFileSync(path.join(bin,'pg_restore.exe'),[...args,'--exit-on-error','--no-owner','-d',testDb,backup],{env,stdio:'pipe'});
    copy=knex({...config,connection:{...connection,database:testDb},pool:{min:0,max:2}});
    if(JSON.stringify(await fingerprint(copy))!==JSON.stringify(before))throw Error('Restored backup differs');
    const rehearsed=await copy.migrate.latest();
    if(JSON.stringify(await fingerprint(copy))!==JSON.stringify(before))throw Error('Rehearsal altered financial or daycare history');
    if(receipts)console.log(JSON.stringify(await checkReceiptMigration(copy)));
    console.log(JSON.stringify({rehearsed:rehearsed[1],financial_history_preserved:true}));
    if(process.argv.includes('--apply')){
      if(JSON.stringify(await fingerprint(source))!==JSON.stringify(before))throw Error('Local database changed during rehearsal; rerun before applying');
      const applied=await source.migrate.latest();
      if(JSON.stringify(await fingerprint(source))!==JSON.stringify(before))throw Error('Post-migration preservation check failed');
      if(receipts)console.log(JSON.stringify(await checkReceiptMigration(source)));
      console.log(JSON.stringify({applied:applied[1],financial_history_preserved:true,enabled_billing_schedules:Number((await source('billing_automation_settings').where({enabled:true}).count('* as n').first()).n)}));
    }else console.log('Rehearsal only; use --apply for local rollout.');
  }finally{
    if(copy)await copy.destroy();await source.destroy();
    if(admin){if(created)await admin.query(`DROP DATABASE "${testDb}" WITH (FORCE)`);await admin.end();}
  }
}
main().catch(error=>{console.error('Plus rollout failed:',error.message);process.exitCode=1;});
