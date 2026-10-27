'use strict';

/**
 * Phase 3 Test Suite: Child Profile Protection & Safety Record Integrity.
 * Runs against an isolated, generated PostgreSQL database.
 * Verifies:
 *   - B09: Transactional replacement of care instructions & emergency contacts using dedicated client.
 *   - B15: Report access consistency upon caregiver reassignment (current assigned caregiver authorized, former caregiver revoked).
 *   - Biometric Guardian Enrollment: pickup authorization, active parent account, and tenant isolation enforced.
 *   - Child Deactivation & Safeguards: Deactivation audits cleanly and preserves historical attendance, reports, and care notes.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { withCurrentDatabase, assertTestDatabaseName } = require('./helpers/auth-test-database.cjs');

const password = 'Test-password-phase3!';
const secret = 'synthetic-phase-three-jwt-secret-for-testing';

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

function makeMockReqRes(params, body, user) {
  let statusCode = 200;
  let responseData = null;
  let nextError = null;

  const req = { params: params || {}, body: body || {}, user };
  const res = {
    status(s) {
      statusCode = s;
      return res;
    },
    json(data) {
      responseData = data;
      return res;
    },
    send() {
      return res;
    },
  };
  const next = (err) => {
    if (err) nextError = err;
  };

  return {
    req,
    res,
    next,
    getResult: () => ({ status: statusCode, data: responseData, error: nextError }),
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

  // Child A initially assigned to Caregiver A1
  const [childA] = await db('children').insert([
    {
      full_name: `Child Alpha ${suffix}`,
      dob: '2022-01-01',
      gender: 'female',
      group_id: groupA.id,
      caregiver_id: caregiverA1.id,
      enrollment_status: 'active',
      daycare_id: daycareA.id,
    },
  ]).returning('*');

  // Initial Guardian Link for Parent A (pickup_authorized = true)
  const [linkA] = await db('guardian_links').insert([
    {
      child_id: childA.id,
      user_id: parentA.id,
      relationship: 'Mother',
      pickup_authorized: true,
      created_by: adminA.id,
    },
  ]).returning('*');

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
    childA,
    linkA,
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
    childrenService: require('../src/modules/children/children.service'),
    childrenParentService: require('../src/modules/children/children.parent.service'),
    reportsService: require('../src/modules/reports/reports.service'),
    biometricService: require('../src/modules/biometric/biometric.service'),
    auditService: require('../src/modules/audit/audit.service'),
    attendanceService: require('../src/modules/attendance/attendance.service'),
  };
}

test('Phase 3: Child Profile Protection & Safety Record Integrity', async (t) => {
  await withCurrentDatabase(async ({ db, pool, name }) => {
    assertTestDatabaseName(name);
    const f = await fixture(db);
    const mod = setupContext(pool);

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Transactional Care Instructions Replacement (B09)
    // ─────────────────────────────────────────────────────────────────────────
    await t.test('B09: Care instructions replacement transaction rolls back on invalid input', async () => {
      // 1. Seed initial care instructions directly
      await db('care_instructions').insert([
        { child_id: f.childA.id, category: 'allergy', instruction_text: 'Peanut allergy — severe' },
        { child_id: f.childA.id, category: 'dietary', instruction_text: 'No seafood' },
      ]);

      // 2. Parent attempts update with an invalid category (should reject at validation before DB)
      const mock1 = makeMockReqRes(
        { id: f.childA.id },
        { instructions: [{ category: 'invalid_cat', instruction_text: 'Invalid' }] },
        f.parentA
      );
      await mod.childrenParentService.updateCareInstructions(mock1.req, mock1.res, mock1.next);
      const res1 = mock1.getResult();
      assert.equal(res1.status, 400);

      // Verify original records are unchanged
      const rows1 = await db('care_instructions').where({ child_id: f.childA.id }).orderBy('id', 'asc');
      assert.equal(rows1.length, 2);
      assert.equal(rows1[0].instruction_text, 'Peanut allergy — severe');

      // 3. Valid update replaces all instructions in a single transaction
      const mock2 = makeMockReqRes(
        { id: f.childA.id },
        {
          instructions: [
            { category: 'allergy', instruction_text: 'Dairy intolerance' },
            { category: 'routine', instruction_text: 'Nap after lunch at 13:00' },
          ],
        },
        f.parentA
      );
      await mod.childrenParentService.updateCareInstructions(mock2.req, mock2.res, mock2.next);
      const res2 = mock2.getResult();
      assert.equal(res2.status, 200);
      assert.equal(res2.data.care_instructions.length, 2);

      const rows2 = await db('care_instructions').where({ child_id: f.childA.id }).orderBy('id', 'asc');
      assert.equal(rows2.length, 2);
      assert.equal(rows2[0].category, 'allergy');
      assert.equal(rows2[0].instruction_text, 'Dairy intolerance');
      assert.equal(rows2[1].category, 'general'); // 'routine' mapped to 'general'
      assert.equal(rows2[1].instruction_text, 'Nap after lunch at 13:00');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Transactional Emergency Contacts Replacement (B09)
    // ─────────────────────────────────────────────────────────────────────────
    await t.test('B09: Emergency contacts replacement transaction rolls back on invalid input', async () => {
      // 1. Seed initial emergency contact
      await db('emergency_contacts').insert([
        { child_id: f.childA.id, name: 'Uncle Bob', relationship: 'Uncle', phone: '+251911223344' },
      ]);

      // 2. Parent attempts update with invalid phone
      const mock1 = makeMockReqRes(
        { id: f.childA.id },
        { contacts: [{ name: 'Aunt Alice', relationship: 'Aunt', phone: '123' }] }, // phone < 7 chars
        f.parentA
      );
      await mod.childrenParentService.updateEmergencyContacts(mock1.req, mock1.res, mock1.next);
      const res1 = mock1.getResult();
      assert.equal(res1.status, 400);

      // Verify initial contact is intact
      const rows1 = await db('emergency_contacts').where({ child_id: f.childA.id });
      assert.equal(rows1.length, 1);
      assert.equal(rows1[0].name, 'Uncle Bob');

      // 3. Valid update replaces emergency contacts
      const mock2 = makeMockReqRes(
        { id: f.childA.id },
        {
          contacts: [
            { name: 'Grandma Betty', relationship: 'Grandmother', phone: '+251922334455' },
            { name: 'Grandpa Joe', relationship: 'Grandfather', phone: '+251933445566' },
          ],
        },
        f.parentA
      );
      await mod.childrenParentService.updateEmergencyContacts(mock2.req, mock2.res, mock2.next);
      const res2 = mock2.getResult();
      assert.equal(res2.status, 200);

      const rows2 = await db('emergency_contacts').where({ child_id: f.childA.id }).orderBy('id', 'asc');
      assert.equal(rows2.length, 2);
      assert.equal(rows2[0].name, 'Grandma Betty');
      assert.equal(rows2[1].name, 'Grandpa Joe');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Caregiver Reassignment and Report Access Consistency (B15)
    // ─────────────────────────────────────────────────────────────────────────
    await t.test('B15: Report access follows child current caregiver assignment', async () => {
      // 1. Caregiver A1 creates daily report for Child A
      const today = '2026-10-18';
      const createdReport = await mod.reportsService.createReport(
        {
          child_id: f.childA.id,
          report_date: today,
          sleep_duration_min: 60,
          mood: 'happy',
          general_observations: 'Great day engaging with blocks',
          meals: [{ meal_type: 'lunch', description: 'Vegetable rice', portion: 'good' }],
          activities: [{ activity_type: 'play', description: 'Blocks stacking', location: 'indoor' }],
        },
        f.caregiverA1
      );

      assert.ok(createdReport.id);

      // 2. Caregiver A1 can open the report detail while assigned to Child A
      const repA1 = await mod.reportsService.getReport(createdReport.id, f.caregiverA1);
      assert.equal(repA1.id, createdReport.id);
      assert.equal(repA1.mood, 'happy');

      // 3. Reassign Child A to Caregiver A2
      await mod.childrenService.updateChild(
        f.childA.id,
        { caregiver_id: f.caregiverA2.id, version: (await db('children').where({id:f.childA.id}).first()).version },
        f.adminA
      );

      // 4. Caregiver A2 can list Child A reports history
      const historyA2 = await mod.reportsService.getChildReports(f.childA.id, {}, f.caregiverA2);
      assert.equal(historyA2.data.length, 1);
      assert.equal(historyA2.data[0].id, createdReport.id);

      // 5. Caregiver A2 can view the report detail created by former Caregiver A1
      const repA2 = await mod.reportsService.getReport(createdReport.id, f.caregiverA2);
      assert.equal(repA2.id, createdReport.id);
      assert.equal(repA2.caregiver_name, f.caregiverA1.name);

      // 6. Caregiver A1 is now denied access to Child A's reports
      await assert.rejects(
        () => mod.reportsService.getReport(createdReport.id, f.caregiverA1),
        (err) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /not assigned to this child/i);
          return true;
        }
      );

      await assert.rejects(
        () => mod.reportsService.getChildReports(f.childA.id, {}, f.caregiverA1),
        (err) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /not assigned to this child/i);
          return true;
        }
      );

      // 7. Linked parent can still view the report
      const repParent = await mod.reportsService.getReport(createdReport.id, f.parentA);
      assert.equal(repParent.id, createdReport.id);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Biometric Guardian Verification & Tenant Isolation
    // ─────────────────────────────────────────────────────────────────────────
    await t.test('Biometric enrollment enforces pickup authorization, active status, and daycare tenant', async () => {
      // 1. Temporarily mark guardian link as pickup_authorized = false
      await db('guardian_links').where({ id: f.linkA.id }).update({ pickup_authorized: false });

      // Admin A attempts to enroll biometrics for unauthorized link -> 400
      await assert.rejects(
        () => mod.biometricService.enroll(
          { guardian_link_id: f.linkA.id, reference_data: 'bio-ref-data-1' },
          f.adminA
        ),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.match(err.message, /not authorized for child pickup/i);
          return true;
        }
      );

      // Restore pickup_authorized = true
      await db('guardian_links').where({ id: f.linkA.id }).update({ pickup_authorized: true });

      // 2. Suspend Parent A and attempt enrollment -> 400
      await db('users').where({ id: f.parentA.id }).update({ status: 'suspended' });
      await assert.rejects(
        () => mod.biometricService.enroll(
          { guardian_link_id: f.linkA.id, reference_data: 'bio-ref-data-2' },
          f.adminA
        ),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.match(err.message, /account is not active/i);
          return true;
        }
      );

      // Reactivate Parent A
      await db('users').where({ id: f.parentA.id }).update({ status: 'active' });

      // 3. Admin B (from Daycare B) attempts to enroll biometrics for Daycare A guardian link -> 404
      await assert.rejects(
        () => mod.biometricService.enroll(
          { guardian_link_id: f.linkA.id, reference_data: 'bio-ref-data-3' },
          f.adminB
        ),
        (err) => {
          assert.equal(err.statusCode, 404);
          return true;
        }
      );

      // 4. Admin A successfully enrolls biometric reference
      const enrolled = await mod.biometricService.enroll(
        { guardian_link_id: f.linkA.id, reference_data: 'bio-template-parent-a' },
        f.adminA
      );
      assert.ok(enrolled.id);
      assert.equal(enrolled.active, true);

      // Verify audit log has daycare_id stamped
      const audit = await db('audit_logs')
        .where({ action: 'BIOMETRIC_ENROLLED', target_id: enrolled.id })
        .first();
      assert.ok(audit);
      assert.equal(audit.daycare_id, f.daycareA.id);

      // 5. Admin B cannot query Parent A's biometric reference
      await assert.rejects(
        () => mod.biometricService.getGuardianBiometric(f.linkA.id, f.adminB),
        (err) => {
          assert.equal(err.statusCode, 404);
          return true;
        }
      );

      // 6. Admin A can fetch Parent A's biometric reference
      const bioRecord = await mod.biometricService.getGuardianBiometric(f.linkA.id, f.adminA);
      assert.equal(bioRecord.guardian_name, f.parentA.name);
      assert.equal(bioRecord.active, true);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Child Deactivation & Historical Record Integrity
    // ─────────────────────────────────────────────────────────────────────────
    await t.test('Child deactivation updates status without destroying historical attendance and reports', async () => {
      // 1. Record attendance checkin for Child A
      await db('attendance').insert({
        child_id: f.childA.id,
        event_type: 'checkin',
        event_time: new Date(),
        notes: 'Arrived with mother',
        recorded_by: f.caregiverA2.id,
        daycare_id: f.daycareA.id,
      });

      // 2. Admin A updates Child A status to inactive
      const updated = await mod.childrenService.updateChild(
        f.childA.id,
        { enrollment_status: 'inactive', version: (await db('children').where({id:f.childA.id}).first()).version },
        f.adminA
      );
      assert.equal(updated.enrollment_status, 'inactive');

      // 3. Verify audit log recorded CHILD_UPDATED
      const auditRow = await db('audit_logs')
        .where({ action: 'CHILD_UPDATED', target_id: f.childA.id })
        .first();
      assert.ok(auditRow);
      assert.equal(auditRow.daycare_id, f.daycareA.id);

      // 4. Verify attendance history is preserved intact
      const attendance = await mod.attendanceService.getChildAttendance(f.childA.id, {}, f.adminA);
      assert.ok(attendance.data.length >= 1);
      assert.equal(attendance.data[0].event_type, 'checkin');

      // 5. Verify daily reports remain intact
      const reports = await mod.reportsService.getChildReports(f.childA.id, {}, f.adminA);
      assert.equal(reports.data.length, 1);

      // 6. Verify parent can still retrieve profile and historical records
      const parentProfile = await mod.childrenService.getChild(f.childA.id, f.parentA);
      assert.equal(parentProfile.full_name, f.childA.full_name);
      assert.equal(parentProfile.enrollment_status, 'inactive');
      assert.ok(parentProfile.emergency_contacts.length >= 1);
      assert.ok(parentProfile.care_instructions.length >= 1);
    });

  });
});
