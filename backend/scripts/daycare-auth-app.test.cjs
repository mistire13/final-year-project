'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const { randomBytes, createHash } = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { withIsolatedDatabase, assertTestDatabaseName, ownedDatabases } = require('./helpers/auth-test-database.cjs');
const { securityConfig, securityEnvironment, finishMfa } = require('./helpers/auth-security-fixtures.cjs');
const { createAccountRecovery } = require('../src/modules/account-recovery');

const origin = 'http://localhost:8081';
const password = 'App-test-password-814!';
const forbiddenDatabase = process.env.DB_NAME || 'ankelba_dev';

async function fixture(db) {
  await db('roles').insert([{ id: 1, name: 'admin' }, { id: 2, name: 'caregiver' }, { id: 3, name: 'parent' }]).onConflict('id').ignore();
  const suffix = randomBytes(4).toString('hex');
  const [daycare] = await db('daycares').insert({
    name: 'Full application fixture', slug: `app-${suffix}`, login_code: `app-${suffix}`,
    contact_email: `contact-${suffix}@example.invalid`, status: 'active',
  }).returning('*');
  const passwordHash = await bcrypt.hash(password, 4);
  const [admin, parent] = await db('users').insert([
    { name: 'App admin', email: `admin-${suffix}@example.invalid`, role_id: 1 },
    { name: 'App parent', email: `parent-${suffix}@example.invalid`, role_id: 3 },
  ].map(user => ({ ...user, password_hash: passwordHash, status: 'active', daycare_id: daycare.id }))).returning('*');
  return { daycare, admin, parent };
}

function bounded(promise, milliseconds, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); }),
  ]).finally(() => clearTimeout(timer));
}

async function withAppWorker(name, enabled, work) {
  assertTestDatabaseName(name);
  const child = fork(path.resolve(__dirname, './helpers/auth-app-worker.cjs'), [], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      ...securityEnvironment,
      DB_NAME: name,
      DB_HOST: process.env.DB_HOST || 'localhost',
      // Migration-017 wiring fixtures intentionally use their generated DB's
      // owner. Restricted current-schema wiring is covered by essential-security.
      APP_DB_USER: process.env.DB_USER || 'postgres',
      APP_DB_PASSWORD: process.env.DB_PASSWORD,
      CONTROL_DB_USER: process.env.DB_USER || 'postgres',
      CONTROL_DB_PASSWORD: process.env.DB_PASSWORD,
      AUTH_TEST_FORBIDDEN_DB: forbiddenDatabase,
      NODE_ENV: 'test',
      DAYCARE_AUTH_ENABLED: String(enabled),
      DAYCARE_AUTH_ALLOWED_ORIGINS: origin,
      JWT_SECRET: 'synthetic-app-wiring-secret-only',
    },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  // This closure owns only this fork. Never discover or kill unrelated PIDs.
  const exited = once(child, 'exit');
  let exitedAlready = false;
  child.once('exit', () => { exitedAlready = true; });
  try {
    const ready = await bounded(new Promise((resolve, reject) => {
      child.on('message', message => {
        if (message?.type === 'ready') resolve(message);
        if (message?.type === 'startup-error') reject(new Error('Isolated app worker failed during startup'));
      });
      child.once('error', reject);
      child.once('exit', () => reject(new Error('Isolated app worker exited before readiness')));
    }), 20000, 'Isolated app worker startup timed out');
    assert.equal(ready.database, name);
    assert.ok(Number.isInteger(ready.port) && ready.port > 0 && ready.port <= 65535);
    const request = async (method, route, body, headers = {}) => {
      const response = await fetch(`http://127.0.0.1:${ready.port}${route}`, {
        method,
        headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(10000), redirect: 'manual',
      });
      const text = await response.text();
      let json;
      try { json = JSON.parse(text); } catch { json = null; }
      return { status: response.status, body: json, text, headers: response.headers, cookie: response.headers.get('set-cookie')?.split(';')[0] };
    };
    await work(request);
  } finally {
    assertTestDatabaseName(name);
    if (child.connected) child.send({ type: 'shutdown' });
    if (!exitedAlready) {
      try { await bounded(exited, 7000, 'Isolated app worker did not shut down'); }
      catch {
        if (!exitedAlready) child.kill('SIGTERM');
        try { await bounded(exited, 3000, 'Isolated app worker did not terminate'); }
        catch {
          if (!exitedAlready) child.kill('SIGKILL');
          await bounded(exited, 5000, 'Unable to close the owned isolated app worker');
        }
      }
    }
    // withIsolatedDatabase cannot DROP until this child has exited and released
    // its application pool, and the parent's pool/Knex are also closed.
    assert.ok(exitedAlready, 'The owned application worker must exit before cleanup');
  }
}

