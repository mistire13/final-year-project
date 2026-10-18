'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { readdirSync } = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const knexFactory = require('knex');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const migrationDirectory = path.resolve(__dirname, '../src/db/migrations');
const standardMigrationConfig = require('../src/config/knexfile').migrations;
const prerequisiteMigration = '012a_profile_complete_prerequisite.js';
const configuredDatabase = process.env.DB_NAME || 'ankelba_dev';
const ownedDatabases = new Set();
const databaseNamePattern = /^ankelba_foundation_test_\d+_\d+_[a-f0-9]{8}$/;
const connection = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
  application_name: 'ankelba_foundation_tests',
};
const newTables = [
  'platform_accounts', 'mfa_factors', 'mfa_recovery_codes',
  'auth_sessions', 'auth_challenges', 'platform_password_reset_tokens',
  'account_invitations', 'platform_audit_events',
  'daycare_password_reset_tokens', 'auth_mail_outbox', 'auth_attempt_buckets',
];
const newMigrations = [
  '014_tenant_account_foundation.js',
  '015_authentication_storage.js',
  '016_invitation_audit_storage.js',
  '017_authentication_security_workflows.js',
];
const timed = {
  created_at: new Date('2026-10-16T07:00:00Z'),
  expires_at: new Date('2026-10-16T08:00:00Z'),
};
const hash = () => randomBytes(32).toString('hex');

class FoundationMigrationSource {
  constructor(maxVersion = 17, excluded = []) {
    this.maxVersion = maxVersion;
    this.excluded = excluded;
  }
  async getMigrations() {
    return readdirSync(migrationDirectory)
      .filter(name => /^\d{3}[a-z]?_.+\.js$/.test(name)
        && Number(name.slice(0, 3)) <= this.maxVersion && !this.excluded.includes(name))
      .sort();
  }
  getMigrationName(name) { return name; }
  getMigration(name) { return require(path.join(migrationDirectory, name)); }
}

function assertTestDatabaseName(name, requireOwnership = true) {
  assert.match(name, databaseNamePattern, 'Refusing a non-generated test database name');
  assert.notEqual(name, configuredDatabase, 'The configured application database is never a test target');
  assert.notEqual(name, 'postgres');
  if (requireOwnership) assert.ok(ownedDatabases.has(name), 'Database was not created by this test run');
}

async function assertTestConnection(db, name) {
  assertTestDatabaseName(name);
  assert.equal(db.client.config.connection.database, name);
  const { rows } = await db.raw('SELECT current_database() AS name');
  assert.equal(rows[0].name, name, 'Refusing to migrate a different database');
}

async function withIsolatedDatabase(work) {
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(connection.host), 'Tests require a local PostgreSQL host');
  assert.ok(Number.isInteger(connection.port) && connection.port > 0 && connection.port <= 65535);
  const name = `ankelba_foundation_test_${process.pid}_${Date.now()}_${randomBytes(4).toString('hex')}`;
  assertTestDatabaseName(name, false);
  const maintenance = new Client({ ...connection, database: 'postgres' });
  let db;
  let failure;
  try {
    await maintenance.connect();
    const location = await maintenance.query('SELECT current_database() AS name');
    assert.equal(location.rows[0].name, 'postgres');
    await maintenance.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
    ownedDatabases.add(name);
    db = knexFactory({ client: 'pg', connection: { ...connection, database: name }, pool: { min: 0, max: 2 } });
    await assertTestConnection(db, name);
    await work(db, name);
  } catch (error) {
    failure = error;
  } finally {
    try {
      if (db) await db.destroy();
      if (ownedDatabases.has(name)) {
        assertTestDatabaseName(name);
        const location = await maintenance.query('SELECT current_database() AS name');
        assert.equal(location.rows[0].name, 'postgres');
        // Never FORCE: only this run's generated database, after owned clients close.
        await maintenance.query(`DROP DATABASE "${name}"`);
        ownedDatabases.delete(name);
      }
    } catch (cleanupError) {
      failure = failure ? new AggregateError([failure, cleanupError], 'Test and cleanup both failed') : cleanupError;
    } finally {
      await maintenance.end();
    }
  }
  if (failure) throw failure;
}

