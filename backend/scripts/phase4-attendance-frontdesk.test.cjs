'use strict';

/**
 * Phase 4 Test Suite: Attendance, Front-Desk Shifts & Verified Pickup Transitions.
 * Runs against an isolated, generated PostgreSQL database.
 * Verifies:
 *   - B10 & FR-DESK-01: Front-desk duty assignment, daycare scoping, shift validation, overlap prevention, and revocation.
 *   - FR-ATT-06: Attendance state machine transitions and conflicting state prevention (no repeated check-in, no direct checkout).
 *   - FR-DESK-02 & FR-DESK-03: Front-desk duty enforcement for staff (duty required unless assigned classroom caregiver; capability scoping).
 *   - FR-ATT-07, FR-BIO-06 & UC-12: Front-desk pickup verification, authorized guardian checks, active adult status, and audit logging.
 *   - Daycare isolation across attendance monitor grid and center summary statistics.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { withCurrentDatabase, assertTestDatabaseName } = require('./helpers/auth-test-database.cjs');

const password = 'Test-password-phase4!';
const secret = 'synthetic-phase-four-jwt-secret-for-testing';

function makeActor(user, roleName) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: roleName,
    daycare_id: user.daycare_id,
    status: user.status || 'active',
  };
}

async function fixture(db) {
  const suffix = randomBytes(4).toString('hex');
  await db('roles').insert([
    { id: 0, name: 'super_admin' },
    { id: 1, name: 'admin' },
    { id: 2, name: 'caregiver' },
    { id: 3, name: 'parent' },
  ]).onConflict('id').ignore();

  // Create two daycares
  const [daycareA, daycareB] = await db('daycares').insert([
    { name: `Daycare A ${suffix}`, slug: `daycare-a-${suffix}`, contact_email: `daycare-a-${suffix}@example.invalid`, status: 'active' },
    { name: `Daycare B ${suffix}`, slug: `daycare-b-${suffix}`, contact_email: `daycare-b-${suffix}@example.invalid`, status: 'active' },
  ]).returning('*');

  const passwordHash = await bcrypt.hash(password, 4);

  // Users for Daycare A
  const [adminA, caregiverA1, caregiverA2, parentA, unauthorizedAdultA] = await db('users').insert([
    { name: 'Admin A', email: `admin-a-${suffix}@example.invalid`, role_id: 1, daycare_id: daycareA.id, password_hash: passwordHash, status: 'active' },
    { name: 'Caregiver A1', email: `caregiver-a1-${suffix}@example.invalid`, role_id: 2, daycare_id: daycareA.id, password_hash: passwordHash, status: 'active' },
    { name: 'Caregiver A2', email: `caregiver-a2-${suffix}@example.invalid`, role_id: 2, daycare_id: daycareA.id, password_hash: passwordHash, status: 'active' },
    { name: 'Parent A', email: `parent-a-${suffix}@example.invalid`, role_id: 3, daycare_id: daycareA.id, password_hash: passwordHash, status: 'active' },
    { name: 'Adult Unauth A', email: `unauth-a-${suffix}@example.invalid`, role_id: 3, daycare_id: daycareA.id, password_hash: passwordHash, status: 'active' },
  ]).returning('*');

  // Users for Daycare B
  const [adminB, caregiverB, parentB] = await db('users').insert([
    { name: 'Admin B', email: `admin-b-${suffix}@example.invalid`, role_id: 1, daycare_id: daycareB.id, password_hash: passwordHash, status: 'active' },
    { name: 'Caregiver B', email: `caregiver-b-${suffix}@example.invalid`, role_id: 2, daycare_id: daycareB.id, password_hash: passwordHash, status: 'active' },
    { name: 'Parent B', email: `parent-b-${suffix}@example.invalid`, role_id: 3, daycare_id: daycareB.id, password_hash: passwordHash, status: 'active' },
  ]).returning('*');

  // Groups
  const [groupA] = await db('groups').insert([
    { name: `Toddlers A ${suffix}`, daycare_id: daycareA.id },
  ]).returning('*');

  const [groupB] = await db('groups').insert([
    { name: `Toddlers B ${suffix}`, daycare_id: daycareB.id },
  ]).returning('*');

  // Children
  const [childA1] = await db('children').insert([
    {
      full_name: `Child Alpha 1 ${suffix}`,
      dob: '2022-01-01',
      gender: 'female',
      group_id: groupA.id,
      caregiver_id: caregiverA1.id,
      enrollment_status: 'active',
      daycare_id: daycareA.id,
    },
  ]).returning('*');

  const [childA2] = await db('children').insert([
    {
      full_name: `Child Alpha 2 ${suffix}`,
      dob: '2022-02-02',
      gender: 'male',
      group_id: groupA.id,
      caregiver_id: caregiverA2.id, // assigned to Caregiver A2, NOT Caregiver A1
      enrollment_status: 'active',
      daycare_id: daycareA.id,
    },
  ]).returning('*');

  const [childB] = await db('children').insert([
    {
      full_name: `Child Beta ${suffix}`,
      dob: '2022-03-03',
      gender: 'male',
      group_id: groupB.id,
      caregiver_id: caregiverB.id,
      enrollment_status: 'active',
      daycare_id: daycareB.id,
    },
  ]).returning('*');

  // Guardian links for Child A1
  const [linkA1] = await db('guardian_links').insert([
    { child_id: childA1.id, user_id: parentA.id, relationship: 'Mother', pickup_authorized: true, created_by: adminA.id },
    { child_id: childA1.id, user_id: unauthorizedAdultA.id, relationship: 'Neighbor', pickup_authorized: false, created_by: adminA.id },
  ]).returning('*');

  return {
    daycareA,
    daycareB,
    adminA: makeActor(adminA, 'admin'),
    caregiverA1: makeActor(caregiverA1, 'caregiver'),
    caregiverA2: makeActor(caregiverA2, 'caregiver'),
    parentA: makeActor(parentA, 'parent'),
    unauthorizedAdultA: makeActor(unauthorizedAdultA, 'parent'),
    adminB: makeActor(adminB, 'admin'),
    caregiverB: makeActor(caregiverB, 'caregiver'),
    parentB: makeActor(parentB, 'parent'),
    childA1,
    childA2,
    childB,
    linkA1,
  };
}

function setupContext(pool) {
  const sourceRoot = path.resolve(__dirname, '../src') + path.sep;
  for (const file of Object.keys(require.cache)) {
    if (file.startsWith(sourceRoot)) delete require.cache[file];
  }
  const dbFile = require.resolve('../src/config/db');
  require.cache[dbFile] = { id: dbFile, filename: dbFile, loaded: true, exports: pool };
  process.env.JWT_SECRET = secret;

  return {
    portalService: require('../src/modules/portal/portal.service'),
    attendanceService: require('../src/modules/attendance/attendance.service'),
    auditService: require('../src/modules/audit/audit.service'),
  };
}

test('Phase 4: Attendance, Front-Desk Shifts & Verified Pickup Transitions', async (t) => {
  await withCurrentDatabase(async ({ db, pool, name }) => {
    assertTestDatabaseName(name);
    const f = await fixture(db);
    const mod = setupContext(pool);
    await t.test('Portal HTTP: assigned caregiver can log in and check in without a shift', async () => {
      process.env.NODE_ENV = 'test';
      process.env.DAYCARE_AUTH_ENABLED = 'false';
      const app = require('../src/app');
      const server = app.listen(0, '127.0.0.1');
      await require('node:events').once(server, 'listening');
      try {
        const base = `http://127.0.0.1:${server.address().port}/api`;
        const request = async (route, body, token) => {
          const response = await fetch(base + route, { method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}) });
          return { status: response.status, body: await response.json() };
        };
        assert.equal((await request('/auth/login', { email: f.caregiverA1.email, password: 'wrong-password' })).status, 401);
        const login = await request('/auth/login', { email: f.caregiverA1.email, password });
        assert.equal(login.status, 200);
        const token = login.body.token;
        const workspace = await request('/portal/workspace', null, token);
        assert.equal(workspace.status, 200);
        assert.deepEqual(workspace.body.children.map(child => child.id), [f.childA1.id]);
        const result = await request('/portal/attendance', { child_id: f.childA1.id, event_type: 'checkin' }, token);
        assert.equal(result.status, 200, JSON.stringify(result.body));
        assert.equal(result.body.recorded_by, f.caregiverA1.id);
        for (const child of [f.childA2, f.childB]) {
          assert.equal((await request('/portal/attendance', { child_id: child.id, event_type: 'checkin' }, token)).status, 403);
        }
        assert.equal((await request('/portal/checkout', { child_id: f.childA1.id, guardian_user_id: f.parentA.id,
          method: 'manual', identity_confirmed: true, reason: 'Checked identification document' }, token)).status, 403);
        await db('attendance').where({ id: result.body.id }).delete();
      } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
      }
    });


    // ─────────────────────────────────────────────────────────────────────────
    // 1. Front-Desk Duty Assignment & Revocation (B10, FR-DESK-01)
    // ─────────────────────────────────────────────────────────────────────────
    await t.test('B10: Admin assigns front-desk duty, prevents invalid shifts, overlaps, and revokes duty', async () => {
      const now = new Date();
      const startsAt = new Date(now.getTime() - 1000 * 60 * 30).toISOString(); // 30 min ago
      const endsAt = new Date(now.getTime() + 1000 * 60 * 60 * 4).toISOString(); // 4 hours later

      // 1. Admin A attempts to assign duty to a caregiver in Daycare B -> 403
      await assert.rejects(
        () => mod.portalService.saveDuty(
          {
            staff_id: f.caregiverB.id,
            starts_at: startsAt,
            ends_at: endsAt,
            can_attendance: true,
            can_pickup: true,
          },
          f.adminA
        ),
        (err) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /Caregiver must belong to your daycare center/i);
          return true;
        }
      );

      // 2. Admin A attempts shift with invalid duration (> 16 hours)
      const longEnd = new Date(now.getTime() + 1000 * 60 * 60 * 20).toISOString();
      await assert.rejects(
        () => mod.portalService.saveDuty(
          {
            staff_id: f.caregiverA1.id,
            starts_at: startsAt,
            ends_at: longEnd,
            can_attendance: true,
            can_pickup: true,
          },
          f.adminA
        ),
        (err) => {
          assert.match(err.message, /at most 16 hours/i);
          return true;
        }
      );

      // 3. Admin A successfully assigns front-desk duty to Caregiver A1
      const duty = await mod.portalService.saveDuty(
        {
          staff_id: f.caregiverA1.id,
          starts_at: startsAt,
          ends_at: endsAt,
          can_attendance: true,
          can_pickup: true,
        },
        f.adminA
      );

      assert.ok(duty.id);
      assert.equal(duty.staff_id, f.caregiverA1.id);
      assert.equal(duty.status, 'active');
      assert.equal(duty.daycare_id, f.daycareA.id);

      // Verify audit log has FRONT_DESK_ASSIGNED
      const auditLog = await db('audit_logs')
        .where({ action: 'FRONT_DESK_ASSIGNED', target_id: duty.id })
        .first();
      assert.ok(auditLog);
      assert.equal(auditLog.daycare_id, f.daycareA.id);

      // 4. Overlap check: creating an overlapping active shift for Caregiver A1 throws 409
      await assert.rejects(
        () => mod.portalService.saveDuty(
          {
            staff_id: f.caregiverA1.id,
            starts_at: startsAt,
            ends_at: endsAt,
            can_attendance: true,
            can_pickup: false,
          },
          f.adminA
        ),
        (err) => {
          assert.equal(err.statusCode, 409);
          assert.match(err.message, /overlapping shift/i);
          return true;
        }
      );

      // 5. Admin B cannot revoke Daycare A's assignment -> 403
      await assert.rejects(
        () => mod.portalService.revokeDuty(duty.id, f.adminB),
        (err) => {
          assert.equal(err.statusCode, 403);
          return true;
        }
      );

      // 6. Admin A revokes duty successfully
      const revoked = await mod.portalService.revokeDuty(duty.id, f.adminA);
      assert.equal(revoked.status, 'revoked');
      assert.ok(revoked.revoked_at);

      // Revoking already revoked duty throws 409
      await assert.rejects(
        () => mod.portalService.revokeDuty(duty.id, f.adminA),
        (err) => {
          assert.equal(err.statusCode, 409);
          return true;
        }
      );
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Attendance State Machine & Conflicting States (FR-ATT-06)
    // ─────────────────────────────────────────────────────────────────────────
    await t.test('FR-ATT-06: Attendance state machine prevents invalid and conflicting states', async () => {
      // 1. Direct checkout via recordAttendance is blocked (must use verified pickup flow)
      await assert.rejects(
        () => mod.portalService.recordAttendance(
          { child_id: f.childA1.id, event_type: 'checkout' },
          f.adminA
        ),
        (err) => {
          assert.equal(err.statusCode, 409);
          assert.match(err.message, /Use the verified front-desk pickup flow/i);
          return true;
        }
      );

      // 2. Initial checkin succeeds
      const checkin = await mod.portalService.recordAttendance(
        { child_id: f.childA1.id, event_type: 'checkin', notes: 'Arrived smiling' },
        f.adminA
      );
      assert.equal(checkin.event_type, 'checkin');
      assert.equal(checkin.child_id, f.childA1.id);
      assert.equal(checkin.daycare_id, f.daycareA.id);

      // 3. Repeated checkin on same day is blocked (409)
      await assert.rejects(
        () => mod.portalService.recordAttendance(
          { child_id: f.childA1.id, event_type: 'checkin', notes: 'Trying again' },
          f.adminA
        ),
        (err) => {
          assert.equal(err.statusCode, 409);
          assert.match(err.message, /Attendance already recorded/i);
          return true;
        }
      );

      // 4. Marking absent when already checked in is blocked (409)
      await assert.rejects(
        () => mod.portalService.recordAttendance(
          { child_id: f.childA1.id, event_type: 'absent' },
          f.adminA
        ),
        (err) => {
          assert.equal(err.statusCode, 409);
          assert.match(err.message, /Attendance already recorded/i);
          return true;
        }
      );
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Front-Desk Staff Scope & Duty Enforcement (FR-DESK-02, FR-DESK-03)
    // ─────────────────────────────────────────────────────────────────────────
    await t.test('FR-DESK-03: Staff requires active duty or classroom assignment to record attendance/pickup', async () => {
      // Child A2 is assigned to Caregiver A2, NOT Caregiver A1.
      // Caregiver A1 has NO active front-desk assignment currently (we revoked the earlier one).

      // 1. Caregiver A1 attempts attendance for Child A2 -> 403
      await assert.rejects(
        () => mod.portalService.recordAttendance(
          { child_id: f.childA2.id, event_type: 'checkin' },
          f.caregiverA1,
          true // regular caregiver mode
        ),
        (err) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /No active front-desk assignment/i);
          return true;
        }
      );

      // 2. Classroom Caregiver A2 can record attendance for their own assigned Child A2
      const recA2 = await mod.portalService.recordAttendance(
        { child_id: f.childA2.id, event_type: 'checkin', notes: 'In classroom' },
        f.caregiverA2,
        true
      );
      assert.equal(recA2.child_id, f.childA2.id);

      // 3. Assign front-desk duty to Caregiver A1 with can_attendance=true, can_pickup=false
      const now = new Date();
      const duty = await mod.portalService.saveDuty(
        {
          staff_id: f.caregiverA1.id,
          starts_at: new Date(now.getTime() - 1000 * 60 * 15).toISOString(),
          ends_at: new Date(now.getTime() + 1000 * 60 * 60 * 2).toISOString(),
          can_attendance: true,
          can_pickup: false, // NOT allowed for pickup
        },
        f.adminA
      );
      assert.ok(duty.id);

      // 4. Caregiver A1 attempts pickup for Child A1 -> 403 (because can_pickup is false)
      await assert.rejects(
        () => mod.portalService.checkout(
          {
            child_id: f.childA1.id,
            guardian_user_id: f.parentA.id,
            method: 'manual',
            identity_confirmed: true,
            reason: 'Mother presented National ID card 12345',
          },
          f.caregiverA1
        ),
        (err) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /No active front-desk assignment for this child and action/i);
          return true;
        }
      );

      // 5. Cross-daycare check: Caregiver A1 attempts attendance for Child Beta in Daycare B -> 403
      await assert.rejects(
        () => mod.portalService.recordAttendance(
          { child_id: f.childB.id, event_type: 'checkin' },
          f.caregiverA1
        ),
        (err) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /Child does not belong to your daycare center/i);
          return true;
        }
      );
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Verified Child Pickup & Guardian Validation (FR-ATT-07, FR-BIO-06, UC-12)
    // ─────────────────────────────────────────────────────────────────────────
    await t.test('UC-12: Front-desk pickup enforces authorized guardian, active account, and logs audit', async () => {
      // Child A1 is currently checked in from Test 2.

      // 1. Attempt pickup with unauthorized adult (pickup_authorized = false) -> 403
      await assert.rejects(
        () => mod.portalService.checkout(
          {
            child_id: f.childA1.id,
            guardian_user_id: f.unauthorizedAdultA.id,
            method: 'manual',
            identity_confirmed: true,
            reason: 'Neighbor arrived to collect child',
          },
          f.adminA
        ),
        (err) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /not currently authorized for pickup/i);
          return true;
        }
      );

      // 2. Attempt pickup with parent from Daycare B -> 403
      await assert.rejects(
        () => mod.portalService.checkout(
          {
            child_id: f.childA1.id,
            guardian_user_id: f.parentB.id,
            method: 'manual',
            identity_confirmed: true,
            reason: 'Cross daycare adult attempt',
          },
          f.adminA
        ),
        (err) => {
          assert.equal(err.statusCode, 403);
          return true;
        }
      );

      // 3. Attempt pickup with insufficient reason text (< 12 characters) -> 422
      await assert.rejects(
        () => mod.portalService.checkout(
          {
            child_id: f.childA1.id,
            guardian_user_id: f.parentA.id,
            method: 'manual',
            identity_confirmed: true,
            reason: 'short',
          },
          f.adminA
        ),
        (err) => {
          assert.equal(err.statusCode, 422);
          assert.match(err.message, /Record the identity check performed/i);
          return true;
        }
      );

      // 4. Valid manual verified pickup
      const result = await mod.portalService.checkout(
        {
          child_id: f.childA1.id,
          guardian_user_id: f.parentA.id,
          method: 'manual',
          identity_confirmed: true,
          reason: 'Mother presented government issued driver license #ETH987654',
        },
        f.adminA
      );

      assert.ok(result.attendance);
      assert.equal(result.attendance.event_type, 'checkout');
      assert.equal(result.attendance.child_id, f.childA1.id);

      assert.ok(result.verification);
      assert.equal(result.verification.result, 'manual_fallback');
      assert.equal(result.verification.method, 'manual');

      // Verify guardian_verification_events record in database
      const verEvent = await db('guardian_verification_events')
        .where({ id: result.verification.id })
        .first();
      assert.ok(verEvent);
      assert.equal(verEvent.attendance_id, result.attendance.id);
      assert.equal(verEvent.guardian_user_id, f.parentA.id);
      assert.equal(verEvent.verified_by, f.adminA.id);
      assert.match(verEvent.manual_reason, /driver license/i);

      // Verify audit log
      const audit = await db('audit_logs')
        .where({ action: 'PICKUP_COMPLETED', target_id: result.attendance.id })
        .first();
      assert.ok(audit);
      assert.equal(audit.daycare_id, f.daycareA.id);

      // 5. Attempting another checkout for Child A1 is rejected (child is already checked out)
      await assert.rejects(
        () => mod.portalService.checkout(
          {
            child_id: f.childA1.id,
            guardian_user_id: f.parentA.id,
            method: 'manual',
            identity_confirmed: true,
            reason: 'Mother trying second checkout attempt',
          },
          f.adminA
        ),
        (err) => {
          assert.equal(err.statusCode, 409);
          assert.match(err.message, /Child must be checked in before pickup/i);
          return true;
        }
      );
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Attendance Monitor & Aggregations Scoping
    // ─────────────────────────────────────────────────────────────────────────
    await t.test('Admin attendance grid and summary counts isolate by daycare tenant', async () => {
      // Daycare A has Child A1 (checked out) and Child A2 (checked in)
      const listA = await mod.attendanceService.listAttendance({}, f.adminA);
      const childIdsA = listA.grid.map(c => c.child_id);
      assert.ok(childIdsA.includes(f.childA1.id));
      assert.ok(childIdsA.includes(f.childA2.id));
      assert.ok(!childIdsA.includes(f.childB.id), 'Daycare A attendance grid must not show Daycare B child');

      assert.equal(listA.summary.total_enrolled, 2);
      assert.equal(listA.summary.checked_in, 1);
      assert.equal(listA.summary.checked_out, 1);

      // Center summary aggregation for Admin A
      const summaryA = await mod.attendanceService.getAttendanceSummary({}, f.adminA);
      assert.equal(summaryA.center_summary.total_active_children, 2);
      assert.equal(summaryA.center_summary.total_checkins, 2);

      // Daycare B admin sees 0 checkins
      const summaryB = await mod.attendanceService.getAttendanceSummary({}, f.adminB);
      assert.equal(summaryB.center_summary.total_active_children, 1);
      assert.equal(summaryB.center_summary.total_checkins, 0);

      // Non-admin cannot view center summary
      await assert.rejects(
        () => mod.attendanceService.getAttendanceSummary({}, f.caregiverA1),
        (err) => {
          assert.equal(err.statusCode, 403);
          return true;
        }
      );
    });

  });
});
