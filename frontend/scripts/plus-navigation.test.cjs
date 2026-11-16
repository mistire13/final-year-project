'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { adminNavigationForFeatures, shouldEmbedStaffScheduling, subscriptionDisplayState } = require('../src/portal/subscriptions.ts');

const groups = [
  { group: 'Daily operations', items: [['staff-scheduling', 'Front-desk shifts · Plus', 'clock'], ['attendance', 'Attendance', 'check']] },
  { group: 'Finance', items: [['finances', 'Care fees & invoices', 'file']] },
  { group: 'Shop', items: [['store', 'Shop & stock · Plus', 'store'], ['orders', 'Orders & payments', 'file']] },
  { group: 'Analytics', items: [['business', 'Business reports · Plus', 'chart']] },
];
const keys = navigation => navigation.flatMap(group => group.items.map(item => item[0]));

test('Standard hides the whole shop; active Plus reveals catalogue and orders', () => {
  const standard = adminNavigationForFeatures(groups, {}, false);
  assert.deepEqual(keys(standard), ['attendance', 'finances']);
  assert.equal(standard.some(group => group.group === 'Shop'), false);
  assert.equal(standard.some(group => group.group === 'Analytics'), false);
  const partial = adminNavigationForFeatures(groups, { shop: true }, false);
  assert.deepEqual(keys(partial), ['attendance', 'finances', 'store', 'orders']);
  assert.equal(partial[2].items[0][1], 'Shop & stock');
  assert.deepEqual(keys(adminNavigationForFeatures(groups, {}, true)), ['staff-scheduling', 'attendance', 'finances', 'store', 'orders', 'business']);
});

test('centers with saved orders and no shop access get history only under Finance', () => {
  const navigation = adminNavigationForFeatures(groups, { shop: false }, false, true);
  assert.equal(navigation.some(group => group.group === 'Shop'), false);
  assert.deepEqual(navigation.find(group => group.group === 'Finance').items,
    [['finances', 'Care fees & invoices', 'file'], ['orders', 'Order history', 'file']]);
  assert.equal(keys(navigation).includes('store'), false);
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

test('advanced scheduling embeds only for a live daycare with the Plus feature', () => {
  assert.equal(shouldEmbedStaffScheduling({ features: {} }, false), false);
  assert.equal(shouldEmbedStaffScheduling({ features: { staff_scheduling: true } }, false), true);
  assert.equal(shouldEmbedStaffScheduling({ features: { staff_scheduling: true } }, true), false);
});
