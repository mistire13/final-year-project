'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { withCurrentDatabase } = require('./helpers/auth-test-database.cjs');
const { createTenantPool } = require('../src/db/tenant-pool');
const {
  PACKAGE_CODES,
  catalogFeatures,
  effectiveFeatures,
  requirePackageFeature,
} = require('../src/modules/saas/package-features');
const { createSubscriptionAccess } = require('../src/middleware/subscription-access');
const { createSubscriptions } = require('../src/modules/saas/subscriptions.service');
const { createPaymentService } = require('../src/modules/saas/subscription-payments.service');

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const PAST = new Date(Date.now() - 86400000).toISOString();

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('effectiveFeatures strictly enforces Standard vs Plus tier, expiry, status, and tampering', () => {
  assert.deepEqual(PACKAGE_CODES, ['standard', 'premium']);

  const standardActive = effectiveFeatures({
    id: 1,
    status: 'active',
    subscription_plan: 'standard',
    subscription_status: 'active',
    subscription_terms: {
      code: 'standard',
      name: 'Standard',
      features: { shop: true, business_analytics: true, billing_automation: true, staff_scheduling: true },
    },
    subscription_ends_at: FUTURE,
  });
  assert.equal(standardActive.active, true);
  assert.equal(standardActive.package_code, 'standard');
  assert.equal(standardActive.package_name, 'Standard');
  assert.deepEqual(standardActive.features, {
    shop: false,
    business_analytics: false,
    billing_automation: false,
    staff_scheduling: false,
  });

  const plusActive = effectiveFeatures({
    id: 2,
    status: 'active',
    subscription_plan: 'premium',
    subscription_status: 'active',
    subscription_terms: { code: 'premium', name: 'Plus', features: catalogFeatures('premium') },
    subscription_ends_at: FUTURE,
  });
  assert.equal(plusActive.active, true);
  assert.equal(plusActive.package_code, 'premium');
  assert.equal(plusActive.package_name, 'Plus');
  assert.deepEqual(plusActive.features, {
    shop: true,
    business_analytics: true,
    billing_automation: true,
    staff_scheduling: true,
  });

  const plusCancelledUnexpired = effectiveFeatures({
    id: 2,
    status: 'active',
    subscription_plan: 'premium',
    subscription_status: 'cancelled',
    subscription_terms: { code: 'premium', features: catalogFeatures('premium') },
    subscription_ends_at: FUTURE,
  });
  assert.equal(plusCancelledUnexpired.active, true);
  assert.equal(plusCancelledUnexpired.features.shop, true);

  const plusExpired = effectiveFeatures({
    id: 2,
    status: 'active',
    subscription_plan: 'premium',
    subscription_status: 'cancelled',
    subscription_terms: { code: 'premium', features: catalogFeatures('premium') },
    subscription_ends_at: PAST,
  });
  assert.equal(plusExpired.active, false);
  assert.deepEqual(plusExpired.features, catalogFeatures('standard'));

  for (const blocked of [
    { subscription_status: 'active', subscription_terms: { code: 'premium' }, subscription_ends_at: null },
    { subscription_status: 'expired', subscription_terms: { code: 'premium' }, subscription_ends_at: FUTURE },
    { subscription_status: 'pending', subscription_terms: { code: 'premium' }, subscription_ends_at: FUTURE },
    { subscription_status: 'trialing', trial_ends_at: FUTURE, subscription_terms: { code: 'premium' }, subscription_ends_at: FUTURE },
    { status: 'suspended', subscription_status: 'active', subscription_terms: { code: 'premium' }, subscription_ends_at: FUTURE },
    { deleted_at: new Date().toISOString(), status: 'active', subscription_status: 'active', subscription_terms: { code: 'premium' }, subscription_ends_at: FUTURE },
  ]) {
    const out = effectiveFeatures({ id: 3, subscription_plan: 'premium', ...blocked });
    assert.equal(out.active, false);
    assert.deepEqual(out.features, catalogFeatures('standard'));
  }
});