async function migrateTo(db, name, maxVersion = 17, excluded = []) {
  await assertTestConnection(db, name);
  return db.migrate.latest({ migrationSource: new FoundationMigrationSource(maxVersion, excluded) });
}

async function migrateStandardSetup(db, name) {
  await assertTestConnection(db, name);
  assert.equal(standardMigrationConfig.directory, migrationDirectory);
  const { directory, ...migrationConfig } = standardMigrationConfig;
  return db.migrate.latest({ ...migrationConfig, migrationSource: new FoundationMigrationSource(17) });
}

async function prepareLegacyBaseline(db, name) {
  await migrateTo(db, name, 12, [prerequisiteMigration]);
  assert.equal(await db.schema.hasColumn('users', 'profile_complete'), false);
  // Match the current database's manual prerequisite, only in a generated DB.
  // Do not execute migrate_profile_complete.js: it targets the application DB.
  await assertTestConnection(db, name);
  await db.schema.alterTable('users', table => {
    table.boolean('profile_complete').notNullable().defaultTo(false);
  });
  await migrateTo(db, name, 13, [prerequisiteMigration]);
}

async function reverseNewMigrations(db, name, includePrerequisite = false) {
  await assertTestConnection(db, name);
  const migrations = includePrerequisite ? [prerequisiteMigration, ...newMigrations] : newMigrations;
  for (const migration of [...migrations].reverse()) {
    const [, reversed] = await db.migrate.down({ name: migration, migrationSource: new FoundationMigrationSource() });
    assert.deepEqual(reversed, [migration]);
  }
}

async function fixtures(db) {
  await db('roles').insert([
    { id: 1, name: 'admin' }, { id: 2, name: 'caregiver' }, { id: 3, name: 'parent' },
  ]);
  const [daycareA, daycareB] = await db('daycares').insert([
    { name: 'Fixture A', slug: 'fixture-a', contact_email: 'contact-a@example.invalid', status: 'active' },
    { name: 'Fixture B', slug: 'fixture-b', contact_email: 'contact-b@example.invalid', status: 'active' },
  ]).returning('*');
  const [adminA, caregiverA, parentA, parentB] = await db('users').insert([
    { name: 'Admin A', email: 'admin-a@example.invalid', password_hash: 'fixture-hash-admin', role_id: 1, daycare_id: daycareA.id },
    { name: 'Caregiver A', email: 'staff-a@example.invalid', password_hash: 'fixture-hash-staff', role_id: 2, daycare_id: daycareA.id },
    { name: 'Parent A', email: 'parent-a@example.invalid', password_hash: 'fixture-hash-parent-a', role_id: 3, daycare_id: daycareA.id },
    { name: 'Parent B', email: 'parent-b@example.invalid', password_hash: 'fixture-hash-parent-b', role_id: 3, daycare_id: daycareB.id },
  ]).returning('*');
  const [groupA] = await db('groups').insert({ name: 'Fixture group', daycare_id: daycareA.id }).returning('*');
  const [childA] = await db('children').insert({
    full_name: 'Fixture child', dob: '2023-01-01', gender: 'female',
    group_id: groupA.id, caregiver_id: caregiverA.id, daycare_id: daycareA.id,
  }).returning('*');
  await db('guardian_links').insert({ child_id: childA.id, user_id: parentA.id, relationship: 'Parent', created_by: adminA.id });
  await db('emergency_contacts').insert({ child_id: childA.id, name: 'Fixture contact', relationship: 'Family', phone: 'test-only' });
  await db('care_instructions').insert({ child_id: childA.id, category: 'general', instruction_text: 'Synthetic fixture only' });
  await db('attendance').insert({ child_id: childA.id, recorded_by: caregiverA.id, event_type: 'checkin', daycare_id: daycareA.id });
  await db('audit_logs').insert({ actor_id: adminA.id, action: 'FIXTURE_CREATED', target_table: 'children', target_id: childA.id, daycare_id: daycareA.id, metadata: { fixture: true } });
  await db('password_reset_tokens').insert({ user_id: parentA.id, token_hash: hash(), expires_at: timed.expires_at });
  return { daycareA, daycareB, adminA, caregiverA, parentA, parentB };
}

