'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { adminNavigationForFeatures, subscriptionDisplayState } = require('../src/portal/subscriptions.ts');

const groups = [
  { group: 'Daily operations', items: [['staff-scheduling', 'Front-desk shifts · Plus', 'clock'], ['attendance', 'Attendance', 'check']] },
  { group: 'Shop', items: [['store', 'Shop & stock · Plus', 'store'], ['orders', 'Orders & payments', 'file']] },
  { group: 'Analytics', items: [['business', 'Business reports · Plus', 'chart']] },
];
const keys = navigation => navigation.flatMap(group => group.items.map(item => item[0]));

test('Standard hides unavailable Plus tools but keeps order history; active entitlements reveal only their tools', () => {
  const standard = adminNavigationForFeatures(groups, {}, false);
  assert.deepEqual(keys(standard), ['attendance', 'orders']);
  assert.equal(standard.some(group => group.group === 'Analytics'), false);
  const partial = adminNavigationForFeatures(groups, { shop: true }, false);
  assert.deepEqual(keys(partial), ['attendance', 'store', 'orders']);
  assert.equal(partial[1].items[0][1], 'Shop & stock');
  assert.deepEqual(keys(adminNavigationForFeatures(groups, {}, true)), ['staff-scheduling', 'attendance', 'store', 'orders', 'business']);
});

test('trial and unavailable access are not misreported as expired paid subscriptions', () => {
  const now = Date.parse('2026-11-13T00:00:00Z');
  assert.equal(subscriptionDisplayState({subscription_status:'trialing', trial_ends_at:'2026-12-09T00:00:00Z', subscription_active:false}, now), 'trial');
  assert.equal(subscriptionDisplayState({subscription_status:'trialing', trial_ends_at:'2026-11-12T00:00:00Z', subscription_active:false}, now), 'expired_trial');
  assert.equal(subscriptionDisplayState({subscription_status:'active', subscription_ends_at:'2026-11-12T00:00:00Z', subscription_active:false}, now), 'expired');
  assert.equal(subscriptionDisplayState({subscription_status:'cancelled', subscription_ends_at:'2026-12-09T00:00:00Z', subscription_active:true}, now), 'cancelled');
  assert.equal(subscriptionDisplayState({subscription_status:'active', subscription_active:false}, now), 'unavailable');
  assert.equal(subscriptionDisplayState(null, now), 'unknown');
});
