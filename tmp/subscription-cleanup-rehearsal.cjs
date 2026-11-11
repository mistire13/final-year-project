'use strict';
// One-off local development cleanup. Requires explicit --live to commit.
// The default creates a fresh backup and rehearses the transaction on a copy.
const {Client} = require('../backend/node_modules/pg');
const {execFileSync} = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const config = require('../backend/src/config/knexfile').connection;
const bin = 'C:\\Program Files\\PostgreSQL\\18\\bin';
const backup = path.resolve(__dirname, 'subscription-backups', 'ankelba-cleanup-current.dump');
const tempName = `ankelba_cleanup_${crypto.randomBytes(6).toString('hex')}`;
const argv = process.argv.slice(2);
const live = argv.includes('--live');
if (config.database !== 'ankelba_dev' || !['localhost','127.0.0.1','::1'].includes(config.host) || config.user !== 'postgres') {
  throw new Error('Refusing cleanup: expected local ankelba_dev with postgres migration role.');
}
const connection = database => ({...config,database});
const env = {...process.env, PGPASSWORD:config.password};
const pgArgs = ['-h',config.host,'-p',String(config.port),'-U',config.user];
const tables = [
  'subscription_payment_resolutions','subscription_payment_intents','subscription_reminders','subscription_events',
  'mfa_recovery_codes','auth_challenges','auth_sessions','auth_mail_outbox','mfa_factors','account_invitations',
  'daycare_password_reset_tokens','password_reset_tokens','child_payments','child_invoices','payments','order_items',
  'orders','report_meals','report_activities','guardian_verification_events','biometric_references','guardian_links',
  'pickup_guardians','attendance','health_records','daily_reports','emergency_contacts','care_instructions',
  'announcements','alerts','messages','front_desk_assignments','events','products','product_categories','groups',
  'children','platform_audit_events','audit_logs','users','daycares','daycare_applications'
];
const statements = [
  `DELETE FROM subscription_payment_resolutions`,
  `DELETE FROM subscription_payment_intents`,
  `DELETE FROM subscription_reminders WHERE daycare_id IS NOT NULL`,
  `DELETE FROM subscription_events WHERE daycare_id IS NOT NULL`,
  `DELETE FROM auth_challenges WHERE daycare_id IS NOT NULL`,
  `DELETE FROM auth_sessions WHERE daycare_id IS NOT NULL`,
  `DELETE FROM auth_mail_outbox WHERE daycare_id IS NOT NULL`,
  `DELETE FROM mfa_recovery_codes WHERE factor_id IN (SELECT id FROM mfa_factors WHERE daycare_id IS NOT NULL)`,
  `DELETE FROM mfa_factors WHERE daycare_id IS NOT NULL`,
  `DELETE FROM account_invitations WHERE daycare_id IS NOT NULL`,
  `DELETE FROM daycare_password_reset_tokens WHERE daycare_id IS NOT NULL`,
  `DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE daycare_id IS NOT NULL)`,
  `DELETE FROM child_payments WHERE daycare_id IS NOT NULL`,
  `DELETE FROM child_invoices WHERE daycare_id IS NOT NULL`,
  `DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE daycare_id IS NOT NULL)`,
  `DELETE FROM order_items WHERE daycare_id IS NOT NULL`,
  `DELETE FROM orders WHERE daycare_id IS NOT NULL`,
  `DELETE FROM report_meals WHERE report_id IN (SELECT id FROM daily_reports WHERE daycare_id IS NOT NULL)`,
  `DELETE FROM report_activities WHERE report_id IN (SELECT id FROM daily_reports WHERE daycare_id IS NOT NULL)`,
  `DELETE FROM guardian_verification_events WHERE daycare_id IS NOT NULL`,
  `DELETE FROM biometric_references WHERE daycare_id IS NOT NULL`,
  `DELETE FROM guardian_links WHERE daycare_id IS NOT NULL`,
  `DELETE FROM pickup_guardians WHERE daycare_id IS NOT NULL`,
  `DELETE FROM attendance WHERE daycare_id IS NOT NULL`,
  `DELETE FROM health_records WHERE daycare_id IS NOT NULL`,
  `DELETE FROM daily_reports WHERE daycare_id IS NOT NULL`,
  `DELETE FROM emergency_contacts WHERE child_id IN (SELECT id FROM children WHERE daycare_id IS NOT NULL)`,
  `DELETE FROM care_instructions WHERE child_id IN (SELECT id FROM children WHERE daycare_id IS NOT NULL)`,
  `DELETE FROM announcements WHERE daycare_id IS NOT NULL`,
  `DELETE FROM alerts WHERE daycare_id IS NOT NULL`,
  `DELETE FROM messages WHERE daycare_id IS NOT NULL`,
  `DELETE FROM front_desk_assignments WHERE daycare_id IS NOT NULL`,
  `DELETE FROM events WHERE daycare_id IS NOT NULL`,
  `DELETE FROM products WHERE daycare_id IS NOT NULL`,
  `DELETE FROM product_categories WHERE daycare_id IS NOT NULL`,
  `UPDATE daycares SET primary_admin_user_id=NULL WHERE primary_admin_user_id IS NOT NULL`,
  `DELETE FROM children WHERE daycare_id IS NOT NULL`,
  `DELETE FROM groups WHERE daycare_id IS NOT NULL`,
  `DELETE FROM platform_audit_events WHERE daycare_id IS NOT NULL`,
  `DELETE FROM audit_logs WHERE daycare_id IS NOT NULL OR target_table IN ('daycares','daycare_applications','subscription_payment_intents')`,
  `DELETE FROM users WHERE daycare_id IS NOT NULL`,
  `DELETE FROM daycare_applications`,
  `DELETE FROM daycares`
];
const hash = rows => crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
async function snapshot(c) {
  const queries = {
    operators:`SELECT to_jsonb(u)::text AS value FROM users u WHERE daycare_id IS NULL ORDER BY id`,
    platform:`SELECT to_jsonb(p)::text AS value FROM platform_accounts p ORDER BY id`,
    roles:`SELECT to_jsonb(r)::text AS value FROM roles r ORDER BY id`,
    packages:`SELECT to_jsonb(p)::text AS value FROM subscription_packages p ORDER BY code`,
    settings:`SELECT to_jsonb(s)::text AS value FROM subscription_payment_settings s ORDER BY id`,
    platform_sessions:`SELECT to_jsonb(s)::text AS value FROM auth_sessions s WHERE daycare_id IS NULL ORDER BY id`,
    platform_factors:`SELECT to_jsonb(f)::text AS value FROM mfa_factors f WHERE daycare_id IS NULL ORDER BY id`,
  };
  const result={};
  for(const [key,sql] of Object.entries(queries)) result[key]=hash((await c.query(sql)).rows);
  return result;
}
async function counts(c) {
  const out={};
  for(const table of tables) out[table]=Number((await c.query(`SELECT COUNT(*)::int AS n FROM "${table}"`)).rows[0].n);
  return out;
}
async function clean(c, expected) {
  await c.query('BEGIN');
  try {
    await c.query("SET LOCAL lock_timeout='5s'");
    await c.query('LOCK TABLE daycares,users,daycare_applications IN ACCESS EXCLUSIVE MODE');
    const before=await counts(c), preserved=await snapshot(c);
    if (expected && JSON.stringify(before)!==JSON.stringify(expected)) throw new Error('Database data changed after the backup; no deletion was committed.');
    if (before.daycares!==28 || before.daycare_applications!==29) throw new Error('Unexpected tenant/application count. Refusing cleanup.');
    const global=(await c.query('SELECT COUNT(*)::int AS n FROM users WHERE daycare_id IS NULL AND role_id=0')).rows[0].n;
    if(global!==1) throw new Error('Unexpected number of global super administrators.');
    for(const sql of statements) await c.query(sql);
    const after=await counts(c), kept=await snapshot(c);
    if (after.daycares || after.daycare_applications || (await c.query('SELECT 1 FROM users WHERE daycare_id IS NOT NULL LIMIT 1')).rowCount) throw new Error('Tenant cleanup verification failed.');
    if(JSON.stringify(preserved)!==JSON.stringify(kept)) throw new Error('Global account, access or settings changed; refusing commit.');
    await c.query('COMMIT');
    return {before,after,operator_preserved:true,global_configuration_preserved:true};
  } catch(e) {await c.query('ROLLBACK');throw e;}
}
async function main() {
  const source=new Client(connection(config.database)), maintenance=new Client(connection('postgres'));
  let created=false;
  try {
    await source.connect();
    const identity=(await source.query('SELECT current_database() AS db,current_user AS role')).rows[0];
    if(identity.db!=='ankelba_dev'||identity.role!=='postgres')throw new Error('Unexpected database identity.');
    const before=await counts(source);
    console.log('Taking current local backup before rehearsal.');
    execFileSync(path.join(bin,'pg_dump.exe'),[...pgArgs,'-Fc','--no-owner','-f',backup,config.database],{env,stdio:'pipe'});
    execFileSync(path.join(bin,'pg_restore.exe'),['--list',backup],{env,stdio:'ignore'});
    await maintenance.connect();
    await maintenance.query(`CREATE DATABASE "${tempName}" TEMPLATE template0`);created=true;
    execFileSync(path.join(bin,'pg_restore.exe'),[...pgArgs,'--no-owner','--no-privileges','-d',tempName,backup],{env,stdio:'pipe'});
    const clone=new Client(connection(tempName));await clone.connect();
    try {const result=await clean(clone,before);console.log(JSON.stringify({phase:'rehearsal',backup,result}));}
    finally {await clone.end();}
    if(live) {
      const result=await clean(source,before);
      console.log(JSON.stringify({phase:'development-cleanup',backup,result}));
    }
  } finally {
    await source.end().catch(()=>{});
    if(created) await maintenance.query(`DROP DATABASE "${tempName}"`).catch(()=>{});
    await maintenance.end().catch(()=>{});
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
