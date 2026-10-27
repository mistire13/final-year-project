'use strict';

/**
 * Phase 5 Test Suite: Daily Activity Reporting, Health Observations & Metrics Reconciliation.
 * Runs against an isolated, generated PostgreSQL database.
 * Verifies:
 *   - B11: Health observation/incident creation and notification restricted to assigned caregiver and daycare tenant.
 *   - B14: Caregiver completion monitor accurately counts assigned, submitted, and missing reports without row multiplication.
 *   - B17: Daily date synchronization and presence metrics correctly deduct checked-out children from currently checked in.
 *   - FR-HIR-06: Non-medical disclaimer returned consistently on all health reporting responses.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { withIsolatedDatabase, assertTestDatabaseName } = require('./helpers/auth-test-database.cjs');

const password = 'Test-password-phase5!';
const secret = 'synthetic-phase-five-jwt-secret-for-testing';

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
  const [adminA, caregiverA1, caregiverA2, parentA] = await db('users').insert([
    { name: 'Admin A', email: `admin-a-${suffix}@example.invalid`, role_id: 1, daycare_id: daycareA.id, password_hash: passwordHash, status: 'active' },
    { name: 'Caregiver A1', email: `caregiver-a1-${suffix}@example.invalid`, role_id: 2, daycare_id: daycareA.id, password_hash: passwordHash, status: 'active' },
    { name: 'Caregiver A2', email: `caregiver-a2-${suffix}@example.invalid`, role_id: 2, daycare_id: daycareA.id, password_hash: passwordHash, status: 'active' },
    { name: 'Parent A', email: `parent-a-${suffix}@example.invalid`, role_id: 3, daycare_id: daycareA.id, password_hash: passwordHash, status: 'active' },
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

  // Children for Daycare A:
  // Caregiver A1 has 2 assigned active children: childA1 and childA2
  // Caregiver A2 has 1 assigned active child: childA3
  const [childA1, childA2, childA3] = await db('children').insert([
    {
      full_name: `Child Alpha 1 ${suffix}`,
      dob: '2022-01-01',
      gender: 'female',
      group_id: groupA.id,
      caregiver_id: caregiverA1.id,
      enrollment_status: 'active',
      daycare_id: daycareA.id,
    },
    {
      full_name: `Child Alpha 2 ${suffix}`,
      dob: '2022-02-02',
      gender: 'male',
      group_id: groupA.id,
      caregiver_id: caregiverA1.id,
      enrollment_status: 'active',
      daycare_id: daycareA.id,
    },
    {
      full_name: `Child Alpha 3 ${suffix}`,
      dob: '2022-03-03',
      gender: 'female',
      group_id: groupA.id,
      caregiver_id: caregiverA2.id,
      enrollment_status: 'active',
      daycare_id: daycareA.id,
    },
  ]).returning('*');

  // Child for Daycare B
  const [childB] = await db('children').insert([
    {
      full_name: `Child Beta ${suffix}`,
      dob: '2022-04-04',
      gender: 'male',
      group_id: null,
      caregiver_id: caregiverB.id,
      enrollment_status: 'active',
      daycare_id: daycareB.id,
    },
  ]).returning('*');

  // Guardian Link for Parent A to Child A1
  await db('guardian_links').insert([
    { child_id: childA1.id, user_id: parentA.id, relationship: 'Mother', pickup_authorized: true, created_by: adminA.id },
  ]);

  return {
    daycareA,
    daycareB,
    adminA: makeActor(adminA, 'admin'),
    caregiverA1: makeActor(caregiverA1, 'caregiver'),
    caregiverA2: makeActor(caregiverA2, 'caregiver'),
    parentA: makeActor(parentA, 'parent'),
    adminB: makeActor(adminB, 'admin'),
    caregiverB: makeActor(caregiverB, 'caregiver'),
    parentB: makeActor(parentB, 'parent'),
    childA1,
    childA2,
    childA3,
    childB,
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
    healthService: require('../src/modules/health/health.service'),
    reportsService: require('../src/modules/reports/reports.service'),
    dashboardService: require('../src/modules/dashboard/dashboard.service'),
    portalService: require('../src/modules/portal/portal.service'),
    attendanceService: require('../src/modules/attendance/attendance.service'),
  };
}

test('Phase 5: Daily Reporting, Health Observations & Metrics Reconciliation', async (t) => {
  await withIsolatedDatabase(async ({ db, pool, name }) => {
    assertTestDatabaseName(name);
    const f = await fixture(db);
    const mod = setupContext(pool);

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Health Record Authorization, Scoping & Parent Notification (B11)
    // ─────────────────────────────────────────────────────────────────────────
    await t.test('B11: Caregiver can only create and notify health records for assigned children within own daycare', async () => {
      // 1. Caregiver A1 creates health record for their assigned Child A1 -> succeeds
      const record1 = await mod.healthService.createRecord(
        {
          child_id: f.childA1.id,
          record_type: 'health',
          description: 'Mild scraped knee during outdoor playtime',
          severity: 'low',
          parent_notified: false,
        },
        f.caregiverA1
      );

      assert.ok(record1.id);
      assert.equal(record1.child_id, f.childA1.id);
      assert.equal(record1.daycare_id, f.daycareA.id);
      assert.equal(record1.parent_notified, false);
      assert.match(record1.disclaimer, /does not constitute medical diagnosis/i);

      // Verify audit log has HEALTH_RECORD_CREATED
      const createAudit = await db('audit_logs')
        .where({ action: 'HEALTH_RECORD_CREATED', target_id: record1.id })
        .first();
      assert.ok(createAudit);
      assert.equal(createAudit.daycare_id, f.daycareA.id);

      // 2. Caregiver A2 attempts to create health record for Child A1 (not assigned) -> 403
      await assert.rejects(
        () => mod.healthService.createRecord(
          {
            child_id: f.childA1.id,
            record_type: 'incident',
            description: 'Unassigned caregiver record attempt',
          },
          f.caregiverA2
        ),
        (err) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /not assigned to this child/i);
          return true;
        }
      );

      // 3. Caregiver A2 attempts to notify Child A1 health record -> 403
      await assert.rejects(
        () => mod.healthService.markNotified(record1.id, f.caregiverA2),
        (err) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /not assigned to this child/i);
          return true;
        }
      );

      // 4. Caregiver B from Daycare B attempts to notify Child A1 health record -> 404
      await assert.rejects(
        () => mod.healthService.markNotified(record1.id, f.caregiverB),
        (err) => {
          assert.equal(err.statusCode, 404);
          return true;
        }
      );

      // 5. Assigned Caregiver A1 marks health record as notified -> succeeds
      const notified = await mod.healthService.markNotified(record1.id, f.caregiverA1);
      assert.equal(notified.id, record1.id);
      assert.equal(notified.parent_notified, true);
      assert.match(notified.disclaimer, /does not constitute medical diagnosis/i);

      // Verify audit log has HEALTH_RECORD_NOTIFIED
      const notifyAudit = await db('audit_logs')
        .where({ action: 'HEALTH_RECORD_NOTIFIED', target_id: record1.id })
        .first();
      assert.ok(notifyAudit);
      assert.equal(notifyAudit.daycare_id, f.daycareA.id);

      // 6. Linked Parent A can view the health history
      const parentView = await mod.healthService.getChildHealth(f.childA1.id, {}, f.parentA);
      assert.equal(parentView.data.length, 1);
      assert.equal(parentView.data[0].id, record1.id);
      assert.equal(parentView.data[0].parent_notified, true);
      assert.match(parentView.disclaimer, /does not constitute medical diagnosis/i);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Report Completion Monitor Calculations (B14)
    // ─────────────────────────────────────────────────────────────────────────
    await t.test('B14: Caregiver report completion monitor does not multiply counts across assigned children', async () => {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Addis_Ababa', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

      // 1. Initial state: 0 reports submitted
      const monitor0 = await mod.reportsService.listReports({ date: today }, f.adminA);
      const rowA1_0 = monitor0.monitor.find(m => m.caregiver_id === f.caregiverA1.id);
      const rowA2_0 = monitor0.monitor.find(m => m.caregiver_id === f.caregiverA2.id);

      // Caregiver A1 has 2 assigned children, 0 submitted, 2 missing
      assert.equal(rowA1_0.assigned_children, 2);
      assert.equal(rowA1_0.reports_submitted, 0);
      assert.equal(rowA1_0.reports_missing, 2);

      // Caregiver A2 has 1 assigned child, 0 submitted, 1 missing
      assert.equal(rowA2_0.assigned_children, 1);
      assert.equal(rowA2_0.reports_submitted, 0);
      assert.equal(rowA2_0.reports_missing, 1);

      // 2. Caregiver A1 submits 1 report for Child A1
      await mod.reportsService.createReport(
        {
          child_id: f.childA1.id,
          report_date: today,
          sleep_duration_min: 45,
          mood: 'calm',
          general_observations: 'Good afternoon nap',
          meals: [{ meal_type: 'morning_snack', description: 'Apple slices', portion: 'good' }],
          activities: [{ activity_type: 'learning', description: 'Color recognition', location: 'indoor' }],
        },
        f.caregiverA1
      );

      // 3. Monitor state with 1 of 2 reports submitted:
      // B14 verification: reports_submitted MUST be 1 (not 2!) and reports_missing MUST be 1
      const monitor1 = await mod.reportsService.listReports({ date: today }, f.adminA);
      const rowA1_1 = monitor1.monitor.find(m => m.caregiver_id === f.caregiverA1.id);
      assert.equal(rowA1_1.assigned_children, 2);
      assert.equal(rowA1_1.reports_submitted, 1, 'Caregiver with 2 children and 1 report must show exactly 1 submitted');
      assert.equal(rowA1_1.reports_missing, 1, 'Caregiver with 2 children and 1 report must show exactly 1 missing');

      // 4. Caregiver A1 submits second report for Child A2
      await mod.reportsService.createReport(
        {
          child_id: f.childA2.id,
          report_date: today,
          sleep_duration_min: 60,
          mood: 'happy',
          general_observations: 'Very energetic today',
          meals: [{ meal_type: 'lunch', description: 'Rice and peas', portion: 'good' }],
          activities: [{ activity_type: 'play', description: 'Sand play', location: 'outdoor' }],
        },
        f.caregiverA1
      );

      // 5. Monitor state with 2 of 2 reports submitted:
      const monitor2 = await mod.reportsService.listReports({ date: today }, f.adminA);
      const rowA1_2 = monitor2.monitor.find(m => m.caregiver_id === f.caregiverA1.id);
      assert.equal(rowA1_2.assigned_children, 2);
      assert.equal(rowA1_2.reports_submitted, 2);
      assert.equal(rowA1_2.reports_missing, 0);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Dashboard Presence Reconciliation & Addis Ababa Timezone (B17)
    // ─────────────────────────────────────────────────────────────────────────
    await t.test('B17: Dashboard presence metrics deduct checked-out children and synchronize with daily dates', async () => {
      // A previous-day event must stay out of today's presence, including
      // runs in the first 30 minutes after Addis Ababa midnight.
      await db('attendance').insert({
        child_id:f.childA2.id,event_type:'checkin',recorded_by:f.caregiverA1.id,daycare_id:f.daycareA.id,
        event_time:db.raw("((clock_timestamp() AT TIME ZONE 'Africa/Addis_Ababa')::date::timestamp AT TIME ZONE 'Africa/Addis_Ababa') - interval '1 second'")
      });
      // Daycare A has 3 active children, with no current-day check-ins.
      const stats0 = await mod.dashboardService.getStats(f.adminA);
      assert.equal(Number(stats0.enrollment.active), 3);
      assert.equal(Number(stats0.attendance_today.checked_in), 0);
      assert.equal(Number(stats0.attendance_today.checked_out), 0);

      // 1. Child A1 checks in on the current daycare day, at its midnight boundary.
      await db('attendance').insert({
        child_id: f.childA1.id,
        event_type: 'checkin',
        event_time: db.raw("(clock_timestamp() AT TIME ZONE 'Africa/Addis_Ababa')::date::timestamp AT TIME ZONE 'Africa/Addis_Ababa'"),
        notes: 'Arrived on bus',
        recorded_by: f.caregiverA1.id,
        daycare_id: f.daycareA.id,
      });

      const stats1 = await mod.dashboardService.getStats(f.adminA);
      assert.equal(Number(stats1.attendance_today.checked_in), 1);
      assert.equal(Number(stats1.attendance_today.checked_out), 0);

      // 2. Child A1 checks out now (still today in Addis Ababa)
      await db('attendance').insert({
        child_id: f.childA1.id,
        event_type: 'checkout',
        event_time: new Date(),
        notes: 'Collected by mother',
        recorded_by: f.caregiverA1.id,
        daycare_id: f.daycareA.id,
      });

      // B17 verification: Child A1 is checked out, so checked_in MUST be 0 and checked_out MUST be 1
      const stats2 = await mod.dashboardService.getStats(f.adminA);
      assert.equal(Number(stats2.attendance_today.checked_in), 0, 'Checked-out child must not be counted as currently checked in');
      assert.equal(Number(stats2.attendance_today.checked_out), 1, 'Checked-out child must reflect in checked_out count');

      // 3. Verify reports metrics on dashboard:
      // In Test 2, Caregiver A1 submitted 2 reports (for childA1 and childA2).
      // Total active children in Daycare A = 3.
      // So submitted_today = 2, missing_today = 1 (childA3).
      assert.equal(Number(stats2.reports_today.submitted_today), 2);
      assert.equal(Number(stats2.reports_today.missing_today), 1);
    });

  });
});
