'use strict';
// Read-only readiness inventory, not deployment authorization or live proof.
const path=require('node:path');
const fs=require('node:fs');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});
const {Pool}=require('pg');
const present=key=>typeof process.env[key]==='string'&&process.env[key].trim().length>0;
const all=keys=>keys.every(present);
async function run(){
  const report={scope:'Configured local environment only; no production destination selected',
    strict_verification:process.env.SUBSCRIPTION_NAME_AMOUNT_TEST_MODE!=='true',
    provider_key_present:present('VERITAS_API_KEY'),
    subscription_reminders_enabled:process.env.SUBSCRIPTION_REMINDERS_ENABLED==='true',
    billing_automation_enabled:process.env.BILLING_AUTOMATION_ENABLED==='true',
    billing_automation_email_enabled:process.env.BILLING_AUTOMATION_EMAIL_ENABLED==='true',
    smtp_fields_present:all(['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD','SMTP_FROM']),
    frontend_origin_present:present('FRONTEND_URL'),
    independent_runtime_logins:present('APP_DB_USER')&&present('CONTROL_DB_USER')&&process.env.APP_DB_USER!==process.env.CONTROL_DB_USER,
    preview_auth_enabled:process.env.DAYCARE_AUTH_ENABLED==='true',
    preview_auth_production_supported:false,
    database:'not_checked_pass_--local-database_to_run_read_only_checks',
    live_bank_acceptance:'not_proven',smtp_delivery:'not_proven',offsite_backup_restore:'not_proven',
    worker_heartbeat:'requires_running_process_and_logs',deployment_authorized:false};
  const backupDir=path.resolve(__dirname,'../../tmp/subscription-backups');
  const backupFiles=fs.existsSync(backupDir)?fs.readdirSync(backupDir,{withFileTypes:true}).filter(item=>item.isFile()&&/\.(dump|backup|sql)(\.gz)?$/i.test(item.name)):[];
  report.local_backup_file_count=backupFiles.length;
  if(process.argv.includes('--local-database')){
    const host=process.env.DB_HOST||'localhost';
    if(!['localhost','127.0.0.1','::1'].includes(host))throw Error('Read-only database inventory supports local hosts only; provide the real release target separately.');
    if(!present('DB_NAME'))throw Error('An explicit DB_NAME is required for database inventory.');
    const p=new Pool({host,port:Number(process.env.DB_PORT||5432),database:process.env.DB_NAME,user:process.env.DB_USER||'postgres',password:process.env.DB_PASSWORD,connectionTimeoutMillis:5000});
    const c=await p.connect();
    try{
      await c.query('BEGIN READ ONLY');
      const applied=(await c.query('SELECT name FROM knex_migrations ORDER BY name')).rows.map(row=>row.name);
      const expected=fs.readdirSync(path.resolve(__dirname,'../src/db/migrations')).filter(name=>/^\d{3}[a-z]?_.+\.js$/.test(name)).sort();
      report.pending_migration_files=expected.filter(name=>!applied.includes(name));
      report.package_prices=(await c.query('SELECT code,available,monthly_price>0 AS monthly_ready,six_month_price>0 AS six_month_ready,annual_price>0 AS annual_ready FROM subscription_packages ORDER BY code')).rows;
      const settings=(await c.query('SELECT bank_accounts FROM subscription_payment_settings LIMIT 1')).rows[0]?.bank_accounts||{};
      report.receiving_accounts=Object.fromEntries(['telebirr','cbe','abyssinia'].map(provider=>{const account=settings[provider];return [provider,{enabled:account?.enabled===true,holder_configured:!!account?.account_holder,account_configured:!!account?.account_number}];}));
      report.database='read_only_inventory_complete';
      await c.query('ROLLBACK');
    }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();await p.end();}
  }
  console.log(JSON.stringify(report,null,2));
}
run().catch(()=>{console.error('Read-only readiness check failed. Inspect local schema/connectivity without publishing configuration values.');process.exitCode=1;});
