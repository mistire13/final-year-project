'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { withCurrentDatabase, assertTestDatabaseName } = require('./helpers/auth-test-database.cjs');

function setupContext(pool) {
  const sourceRoot = path.resolve(__dirname, '../src') + path.sep;
  for (const file of Object.keys(require.cache)) {
    if (file.startsWith(sourceRoot)) delete require.cache[file];
  }
  const dbFile = require.resolve('../src/config/db');
  require.cache[dbFile] = { id: dbFile, filename: dbFile, loaded: true, exports: pool };
  process.env.JWT_SECRET = 'test-secret';

  return {
    biometricService: require('../src/modules/biometric/biometric.service'),
    portalService: require('../src/modules/portal/portal.service'),
  };
}

test('Biometric device management: slots, R307S enrollment, and pickup identification', async () => {
  await withCurrentDatabase(async ({ db, pool, name }) => {
    assertTestDatabaseName(name);
    const { biometricService, portalService } = setupContext(pool);

    await db('roles').insert([
      { id: 0, name: 'super_admin' },
      { id: 1, name: 'admin' },
      { id: 2, name: 'caregiver' },
      { id: 3, name: 'parent' },
    ]).onConflict('id').ignore();

    // 1. Seed minimal daycare, child, admin, and parent
    const [daycare] = await db('daycares').insert({
      name: 'Biometric Test Daycare',
      slug: 'biometric-test-daycare',
      contact_email: 'center@biometric.test',
      status: 'active',
      subscription_plan: 'standard',
      subscription_status: 'active',
    }).returning('*');

    const [adminRow] = await db('users').insert({
      daycare_id: daycare.id,
      email: 'bio.admin@test.com',
      password_hash: 'hashed',
      name: 'Bio Admin',
      role_id: 1,
      status: 'active',
    }).returning('*');
    const admin = { ...adminRow, role: 'admin' };

    const [parentARow] = await db('users').insert({
      daycare_id: daycare.id,
      email: 'parent.a@test.com',
      password_hash: 'hashed',
      name: 'Abebe Parent',
      role_id: 3,
      status: 'active',
    }).returning('*');
    const parentA = { ...parentARow, role: 'parent' };

    const [parentBRow] = await db('users').insert({
      daycare_id: daycare.id,
      email: 'parent.b@test.com',
      password_hash: 'hashed',
      name: 'Kebede Other',
      role_id: 3,
      status: 'active',
    }).returning('*');
    const parentB = { ...parentBRow, role: 'parent' };

    const [childA] = await db('children').insert({
      daycare_id: daycare.id,
      full_name: 'Daniel Abebe',
      dob: '2023-01-01',
      gender: 'male',
      enrollment_status: 'active',
    }).returning('*');

    const [childB] = await db('children').insert({
      daycare_id: daycare.id,
      full_name: 'Sara Kebede',
      dob: '2023-02-01',
      gender: 'female',
      enrollment_status: 'active',
    }).returning('*');

    // Link Parent A to Child A (authorized)
    const [linkA] = await db('guardian_links').insert({
      daycare_id: daycare.id,
      child_id: childA.id,
      user_id: parentA.id,
      relationship: 'Father',
      pickup_authorized: true,
      created_by: admin.id,
    }).returning('*');

    // Link Parent B to Child B (authorized)
    const [linkB] = await db('guardian_links').insert({
      daycare_id: daycare.id,
      child_id: childB.id,
      user_id: parentB.id,
      relationship: 'Father',
      pickup_authorized: true,
      created_by: admin.id,
    }).returning('*');

    // 2. Check available slots initially
    const slotsInit = await biometricService.getAvailableSlots(admin);
    assert.equal(slotsInit.occupied_slots.length, 0);
    assert.equal(slotsInit.next_slot, 1);
    assert.equal(slotsInit.capacity, 300);

    // 3. Enroll Parent A into slot 5
    const enrolledA = await biometricService.enroll({
      guardian_link_id: linkA.id,
      slot_id: 5,
      device_id: 'R307S',
    }, admin);
    assert.ok(enrolledA.id);

    // Check available slots after enrollment
    const slotsAfter = await biometricService.getAvailableSlots(admin);
    assert.deepEqual(slotsAfter.occupied_slots, [5]);
    assert.equal(slotsAfter.next_slot, 1); // 1 is still free

    // 4. Test identification by slot
    // Parent A scans slot 5 for Child A -> authorized
    const identifyOk = await biometricService.identifyGuardianBySlot(childA.id, 5, admin);
    assert.equal(identifyOk.matched, true);
    assert.equal(identifyOk.authorized, true);
    assert.equal(identifyOk.guardian.name, 'Abebe Parent');
    assert.equal(identifyOk.guardian.relationship, 'Father');

    // Parent A scans slot 5 for Child B -> NOT authorized (Parent A cannot pick up Child B)
    const identifyDenied = await biometricService.identifyGuardianBySlot(childB.id, 5, admin);
    assert.equal(identifyDenied.matched, true);
    assert.equal(identifyDenied.authorized, false);
    assert.ok(identifyDenied.reason.includes('not an authorized pickup contact'));

    // Unknown slot 99 -> not matched
    const identifyUnknown = await biometricService.identifyGuardianBySlot(childA.id, 99, admin);
    assert.equal(identifyUnknown.matched, false);
    assert.equal(identifyUnknown.authorized, false);

    // 5. Check in Child A first so checkout is allowed
    await db('attendance').insert({
      child_id: childA.id,
      recorded_by: admin.id,
      event_type: 'checkin',
      daycare_id: daycare.id,
    });

    // 6. Complete biometric checkout for Child A
    const checkoutResult = await portalService.checkout({
      child_id: childA.id,
      method: 'biometric',
      guardian_user_id: parentA.id,
      reason: 'Biometric scan verified at front desk via R307S (Slot #5)',
      match_score: 0.95,
    }, admin);

    assert.equal(checkoutResult.attendance.event_type, 'checkout');
    assert.equal(checkoutResult.verification.result, 'success');
    assert.equal(checkoutResult.verification.method, 'biometric');

    // Verify audit log
    const auditLogs = await db('audit_logs')
      .where({ daycare_id: daycare.id, action: 'PICKUP_COMPLETED' });
    assert.ok(auditLogs.length >= 1);
  });
});
