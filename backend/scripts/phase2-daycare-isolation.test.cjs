'use strict';

/**
 * Phase 2 Test Suite: Daycare Tenant Separation & Permission Boundaries.
 * Runs against an isolated, generated PostgreSQL database.
 * Verifies that two distinct daycares (Daycare A and Daycare B) cannot read,
 * modify, cross-link, or aggregate each other's records through any API or service.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { Client, Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { withOperationalDatabase, assertTestDatabaseName } = require('./helpers/auth-test-database.cjs');
const { createTenantPool, withTenant } = require('../src/db/tenant-pool');
const m18 = require('../src/db/migrations/018_profile_security_revisions');
const m19 = require('../src/db/migrations/019_tenant_relationship_integrity');
const m20 = require('../src/db/migrations/020_tenant_product_categories');
const m21 = require('../src/db/migrations/021_runtime_rls');

const password = 'Test-password-phase2!';
const secret = 'synthetic-phase-two-jwt-secret-for-testing';

// Helper to construct actors
function makeActor(user, roleName) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: roleName,
    daycare_id: user.daycare_id,
    status: 'active',
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
  const [adminA, caregiverA, parentA] = await db('users').insert([
    { name: 'Admin A', email: `admin-a-${suffix}@example.invalid`, role_id: 1, daycare_id: daycareA.id, password_hash: passwordHash, status: 'active' },
    { name: 'Caregiver A', email: `caregiver-a-${suffix}@example.invalid`, role_id: 2, daycare_id: daycareA.id, password_hash: passwordHash, status: 'active' },
    { name: 'Parent A', email: `parent-a-${suffix}@example.invalid`, role_id: 3, daycare_id: daycareA.id, password_hash: passwordHash, status: 'active' },
  ]).returning('*');

  // Users for Daycare B
  const [adminB, caregiverB, parentB] = await db('users').insert([
    { name: 'Admin B', email: `admin-b-${suffix}@example.invalid`, role_id: 1, daycare_id: daycareB.id, password_hash: passwordHash, status: 'active' },
    { name: 'Caregiver B', email: `caregiver-b-${suffix}@example.invalid`, role_id: 2, daycare_id: daycareB.id, password_hash: passwordHash, status: 'active' },
    { name: 'Parent B', email: `parent-b-${suffix}@example.invalid`, role_id: 3, daycare_id: daycareB.id, password_hash: passwordHash, status: 'active' },
  ]).returning('*');

  // Super Admin (platform owner)
  const [superAdmin] = await db('users').insert([
    { name: 'Super Admin', email: `superadmin-${suffix}@example.invalid`, role_id: 0, daycare_id: null, password_hash: passwordHash, status: 'active' },
  ]).returning('*');

  // Groups
  const [groupA] = await db('groups').insert([
    { name: `Toddlers A ${suffix}`, daycare_id: daycareA.id },
  ]).returning('*');

  const [groupB] = await db('groups').insert([
    { name: `Toddlers B ${suffix}`, daycare_id: daycareB.id },
  ]).returning('*');

  // Children
  const [childA] = await db('children').insert([
    { full_name: `Child Alpha ${suffix}`, dob: '2022-01-01', gender: 'female', group_id: groupA.id, caregiver_id: caregiverA.id, enrollment_status: 'active', daycare_id: daycareA.id },
  ]).returning('*');

  const [childB] = await db('children').insert([
    { full_name: `Child Beta ${suffix}`, dob: '2022-02-02', gender: 'male', group_id: groupB.id, caregiver_id: caregiverB.id, enrollment_status: 'active', daycare_id: daycareB.id },
  ]).returning('*');

  // Guardian Links
  await db('guardian_links').insert([
    { child_id: childA.id, user_id: parentA.id, relationship: 'Mother', pickup_authorized: true, created_by: adminA.id },
    { child_id: childB.id, user_id: parentB.id, relationship: 'Father', pickup_authorized: true, created_by: adminB.id },
  ]);

  return {
    daycareA, daycareB,
    adminA: makeActor(adminA, 'admin'),
    caregiverA: makeActor(caregiverA, 'caregiver'),
    parentA: makeActor(parentA, 'parent'),
    adminB: makeActor(adminB, 'admin'),
    caregiverB: makeActor(caregiverB, 'caregiver'),
    parentB: makeActor(parentB, 'parent'),
    superAdmin: makeActor(superAdmin, 'super_admin'),
    groupA, groupB,
    childA, childB,
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
    usersService: require('../src/modules/users/users.service'),
    childrenService: require('../src/modules/children/children.service'),
    childrenCareService: require('../src/modules/children/children.care.service'),
    childrenParentService: require('../src/modules/children/children.parent.service'),
    groupsService: require('../src/modules/groups/groups.service'),
    healthService: require('../src/modules/health/health.service'),
    communicationService: require('../src/modules/communication/communication.service'),
    reportsService: require('../src/modules/reports/reports.service'),
    storeService: require('../src/modules/store/store.service'),
    eventsService: require('../src/modules/events/events.service'),
    searchService: require('../src/modules/search/search.service'),
    dashboardService: require('../src/modules/dashboard/dashboard.service'),
    auditService: require('../src/modules/audit/audit.service'),
  };
}

test('phase two: daycare isolation and permission enforcement', async (t) => {
  await withOperationalDatabase(async ({ db, pool, name }) => {
    assertTestDatabaseName(name);
    // Keep the pre-RLS upgrade scenario below, with current API-only fields.
    await require('../src/db/migrations/030_announcement_request_keys').up(db);
    await require('../src/db/migrations/033_child_and_classroom_edit_versions').up(db);
    const f = await fixture(db);
    const mod = setupContext(pool);

    // ─────────────────────────────────────────────────────────────────────────
    // 1. User & Account Scoping (B02, B04, B07)
    // ─────────────────────────────────────────────────────────────────────────
    await t.test('admin A only sees users from daycare A and never super_admin', async () => {
      const result = await mod.usersService.listUsers({}, f.adminA);
      const userIds = result.data.map(u => u.id);
      assert.ok(userIds.includes(f.adminA.id));
      assert.ok(userIds.includes(f.caregiverA.id));
      assert.ok(userIds.includes(f.parentA.id));
      assert.ok(!userIds.includes(f.adminB.id), 'Admin A must not see Admin B');
      assert.ok(!userIds.includes(f.superAdmin.id), 'Admin A must not see Super Admin');
    });

    await t.test('admin A cannot get, update, or deactivate user from daycare B', async () => {
      await assert.rejects(
        () => mod.usersService.getUserById(f.adminB.id, f.adminA),
        err => err.statusCode === 404
      );
      await assert.rejects(
        () => mod.usersService.updateUser(f.adminB.id, { name: 'Hacked' }, f.adminA),
        err => err.statusCode === 404
      );
      await assert.rejects(
        () => mod.usersService.updateStatus(f.adminB.id, 'suspended', f.adminA),
        err => err.statusCode === 404
      );
    });

    await t.test('owner-only admin appointment: tenant admin cannot create another admin (B07)', async () => {
      await assert.rejects(
        () => mod.usersService.createUser({
          name: 'New Rogue Admin',
          email: 'rogue-admin@example.invalid',
          password: 'Password123!',
          role: 'admin',
        }, f.adminA),
        err => err.statusCode === 403
      );
    });

    await t.test('tenant admin creating caregiver stamps actor daycare_id (B04)', async () => {
      const newCaregiver = await mod.usersService.createUser({
        name: 'Staff Member 1',
        email: `staff-${Date.now()}@example.invalid`,
        password: 'Password123!',
        role: 'caregiver',
      }, f.adminA);
      assert.equal(newCaregiver.daycare_id, f.daycareA.id);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Child & Group Management (B03, B04, B08)
    // ─────────────────────────────────────────────────────────────────────────
    await t.test('admin A only lists children from daycare A', async () => {
      const result = await mod.childrenService.listChildren({}, f.adminA);
      const ids = result.data.map(c => c.id);
      assert.ok(ids.includes(f.childA.id));
      assert.ok(!ids.includes(f.childB.id), 'Child B must not be listed for Daycare A');
    });

    await t.test('admin A cannot get or update child from daycare B', async () => {
      await assert.rejects(
        () => mod.childrenService.getChild(f.childB.id, f.adminA),
        err => err.statusCode === 404
      );
      await assert.rejects(
        () => mod.childrenService.updateChild(f.childB.id, { full_name: 'Hacked Beta' }, f.adminA),
        err => err.statusCode === 404
      );
    });

    await t.test('admin A cannot assign caregiver or group from daycare B to child A', async () => {
      await assert.rejects(
        () => mod.childrenService.createChild({
          full_name: 'Cross Daycare Child',
          dob: '2023-01-01',
          caregiver_id: f.caregiverB.id, // Caregiver from Daycare B
        }, f.adminA),
        err => err.statusCode === 422
      );
      await assert.rejects(
        () => mod.childrenService.createChild({
          full_name: 'Cross Daycare Child 2',
          dob: '2023-01-01',
          group_id: f.groupB.id, // Group from Daycare B
        }, f.adminA),
        err => err.statusCode === 422
      );
    });

    await t.test('admin A cannot link parent B to child A', async () => {
      await assert.rejects(
        () => mod.childrenService.addGuardian(f.childA.id, {
          user_id: f.parentB.id,
          relationship: 'Unauthorized Stranger',
          pickup_authorized: true,
        }, f.adminA),
        err => err.statusCode === 422
      );
    });

    await t.test('admin A cannot add, update or delete emergency contacts or care instructions on child B', async () => {
      await assert.rejects(
        () => mod.childrenCareService.addContact(f.childB.id, { name: 'Emergency Doc', phone: '+251911000000', relationship: 'Doctor' }, f.adminA),
        err => err.statusCode === 404
      );
      await assert.rejects(
        () => mod.childrenCareService.addInstruction(f.childB.id, { category: 'allergy', instruction_text: 'Peanuts' }, f.adminA),
        err => err.statusCode === 404
      );
    });

    await t.test('parent A cannot self-authorize pickup or change classroom group (B08)', async () => {
      const fakeReq = {
        user: f.parentA,
        params: { id: f.childA.id },
        body: {
          full_name: 'Updated Alpha Child',
          group_id: f.groupB.id,
          pickup_authorized: false, // Attempting to tamper
          relationship: 'Legal Guardian',
        },
      };
      let jsonResult;
      const fakeRes = { json: data => { jsonResult = data; } };
      let nextError = null;
      await mod.childrenParentService.updateChildProfile(fakeReq, fakeRes, err => { nextError = err; });
      assert.ifError(nextError);
      assert.ok(jsonResult.child);
      assert.equal(jsonResult.child.group_id, f.groupA.id, 'Group must NOT have been changed by parent');
      assert.equal(jsonResult.child.pickup_authorized, true, 'Pickup authorization must remain untouched by parent');
    });

    await t.test('admin A only sees daycare A groups and cannot modify group B', async () => {
      const groups = await mod.groupsService.listGroups(f.adminA);
      const groupIds = groups.data.map(g => g.id);
      assert.ok(groupIds.includes(f.groupA.id));
      assert.ok(!groupIds.includes(f.groupB.id));

      await assert.rejects(
        () => mod.groupsService.updateGroup(f.groupB.id, { name: 'Renamed' }, f.adminA),
        err => err.statusCode === 404
      );
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Health & Incident Isolation (B11)
    // ─────────────────────────────────────────────────────────────────────────
    let healthRecordA;
    await t.test('health records stamp daycare_id and reject cross-daycare access and unassigned caregivers', async () => {
      // Create health record for Child A by assigned Caregiver A
      healthRecordA = await mod.healthService.createRecord({
        child_id: f.childA.id,
        record_type: 'health',
        description: 'Slight fever 37.5C',
        severity: 'low',
      }, f.caregiverA);
      assert.equal(healthRecordA.daycare_id, f.daycareA.id);

      // Caregiver B cannot record health on Child A
      await assert.rejects(
        () => mod.healthService.createRecord({
          child_id: f.childA.id,
          record_type: 'health',
          description: 'Caregiver B invasion',
        }, f.caregiverB),
        err => err.statusCode === 404
      );

      // Admin B cannot view Child A health records
      await assert.rejects(
        () => mod.healthService.getChildHealth(f.childA.id, {}, f.adminB),
        err => err.statusCode === 404
      );

      // Admin B cannot mark Child A health record as notified
      await assert.rejects(
        () => mod.healthService.markNotified(healthRecordA.id, f.adminB),
        err => err.statusCode === 404
      );

      // Assigned Caregiver A or Admin A CAN mark notified
      const notified = await mod.healthService.markNotified(healthRecordA.id, f.caregiverA);
      assert.equal(notified.parent_notified, true);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Communication, Announcements, Alerts & Messaging (B12)
    // ─────────────────────────────────────────────────────────────────────────
    await t.test('announcements stamp daycare_id and isolate across tenants', async () => {
      const annA = await mod.communicationService.createAnnouncement({
        title: 'Daycare A Sports Day',
        body: 'Wear running shoes on Friday',
        audience: 'all',
      }, f.adminA);
      assert.equal(annA.daycare_id, f.daycareA.id);

      const annB = await mod.communicationService.createAnnouncement({
        title: 'Daycare B Science Fair',
        body: 'Bring volcano models',
        audience: 'all',
      }, f.adminB);
      assert.equal(annB.daycare_id, f.daycareB.id);

      // Parent A only sees Daycare A announcements
      const listA = await mod.communicationService.listAnnouncements({}, f.parentA);
      const titlesA = listA.data.map(a => a.title);
      assert.ok(titlesA.includes('Daycare A Sports Day'));
      assert.ok(!titlesA.includes('Daycare B Science Fair'), 'Parent A must not see Daycare B announcements');
    });

    await t.test('direct messages reject cross-daycare recipients', async () => {
      await assert.rejects(
        () => mod.communicationService.sendMessage({
          recipient_id: f.parentB.id,
          body: 'Hello across daycares!',
        }, f.parentA),
        err => err.statusCode === 404
      );
    });

    await t.test('alerts reject targeting users from another daycare', async () => {
      await assert.rejects(
        () => mod.communicationService.createAlert({
          title: 'Intruder alert',
          recipient_scope: 'individual',
          target_user_id: f.parentB.id,
        }, f.adminA),
        err => err.statusCode === 404
      );
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Daily Reports & Completion Monitor (B03, B04)
    // ─────────────────────────────────────────────────────────────────────────
    let reportA;
    await t.test('daily reports stamp daycare_id and isolate across tenants', async () => {
      reportA = await mod.reportsService.createReport({
        child_id: f.childA.id,
        report_date: '2026-10-18',
        mood: 'happy',
        sleep_duration_min: 60,
      }, f.caregiverA);
      assert.equal(reportA.daycare_id, f.daycareA.id);

      // Caregiver B cannot submit report for Child A
      await assert.rejects(
        () => mod.reportsService.createReport({
          child_id: f.childA.id,
          report_date: '2026-10-19',
          mood: 'sad',
        }, f.caregiverB),
        err => err.statusCode === 404
      );

      // Admin B cannot read report A
      await assert.rejects(
        () => mod.reportsService.getReport(reportA.id, f.adminB),
        err => err.statusCode === 404
      );

      // Completion monitor for Admin A only reports Daycare A staff and children
      const monitorA = await mod.reportsService.listReports({ date: '2026-10-18' }, f.adminA);
      const caregiverIds = monitorA.caregivers.map(c => c.caregiver_id);
      assert.ok(caregiverIds.includes(f.caregiverA.id));
      assert.ok(!caregiverIds.includes(f.caregiverB.id), 'Completion monitor must NOT show Caregiver B');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Store Products & Orders (B03, B04)
    // ─────────────────────────────────────────────────────────────────────────
    let productA, productB;
    await t.test('store products and orders enforce strict daycare isolation', async () => {
      productA = await mod.storeService.createProduct({
        name: 'Daycare A Uniform Shirt',
        price: 150.00,
        stock_qty: 20,
      }, f.adminA);
      assert.equal(productA.daycare_id, f.daycareA.id);

      productB = await mod.storeService.createProduct({
        name: 'Daycare B Backpack',
        price: 250.00,
        stock_qty: 10,
      }, f.adminB);
      assert.equal(productB.daycare_id, f.daycareB.id);

      // Admin A cannot update Product B
      await assert.rejects(
        () => mod.storeService.updateProduct(productB.id, { price: 1.00 }, f.adminA),
        err => err.statusCode === 404
      );

      // Parent A cannot order Product B
      await assert.rejects(
        () => mod.storeService.placeOrder({
          items: [{ product_id: productB.id, quantity: 1 }],
        }, f.parentA),
        err => err.statusCode === 404
      );

      // Parent A successfully orders Product A
      const orderA = await mod.storeService.placeOrder({
        items: [{ product_id: productA.id, quantity: 2 }],
      }, f.parentA);
      assert.equal(orderA.daycare_id, f.daycareA.id);

      // Admin B listing all orders cannot see Order A
      const ordersB = await mod.storeService.listAllOrders({}, f.adminB);
      const orderIdsB = ordersB.data.map(o => o.id);
      assert.ok(!orderIdsB.includes(orderA.id), 'Admin B must not see Order A');

      // Admin B cannot update status of Order A
      await assert.rejects(
        () => mod.storeService.updateOrderStatus(orderA.id, { order_status: 'delivered' }, f.adminB),
        err => err.statusCode === 404
      );
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 7. Events Calendar (B03, B04)
    // ─────────────────────────────────────────────────────────────────────────
    let eventA, eventB;
    await t.test('calendar events stamp daycare_id and isolate across tenants', async () => {
      eventA = await mod.eventsService.createEvent({
        title: 'Daycare A Parent Meeting',
        event_date: '2026-11-01',
        event_type: 'meeting',
      }, f.adminA);
      assert.equal(eventA.daycare_id, f.daycareA.id);

      eventB = await mod.eventsService.createEvent({
        title: 'Daycare B Field Trip',
        event_date: '2026-11-02',
        event_type: 'activity_day',
      }, f.adminB);
      assert.equal(eventB.daycare_id, f.daycareB.id);

      // Admin A listing events does not see Event B
      const listA = await mod.eventsService.listEvents({}, f.adminA);
      const titlesA = listA.data.map(e => e.title);
      assert.ok(titlesA.includes('Daycare A Parent Meeting'));
      assert.ok(!titlesA.includes('Daycare B Field Trip'));

      // Admin A cannot cancel Event B
      await assert.rejects(
        () => mod.eventsService.cancelEvent(eventB.id, f.adminA),
        err => err.statusCode === 404
      );
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 8. Global Search (B03, B04)
    // ─────────────────────────────────────────────────────────────────────────
    await t.test('global search results never leak records from another daycare', async () => {
      // Admin A searches for 'Child'
      const searchResA = await mod.searchService.globalSearch('Child', f.adminA);
      const childNamesA = searchResA.results.children.map(c => c.full_name);
      assert.ok(childNamesA.some(name => name.includes('Alpha')), 'Must find Child Alpha');
      assert.ok(!childNamesA.some(name => name.includes('Beta')), 'Must NOT find Child Beta');

      // Admin A searches for 'Daycare'
      const annSearch = await mod.searchService.globalSearch('Daycare', f.adminA);
      const annTitles = annSearch.results.announcements.map(a => a.title);
      assert.ok(annTitles.includes('Daycare A Sports Day'));
      assert.ok(!annTitles.includes('Daycare B Science Fair'));

      // Admin A searches users
      const userSearch = await mod.searchService.globalSearch('Admin', f.adminA);
      const userNames = userSearch.results.users.map(u => u.name);
      assert.ok(userNames.includes('Admin A'));
      assert.ok(!userNames.includes('Admin B'));
      assert.ok(!userNames.includes('Super Admin'));
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 9. Aggregated Dashboard Stats (B03, B04)
    // ─────────────────────────────────────────────────────────────────────────
    await t.test('admin dashboard statistics only aggregate for own daycare', async () => {
      const statsA = await mod.dashboardService.getStats(f.adminA);
      const statsB = await mod.dashboardService.getStats(f.adminB);

      // Daycare A has 1 active child (Child Alpha)
      assert.equal(Number(statsA.enrollment.total), 1);
      assert.equal(Number(statsA.enrollment.active), 1);

      // Daycare B has 1 active child (Child Beta)
      assert.equal(Number(statsB.enrollment.total), 1);
      assert.equal(Number(statsB.enrollment.active), 1);

      // Daycare A has 1 order placed (revenue 0 because unpaid)
      assert.equal(Number(statsA.orders.pending_orders), 1);
      // Daycare B has 0 orders placed
      assert.equal(Number(statsB.orders.pending_orders), 0);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 10. Audit Logging (B18)
    // ─────────────────────────────────────────────────────────────────────────
    await t.test('audit logs stamp daycare_id and isolate across tenants', async () => {
      await mod.auditService.logAudit(f.adminA.id, 'SECURITY_CHECK_A', 'users', f.adminA.id, {}, null, f.daycareA.id);
      await mod.auditService.logAudit(f.adminB.id, 'SECURITY_CHECK_B', 'users', f.adminB.id, {}, null, f.daycareB.id);

      const logsA = await mod.auditService.listAuditLogs({}, f.adminA);
      const actionsA = logsA.data.map(l => l.action);
      assert.ok(actionsA.includes('SECURITY_CHECK_A'));
      assert.ok(!actionsA.includes('SECURITY_CHECK_B'), 'Admin A must not see Daycare B audit logs');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 11. Restricted Database Role & RLS Enforcement (Fail-Closed & Isolation)
    // ─────────────────────────────────────────────────────────────────────────
    await t.test('restricted non-superuser role enforces RLS, fails closed without context, and isolates data', async (t2) => {
      // 1. Apply forward migrations up to 021 (integrity constraints + runtime RLS)
      await db.transaction(tx => m18.up(tx));
      await db.transaction(tx => m19.up(tx));
      await db.transaction(tx => m20.up(tx));
      await db.transaction(tx => m21.up(tx));

      // 2. Create non-superuser test role
      const testRole = `test_tenant_role_${randomBytes(4).toString('hex')}`;
      const rolePassword = 'TestRoleSecret2026!';
      await db.raw(`CREATE ROLE "${testRole}" WITH LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE ankelba_tenant`);
      t2.after(async () => {
        await db.raw(`DROP OWNED BY "${testRole}"`);
        await db.raw(`DROP ROLE "${testRole}"`);
      });
      await db.raw(`GRANT USAGE ON SCHEMA public TO "${testRole}"`);
      await db.raw(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "${testRole}"`);
      await db.raw(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO "${testRole}"`);

      const dbHost = process.env.DB_HOST || 'localhost';
      const dbPort = Number(process.env.DB_PORT || 5432);

      const nonSuperClient = new Client({
        host: dbHost,
        port: dbPort,
        database: name,
        user: testRole,
        password: rolePassword,
      });
      await nonSuperClient.connect();

      try {
        // Assert role is NOT superuser and has NO BYPASSRLS
        const roleInfo = (await nonSuperClient.query(
          'SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'
        )).rows[0];
        assert.equal(roleInfo.rolsuper, false, 'Runtime role must not be superuser');
        assert.equal(roleInfo.rolbypassrls, false, 'Runtime role must not bypass RLS');

        // (a) Fail closed without tenant context
        await t2.test('un-contexted queries fail closed and return 0 rows under RLS', async () => {
          const children = await nonSuperClient.query('SELECT * FROM children');
          assert.equal(children.rows.length, 0, 'Children query without context must return 0 rows');

          const users = await nonSuperClient.query('SELECT * FROM users');
          assert.equal(users.rows.length, 0, 'Users query without context must return 0 rows');

          const orders = await nonSuperClient.query('SELECT * FROM orders');
          assert.equal(orders.rows.length, 0, 'Orders query without context must return 0 rows');

          const products = await nonSuperClient.query('SELECT * FROM products');
          assert.equal(products.rows.length, 0, 'Products query without context must return 0 rows');

          const care = await nonSuperClient.query('SELECT * FROM care_instructions');
          assert.equal(care.rows.length, 0, 'Care instructions query without context must return 0 rows');

          const contacts = await nonSuperClient.query('SELECT * FROM emergency_contacts');
          assert.equal(contacts.rows.length, 0, 'Emergency contacts query without context must return 0 rows');
        });

        // (b) Tenant context Daycare A returns only Daycare A rows
        await t2.test('queries with Daycare A context return only Daycare A rows without WHERE clause', async () => {
          await nonSuperClient.query('BEGIN');
          await nonSuperClient.query("SELECT set_config('app.current_daycare_id', $1, true)", [String(f.daycareA.id)]);

          const children = await nonSuperClient.query('SELECT id, full_name, daycare_id FROM children');
          const childIds = children.rows.map(c => c.id);
          assert.ok(childIds.includes(f.childA.id), 'Child A must be visible');
          assert.ok(!childIds.includes(f.childB.id), 'Child B must NOT be visible under Daycare A context');
          assert.ok(children.rows.every(c => c.daycare_id === f.daycareA.id));

          const users = await nonSuperClient.query('SELECT id, name, daycare_id FROM users');
          const userIds = users.rows.map(u => u.id);
          assert.ok(userIds.includes(f.adminA.id));
          assert.ok(userIds.includes(f.caregiverA.id));
          assert.ok(userIds.includes(f.parentA.id));
          assert.ok(!userIds.includes(f.adminB.id), 'Admin B must NOT be visible');
          assert.ok(!userIds.includes(f.superAdmin.id), 'Super Admin must NOT be visible in tenant context');

          await nonSuperClient.query('COMMIT');
        });

        // (c) Cross-tenant writes rejected by RLS WITH CHECK
        await t2.test('direct SQL cross-tenant insert is rejected by RLS WITH CHECK policy', async () => {
          await nonSuperClient.query('BEGIN');
          await nonSuperClient.query("SELECT set_config('app.current_daycare_id', $1, true)", [String(f.daycareA.id)]);

          await assert.rejects(
            () => nonSuperClient.query(
              'INSERT INTO children (full_name, dob, gender, enrollment_status, daycare_id) VALUES ($1, $2, $3, $4, $5)',
              ['Cross Daycare Injected', '2023-01-01', 'male', 'active', f.daycareB.id]
            ),
            err => err.code === '42501' || err.code === '23514',
            'Inserting child with Daycare B id under Daycare A context must fail RLS WITH CHECK'
          );

          await nonSuperClient.query('ROLLBACK');
        });

        // (d) Cross-tenant writes to dependent tables rejected
        await t2.test('direct SQL insert into dependent table for cross-tenant child is rejected by RLS', async () => {
          await nonSuperClient.query('BEGIN');
          await nonSuperClient.query("SELECT set_config('app.current_daycare_id', $1, true)", [String(f.daycareA.id)]);

          await assert.rejects(
            () => nonSuperClient.query(
              'INSERT INTO care_instructions (child_id, category, instruction_text) VALUES ($1, $2, $3)',
              [f.childB.id, 'allergy', 'Cross-tenant instruction']
            ),
            err => err.code === '42501' || err.code === '23514',
            'Inserting care instruction for Child B under Daycare A context must be rejected'
          );

          await nonSuperClient.query('ROLLBACK');
        });

        // (e) Cross-tenant updates touch 0 rows
        await t2.test('direct SQL update targeting Daycare B record under Daycare A context affects 0 rows', async () => {
          await nonSuperClient.query('BEGIN');
          await nonSuperClient.query("SELECT set_config('app.current_daycare_id', $1, true)", [String(f.daycareA.id)]);

          const updateResult = await nonSuperClient.query(
            'UPDATE children SET full_name = $1 WHERE id = $2',
            ['Tampered Child Beta', f.childB.id]
          );
          assert.equal(updateResult.rowCount, 0, 'Cannot update record of another daycare');

          await nonSuperClient.query('COMMIT');
        });

        // (f) Tenant context Daycare B returns only Daycare B rows
        await t2.test('queries with Daycare B context return only Daycare B rows', async () => {
          await nonSuperClient.query('BEGIN');
          await nonSuperClient.query("SELECT set_config('app.current_daycare_id', $1, true)", [String(f.daycareB.id)]);

          const children = await nonSuperClient.query('SELECT id, full_name, daycare_id FROM children');
          const childIds = children.rows.map(c => c.id);
          assert.ok(childIds.includes(f.childB.id));
          assert.ok(!childIds.includes(f.childA.id));

          await nonSuperClient.query('COMMIT');
        });

      } finally {
        await nonSuperClient.end();
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 12. Tenant Context for Pooled Queries & Connection Reuse
      // ─────────────────────────────────────────────────────────────────────────
      await t2.test('tenant connection pool isolates context, prevents leakage across checkouts, and fails closed', async () => {
        const testPool = new Pool({
          host: dbHost,
          port: dbPort,
          database: name,
          user: testRole,
          password: rolePassword,
          max: 5,
          idleTimeoutMillis: 1000,
        });

        const tenantPool = createTenantPool(testPool);

        try {
          // 1. Query outside withTenant fails closed
          const outside = await tenantPool.query('SELECT * FROM children');
          assert.equal(outside.rows.length, 0, 'Pooled query without withTenant must return 0 rows');

          // 2. Query inside withTenant(A) sees only A
          await withTenant(f.daycareA.id, async () => {
            const res = await tenantPool.query('SELECT id, full_name FROM children');
            const ids = res.rows.map(r => r.id);
            assert.ok(ids.includes(f.childA.id));
            assert.ok(!ids.includes(f.childB.id));
          });

          // 3. Query inside withTenant(B) sees only B
          await withTenant(f.daycareB.id, async () => {
            const res = await tenantPool.query('SELECT id, full_name FROM children');
            const ids = res.rows.map(r => r.id);
            assert.ok(ids.includes(f.childB.id));
            assert.ok(!ids.includes(f.childA.id));
          });

          // 4. Query after tenant blocks again fails closed (no connection state leakage)
          const resetCheck = await tenantPool.query('SELECT * FROM children');
          assert.equal(resetCheck.rows.length, 0, 'Returned connection must not retain previous tenant context');

          // 5. Concurrent pooled execution across tenants maintains strict boundaries
          const results = await Promise.all([
            withTenant(f.daycareA.id, () => tenantPool.query('SELECT id FROM children')),
            withTenant(f.daycareB.id, () => tenantPool.query('SELECT id FROM children')),
            withTenant(f.daycareA.id, () => tenantPool.query('SELECT id FROM children')),
            withTenant(f.daycareB.id, () => tenantPool.query('SELECT id FROM children')),
            tenantPool.query('SELECT id FROM children'),
          ]);

          assert.deepEqual(results[0].rows.map(r => r.id), [f.childA.id]);
          assert.deepEqual(results[1].rows.map(r => r.id), [f.childB.id]);
          assert.deepEqual(results[2].rows.map(r => r.id), [f.childA.id]);
          assert.deepEqual(results[3].rows.map(r => r.id), [f.childB.id]);
          assert.equal(results[4].rows.length, 0, 'Concurrent un-scoped query must return 0 rows');

        } finally {
          await tenantPool.end();
        }
      });
    });

  });
});