test('requirePackageFeature rejects impersonation, missing tenant, Standard, and expired Plus', async () => {
  let queried = 0;
  const fakePool = {
    async query(_sql, [daycareId]) {
      queried += 1;
      if (Number(daycareId) === 10) {
        return {
          rows: [{
            row: {
              id: 10,
              status: 'active',
              deleted_at: null,
              subscription_plan: 'premium',
              subscription_status: 'active',
              subscription_terms: { code: 'premium', features: catalogFeatures('premium') },
              subscription_ends_at: FUTURE,
              trial_ends_at: null,
              legacy_shop_access_until: null,
            },
          }],
        };
      }
      return {
        rows: [{
          row: {
            id: Number(daycareId),
            status: 'active',
            deleted_at: null,
            subscription_plan: 'standard',
            subscription_status: 'active',
            subscription_terms: { code: 'standard', features: catalogFeatures('standard') },
            subscription_ends_at: FUTURE,
            trial_ends_at: null,
            legacy_shop_access_until: null,
          },
        }],
      };
    },
  };
  const mw = requirePackageFeature('business_analytics', fakePool);

  const resImpersonating = mockRes();
  let calledNext = false;
  await mw({ user: { id: 1, daycare_id: 10, is_impersonating: true } }, resImpersonating, () => {
    calledNext = true;
  });
  assert.equal(calledNext, false);
  assert.equal(resImpersonating.statusCode, 403);
  assert.equal(resImpersonating.body.code, 'FEATURE_NOT_INCLUDED');
  assert.equal(queried, 0);

  const resMissingDaycare = mockRes();
  await mw({ user: { id: 1 } }, resMissingDaycare, () => {
    calledNext = true;
  });
  assert.equal(resMissingDaycare.statusCode, 403);
  assert.equal(queried, 0);

  let stdErr = null;
  await mw({ user: { id: 2, daycare_id: 20 } }, mockRes(), (err) => {
    stdErr = err;
  });
  assert.equal(stdErr?.statusCode, 403);
  assert.equal(stdErr?.code, 'FEATURE_NOT_INCLUDED');

  let plusErr = 'unset';
  await mw({ user: { id: 3, daycare_id: 10 } }, mockRes(), (err) => {
    plusErr = err ?? null;
  });
  assert.equal(plusErr, null);
});

test('subscriptionAccess rejects missing tenant or non-active daycare_status on reads and safeWrites', async () => {
  const mw = createSubscriptionAccess({
    async query() {
      return { rows: [{ subscription_ends_at: FUTURE }] };
    },
  });

  for (const badReq of [
    { method: 'GET', originalUrl: '/api/children', user: { id: 1 } },
    { method: 'GET', originalUrl: '/api/children', user: { id: 1, daycare_id: 1, daycare_status: 'suspended' } },
    { method: 'POST', originalUrl: '/api/portal/attendance', user: { id: 1, daycare_id: 1, daycare_status: 'pending' } },
    { method: 'POST', originalUrl: '/api/children', user: { id: 1, daycare_id: 1, daycare_status: 'rejected' } },
  ]) {
    const res = mockRes();
    let passed = false;
    await mw(badReq, res, () => {
      passed = true;
    });
    assert.equal(passed, false);
    assert.equal(res.statusCode, 403);
  }
});

