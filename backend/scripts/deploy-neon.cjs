'use strict';
require('dns').setDefaultResultOrder?.('ipv4first');
const dns = require('dns').promises;
const { Client, Pool } = require('pg');
const { verifyRuntime } = require('../src/db/runtime-policy');
const { setupRuntimeRoles } = require('./setup-runtime-roles.cjs');

const HOST_DOMAIN = 'ep-lingering-truth-bduff5y4.c-8.us-east-2.aws.neon.tech';
const DB_PORT = 5432;
const DB_NAME = 'neondb';
const DB_USER = 'neondb_owner';
const DB_PASSWORD = 'npg_4HLh9JsGmrdK';

const APP_DB_USER = 'ankelba_tenant_app';
const APP_DB_PASSWORD = 'Ww_zh35pYk9u8mNzfoNWwMDb';
const CONTROL_DB_USER = 'ankelba_control_app';
const CONTROL_DB_PASSWORD = 'SkoEkcIGnPaD8PaKLene9pW_';

async function main() {
  console.log(`[Neon Deploy] Resolving direct host IPv4 for ${HOST_DOMAIN}...`);
  const [ip] = await dns.resolve4(HOST_DOMAIN);
  console.log(`[Neon Deploy] Target IP: ${ip}`);

  const ssl = { rejectUnauthorized: false, servername: HOST_DOMAIN };
  const knexConfig = {
    client: 'pg',
    connection: {
      host: ip,
      port: DB_PORT,
      database: DB_NAME,
      user: DB_USER,
      password: DB_PASSWORD,
      ssl,
      connectionTimeoutMillis: 30000,
    },
    migrations: {
      directory: require('path').resolve(__dirname, '../src/db/migrations'),
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: require('path').resolve(__dirname, '../src/db/seeds'),
    },
    pool: { min: 1, max: 2, acquireTimeoutMillis: 60000 },
  };

  const knex = require('knex')(knexConfig);
  knex.on('query', q => console.log('[Knex SQL]', q.sql.substring(0, 80)));
  knex.on('query-error', (err, q) => console.error('[Knex Error]', err.message));

  console.log('[Neon Deploy] 1. Applying remaining migrations (002-062)...');
  const [batchNo, applied] = await knex.migrate.latest();
  console.log(`[Neon Deploy] Migrations complete. Batch ${batchNo}: ${applied.length} migrations applied.`);

  console.log('[Neon Deploy] 2. Setting up restricted runtime roles (RLS)...');
  const client = new Client({
    host: ip,
    port: DB_PORT,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    ssl,
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    await setupRuntimeRoles(client, [
      { user: APP_DB_USER, password: APP_DB_PASSWORD, group: 'ankelba_tenant', other: 'ankelba_control' },
      { user: CONTROL_DB_USER, password: CONTROL_DB_PASSWORD, group: 'ankelba_control', other: 'ankelba_tenant' },
    ]);
    await client.query('COMMIT');
    console.log('[Neon Deploy] Runtime roles created & granted successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }

  console.log('[Neon Deploy] 3. Seeding database with initial roles and test data...');
  const [seeds] = await knex.seed.run();
  console.log(`[Neon Deploy] Seeds complete: ${seeds.length} seed files ran.`);
  await knex.destroy();

  console.log('[Neon Deploy] 4. Verifying runtime isolation policy...');
  const tenantPool = new Pool({
    host: ip,
    port: DB_PORT,
    database: DB_NAME,
    user: APP_DB_USER,
    password: APP_DB_PASSWORD,
    ssl,
  });
  const controlPool = new Pool({
    host: ip,
    port: DB_PORT,
    database: DB_NAME,
    user: CONTROL_DB_USER,
    password: CONTROL_DB_PASSWORD,
    ssl,
  });

  try {
    await verifyRuntime(tenantPool, controlPool);
    console.log('[Neon Deploy] VERIFICATION PASSED: RLS policies and runtime roles are 100% active and safe!');
  } finally {
    await Promise.all([tenantPool.end(), controlPool.end()]);
  }

  console.log('[Neon Deploy] ALL STEPS COMPLETED SUCCESSFULLY!');
}

main().catch(err => {
  console.error('[Neon Deploy] Error:', err);
  process.exit(1);
});
