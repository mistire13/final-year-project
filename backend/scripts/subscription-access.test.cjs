'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSubscriptionAccess, isCareWrite } = require('../src/middleware/subscription-access');

async function check(method, url, end) {
  const middleware = createSubscriptionAccess({query: async () => ({rows: [{subscription_ends_at: end}]})}, () => Date.parse('2026-11-06T00:00:00Z'));
  const req = { method, originalUrl: url, user: {daycare_id: 1} };
  const res = {status(value) {this.statusCode=value; return this;}, json(value) {this.body=value; return this;}};
  let called = false;
  await middleware(req, res, error => { if (error) throw error; called=true; });
  return {called, res};
}

test('expired subscriptions block operational writes while preserving safety and reads', async () => {
  for (const route of ['/api/portal/attendance', '/api/portal/checkout', '/api/portal/assignments', '/api/biometric/verify', '/api/health', '/api/alerts', '/api/communication/alerts']) {
    assert.equal((await check('POST', route, '2026-11-05T00:00:00Z')).called, true, route);
  }
  assert.equal((await check('PATCH', '/api/health/12/notify', '2026-11-05T00:00:00Z')).called, true);
  assert.equal((await check('GET', '/api/children', '2026-11-05T00:00:00Z')).called, true);
  const denied = await check('POST', '/api/children', '2026-11-05T00:00:00Z');
  assert.equal(denied.res.statusCode, 403);
  assert.equal(denied.res.body.code, 'SUBSCRIPTION_EXPIRED');
  assert.equal(isCareWrite('POST', '/api/biometric/enroll'), false);
});

test('active and legacy subscriptions can write; expiry is evaluated at request time', async () => {
  assert.equal((await check('POST', '/api/children', '2026-11-07T00:00:00Z')).called, true);
  assert.equal((await check('POST', '/api/children', null)).called, true);
  assert.equal((await check('POST', '/api/children', '2026-11-06T00:00:00Z')).called, false);
});
