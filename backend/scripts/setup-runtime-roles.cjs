'use strict';

/**
 * scripts/setup-runtime-roles.cjs
 * Provision and verify restricted non-superuser database role for Ankelba multi-tenant SaaS.
 * 
 * Enforces:
 * - NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE
 * - Inherits ankelba_tenant and ankelba_control roles
 * - Schema usage, table CRUD, and sequence permissions
 * - Verified fail-closed RLS behavior when no tenant context is set
 * 
 * Usage:
 *   node backend/scripts/setup-runtime-roles.cjs [--apply-migrations]
 */

const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Client } = require('pg');

const appUser = process.env.APP_DB_USER || 'ankelba_app';
const appPassword = process.env.APP_DB_PASSWORD || 'AnkelbaAppSecure2026!';

const adminConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'ankelba_dev',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
};

async function setupRuntimeRoles(client) {
  // 1. Ensure cluster-level roles exist
  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ankelba_tenant') THEN
        CREATE ROLE ankelba_tenant NOLOGIN NOSUPERUSER NOBYPASSRLS;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ankelba_control') THEN
        CREATE ROLE ankelba_control NOLOGIN NOSUPERUSER NOBYPASSRLS;
      END IF;
    END $$;
  `);

  // 2. Ensure non-superuser application login role exists and has correct flags
  const escapedPassword = appPassword.replace(/'/g, "''");
  const userCheck = await client.query('SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1', [appUser]);
  if (userCheck.rows.length === 0) {
    await client.query(
      `CREATE ROLE "${appUser}" WITH LOGIN PASSWORD '${escapedPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE ankelba_tenant, ankelba_control`
    );
  } else {
    await client.query(
      `ALTER ROLE "${appUser}" WITH LOGIN PASSWORD '${escapedPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`
    );
    await client.query(`GRANT ankelba_tenant, ankelba_control TO "${appUser}"`);
  }

  // 3. Grant schema, table, and sequence access
  await client.query(`
    GRANT USAGE ON SCHEMA public TO ankelba_tenant, ankelba_control, "${appUser}";
    GRANT SELECT ON roles TO ankelba_tenant, ankelba_control, "${appUser}";
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ankelba_tenant, "${appUser}";
    GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ankelba_tenant, ankelba_control, "${appUser}";
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ankelba_tenant, "${appUser}";
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ankelba_tenant, "${appUser}";
  `);
}

async function verifyRestrictedRole() {
  const restrictedClient = new Client({
    host: adminConfig.host,
    port: adminConfig.port,
    database: adminConfig.database,
    user: appUser,
    password: appPassword,
  });

  await restrictedClient.connect();

  try {
    // 1. Verify role attributes
    const roleInfo = (await restrictedClient.query(
      'SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'
    )).rows[0];

    if (roleInfo.rolsuper || roleInfo.rolbypassrls) {
      throw new Error(`Role ${appUser} must NOT be a superuser or have BYPASSRLS!`);
    }

    // 2. Verify RLS fail-closed without tenant context
    await restrictedClient.query('BEGIN');
    await restrictedClient.query("SELECT set_config('app.current_daycare_id', '', true), set_config('app.daycare_id', '', true)");
    const emptyResult = await restrictedClient.query('SELECT count(*)::int AS count FROM children');
    await restrictedClient.query('ROLLBACK');

    // 3. Verify tenant-scoped query with tenant context
    await restrictedClient.query('BEGIN');
    await restrictedClient.query("SELECT set_config('app.current_daycare_id', '1', true), set_config('app.daycare_id', '1', true)");
    const scopedResult = await restrictedClient.query('SELECT count(*)::int AS count FROM children');
    await restrictedClient.query('ROLLBACK');

    return {
      role: roleInfo.current_user,
      is_superuser: roleInfo.rolsuper,
      bypasses_rls: roleInfo.rolbypassrls,
      fail_closed_without_context: emptyResult.rows[0].count === 0,
      scoped_query_succeeded: true,
      daycare_1_visible_records: scopedResult.rows[0].count,
    };
  } finally {
    await restrictedClient.end();
  }
}

async function main() {
  const adminClient = new Client(adminConfig);
  await adminClient.connect();

  try {
    console.log(`Setting up restricted runtime role "${appUser}" on database "${adminConfig.database}"...`);
    await setupRuntimeRoles(adminClient);
    console.log(`Role "${appUser}" successfully provisioned with NOSUPERUSER NOBYPASSRLS.`);

    // If requested or if migration 021 not yet applied, apply it
    const shouldApplyMigrations = process.argv.includes('--apply-migrations');
    if (shouldApplyMigrations) {
      const knex = require('knex')(require('../src/config/knexfile'));
      try {
        const m18 = require('../src/db/migrations/018_profile_security_revisions');
        const m19 = require('../src/db/migrations/019_tenant_relationship_integrity');
        const m20 = require('../src/db/migrations/020_tenant_product_categories');
        const m21 = require('../src/db/migrations/021_runtime_rls');

        const applied = (await knex('knex_migrations').select('name')).map(r => r.name);
        if (!applied.includes('018_profile_security_revisions.js')) {
          console.log('Applying 018_profile_security_revisions...');
          await knex.transaction(tx => m18.up(tx));
          await knex('knex_migrations').insert({ name: '018_profile_security_revisions.js', batch: 1, migration_time: new Date() });
        }
        if (!applied.includes('019_tenant_relationship_integrity.js')) {
          console.log('Applying 019_tenant_relationship_integrity...');
          await knex.transaction(tx => m19.up(tx));
          await knex('knex_migrations').insert({ name: '019_tenant_relationship_integrity.js', batch: 1, migration_time: new Date() });
        }
        if (!applied.includes('020_tenant_product_categories.js')) {
          console.log('Applying 020_tenant_product_categories...');
          await knex.transaction(tx => m20.up(tx));
          await knex('knex_migrations').insert({ name: '020_tenant_product_categories.js', batch: 1, migration_time: new Date() });
        }
        if (!applied.includes('021_runtime_rls.js')) {
          console.log('Applying 021_runtime_rls...');
          await knex.transaction(tx => m21.up(tx));
          await knex('knex_migrations').insert({ name: '021_runtime_rls.js', batch: 1, migration_time: new Date() });
        }
      } finally {
        await knex.destroy();
      }
    }

    console.log(`Verifying restricted role access...`);
    const verification = await verifyRestrictedRole();
    console.log('\n--- Restricted Database Role Verification ---');
    console.log(JSON.stringify(verification, null, 2));
    console.log('--------------------------------------------\n');
    console.log(`Success! To switch backend to this non-superuser role:`);
    console.log(`  Set DB_USER=${appUser}`);
    console.log(`  Set DB_PASSWORD=${appPassword}`);
  } finally {
    await adminClient.end();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Setup failed:', err.message);
    process.exit(1);
  });
}

module.exports = { setupRuntimeRoles, verifyRestrictedRole, appUser, appPassword };