test('strict subscription service & Express HTTP routes enforce Standard vs Plus differentiation', async () => {
  await withCurrentDatabase(async ({ db, pool }) => {
    await db('roles')
      .insert([
        { id: 0, name: 'super_admin' },
        { id: 1, name: 'admin' },
        { id: 2, name: 'caregiver' },
        { id: 3, name: 'parent' },
      ])
      .onConflict('id')
      .ignore();

    const plusTerms = { code: 'premium', name: 'Plus', version: 1, max_children: 150, billing_cycle: 'monthly', price: '2500.00', currency: 'ETB', features: catalogFeatures('premium') };
    const stdTerms = { code: 'standard', name: 'Standard', version: 1, max_children: 1, billing_cycle: 'monthly', price: '1000.00', currency: 'ETB', features: catalogFeatures('standard') };

    const [stdDaycare, plusDaycare, expiredPlusDaycare, suspendedDaycare] = await db('daycares')
      .insert([
        { name: 'Standard Center', slug: 'strict-std', contact_email: 'std@example.invalid', status: 'active', subscription_plan: 'standard', billing_cycle: 'monthly', subscription_status: 'active', subscription_terms: stdTerms, max_children: 1, subscription_started_at: db.raw("NOW() - INTERVAL '5 days'"), subscription_ends_at: FUTURE },
        { name: 'Plus Center', slug: 'strict-plus', contact_email: 'plus@example.invalid', status: 'active', subscription_plan: 'premium', billing_cycle: 'monthly', subscription_status: 'active', subscription_terms: plusTerms, max_children: 150, subscription_started_at: db.raw("NOW() - INTERVAL '5 days'"), subscription_ends_at: FUTURE },
        { name: 'Expired Plus Center', slug: 'strict-expired-plus', contact_email: 'exp@example.invalid', status: 'active', subscription_plan: 'premium', billing_cycle: 'monthly', subscription_status: 'cancelled', subscription_terms: plusTerms, max_children: 150, subscription_started_at: db.raw("NOW() - INTERVAL '35 days'"), subscription_ends_at: PAST },
        { name: 'Suspended Center', slug: 'strict-suspended', contact_email: 'susp@example.invalid', status: 'suspended', subscription_plan: 'premium', billing_cycle: 'monthly', subscription_status: 'active', subscription_terms: plusTerms, max_children: 150, subscription_started_at: db.raw("NOW() - INTERVAL '5 days'"), subscription_ends_at: FUTURE },
      ])
      .returning('*');

    const [owner] = await db('users')
      .insert({ name: 'Platform Owner', email: 'strict-owner@example.invalid', role_id: 0, status: 'active', password_hash: 'synthetic' })
      .returning('*');

    const password = 'Synthetic-strict-policy!';
    const hash = await bcrypt.hash(password, 4);

    const [stdAdmin, stdParent, plusAdmin, expAdmin, suspAdmin] = await db('users')
      .insert([
        { name: 'Std Admin', email: 'strict-std-admin@example.invalid', role_id: 1, daycare_id: stdDaycare.id, status: 'active', password_hash: hash },
        { name: 'Std Parent', email: 'strict-std-parent@example.invalid', role_id: 3, daycare_id: stdDaycare.id, status: 'active', password_hash: hash },
        { name: 'Plus Admin', email: 'strict-plus-admin@example.invalid', role_id: 1, daycare_id: plusDaycare.id, status: 'active', password_hash: hash },
        { name: 'Expired Admin', email: 'strict-exp-admin@example.invalid', role_id: 1, daycare_id: expiredPlusDaycare.id, status: 'active', password_hash: hash },
        { name: 'Suspended Admin', email: 'strict-susp-admin@example.invalid', role_id: 1, daycare_id: suspendedDaycare.id, status: 'active', password_hash: hash },
      ])
      .returning('*');

    await db('children').insert([
      { full_name: 'Active Child One', dob: '2022-03-01', enrollment_status: 'active', daycare_id: stdDaycare.id },
      { full_name: 'Inactive Child Two', dob: '2022-04-01', enrollment_status: 'inactive', daycare_id: stdDaycare.id },
    ]);

    const subscriptions = createSubscriptions(pool);
    const stdSummary = await subscriptions.summary(stdDaycare.id);
    assert.equal(stdSummary.active_children_count, 1);
    assert.equal(stdSummary.max_children, 1);
    assert.equal(stdSummary.package_code, 'standard');

    // Resume cannot fall back to 'trialing' when subscription_ends_at is already in the past.
    await assert.rejects(
      subscriptions.action(
        expiredPlusDaycare.id,
        { action: 'resume', version: expiredPlusDaycare.version, request_key: 'strict-resume-expired-01', reason: 'Attempt invalid resume past period' },
        owner.id
      ),
      (err) => err.statusCode === 409
    );

    // Bind runtime config/db to this isolated DB for saas.service + app.js HTTP checks.
    process.env.NODE_ENV = 'test';
    process.env.DAYCARE_AUTH_ENABLED = 'false';
    process.env.JWT_SECRET = 'synthetic-strict-policy-jwt-secret';
    const dbPath = require.resolve('../src/config/db');
    const saasPath = require.resolve('../src/modules/saas/saas.service');
    const appPath = require.resolve('../src/app');
    const previousDb = require.cache[dbPath];
    const previousSaas = require.cache[saasPath];
    const previousApp = require.cache[appPath];
    const tenant = createTenantPool(pool);
    tenant.control = pool;
    let server;
    try {
      require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: tenant };
      delete require.cache[saasPath];
      delete require.cache[appPath];
      const saas = require(saasPath);

      await db('subscription_packages').where({ code: 'standard' }).update({ monthly_price: '1000.00' });
      await db('subscription_packages').where({ code: 'premium' }).update({ monthly_price: '2500.00' });
      const payments = createPaymentService(pool, {
        apiKey: 'synthetic-strict-key',
        accounts: { cbe: { enabled: true, account_holder: 'Synthetic receiver', account_number: '0911234567' } },
        fetch: async (_url, options) => {
          const input = JSON.parse(options.body);
          const expectedAmount = input.reference.includes('PLUS') ? '2500.00' : '1000.00';
          return {
            ok: true,
            json: async () => ({
              success: true,
              data: {
                status: 'success',
                reference: input.reference,
                amount: expectedAmount,
                currency: 'ETB',
                receiverName: 'Synthetic receiver',
                receiverAccount: '0911234567',
                transactionDate: new Date().toISOString(),
              },
            }),
          };
        },
      });
      const stdPay = await payments.create({ provider: 'cbe', package_code: 'standard', billing_cycle: 'monthly', email: 'pending-admin-std@example.invalid' });
      await payments.verify(stdPay.id, { token: stdPay.token, provider: 'cbe', reference: 'https://mbreciept.cbe.com.et/STRICT-STD-1' });
      const pendingStd = (await saas.registerDaycare({
        daycareName: 'Pending Std App',
        contactEmail: 'pending-std@example.invalid',
        adminName: 'Pending Admin',
        adminEmail: 'pending-admin-std@example.invalid',
        adminPassword: password,
        payment_intent_id: stdPay.id,
        payment_token: stdPay.token,
      })).application;

      const plusPay = await payments.create({ provider: 'cbe', package_code: 'premium', billing_cycle: 'monthly', email: 'pending-admin-plus@example.invalid' });
      await payments.verify(plusPay.id, { token: plusPay.token, provider: 'cbe', reference: 'https://mbreciept.cbe.com.et/STRICT-PLUS-1' });
      await saas.registerDaycare({
        daycareName: 'Pending Plus App',
        contactEmail: 'pending-plus@example.invalid',
        adminName: 'Pending Plus Admin',
        adminEmail: 'pending-admin-plus@example.invalid',
        adminPassword: password,
        payment_intent_id: plusPay.id,
        payment_token: plusPay.token,
      });

      const listed = await saas.listDaycares();
      assert.equal(listed.find((d) => d.slug === 'pending-std-app')?.max_children, 50);
      assert.equal(listed.find((d) => d.slug === 'pending-plus-app')?.max_children, 150);

      // Tampered package code in persisted payment intent terms must be rejected by approveApplication.
      await db('subscription_payment_intents')
        .where({ id: stdPay.id })
        .update({ terms: { code: 'invalid_tier', max_children: 50, billing_cycle: 'monthly', price: '1000.00' } });
      await assert.rejects(
        saas.approveApplication(pendingStd.id, { plan: 'standard' }, owner.id),
        (err) => err.statusCode === 409 || err.statusCode === 422
      );

      const app = require(appPath);
      server = app.listen(0, '127.0.0.1');
      await require('node:events').once(server, 'listening');
      const base = `http://127.0.0.1:${server.address().port}/api`;
      const req = async (method, path, token, body) => {
        const res = await fetch(base + path, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        let data = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }
        return { status: res.status, body: data };
      };
      const loginToken = async (email) => {
        const res = await req('POST', '/auth/login', null, { email, password });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        return res.body.token;
      };

      // Obtain token before suspension to verify active sessions also fail closed after suspension.
      await db('daycares').where({ id: suspendedDaycare.id }).update({ status: 'active' });
      const stdToken = await loginToken(stdAdmin.email);
      const stdParentToken = await loginToken(stdParent.email);
      const plusToken = await loginToken(plusAdmin.email);
      const expToken = await loginToken(expAdmin.email);
      const suspToken = await loginToken(suspAdmin.email);
      await db('daycares').where({ id: suspendedDaycare.id }).update({ status: 'suspended' });
      const suspLoginAfter = await req('POST', '/auth/login', null, { email: suspAdmin.email, password });
      assert.equal(suspLoginAfter.status, 403);

      // Standard blocked from all Plus APIs (admin + parent store/demo gates).
      for (const [method, url, token, body] of [
        ['GET', '/plus/analytics', stdToken],
        ['GET', '/plus/analytics/export.csv', stdToken],
        ['GET', '/staff-scheduling', stdToken],
        ['GET', '/billing-automation/settings', stdToken],
        ['GET', '/billing-automation/history', stdToken],
        ['POST', '/billing-automation/run', stdToken, {}],
        ['GET', '/store/products', stdToken],
        ['POST', '/store/products', stdToken, { name: 'Item', price: 100 }],
        ['GET', '/store/categories', stdToken],
        ['POST', '/store/categories', stdToken, { name: 'Supplies' }],
        ['POST', '/store/orders', stdParentToken, { items: [] }],
        ['POST', '/payments/demo', stdParentToken, { order_id: 1 }],
      ]) {
        const r = await req(method, url, token, body);
        assert.equal(r.status, 403, `Expected 403 on ${method} ${url} for Standard, got ${r.status}`);
        assert.equal(r.body?.code, 'FEATURE_NOT_INCLUDED', `Expected FEATURE_NOT_INCLUDED on ${method} ${url}`);
      }
      const stdPayCap = await req('GET', '/payments/capabilities', stdParentToken);
      assert.equal(stdPayCap.status, 200);
      assert.equal(stdPayCap.body?.demo_enabled, false);
      assert.equal((await req('GET', '/store/orders/my', stdParentToken)).status, 200);

      // Standard still retains existing shop order read endpoint and active child quota check.
      assert.equal((await req('GET', '/store/orders', stdToken)).status, 200);
      const quotaFail = await req('POST', '/children', stdToken, { full_name: 'Over Quota Child', dob: '2023-01-01', enrollment_status: 'active' });
      assert.ok(quotaFail.status >= 400 && quotaFail.status < 500, `Expected 4xx on child over max_children quota, got ${quotaFail.status}`);
      assert.equal(
        Number((await db('children').where({ daycare_id: stdDaycare.id, enrollment_status: 'active' }).count('* AS c').first()).c),
        1
      );

      // Active Plus allowed on Plus routes and snapshot exposes package + features cleanly.
      const plusSnap = await req('GET', '/portal/snapshot', plusToken);
      assert.equal(plusSnap.status, 200);
      assert.equal(plusSnap.body.daycare.package_code, 'premium');
      assert.equal(plusSnap.body.daycare.subscription_active, true);
      assert.equal(plusSnap.body.daycare.features.business_analytics, true);
      assert.equal((await req('GET', '/plus/analytics', plusToken)).status, 200);
      assert.equal((await req('GET', '/staff-scheduling', plusToken)).status, 200);
      assert.equal((await req('GET', '/billing-automation/settings', plusToken)).status, 200);
      assert.equal((await req('GET', '/billing-automation/history', plusToken)).status, 200);
      assert.equal((await req('GET', '/store/products', plusToken)).status, 200);
      assert.equal((await req('GET', '/store/categories', plusToken)).status, 200);

      // Expired Plus preserves reads/snapshot with features=false, blocks Plus features & general mutations.
      const expSnap = await req('GET', '/portal/snapshot', expToken);
      assert.equal(expSnap.status, 200);
      assert.equal(expSnap.body.daycare.subscription_active, false);
      assert.equal(expSnap.body.daycare.features.shop, false);
      assert.equal((await req('GET', '/plus/analytics', expToken)).status, 403);
      assert.equal((await req('GET', '/staff-scheduling', expToken)).status, 403);
      assert.equal((await req('GET', '/store/products', expToken)).status, 403);
      const expCreateChild = await req('POST', '/children', expToken, { full_name: 'Blocked Child', dob: '2023-01-01' });
      assert.equal(expCreateChild.status, 403);
      assert.equal(expCreateChild.body?.code, 'SUBSCRIPTION_EXPIRED');

      // Suspended tenant fails closed on tenant routes (auth revokes session at 401; guards enforce 403).
      assert.ok([401, 403].includes((await req('GET', '/portal/snapshot', suspToken)).status));
    } finally {
      if (server) {
        server.closeAllConnections?.();
        await new Promise((resolve) => server.close(resolve));
      }
      if (previousDb) require.cache[dbPath] = previousDb;
      else delete require.cache[dbPath];
      if (previousSaas) require.cache[saasPath] = previousSaas;
      else delete require.cache[saasPath];
      if (previousApp) require.cache[appPath] = previousApp;
      else delete require.cache[appPath];
    }
  });
});