async function legacySnapshot(db, shape) {
  if (!shape) {
    const { rows } = await db.raw(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name NOT LIKE 'knex_migrations%'
      ORDER BY table_name, ordinal_position
    `);
    shape = {};
    for (const row of rows) (shape[row.table_name] ||= []).push(row.column_name);
  }
  const records = {};
  for (const [table, columns] of Object.entries(shape)) records[table] = await db(table).select(columns).orderBy(columns.includes('id') ? 'id' : 'key_hash');
  return { shape, records };
}

async function rejectsWith(operation, code, constraint) {
  await assert.rejects(operation, error => {
    assert.ok([code].flat().includes(error.code), `Expected PostgreSQL code ${code}, received ${error.code}`);
    if (constraint) assert.equal(error.constraint, constraint);
    return true;
  });
}

test('database guard rejects application, maintenance and unowned targets', () => {
  for (const name of [configuredDatabase, 'postgres', 'ankelba_foundation_test_invalid', 'some_other_database']) {
    assert.throws(() => assertTestDatabaseName(name));
  }
  const generatedButUnowned = 'ankelba_foundation_test_1_1_1234abcd';
  assert.throws(() => assertTestDatabaseName(generatedButUnowned));
  assert.equal(ownedDatabases.size, 0);
});

test('historical chain without the repair reproduces the original clean-install failure', { timeout: 120000 }, async () => {
  await withIsolatedDatabase(async (db, name) => {
    await assert.rejects(() => migrateTo(db, name, 16, [prerequisiteMigration]), error => {
      assert.equal(error.code, '42703');
      assert.match(error.message, /profile_complete/);
      return true;
    });
    for (const table of newTables) assert.equal(await db.schema.hasTable(table), false);
  });
  assert.equal(ownedDatabases.size, 0);
});

test('fresh standard setup installs onboarding and scoped security storage without manual preparation', { timeout: 120000 }, async (t) => {
  await withIsolatedDatabase(async (db, name) => {
    const [, applied] = await migrateStandardSetup(db, name);
    const expected = await new FoundationMigrationSource().getMigrations();
    assert.deepEqual(applied, expected);
    assert.ok(applied.indexOf(prerequisiteMigration) < applied.indexOf('013_multi_tenant_saas.js'));
    await t.test('security tables start empty and legacy owner stays in users', async () => {
      for (const table of newTables) assert.deepEqual(await db(table).select('*'), []);
      assert.equal((await db('users').where({ role_id: 0 }).select('id')).length, 1);
      assert.ok(await db.schema.hasTable('password_reset_tokens'));
      const column = await db('users').columnInfo('profile_complete');
      assert.equal(column.type, 'boolean');
      assert.equal(column.nullable, false);
      assert.equal(column.defaultValue, 'false');
      assert.equal((await db('users').where({ role_id: 0 }).first()).profile_complete, true);
    });
    const f = await fixtures(db);
    assert.equal(f.parentA.profile_complete, false);
    const userA = { daycare_id: f.daycareA.id, user_id: f.parentA.id };
    const userB = { daycare_id: f.daycareB.id, user_id: f.parentB.id };
    const [platformA, platformB] = await db('platform_accounts').insert([
      { name: 'Platform A', email: 'owner-a@example.invalid' },
      { name: 'Platform B', email: 'owner-b@example.invalid' },
    ]).returning('*');
    const factor = principal => ({ ...principal, secret_ciphertext: 'test-envelope-not-real-encryption', encryption_key_id: 'test-key' });
    const [factorA, factorB, platformFactorA, platformFactorB] = await db('mfa_factors').insert([
      factor(userA), factor(userB), factor({ platform_account_id: platformA.id }), factor({ platform_account_id: platformB.id }),
    ]).returning('*');

    await t.test('daycare metadata is transitional and primary-admin references cannot cross tenants', async () => {
      assert.equal((await db('daycares').where({ id: 1 }).first()).login_code, 'dc-1');
      const [legacyInsert] = await db('daycares').insert({ name: 'Old insert', slug: 'old-insert', contact_email: 'old@example.invalid' }).returning('*');
      assert.equal(legacyInsert.login_code, null);
      assert.equal(legacyInsert.primary_admin_user_id, null);
      assert.equal(legacyInsert.setup_status, 'not_started');
      await db('daycares').where({ id: f.daycareA.id }).update({ primary_admin_user_id: f.adminA.id });
      await rejectsWith(() => db('daycares').where({ id: f.daycareA.id }).update({ primary_admin_user_id: f.parentB.id }), '23503', 'daycares_primary_admin_tenant_fk');
      await rejectsWith(() => db('daycares').where({ id: f.daycareA.id }).update({ setup_status: 'complete' }), '23514');
      await db('daycares').where({ id: f.daycareA.id }).update({ setup_status: 'complete', setup_completed_at: timed.created_at });
      await rejectsWith(() => db('daycares').where({ id: f.daycareA.id }).update({ setup_status: 'in_progress' }), '23514');
      await rejectsWith(() => db('daycares').where({ id: f.daycareB.id }).update({ login_code: 'NOT CANONICAL' }), '23514');
      await db('daycares').where({ id: f.daycareB.id }).update({ login_code: 'fixture-code' });
      await rejectsWith(() => db('daycares').where({ id: f.daycareA.id }).update({ login_code: 'fixture-code' }), '23505');
    });

    await t.test('legacy global email constraint remains and tenant-normalized duplicates are rejected', async () => {
      const account = { name: 'Duplicate', password_hash: 'test-only', role_id: 3 };
      await rejectsWith(() => db('users').insert({ ...account, daycare_id: f.daycareB.id, email: f.parentA.email }), '23505', 'users_email_unique');
      await rejectsWith(() => db('users').insert({ ...account, daycare_id: f.daycareA.id, email: ` ${f.parentA.email.toUpperCase()} ` }), '23505', 'users_daycare_normalized_email_unique');
      await rejectsWith(() => db('platform_accounts').insert({ name: 'Duplicate owner', email: ' OWNER-A@EXAMPLE.INVALID ' }), '23505');
      await rejectsWith(() => db('platform_accounts').insert({ name: 'No credential', email: 'no-credential@example.invalid', status: 'active' }), '23514');
    });

    await t.test('security records reject every partial-null or mixed principal', async () => {
      const invalidPrincipals = [
        {}, { daycare_id: f.daycareA.id }, { user_id: f.parentA.id },
        { daycare_id: f.daycareA.id, platform_account_id: platformA.id },
        { user_id: f.parentA.id, platform_account_id: platformA.id },
        { ...userA, platform_account_id: platformA.id },
      ];
      for (const principal of invalidPrincipals) {
        await rejectsWith(() => db('mfa_factors').insert(factor(principal)), '23514');
        await rejectsWith(() => db('auth_sessions').insert({ ...principal, token_hash: hash(), ...timed }), '23514');
        await rejectsWith(() => db('auth_challenges').insert({ ...principal, purpose: 'login_mfa', token_hash: hash(), ...timed }), '23514');
      }
      const mismatched = { daycare_id: f.daycareB.id, user_id: f.parentA.id };
      await rejectsWith(() => db('mfa_factors').insert(factor(mismatched)), '23503');
      await rejectsWith(() => db('auth_sessions').insert({ ...mismatched, token_hash: hash(), ...timed }), '23503');
      await rejectsWith(() => db('auth_challenges').insert({ ...mismatched, purpose: 'login_mfa', token_hash: hash(), ...timed }), '23503');
    });

    await t.test('recovery and local mail storage reject tenant mismatches, mixed principals and malformed budgets', async () => {
      const reset = { ...userA, token_hash: hash(), ...timed };
      await db('daycare_password_reset_tokens').insert(reset);
      await rejectsWith(() => db('daycare_password_reset_tokens').insert({ ...reset, token_hash: hash(), user_id: f.parentB.id }), '23503');
      await rejectsWith(() => db('daycare_password_reset_tokens').insert({ ...reset, token_hash: 'raw-token' }), '23514');
      await rejectsWith(() => db('daycare_password_reset_tokens').insert({ ...reset, token_hash: hash(), expires_at: timed.created_at }), '23514');
      const mail = { ...userA, recipient: 'test@example.invalid', kind: 'password_reset',
        payload_ciphertext: 'fixture-envelope', encryption_key_id: 'fixture', ...timed };
      await db('auth_mail_outbox').insert(mail);
      await db('auth_mail_outbox').insert({ ...mail, daycare_id: null, user_id: null, platform_account_id: platformA.id });
      for (const principal of [{ daycare_id: null, user_id: null }, { daycare_id: f.daycareA.id, user_id: null },
        { ...userA, platform_account_id: platformA.id }]) {
        await rejectsWith(() => db('auth_mail_outbox').insert({ ...mail, ...principal }), '23514');
      }
      await rejectsWith(() => db('auth_mail_outbox').insert({ ...mail, user_id: f.parentB.id }), '23503');
      await rejectsWith(() => db('auth_mail_outbox').insert({ ...mail, kind: 'unsupported' }), '23514');
      await rejectsWith(() => db('auth_mail_outbox').insert({ ...mail, expires_at: timed.created_at }), '23514');
      await rejectsWith(() => db('auth_attempt_buckets').insert({ key_hash: 'raw-email', attempts: 1 }), '23514');
      await rejectsWith(() => db('auth_attempt_buckets').insert({ key_hash: hash(), attempts: 0 }), '23514');
    });

    await t.test('session and challenge MFA factors must match the daycare or platform principal', async () => {
      const session = (principal, factorId) => ({ ...principal, mfa_factor_id: factorId, mfa_verified_at: timed.created_at, token_hash: hash(), ...timed });
      const challenge = (principal, factorId) => ({ ...principal, mfa_factor_id: factorId, purpose: 'login_mfa', token_hash: hash(), ...timed });
      await db('auth_sessions').insert(session(userA, factorA.id));
      await db('auth_sessions').insert(session({ platform_account_id: platformA.id }, platformFactorA.id));
      await db('auth_challenges').insert(challenge(userA, factorA.id));
      await db('auth_challenges').insert(challenge({ platform_account_id: platformA.id }, platformFactorA.id));
      for (const wrongFactor of [factorB.id, platformFactorA.id]) {
        await rejectsWith(() => db('auth_sessions').insert(session(userA, wrongFactor)), '23503');
        await rejectsWith(() => db('auth_challenges').insert(challenge(userA, wrongFactor)), '23503');
      }
      for (const wrongFactor of [platformFactorB.id, factorA.id]) {
        await rejectsWith(() => db('auth_sessions').insert(session({ platform_account_id: platformA.id }, wrongFactor)), '23503');
        await rejectsWith(() => db('auth_challenges').insert(challenge({ platform_account_id: platformA.id }, wrongFactor)), '23503');
      }
      await rejectsWith(() => db('auth_sessions').insert({ ...userA, mfa_verified_at: timed.created_at, token_hash: hash(), ...timed }), '23514');
      await rejectsWith(() => db('auth_sessions').insert({ ...userA, mfa_factor_id: factorA.id, token_hash: hash(), ...timed }), '23514');
    });

    await t.test('confirmed-factor uniqueness permits a pending replacement and later rotation', async () => {
      await db('mfa_factors').where({ id: factorA.id }).update({ confirmed_at: timed.created_at });
      const [replacement] = await db('mfa_factors').insert(factor(userA)).returning('*');
      await rejectsWith(() => db('mfa_factors').where({ id: replacement.id }).update({ confirmed_at: timed.created_at }), '23505');
      await db('mfa_factors').where({ id: factorA.id }).update({ revoked_at: timed.created_at });
      await db('mfa_factors').where({ id: replacement.id }).update({ confirmed_at: timed.created_at });
      await db('mfa_factors').where({ id: platformFactorA.id }).update({ confirmed_at: timed.created_at });
      await rejectsWith(() => db('mfa_factors').insert({ ...factor({ platform_account_id: platformA.id }), confirmed_at: timed.created_at }), '23505');
    });

    await t.test('token stores enforce hash shape and expiry and challenge attempts stay bounded', async () => {
      await rejectsWith(() => db('auth_sessions').insert({ ...userA, token_hash: 'raw-secret', ...timed }), '23514');
      await rejectsWith(() => db('auth_sessions').insert({ ...userA, token_hash: hash(), ...timed, expires_at: timed.created_at }), '23514');
      await rejectsWith(() => db('auth_challenges').insert({ ...userA, purpose: 'login_mfa', token_hash: hash(), ...timed, attempts: 6 }), '23514');
      await rejectsWith(() => db('auth_challenges').insert({ ...userA, purpose: 'unknown', token_hash: hash(), ...timed }), '23514');
      await rejectsWith(() => db('auth_challenges').insert({ ...userA, purpose: 'login_mfa', token_hash: hash(), ...timed, max_attempts: 0 }), '23514');
      await db('platform_password_reset_tokens').insert({ platform_account_id: platformA.id, token_hash: hash(), ...timed });
      await rejectsWith(() => db('platform_password_reset_tokens').insert({ platform_account_id: platformA.id, token_hash: hash(), ...timed, expires_at: timed.created_at }), '23514');
      await rejectsWith(() => db('mfa_recovery_codes').insert({ factor_id: factorA.id, code_hash: 'plain-code' }), '23514');
      const codeHash = hash();
      await db('mfa_recovery_codes').insert({ factor_id: factorA.id, code_hash: codeHash });
      await rejectsWith(() => db('mfa_recovery_codes').insert({ factor_id: factorB.id, code_hash: codeHash }), '23505');
    });

    await t.test('invitations constrain grant authority, recipient scope and acceptance state', async () => {
      const invitation = overrides => ({ daycare_id: f.daycareA.id, email: `${hash()}@example.invalid`, role_id: 3, invited_by_user_id: f.adminA.id, token_hash: hash(), ...timed, ...overrides });
      await db('account_invitations').insert(invitation({ user_id: f.parentA.id }));
      await db('account_invitations').insert(invitation({ role_id: 1, invited_by_user_id: null, invited_by_platform_account_id: platformA.id }));
      await rejectsWith(() => db('account_invitations').insert(invitation({ role_id: 1 })), '23514');
      await rejectsWith(() => db('account_invitations').insert(invitation({ invited_by_user_id: null, invited_by_platform_account_id: platformA.id })), '23514');
      await rejectsWith(() => db('account_invitations').insert(invitation({ invited_by_user_id: null })), '23514');
      await rejectsWith(() => db('account_invitations').insert(invitation({ invited_by_platform_account_id: platformA.id })), '23514');
      await rejectsWith(() => db('account_invitations').insert(invitation({ user_id: f.parentB.id })), '23503');
      await rejectsWith(() => db('account_invitations').insert(invitation({ invited_by_user_id: f.parentB.id })), '23503');
      await rejectsWith(() => db('account_invitations').insert(invitation({ accepted_at: timed.created_at, accepted_by_user_id: f.parentB.id })), '23503');
      await rejectsWith(() => db('account_invitations').insert(invitation({ accepted_at: timed.created_at })), '23514');
      await rejectsWith(() => db('account_invitations').insert(invitation({ accepted_by_user_id: f.parentA.id })), '23514');
      await rejectsWith(() => db('account_invitations').insert(invitation({ user_id: f.parentA.id, accepted_at: timed.created_at, accepted_by_user_id: f.caregiverA.id })), '23514', 'account_invitations_target_acceptor');
      await db('account_invitations').insert(invitation({ user_id: f.parentA.id, accepted_at: timed.created_at, accepted_by_user_id: f.parentA.id }));
      await rejectsWith(() => db('account_invitations').insert(invitation({ email: 'UPPER@EXAMPLE.INVALID' })), '23514');
      await rejectsWith(() => db('account_invitations').insert(invitation({ expires_at: timed.created_at })), '23514');
    });

    await t.test('invitation reissue requires revoking the previous pending link', async () => {
      const row = { daycare_id: f.daycareA.id, email: 'reissue@example.invalid', role_id: 3, invited_by_user_id: f.adminA.id, ...timed };
      const [first] = await db('account_invitations').insert({ ...row, token_hash: hash() }).returning('*');
      await rejectsWith(() => db('account_invitations').insert({ ...row, token_hash: hash() }), '23505', 'account_invitations_pending_unique');
      await db('account_invitations').where({ id: first.id }).update({ revoked_at: timed.created_at });
      await db('account_invitations').insert({ ...row, token_hash: hash() });
    });

    await t.test('audit actor checks and restrictive FKs preserve platform history', async () => {
      const [auditOwner] = await db('platform_accounts').insert({ name: 'Audit owner', email: 'audit@example.invalid' }).returning('*');
      const [auditDaycare] = await db('daycares').insert({ name: 'Audit center', slug: 'audit-center', contact_email: 'audit-center@example.invalid' }).returning('*');
      const event = { actor_kind: 'platform', platform_account_id: auditOwner.id, daycare_id: auditDaycare.id, action: 'DAYCARE_APPROVED', target_type: 'daycare', outcome: 'success' };
      await db('platform_audit_events').insert(event);
      // PG18 distinguishes RESTRICT violations (23001) from older FK errors.
      await rejectsWith(() => db('platform_accounts').where({ id: auditOwner.id }).delete(), ['23001', '23503'], 'platform_audit_events_platform_account_id_fkey');
      await rejectsWith(() => db('daycares').where({ id: auditDaycare.id }).delete(), ['23001', '23503'], 'platform_audit_events_daycare_id_fkey');
      await rejectsWith(() => db('platform_audit_events').insert({ ...event, platform_account_id: null }), '23514');
      await rejectsWith(() => db('platform_audit_events').insert({ ...event, actor_kind: 'system' }), '23514');
      await rejectsWith(() => db('platform_audit_events').insert({ ...event, metadata: JSON.stringify(['not-an-object']) }), '23514');
      await db('platform_audit_events').insert({ ...event, actor_kind: 'system', platform_account_id: null });
    });

    await t.test('repeated standard setup has no pending migrations and preserves stored data', async () => {
      const before = await legacySnapshot(db);
      const historyBefore = await db('knex_migrations').select('*').orderBy('id');
      const [, repeated] = await migrateStandardSetup(db, name);
      assert.deepEqual(repeated, []);
      assert.deepEqual(await legacySnapshot(db), before);
      assert.deepEqual(await db('knex_migrations').select('*').orderBy('id'), historyBefore);
    });
  });
  assert.equal(ownedDatabases.size, 0);
});

test('upgrade and rollback preserve all legacy rows, credentials, ownership and migration history', { timeout: 120000 }, async () => {
  await withIsolatedDatabase(async (db, name) => {
    await prepareLegacyBaseline(db, name);
    await fixtures(db);
    const before = await legacySnapshot(db);
    const historyBefore = await db('knex_migrations').select('*').orderBy('id');
    await migrateStandardSetup(db, name);
    assert.deepEqual((await legacySnapshot(db, before.shape)).records, before.records);
    assert.deepEqual((await db('knex_migrations').select('*').orderBy('id')).slice(0, historyBefore.length), historyBefore);
    assert.deepEqual((await db('knex_migrations').select('name').orderBy('id')).slice(-(newMigrations.length + 1)).map(row => row.name), [prerequisiteMigration, ...newMigrations]);
    for (const table of newTables) assert.deepEqual(await db(table).select('*'), []);

    await reverseNewMigrations(db, name, true);
    assert.deepEqual(await legacySnapshot(db), before);
    assert.deepEqual(await db('knex_migrations').select('*').orderBy('id'), historyBefore);
    assert.equal(await db.schema.hasColumn('daycares', 'login_code'), false);
    for (const table of newTables) assert.equal(await db.schema.hasTable(table), false);

    await migrateStandardSetup(db, name);
    assert.deepEqual((await legacySnapshot(db, before.shape)).records, before.records);
  });
  assert.equal(ownedDatabases.size, 0);
});

test('repair and security storage preserve an existing 016 database and append only new history', { timeout: 120000 }, async () => {
  await withIsolatedDatabase(async (db, name) => {
    await prepareLegacyBaseline(db, name);
    const f = await fixtures(db);
    await migrateTo(db, name, 16, [prerequisiteMigration]);
    await db('users').where({ id: f.parentA.id }).update({ profile_complete: true });
    await db('platform_accounts').insert({ name: 'Existing owner', email: 'existing-owner@example.invalid' });
    const before = await legacySnapshot(db);
    const columnBefore = await db('users').columnInfo('profile_complete');
    const historyBefore = await db('knex_migrations').select('*').orderBy('id');
    const [, applied] = await migrateStandardSetup(db, name);
    assert.deepEqual(applied, [prerequisiteMigration, '017_authentication_security_workflows.js']);
    assert.deepEqual((await legacySnapshot(db, before.shape)).records, before.records);
    assert.deepEqual(await db('users').columnInfo('profile_complete'), columnBefore);
    const history = await db('knex_migrations').select('*').orderBy('id');
    assert.deepEqual(history.slice(0, -2), historyBefore);
    assert.deepEqual(history.slice(-2).map(row => row.name), applied);
  });
  assert.equal(ownedDatabases.size, 0);
});

test('repair fills a missing onboarding column and its targeted rollback retains the values', { timeout: 120000 }, async () => {
  await withIsolatedDatabase(async (db, name) => {
    await migrateTo(db, name, 12, [prerequisiteMigration]);
    await db('roles').insert({ id: 3, name: 'parent' });
    const [parent] = await db('users').insert({ name: 'Legacy parent', email: 'legacy-parent@example.invalid', password_hash: 'preserve-this-hash', role_id: 3 }).returning('*');
    const historyBefore = await db('knex_migrations').select('*').orderBy('id');
    await migrateTo(db, name, 12);
    assert.equal((await db('users').where({ id: parent.id }).first()).profile_complete, false);
    await rejectsWith(() => db('users').where({ id: parent.id }).update({ profile_complete: null }), '23502');
    await db('users').where({ id: parent.id }).update({ profile_complete: true });
    const before = await legacySnapshot(db);
    const [, reversed] = await db.migrate.down({ name: prerequisiteMigration, migrationSource: new FoundationMigrationSource(12) });
    assert.deepEqual(reversed, [prerequisiteMigration]);
    assert.deepEqual(await legacySnapshot(db), before);
    assert.deepEqual(await db('knex_migrations').select('*').orderBy('id'), historyBefore);
    await migrateTo(db, name, 12);
    assert.deepEqual(await legacySnapshot(db), before);
  });
  assert.equal(ownedDatabases.size, 0);
});

test('incompatible legacy onboarding columns stop the repair without rewriting data', { timeout: 120000 }, async (t) => {
  for (const kind of ['nullable_boolean', 'text']) {
    await t.test(kind, async () => {
      await withIsolatedDatabase(async (db, name) => {
        await migrateTo(db, name, 12, [prerequisiteMigration]);
        await db.schema.alterTable('users', table => {
          if (kind === 'nullable_boolean') table.boolean('profile_complete');
          else table.text('profile_complete').notNullable().defaultTo('legacy-value');
        });
        await db('roles').insert({ id: 3, name: 'parent' });
        await db('users').insert({ name: 'Drift fixture', email: 'schema-drift@example.invalid', password_hash: 'unchanged-hash', role_id: 3 });
        const before = await legacySnapshot(db);
        const columnBefore = await db('users').columnInfo('profile_complete');
        const historyBefore = await db('knex_migrations').select('*').orderBy('id');
        await assert.rejects(() => migrateStandardSetup(db, name), /Existing users.profile_complete must be a non-nullable boolean/);
        assert.deepEqual(await legacySnapshot(db), before);
        assert.deepEqual(await db('users').columnInfo('profile_complete'), columnBefore);
        assert.deepEqual(await db('knex_migrations').select('*').orderBy('id'), historyBefore);
      });
    });
  }
  assert.equal(ownedDatabases.size, 0);
});

test('normalized-email conflicts stop upgrades atomically without rewriting accounts', { timeout: 120000 }, async () => {
  await withIsolatedDatabase(async (db, name) => {
    await prepareLegacyBaseline(db, name);
    const f = await fixtures(db);
    await db('users').insert({ name: 'Case conflict', email: f.parentA.email.toUpperCase(), password_hash: 'conflict-fixture', role_id: 3, daycare_id: f.daycareA.id });
    const before = await legacySnapshot(db);
    const historyBefore = await db('knex_migrations').select('*').orderBy('id');
    await assert.rejects(() => migrateTo(db, name), /Resolve duplicate normalized emails within a daycare/);
    assert.deepEqual(await legacySnapshot(db), before);
    assert.deepEqual(await db('knex_migrations').select('*').orderBy('id'), historyBefore);
    assert.equal(await db.schema.hasColumn('daycares', 'login_code'), false);
    assert.equal(await db.schema.hasTable('platform_accounts'), false);
  });
  assert.equal(ownedDatabases.size, 0);
});
