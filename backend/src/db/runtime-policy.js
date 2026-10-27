'use strict';

const scopedTables = [...require('./tenant-integrity').tables, 'users', 'guardian_links', 'order_items',
  'audit_logs', 'daycares', 'care_instructions', 'emergency_contacts', 'report_meals', 'report_activities',
  'payments', 'biometric_references', 'guardian_verification_events', 'pickup_guardians',
  'auth_sessions', 'auth_challenges', 'daycare_password_reset_tokens', 'password_reset_tokens', 'subscription_events'];
const controlShared = new Set(['users', 'daycares', 'audit_logs', 'auth_sessions', 'auth_challenges',
  'daycare_password_reset_tokens', 'password_reset_tokens', 'subscription_events']);

async function verifyRole(pool, group, forbiddenGroup) {
  const { rows: [role] } = await pool.query(`SELECT current_user AS name,
    rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication,
    pg_has_role(current_user,$1,'MEMBER') AS expected,
    pg_has_role(current_user,$2,'MEMBER') AS forbidden
    FROM pg_roles WHERE rolname=current_user`, [group, forbiddenGroup]);
  if (!role || role.rolsuper || role.rolbypassrls || role.rolcreatedb || role.rolcreaterole || role.rolreplication || !role.expected || role.forbidden) {
    throw new Error(`Unsafe ${group} database credentials. Run db:runtime:setup with separate restricted logins.`);
  }
  const { rows } = await pool.query(`SELECT 1 FROM pg_roles WHERE
    (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)
    AND pg_has_role(current_user,oid,'MEMBER') LIMIT 1`);
  if (rows.length) throw new Error(`Unsafe ${group} inherited database privileges.`);
  return role.name;
}

async function verifyRuntime(tenant, control) {
  const tenantName = await verifyRole(tenant, 'ankelba_tenant', 'ankelba_control');
  const controlName = await verifyRole(control, 'ankelba_control', 'ankelba_tenant');
  if (tenantName === controlName) throw new Error('Tenant and control database logins must be separate.');
  const client = await tenant.connect();
  let cleanupFailed = false;
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_daycare_id','',true),set_config('app.daycare_id','',true)");
    for (const table of [...scopedTables, 'product_categories']) {
      const { rows: [policy] } = await client.query(`SELECT relrowsecurity,relforcerowsecurity,
        pg_has_role(current_user,relowner,'MEMBER') AS owned FROM pg_class
        WHERE oid=$1::regclass`, [table]);
      if (!policy?.relrowsecurity || !policy.relforcerowsecurity || policy.owned) throw new Error(`Unsafe runtime table policy: ${table}`);
      if ((await client.query('SELECT has_table_privilege(current_user,$1,\'TRUNCATE\') AS allowed', [table])).rows[0].allowed) {
        throw new Error(`Runtime must not have TRUNCATE privilege: ${table}`);
      }
      // Shared category templates are deliberately readable without a tenant.
      const { rows } = await client.query(`SELECT 1 FROM ${table}${table === 'product_categories' ? ' WHERE daycare_id IS NOT NULL' : ''} LIMIT 1`);
      if (rows.length) throw new Error(`Tenant context is required for ${table}.`);
    }
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => { cleanupFailed = true; });
    throw error;
  } finally { client.release(cleanupFailed || undefined); }
  for (const table of [...scopedTables.filter(name => !controlShared.has(name)), 'product_categories']) {
    if ((await control.query("SELECT has_table_privilege(current_user,$1,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS allowed",[table])).rows[0].allowed) {
      throw new Error(`Control login must not access private operational records: ${table}`);
    }
  }
  const { rows: authTables } = await tenant.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'
    AND tablename ~ '^(auth_|platform_|mfa_|account_invitations$)'`);
  for (const { tablename } of authTables.filter(row => !scopedTables.includes(row.tablename))) {
    if ((await tenant.query("SELECT has_table_privilege(current_user,$1,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS allowed", [tablename])).rows[0].allowed) {
      throw new Error(`Tenant login must not access control authentication records: ${tablename}`);
    }
  }
}

module.exports = { verifyRuntime };
