'use strict';
// Explicit local-development maintenance; never exposed through the web API.
const {Client}=require('pg');
const {execFileSync}=require('node:child_process');
const {mkdirSync}=require('node:fs');
const {createHash,randomBytes}=require('node:crypto');
const path=require('node:path');
const config=require('../src/config/knexfile').connection;
const removePending=process.argv.includes('--remove-pending');

function assertLocalDevelopment(){
  if(process.env.NODE_ENV!=='development'||config.database!=='ankelba_dev'||!['localhost','127.0.0.1','::1'].includes(config.host)){
    throw Error('Reference reset is restricted to local ankelba_dev with NODE_ENV=development.');
  }
}
async function inspect(c){
  const counts=(await c.query(`SELECT
    (SELECT count(*)::int FROM subscription_payment_references) AS reference_claims,
    (SELECT count(*)::int FROM subscription_payment_attempts) AS attempts,
    (SELECT count(*)::int FROM subscription_payment_intents WHERE payment_reference IS NOT NULL) AS sessions_with_reference,
    (SELECT count(*)::int FROM subscription_payment_intents) AS sessions,
    (SELECT count(*)::int FROM subscription_payment_intents WHERE status IN ('pending','verification_pending')) AS pending_sessions,
    (SELECT count(*)::int FROM subscription_payment_intents WHERE status IN ('verified','consumed','resolved') OR application_id IS NOT NULL OR daycare_id IS NOT NULL) AS protected_sessions,
    (SELECT count(*)::int FROM subscription_events WHERE action='renew') AS recorded_renewals`)).rows[0];
  if(counts.protected_sessions||counts.recorded_renewals)throw Error('Confirmed or linked payment history exists. Refusing a blanket test reset.');
  if(removePending&&counts.pending_sessions!==counts.sessions)throw Error('Non-pending payment history exists. Refusing a blanket pending-test cleanup.');
  const hash=createHash('sha256');
  for(const table of ['subscription_payment_intents','subscription_payment_references','subscription_payment_attempts','subscription_events']){
    const rows=(await c.query(`SELECT to_jsonb(t)::text AS value FROM ${table} t ORDER BY id`)).rows;
    hash.update(table).update(JSON.stringify(rows));
  }
  return {counts,fingerprint:hash.digest('hex')};
}
async function preserved(c){
  const hash=createHash('sha256');
  for(const table of ['subscription_payment_settings','subscription_packages','daycares','daycare_applications']){
    const rows=(await c.query(`SELECT to_jsonb(t)::text AS value FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows;
    hash.update(table).update(JSON.stringify(rows));
  }
  return hash.digest('hex');
}
async function main(){
  assertLocalDevelopment();
  const c=new Client({...config,connectionTimeoutMillis:5000});await c.connect();
  try{
    const initial=await inspect(c);
    if(!process.argv.includes('--apply')){console.log(JSON.stringify({dry_run:true,...initial.counts}));return;}
    const directory=path.resolve(__dirname,'../../tmp/subscription-backups');mkdirSync(directory,{recursive:true});
    const filename=`before-${removePending?'pending-request-cleanup':'reference-reset'}-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomBytes(3).toString('hex')}.dump`;
    const backup=path.join(directory,filename);
    const bin='C:/Program Files/PostgreSQL/18/bin';
    execFileSync(path.join(bin,'pg_dump.exe'),['-h',config.host,'-p',String(config.port),'-U',config.user,'-d',config.database,'-Fc','-f',backup],
      {env:{...process.env,PGPASSWORD:config.password},stdio:['ignore','pipe','pipe']});
    const listing=execFileSync(path.join(bin,'pg_restore.exe'),['--list',backup],{encoding:'utf8'});
    if(!listing.includes('subscription_payment_references'))throw Error('Backup archive validation failed.');
    await c.query('BEGIN');
    try{
      await c.query("SET LOCAL lock_timeout='5s'");
      await c.query('LOCK TABLE subscription_payment_intents,subscription_payment_references,subscription_payment_attempts,subscription_events IN ACCESS EXCLUSIVE MODE');
      const current=await inspect(c);
      if(current.fingerprint!==initial.fingerprint)throw Error('Payment records changed during backup. Reset was not applied.');
      const configuration=await preserved(c);
      await c.query('DELETE FROM subscription_payment_references');
      await c.query('DELETE FROM subscription_payment_attempts');
      const changed=removePending?await c.query('DELETE FROM subscription_payment_intents'):await c.query(`UPDATE subscription_payment_intents SET payment_reference=NULL,verification=NULL,
        review_reason=NULL,reviewed_by=NULL,status='pending',version=version+1,expires_at=NOW()+INTERVAL '10 minutes',updated_at=NOW()
        WHERE payment_reference IS NOT NULL OR verification IS NOT NULL OR status='verification_pending'`);
      const after=await inspect(c);
      if(after.counts.reference_claims||after.counts.attempts||after.counts.sessions_with_reference||after.counts.sessions!==(removePending?0:initial.counts.sessions))throw Error('Reset verification failed.');
      if(await preserved(c)!==configuration)throw Error('Unrelated subscription configuration changed.');
      await c.query(`INSERT INTO audit_logs(actor_id,action,target_table,metadata)
        VALUES(NULL,$2,'subscription_payment_intents',$1)`,
        [JSON.stringify({reason:removePending?'User-requested local pending payment request cleanup':'User-requested local payment testing reset',before:initial.counts,after:after.counts,backup:filename}),removePending?'SUBSCRIPTION_PENDING_TEST_REQUESTS_CLEARED':'SUBSCRIPTION_TEST_REFERENCES_RESET']);
      await c.query('COMMIT');
      console.log(JSON.stringify({applied:true,reset_sessions:removePending?0:changed.rowCount,removed_pending_sessions:removePending?changed.rowCount:0,before:initial.counts,after:after.counts,backup}));
    }catch(error){await c.query('ROLLBACK');throw error;}
  }finally{await c.end();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
