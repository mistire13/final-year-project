'use strict';

// Local-development reset: preserve platform-owner credentials and structural
// lookup/configuration rows, then remove every tenant and operational record.
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Client, escapeIdentifier } = require('pg');
const connection = require('../src/config/knexfile').connection;

const execute = process.argv.includes('--execute');
const allowedDatabases = new Set(['ankelba_dev', 'ankelba_local', 'ankelba_test']);
const preservedTables = new Set([
  'knex_migrations',
  'knex_migrations_lock',
  'roles',
  'product_categories',
  'subscription_packages',
]);
const localTestAccounts = {
  cbe: {
    enabled: true,
    account_holder: 'LOCAL TEST ONLY - NO TRANSFER',
    account_number: '9999999999999999',
  },
  abyssinia: { enabled: false, account_holder: '', account_number: '' },
  telebirr: { enabled: false, account_holder: '', account_number: '' },
};

function assertLocalSafety() {
  const host = String(connection.host || 'localhost').toLowerCase();
  const database = String(connection.database || '');
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error('Reset refused: PostgreSQL is not local.');
  }
  if (!allowedDatabases.has(database)) {
    throw new Error(`Reset refused: database ${database || '(missing)'} is not an approved local database.`);
  }
  if (process.env.NODE_ENV && !['development', 'test'].includes(process.env.NODE_ENV)) {
    throw new Error('Reset refused outside development/test mode.');
  }
}

async function tableExists(client, table) {
  const { rows } = await client.query('SELECT to_regclass($1) IS NOT NULL AS present', [`public.${table}`]);
  return rows[0].present;
}

async function inventory(client) {
  const users = await client.query(`SELECT u.id,u.name,u.email,u.status,u.daycare_id,r.name AS role
    FROM users u JOIN roles r ON r.id=u.role_id ORDER BY u.id`);
  const platform = await client.query(`SELECT id,name,email,status FROM platform_accounts ORDER BY id`);
  const tables = await client.query(`SELECT tablename FROM pg_tables
    WHERE schemaname=current_schema() AND tablename NOT LIKE 'knex_%' ORDER BY tablename`);
  const counts = [];
  for (const { tablename } of tables.rows) {
    const result = await client.query(`SELECT count(*)::int AS count FROM ${escapeIdentifier(tablename)}`);
    if (result.rows[0].count) counts.push({ table: tablename, count: result.rows[0].count });
  }
  return { users: users.rows, platform_accounts: platform.rows, counts };
}

async function reset(client) {
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ankelba-local-data-reset'))");
    const platformCount = Number((await client.query('SELECT count(*) AS count FROM platform_accounts')).rows[0].count);
    const legacyCount = Number((await client.query('SELECT count(*) AS count FROM users WHERE role_id=0')).rows[0].count);
    if (platformCount + legacyCount < 1) throw new Error('Reset refused: no super-admin credential was found to preserve.');

    await client.query('CREATE TEMP TABLE saved_platform_accounts ON COMMIT DROP AS SELECT * FROM platform_accounts');
    await client.query('CREATE TEMP TABLE saved_platform_mfa ON COMMIT DROP AS SELECT * FROM mfa_factors WHERE platform_account_id IS NOT NULL');
    await client.query(`CREATE TEMP TABLE saved_platform_recovery ON COMMIT DROP AS
      SELECT recovery.* FROM mfa_recovery_codes recovery
      JOIN saved_platform_mfa factor ON factor.id=recovery.factor_id`);
    await client.query('CREATE TEMP TABLE saved_legacy_superadmins ON COMMIT DROP AS SELECT * FROM users WHERE role_id=0');

    const { rows } = await client.query(`SELECT tablename FROM pg_tables
      WHERE schemaname=current_schema() ORDER BY tablename`);
    const targets = rows.map(row => row.tablename).filter(table => !preservedTables.has(table));
    if (!targets.includes('users') || !targets.includes('daycares')) {
      throw new Error('Reset refused: expected tenant tables were not found.');
    }
    await client.query(`TRUNCATE TABLE ${targets.map(escapeIdentifier).join(', ')} RESTART IDENTITY CASCADE`);

    await client.query('INSERT INTO platform_accounts SELECT * FROM saved_platform_accounts');
    await client.query('INSERT INTO users SELECT * FROM saved_legacy_superadmins');
    await client.query('INSERT INTO mfa_factors SELECT * FROM saved_platform_mfa');
    await client.query('INSERT INTO mfa_recovery_codes SELECT * FROM saved_platform_recovery');
    if (await tableExists(client, 'subscription_payment_settings')) {
      await client.query(`INSERT INTO subscription_payment_settings
        (id,institution,account_holder,account_number,version,bank_accounts)
        VALUES (1,'Commercial Bank of Ethiopia',$1,$2,1,$3::jsonb)`,
      [localTestAccounts.cbe.account_holder, localTestAccounts.cbe.account_number, JSON.stringify(localTestAccounts)]);
    }

    for (const table of ['platform_accounts', 'users']) {
      if (!await tableExists(client, table)) continue;
      const sequence = (await client.query('SELECT pg_get_serial_sequence($1,$2) AS name', [table, 'id'])).rows[0].name;
      if (sequence) await client.query(`SELECT setval($1,COALESCE((SELECT max(id) FROM ${escapeIdentifier(table)}),1),EXISTS(SELECT 1 FROM ${escapeIdentifier(table)}))`, [sequence]);
    }
    await client.query('COMMIT');
    return { platform_accounts: platformCount, legacy_superadmins: legacyCount, cleared_tables: targets.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  assertLocalSafety();
  const client = new Client(connection);
  await client.connect();
  try {
    if (!execute) {
      const current = await inventory(client);
      process.stdout.write(`${JSON.stringify({ mode: 'dry-run', database: connection.database, ...current }, null, 2)}\n`);
      return;
    }
    const result = await reset(client);
    const after = await inventory(client);
    process.stdout.write(`${JSON.stringify({ mode: 'executed', database: connection.database, result, after }, null, 2)}\n`);
  } finally {
    await client.end();
  }
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
