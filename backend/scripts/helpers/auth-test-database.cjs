'use strict';

// This helper never accepts an application database as a write target. Every
// mutable connection is created here, for a name generated and owned by this run.
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { readdirSync } = require('node:fs');
const { Client, Pool } = require('pg');
const knexFactory = require('knex');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const ownedDatabases = new Set();
const generatedName = /^ankelba_auth_test_\d+_\d+_[a-f0-9]{8}$/;
const configuredDatabase = process.env.DB_NAME || 'ankelba_dev';
const migrationDirectory = path.resolve(__dirname, '../../src/db/migrations');
const connection = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
  application_name: 'ankelba_daycare_auth_tests',
};

class AuthMigrationSource {
  constructor(operational = false, current = false) { this.operational = operational; this.current = current; }
  async getMigrations() {
    return readdirSync(migrationDirectory)
      .filter(name => /^\d{3}[a-z]?_.+\.js$/.test(name) && (this.current || Number(name.slice(0, 3)) <= 17 || (this.operational && [22,23,25,26].includes(Number(name.slice(0,3))))))
      .sort();
  }
  getMigrationName(name) { return name; }
  getMigration(name) { return require(path.join(migrationDirectory, name)); }
}

function assertTestDatabaseName(name, requireOwnership = true) {
  assert.match(name, generatedName, 'Refusing a non-generated authentication test database');
  assert.notEqual(name, configuredDatabase, 'The configured application database is never a write target');
  assert.notEqual(name, 'postgres');
  if (requireOwnership) assert.ok(ownedDatabases.has(name), 'Database is not owned by this test run');
}

async function assertTestConnection(client, name) {
  assertTestDatabaseName(name);
  const result = await client.query('SELECT current_database() AS name');
  assert.equal(result.rows[0].name, name);
}

async function withIsolatedDatabase(work, { operational = false, current = false } = {}) {
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(connection.host), 'Only local PostgreSQL hosts are allowed');
  assert.ok(Number.isInteger(connection.port) && connection.port > 0 && connection.port <= 65535);
  const name = `ankelba_auth_test_${process.pid}_${Date.now()}_${randomBytes(4).toString('hex')}`;
  assertTestDatabaseName(name, false);
  const maintenance = new Client({ ...connection, database: 'postgres' });
  let db;
  let pool;
  let failure;
  try {
    await maintenance.connect();
    assert.equal((await maintenance.query('SELECT current_database() AS name')).rows[0].name, 'postgres');
    await maintenance.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
    ownedDatabases.add(name);
    const isolatedConnection = { ...connection, database: name };
    db = knexFactory({ client: 'pg', connection: isolatedConnection, pool: { min: 0, max: 2 } });
    assert.equal((await db.raw('SELECT current_database() AS name')).rows[0].name, name);
    assertTestDatabaseName(name);
    await db.migrate.latest({ migrationSource: new AuthMigrationSource(operational, current) });
    pool = new Pool({ ...isolatedConnection, max: 4 });
    await assertTestConnection(pool, name);
    // work must close HTTP servers before returning; clients close before DROP.
    await work({ db, pool, name });
  } catch (error) {
    failure = error;
  } finally {
    const cleanupErrors = [];
    if (pool) try { await pool.end(); } catch (error) { cleanupErrors.push(error); }
    if (db) try { await db.destroy(); } catch (error) { cleanupErrors.push(error); }
    if (!cleanupErrors.length && ownedDatabases.has(name)) {
      try {
        assertTestDatabaseName(name);
        assert.equal((await maintenance.query('SELECT current_database() AS name')).rows[0].name, 'postgres');
        // No FORCE and no name discovery: drop only this run's exact registered DB.
        await maintenance.query(`DROP DATABASE "${name}"`);
        ownedDatabases.delete(name);
      } catch (error) { cleanupErrors.push(error); }
    }
    try { await maintenance.end(); } catch (error) { cleanupErrors.push(error); }
    if (cleanupErrors.length) failure = new AggregateError([...(failure ? [failure] : []), ...cleanupErrors], 'Authentication test or cleanup failed');
  }
  if (failure) throw failure;
}

const withOperationalDatabase = work => withIsolatedDatabase(work, { operational: true });
const withCurrentDatabase = work => withIsolatedDatabase(work, { current: true });
module.exports = { withIsolatedDatabase, withOperationalDatabase, withCurrentDatabase, assertTestDatabaseName, ownedDatabases };