test('actual application preview wiring closes legacy bypasses and authenticates scoped sessions', { timeout: 120000 }, async t => {
  await withIsolatedDatabase(async ({ db, pool, name }) => {
    const f = await fixture(db);
    await withAppWorker(name, true, async request => {
      await t.test('CORS permits exact allowed origin and CSRF headers', async () => {
        const result = await request('OPTIONS', '/api/users/profile/me', undefined, {
          Origin: origin, 'Access-Control-Request-Method': 'PATCH',
          'Access-Control-Request-Headers': 'content-type,x-csrf-token',
        });
        assert.equal(result.status, 204);
        assert.equal(result.headers.get('access-control-allow-origin'), origin);
        assert.equal(result.headers.get('access-control-allow-credentials'), 'true');
        assert.match(result.headers.get('access-control-allow-headers'), /x-csrf-token/i);
        const forbidden = await request('OPTIONS', '/api/users/profile/me', undefined, {
          Origin: 'https://untrusted.example.invalid', 'Access-Control-Request-Method': 'PATCH',
        });
        assert.equal(forbidden.headers.get('access-control-allow-origin'), null);
      });

      await t.test('both daycare registration aliases and public account signup stay closed', async () => {
        const daycares = Number((await db('daycares').count('* AS count').first()).count);
        const users = Number((await db('users').count('* AS count').first()).count);
        for (const route of ['/api/saas/register-daycare', '/api/register-daycare', '/api/auth/register']) {
          assert.equal((await request('POST', route, { name: 'Must not provision', email: 'blocked@example.invalid', password })).status, 403);
        }
        assert.equal(Number((await db('daycares').count('* AS count').first()).count), daycares);
        assert.equal(Number((await db('users').count('* AS count').first()).count), users);
      });

      await t.test('login and recovery require scoped input and reject legacy password payloads', async () => {
        assert.equal((await request('POST', '/api/auth/login', { email: f.parent.email, password })).status, 422);
        for (const [method, route] of [['POST', '/api/auth/forgot-password'], ['POST', '/api/auth/reset-password'], ['PATCH', '/api/auth/change-password']]) {
          const result = await request(method, route, { email: f.parent.email, token: 'test-not-a-reset-token', password });
          assert.ok([401, 422].includes(result.status), `${method} ${route}: ${result.text}`);
          assert.equal(result.text.includes('test-not-a-reset-token'), false);
        }
        assert.equal(Number((await db('password_reset_tokens').where({ user_id: f.parent.id }).count('* AS count').first()).count), 0);
      });

      await t.test('legacy JWT authentication cannot reach users or operational middleware', async () => {
        const token = jwt.sign({ userId: f.admin.id, role: 'admin', daycareId: f.daycare.id }, 'synthetic-app-wiring-secret-only');
        for (const route of ['/api/users', '/api/portal/workspace']) {
          assert.equal((await request('GET', route, undefined, { Authorization: `Bearer ${token}` })).status, 401);
        }
      });

      await t.test('the runtime pool and global middleware accept daycare sessions and preserve role restrictions', async () => {
        const login = async user => finishMfa(request, await request('POST', '/api/auth/login', {
          daycare_code: f.daycare.login_code, email: user.email, password, transport: 'bearer',
        }), user.email, 'bearer');
        const admin = await login(f.admin);
        assert.equal(admin.status, 200, admin.text);
        assert.match(admin.body.token, /^dc1\.[A-Za-z0-9_-]{43}$/);
        const listed = await request('GET', '/api/users', undefined, { Authorization: `Bearer ${admin.body.token}` });
        assert.equal(listed.status, 200, listed.text);
        assert.equal(listed.body.total, 2);
        assert.ok(listed.body.data.every(user => user.daycare_id === f.daycare.id));
        const parent = await login(f.parent);
        assert.equal(parent.status, 200);
        assert.equal((await request('GET', '/api/users', undefined, { Authorization: `Bearer ${parent.body.token}` })).status, 403);
      });

      await t.test('operational mutations encounter cookie CSRF checks before business validation or writes', async () => {
        const attendanceBefore = Number((await db('attendance').count('* AS count').first()).count);
        const result = await finishMfa(request, await request('POST', '/api/auth/login', {
          daycare_code: f.daycare.login_code, email: f.admin.email, password,
        }), f.admin.email, 'cookie');
        assert.equal(result.status, 200);
        assert.ok(result.cookie);
        // Deliberately invalid business data: a 403 proves authentication runs
        // before the route's 422 validator, without touching children/attendance.
        for (const headers of [{ Cookie: result.cookie, Origin: origin }, {
          Cookie: result.cookie, Origin: origin, 'X-CSRF-Token': '0'.repeat(64),
        }]) assert.equal((await request('POST', '/api/portal/attendance', {}, headers)).status, 403);
        const validated = await request('POST', '/api/portal/attendance', {}, {
          Cookie: result.cookie, Origin: origin, 'X-CSRF-Token': result.body.csrf_token,
        });
        assert.equal(validated.status, 422, validated.text);
        assert.equal(Number((await db('attendance').count('* AS count').first()).count), attendanceBefore);
      });

      await t.test('failed logout proof cannot clear or revoke another browser session', async () => {
        const signedIn = await request('POST', '/api/auth/login', {
          daycare_code: f.daycare.login_code, email: f.parent.email, password,
        });
        assert.equal(signedIn.status, 200);
        for (const headers of [
          { Cookie: signedIn.cookie, Origin: origin, 'X-CSRF-Token': '0'.repeat(64) },
          { Cookie: signedIn.cookie, Origin: 'https://untrusted.example.invalid', 'X-CSRF-Token': signedIn.body.csrf_token },
        ]) {
          const denied = await request('POST', '/api/auth/logout', {}, headers);
          assert.equal(denied.status, 403);
          assert.equal(denied.headers.get('set-cookie'), null, 'Invalid logout proof must not clear cookies');
          assert.equal((await request('GET', '/api/auth/me', undefined, { Cookie: signedIn.cookie })).status, 200);
        }
        const logout = await request('POST', '/api/auth/logout', {}, {
          Cookie: signedIn.cookie, Origin: origin, 'X-CSRF-Token': signedIn.body.csrf_token,
        });
        assert.equal(logout.status, 200);
        assert.match(logout.headers.get('set-cookie'), /daycare_session=;/);
        assert.equal((await request('GET', '/api/auth/me', undefined, { Cookie: signedIn.cookie })).status, 401);
        const repeated = await request('POST', '/api/auth/logout', {}, {
          Cookie: signedIn.cookie, Origin: origin, 'X-CSRF-Token': signedIn.body.csrf_token,
        });
        assert.equal(repeated.status, 200);
        assert.match(repeated.headers.get('set-cookie'), /daycare_session=;/);
      });

      await t.test('a password-only administrator challenge and a session without MFA cannot access protected routes', async () => {
        const g = await fixture(db);
        const started = await request('POST', '/api/auth/login', {
          daycare_code: g.daycare.login_code, email: g.admin.email, password,
        });
        assert.equal(started.status, 202);
        assert.equal(started.body.token, undefined);
        assert.equal(started.cookie, undefined);
        const raw = `dc1.${randomBytes(32).toString('base64url')}`;
        await db('auth_sessions').insert({ daycare_id: g.daycare.id, user_id: g.admin.id,
          token_hash: createHash('sha256').update(raw).digest('hex'), expires_at: new Date(Date.now() + 60000) });
        for (const token of [raw, started.body.challenge_token]) {
          assert.equal((await request('GET', '/api/users', undefined, { Authorization: `Bearer ${token}` })).status, 401);
        }
      });

      await t.test('daycare recovery and authenticated password changes revoke access through the complete application', async () => {
        const g = await fixture(db);
        const loginInput = { daycare_code: g.daycare.login_code, email: g.parent.email, password, transport: 'bearer' };
        const signedIn = await request('POST', '/api/auth/login', loginInput);
        assert.equal(signedIn.status, 200);
        const sent = await request('POST', '/api/auth/forgot-password', { daycare_code: g.daycare.login_code, email: g.parent.email });
        assert.equal(sent.status, 202, sent.text);
        const recovery = createAccountRecovery({ pool, config: securityConfig() });
        const row = await db('auth_mail_outbox').where({ user_id: g.parent.id, kind: 'password_reset' }).first();
        const message = await recovery.inbox.view(row.id);
        const token = new URLSearchParams(new URL(message.reset_url).hash.slice(1)).get('token');
        const nextPassword = 'App-recovered-password-713!';
        const reset = { daycare_code: g.daycare.login_code, token, new_password: nextPassword };
        assert.equal((await request('POST', '/api/auth/reset-password', { ...reset, daycare_code: f.daycare.login_code })).status, 400);
        assert.equal((await request('POST', '/api/auth/reset-password', reset)).status, 200);
        assert.equal((await request('POST', '/api/auth/reset-password', reset)).status, 400);
        assert.equal((await request('GET', '/api/auth/me', undefined, { Authorization: `Bearer ${signedIn.body.token}` })).status, 401);
        assert.equal((await request('POST', '/api/auth/login', loginInput)).status, 401);
        const current = await request('POST', '/api/auth/login', { ...loginInput, password: nextPassword });
        assert.equal(current.status, 200);
        const headers = { Authorization: `Bearer ${current.body.token}` };
        assert.equal((await request('PATCH', '/api/auth/change-password', {
          current_password: 'Wrong-old-password', new_password: 'App-second-password-891!',
        }, headers)).status, 401);
        assert.equal((await request('PATCH', '/api/auth/change-password', {
          current_password: nextPassword, new_password: 'App-second-password-891!',
        }, headers)).status, 200);
        assert.equal((await request('GET', '/api/auth/me', undefined, headers)).status, 401);
        assert.equal((await request('POST', '/api/auth/login', { ...loginInput, password: 'App-second-password-891!' })).status, 200);
      });

      await t.test('platform login, recovery and password changes preserve MFA and remain outside daycare access', async () => {
        const suffix = randomBytes(4).toString('hex');
        const [owner] = await db('platform_accounts').insert({ name: 'Full app owner', email: `owner-${suffix}@example.invalid`,
          password_hash: await bcrypt.hash(password, 4), status: 'pending_activation' }).returning('*');
        const path = '/api/platform/auth';
        const input = { email: owner.email, password, transport: 'bearer' };
        const signedIn = await finishMfa(request, await request('POST', `${path}/login`, input), owner.email, 'bearer', path);
        assert.match(signedIn.body.token, /^pf1\./);
        const headers = { Authorization: `Bearer ${signedIn.body.token}` };
        assert.equal((await request('GET', `${path}/me`, undefined, headers)).status, 200);
        for (const route of ['/api/auth/me', '/api/users', '/api/portal/workspace']) {
          assert.equal((await request('GET', route, undefined, headers)).status, 401);
        }
        const before = await db('mfa_factors').where({ platform_account_id: owner.id }).whereNotNull('confirmed_at').first();
        assert.equal((await request('POST', `${path}/forgot-password`, { email: owner.email })).status, 202);
        const recovery = createAccountRecovery({ pool, config: securityConfig() });
        const row = await db('auth_mail_outbox').where({ platform_account_id: owner.id, kind: 'password_reset' }).first();
        const message = await recovery.inbox.view(row.id);
        const token = new URLSearchParams(new URL(message.reset_url).hash.slice(1)).get('token');
        const nextPassword = 'Platform-recovered-password-791!';
        assert.equal((await request('POST', `${path}/reset-password`, { token, new_password: nextPassword })).status, 200);
        assert.equal((await request('GET', `${path}/me`, undefined, headers)).status, 401);
        const after = await db('mfa_factors').where({ id: before.id }).first();
        assert.equal(after.revoked_at, null);
        assert.deepEqual(after.confirmed_at, before.confirmed_at);
        const challenge = await request('POST', `${path}/login`, { ...input, password: nextPassword });
        assert.equal(challenge.status, 202);
        assert.equal(challenge.body.enrollment_required, false);
        const current = await finishMfa(request, challenge, owner.email, 'bearer', path);
        const currentHeaders = { Authorization: `Bearer ${current.body.token}` };
        assert.equal((await request('PATCH', `${path}/change-password`, {
          current_password: nextPassword, new_password: 'Platform-changed-password-492!',
        }, currentHeaders)).status, 200);
        assert.equal((await request('GET', `${path}/me`, undefined, currentHeaders)).status, 401);
        assert.equal((await request('POST', `${path}/login`, { ...input, password: 'Platform-changed-password-492!' })).status, 202);
      });
    });

    await t.test('preview disabled retains legacy validation but rejects unversioned JWTs', async () => {
      await withAppWorker(name, false, async request => {
        // Invalid input stops at the legacy validator and performs no login or
        // credential write. Missing daycare code is not part of that schema.
        const invalid = await request('POST', '/api/auth/login', { email: 'invalid-email', password });
        assert.equal(invalid.status, 422);
        const token = jwt.sign({ userId: f.admin.id, role: 'admin', daycareId: f.daycare.id }, 'synthetic-app-wiring-secret-only');
        const profile = await request('GET', '/api/auth/me', undefined, { Authorization: `Bearer ${token}` });
        assert.equal(profile.status, 401, profile.text);
      });
    });
  });
  assert.equal(ownedDatabases.size, 0);
});
