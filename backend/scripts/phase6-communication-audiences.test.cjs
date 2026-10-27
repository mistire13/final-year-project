'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { withCurrentDatabase, assertTestDatabaseName } = require('./helpers/auth-test-database.cjs');

const password = 'Test-password-phase6!';
const secret = 'synthetic-phase-six-jwt-secret-for-testing';

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
  const [adminA, caregiverA1, caregiverA2, parentA1, parentA2] = await db('users').insert([
    { name: 'Admin A', email: `admin-a-${suffix}@example.invalid`, role_id: 1, daycare_id: daycareA.id, password_hash: passwordHash, status: 'active' },
    { name: 'Caregiver A1', email: `caregiver-a1-${suffix}@example.invalid`, role_id: 2, daycare_id: daycareA.id, password_hash: passwordHash, status: 'active' },
    { name: 'Caregiver A2', email: `caregiver-a2-${suffix}@example.invalid`, role_id: 2, daycare_id: daycareA.id, password_hash: passwordHash, status: 'active' },
    { name: 'Parent A1', email: `parent-a1-${suffix}@example.invalid`, role_id: 3, daycare_id: daycareA.id, password_hash: passwordHash, status: 'active' },
    { name: 'Parent A2', email: `parent-a2-${suffix}@example.invalid`, role_id: 3, daycare_id: daycareA.id, password_hash: passwordHash, status: 'active' },
  ]).returning('*');

  // Users for Daycare B
  const [adminB, caregiverB, parentB] = await db('users').insert([
    { name: 'Admin B', email: `admin-b-${suffix}@example.invalid`, role_id: 1, daycare_id: daycareB.id, password_hash: passwordHash, status: 'active' },
    { name: 'Caregiver B', email: `caregiver-b-${suffix}@example.invalid`, role_id: 2, daycare_id: daycareB.id, password_hash: passwordHash, status: 'active' },
    { name: 'Parent B', email: `parent-b-${suffix}@example.invalid`, role_id: 3, daycare_id: daycareB.id, password_hash: passwordHash, status: 'active' },
  ]).returning('*');

  // Groups
  const [groupInfants] = await db('groups').insert([
    { name: `Infants ${suffix}`, daycare_id: daycareA.id },
  ]).returning('*');

  const [groupToddlers] = await db('groups').insert([
    { name: `Toddlers ${suffix}`, daycare_id: daycareA.id },
  ]).returning('*');

  // Children for Daycare A
  const [childA1, childA2] = await db('children').insert([
    {
      full_name: `Child Alpha 1 ${suffix}`,
      dob: '2023-01-01',
      gender: 'male',
      group_id: groupInfants.id,
      caregiver_id: caregiverA1.id,
      enrollment_status: 'active',
      daycare_id: daycareA.id,
    },
    {
      full_name: `Child Alpha 2 ${suffix}`,
      dob: '2022-05-05',
      gender: 'female',
      group_id: groupToddlers.id,
      caregiver_id: caregiverA2.id,
      enrollment_status: 'active',
      daycare_id: daycareA.id,
    },
  ]).returning('*');

  // Guardian links
  await db('guardian_links').insert([
    { user_id: parentA1.id, child_id: childA1.id, relationship: 'Mother', pickup_authorized: true, created_by: adminA.id },
    { user_id: parentA2.id, child_id: childA2.id, relationship: 'Father', pickup_authorized: true, created_by: adminA.id },
  ]);


  return {
    daycareA,
    daycareB,
    adminA: makeActor(adminA, 'admin'),
    adminB: makeActor(adminB, 'admin'),
    caregiverA1: makeActor(caregiverA1, 'caregiver'),
    caregiverA2: makeActor(caregiverA2, 'caregiver'),
    caregiverB: makeActor(caregiverB, 'caregiver'),
    parentA1: makeActor(parentA1, 'parent'),
    parentA2: makeActor(parentA2, 'parent'),
    parentB: makeActor(parentB, 'parent'),
    groupInfants,
    groupToddlers,
    childA1,
    childA2,
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
    commService: require('../src/modules/communication/communication.service'),
    searchService: require('../src/modules/search/search.service'),
  };
}

test('Phase 6 — Communication, Announcements, Alerts & Audiences (B12, F07, F13)', async (t) => {
  await withCurrentDatabase(async ({ db, pool, name }) => {
    assertTestDatabaseName(name);
    const f = await fixture(db);
    const { commService, searchService } = setupContext(pool);

    await t.test('Alternate inbox and meal routes preserve tenant and audience boundaries', async () => {
      const notifications = require('../src/modules/notifications/notifications.service');
      const foreign = await commService.createAlert({ title: 'Private other tenant alert', urgency: 'high', recipient_scope: 'all' }, f.adminB);
      const staff = await commService.createAnnouncement({ title: 'Private staff meal', body: 'Staff only', announcement_type: 'meal_plan', audience: 'caregivers' }, f.adminA);
      const group = await commService.createAnnouncement({ title: 'Other classroom meal', body: 'Other classroom', announcement_type: 'meal_plan', audience: 'all', target_group_id: f.groupToddlers.id }, f.adminA);
      const inbox = await notifications.getNotifications(f.parentA1);
      assert.ok(!inbox.alerts.recent.some(row => row.id === foreign.id));
      for (const query of [{}, { group_id: f.groupInfants.id }]) {
        const meals = await commService.listMealPlans(query, f.parentA1);
        assert.ok(!meals.data.some(row => row.id === staff.id || row.id === group.id));
      }
      await assert.rejects(notifications.getNotifications({ id: 1, role: 'super_admin' }), { statusCode: 403 });
      await db('announcements').whereIn('id', [staff.id, group.id]).delete();
      await db('alerts').where({ id: foreign.id }).delete();
    });

    await t.test('Unowned products are rejected and foreign products cannot be listed, searched, purchased or edited', async () => {
      const store = require('../src/modules/store/store.service');
      const draft = { name: 'OrphanRegression', price: 10, stock_qty: 5, available: true, created_by: f.adminB.id, daycare_id: null };
      await assert.rejects(db('products').insert(draft), {code:'23514'});
      const [product] = await db('products').insert({...draft,daycare_id:f.daycareB.id}).returning('*');
      assert.ok(!(await store.listProducts({}, f.adminA)).data.some(row => row.id === product.id));
      assert.ok(!(await searchService.globalSearch('OrphanRegression', f.adminA)).results.products.length);
      await assert.rejects(store.updateProduct(product.id, { name: 'Changed' }, f.adminA), { statusCode: 404 });
      await assert.rejects(store.placeOrder({ items: [{ product_id: product.id, quantity: 1 }] }, f.parentA1), { statusCode: 404 });
      await db('products').where({ id: product.id }).delete();
    });


    // ─────────────────────────────────────────────────────────────────
    // Test 1: Announcements Audience & Group Isolation (B12)
    // ─────────────────────────────────────────────────────────────────
    await t.test('Mounted operational APIs reject the platform owner while governance stays available', async () => {
      process.env.NODE_ENV = 'test';
      process.env.DAYCARE_AUTH_ENABLED = 'false';
      const [owner] = await db('users').insert({ name: 'Owner boundary test', email: 'owner-boundary@example.invalid', role_id: 0, status: 'active', password_hash: await bcrypt.hash(password, 4) }).returning('*');
      const portal = require('../src/modules/portal/portal.service');
      await assert.rejects(portal.snapshot('2026-10-18', 1, { id: owner.id, role: 'super_admin' }), { statusCode: 403 });
      const app = require('../src/app');
      const server = app.listen(0, '127.0.0.1');
      await require('node:events').once(server, 'listening');
      try {
        const base = `http://127.0.0.1:${server.address().port}`;
        const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: owner.email, password }) });
        assert.equal(login.status, 200);
        const { token } = await login.json();
        for (const route of ['/portal/snapshot', '/portal/workspace', '/children', '/notifications', '/search?q=test', '/announcements', '/communication/alerts']) {
          const response = await fetch(`${base}/api${route}`, { headers: { Authorization: `Bearer ${token}` } });
          assert.equal(response.status, 403, route);
          await response.arrayBuffer();
        }
        const governance = await fetch(`${base}/api/saas/super-admin/daycares`, { headers: { Authorization: `Bearer ${token}` } });
        assert.equal(governance.status, 200);
        await governance.arrayBuffer();
      } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
      }
    });

    await t.test('1. Announcement audience and group isolation', async () => {
      // Admin A creates announcements with various audiences and groups
      const annAll = await commService.createAnnouncement(
        { title: 'Alpha General Holiday Notice', body: 'Closed on Friday', audience: 'all' },
        f.adminA
      );
      const annInfants = await commService.createAnnouncement(
        { title: 'Infants Diaper Stock Reminder', body: 'Bring diapers', audience: 'group', target_group_id: f.groupInfants.id },
        f.adminA
      );
      const annToddlers = await commService.createAnnouncement(
        { title: 'Toddlers Art Project', body: 'Bring painting smocks', audience: 'group', target_group_id: f.groupToddlers.id },
        f.adminA
      );
      const annParentsOnly = await commService.createAnnouncement(
        { title: 'Parent Evening Meeting', body: 'Join us at 6 PM', audience: 'parents' },
        f.adminA
      );
      const annStaffOnly = await commService.createAnnouncement(
        { title: 'Staff Training Seminar', body: 'First aid certification', audience: 'staff' },
        f.adminA
      );

      // Admin B creates an announcement in Daycare B
      const annBeta = await commService.createAnnouncement(
        { title: 'Beta Daycare Picnic', body: 'Picnic in Beta park', audience: 'all' },
        f.adminB
      );

      // Parent A1 (has child in Infants):
      const resParent1 = await commService.listAnnouncements({}, f.parentA1);
      const parent1Ids = resParent1.data.map(a => a.id);
      assert.ok(parent1Ids.includes(annAll.id), 'Parent 1 should see general broadcast');
      assert.ok(parent1Ids.includes(annInfants.id), 'Parent 1 should see Infants group announcement');
      assert.ok(parent1Ids.includes(annParentsOnly.id), 'Parent 1 should see parents-targeted announcement');
      assert.ok(!parent1Ids.includes(annToddlers.id), 'Parent 1 MUST NOT see Toddlers group announcement');
      assert.ok(!parent1Ids.includes(annStaffOnly.id), 'Parent 1 MUST NOT see staff-only announcement');
      assert.ok(!parent1Ids.includes(annBeta.id), 'Parent 1 MUST NOT see Daycare Beta announcement');

      // Caregiver A1 (cares for Infants):
      const resCaregiver1 = await commService.listAnnouncements({}, f.caregiverA1);
      const cg1Ids = resCaregiver1.data.map(a => a.id);
      assert.ok(cg1Ids.includes(annAll.id), 'Caregiver 1 should see general broadcast');
      assert.ok(cg1Ids.includes(annInfants.id), 'Caregiver 1 should see Infants group announcement');
      assert.ok(cg1Ids.includes(annStaffOnly.id), 'Caregiver 1 should see staff-only announcement');
      assert.ok(!cg1Ids.includes(annParentsOnly.id), 'Caregiver 1 MUST NOT see parents-only announcement');
      assert.ok(!cg1Ids.includes(annToddlers.id), 'Caregiver 1 MUST NOT see Toddlers group announcement');
      assert.ok(!cg1Ids.includes(annBeta.id), 'Caregiver 1 MUST NOT see Daycare Beta announcement');

      // Admin A sees all announcements for Daycare A
      const resAdminA = await commService.listAnnouncements({}, f.adminA);
      const adminAIds = resAdminA.data.map(a => a.id);
      assert.equal(adminAIds.length, 5, 'Admin A should see all 5 Daycare A announcements');
      assert.ok(!adminAIds.includes(annBeta.id), 'Admin A MUST NOT see Daycare Beta announcement');
    });

    // ─────────────────────────────────────────────────────────────────
    // Test 2: Meal Plan Group and Audience Scoping (B12)
    // ─────────────────────────────────────────────────────────────────
    await t.test('2. Meal plans group scoping and optional caller filter protection', async () => {
      const mpBroadcast = await commService.createAnnouncement(
        { title: 'Alpha Weekly Nutrition Overview', body: 'Standard menu', announcement_type: 'meal_plan', audience: 'all' },
        f.adminA
      );
      const mpInfants = await commService.createAnnouncement(
        { title: 'Infants Puree & Milk Rotation', body: 'Pumpkin puree & infant formula', announcement_type: 'meal_plan', audience: 'group', target_group_id: f.groupInfants.id },
        f.adminA
      );
      const mpToddlers = await commService.createAnnouncement(
        { title: 'Toddlers Solid Foods Menu', body: 'Scrambled eggs and toast', announcement_type: 'meal_plan', audience: 'group', target_group_id: f.groupToddlers.id },
        f.adminA
      );

      // Parent A1 lists without group filter -> should see broadcast + Infants only
      const p1ListNoFilter = await commService.listMealPlans({}, f.parentA1);
      const p1NoFilterIds = p1ListNoFilter.data.map(m => m.id);
      assert.ok(p1NoFilterIds.includes(mpBroadcast.id), 'Parent 1 sees broadcast meal plan');
      assert.ok(p1NoFilterIds.includes(mpInfants.id), 'Parent 1 sees their child Infants meal plan');
      assert.ok(!p1NoFilterIds.includes(mpToddlers.id), 'Parent 1 MUST NOT see Toddlers meal plan when omitting filter');

      // Parent A1 lists with group_id of their child's group (Infants)
      const p1ListOwnGroup = await commService.listMealPlans({ group_id: f.groupInfants.id }, f.parentA1);
      const p1OwnIds = p1ListOwnGroup.data.map(m => m.id);
      assert.ok(p1OwnIds.includes(mpInfants.id));
      assert.ok(!p1OwnIds.includes(mpToddlers.id));

      // Parent A1 attempts to inspect Toddlers meal plan by supplying group_id: f.groupToddlers.id
      const p1ListForeignGroup = await commService.listMealPlans({ group_id: f.groupToddlers.id }, f.parentA1);
      assert.equal(p1ListForeignGroup.data.length, 0, 'Parent 1 MUST get empty results when querying non-enrolled group meal plan');

      // Admin A can filter by any group or view all
      const adminAll = await commService.listMealPlans({}, f.adminA);
      assert.equal(adminAll.data.length, 3, 'Admin sees all 3 meal plans');
    });

    // ─────────────────────────────────────────────────────────────────
    // Test 3: Direct Messages Security & Scoping (B12, F07, F13)
    // ─────────────────────────────────────────────────────────────────
    await t.test('3. Direct messages permissions, tenant isolation, and read status', async () => {
      // 1. Parent A1 sends message to assigned Caregiver A1 -> succeeds
      const msg1 = await commService.sendMessage(
        { recipient_id: f.caregiverA1.id, subject: 'Pickup timing', body: 'I will arrive 10 min early today.' },
        f.parentA1
      );
      assert.ok(msg1.id, 'Message created');
      assert.equal(msg1.daycare_id, f.daycareA.id);
      assert.equal(msg1.read_at, null, 'Message initially unread');

      // 2. Parent A1 attempts to send message to Parent A2 -> rejected (parents only message staff)
      await assert.rejects(
        async () => {
          await commService.sendMessage(
            { recipient_id: f.parentA2.id, body: 'Can we carpool?' },
            f.parentA1
          );
        },
        (err) => err.statusCode === 403,
        'Parents cannot send direct messages to other parents'
      );

      // 3. Parent A1 attempts to send message to Daycare B user -> rejected 404
      await assert.rejects(
        async () => {
          await commService.sendMessage(
            { recipient_id: f.parentB.id, body: 'Hello across daycares' },
            f.parentA1
          );
        },
        (err) => err.statusCode === 404,
        'Cross-daycare messaging must be rejected'
      );

      // 4. Caregiver A1 lists messages -> sees msg1
      const cg1Msgs = await commService.listMessages({ with_user_id: f.parentA1.id }, f.caregiverA1);
      assert.equal(cg1Msgs.data.length, 1);
      assert.equal(cg1Msgs.data[0].id, msg1.id);
      assert.equal(cg1Msgs.data[0].read_at, null);

      // 5. Parent A1 attempts to mark msg1 read -> fails 404 (not recipient)
      await assert.rejects(
        async () => {
          await commService.markMessageRead(msg1.id, f.parentA1);
        },
        (err) => err.statusCode === 404,
        'Sender cannot mark message as read'
      );

      // 6. Caregiver A1 marks msg1 as read (F13)
      const readResult = await commService.markMessageRead(msg1.id, f.caregiverA1);
      assert.ok(readResult.read_at !== null, 'Message read_at must be populated');

      // 7. Caregiver A1 verifies listMessages now reflects read status
      const cg1MsgsAfterRead = await commService.listMessages({ with_user_id: f.parentA1.id }, f.caregiverA1);
      assert.ok(cg1MsgsAfterRead.data[0].read_at !== null, 'Read status updated');
    });

    // ─────────────────────────────────────────────────────────────────
    // Test 4: Urgent Alerts Audience & Tenant Ownership (B12)
    // ─────────────────────────────────────────────────────────────────
    await t.test('4. Urgent alerts tenant ownership and audience scoping', async () => {
      // Admin A creates alerts
      const alertBroadcast = await commService.createAlert(
        { title: 'Weather Warning', urgency: 'high', recipient_scope: 'all' },
        f.adminA
      );
      assert.equal(alertBroadcast.daycare_id, f.daycareA.id, 'Alert must have daycare ownership');

      const alertParents = await commService.createAlert(
        { title: 'Fee Schedule Update', urgency: 'normal', recipient_scope: 'parents' },
        f.adminA
      );
      const alertStaff = await commService.createAlert(
        { title: 'Staff Meeting at 5', urgency: 'normal', recipient_scope: 'staff' },
        f.adminA
      );
      const alertTargetP1 = await commService.createAlert(
        { title: 'Individual Medical Inquiry', urgency: 'high', recipient_scope: 'individual', target_user_id: f.parentA1.id },
        f.adminA
      );
      const alertTargetP2 = await commService.createAlert(
        { title: 'Individual Notice for Parent 2', urgency: 'normal', recipient_scope: 'individual', target_user_id: f.parentA2.id },
        f.adminA
      );

      // Admin B creates an alert in Daycare B
      const alertBeta = await commService.createAlert(
        { title: 'Daycare Beta Power Outage', urgency: 'high', recipient_scope: 'all' },
        f.adminB
      );
      assert.equal(alertBeta.daycare_id, f.daycareB.id);

      // Parent A1 lists alerts
      const p1Alerts = await commService.listAlerts(f.parentA1);
      const p1AlertIds = p1Alerts.data.map(a => a.id);
      assert.ok(p1AlertIds.includes(alertBroadcast.id), 'Parent 1 sees broadcast alert');
      assert.ok(p1AlertIds.includes(alertParents.id), 'Parent 1 sees parents alert');
      assert.ok(p1AlertIds.includes(alertTargetP1.id), 'Parent 1 sees alert targeted to them');
      assert.ok(!p1AlertIds.includes(alertStaff.id), 'Parent 1 MUST NOT see staff-only alert');
      assert.ok(!p1AlertIds.includes(alertTargetP2.id), 'Parent 1 MUST NOT see alert targeted to Parent 2');
      assert.ok(!p1AlertIds.includes(alertBeta.id), 'Parent 1 MUST NOT see Daycare B alert');

      // Caregiver A1 lists alerts
      const cgAlerts = await commService.listAlerts(f.caregiverA1);
      const cgAlertIds = cgAlerts.data.map(a => a.id);
      assert.ok(cgAlertIds.includes(alertBroadcast.id), 'Caregiver 1 sees broadcast alert');
      assert.ok(cgAlertIds.includes(alertStaff.id), 'Caregiver 1 sees staff alert');
      assert.ok(!cgAlertIds.includes(alertParents.id), 'Caregiver 1 MUST NOT see parents alert');
      assert.ok(!cgAlertIds.includes(alertTargetP1.id), 'Caregiver 1 MUST NOT see individual parent alert');
      assert.ok(!cgAlertIds.includes(alertBeta.id), 'Caregiver 1 MUST NOT see Daycare B alert');

      // Admin A attempts to target a user in Daycare B -> rejected 404
      await assert.rejects(
        async () => {
          await commService.createAlert(
            { title: 'Cross Daycare Alert', recipient_scope: 'individual', target_user_id: f.parentB.id },
            f.adminA
          );
        },
        (err) => err.statusCode === 404,
        'Cannot target alert to user in different daycare'
      );
    });

    // ─────────────────────────────────────────────────────────────────
    // Test 5: Global Search Audience & Tenant Scoping (B12)
    // ─────────────────────────────────────────────────────────────────
    await t.test('5. Global search respects announcement audience, groups and daycare boundaries', async () => {
      // Search term: 'Alpha'
      const searchP1 = await searchService.globalSearch('Alpha', f.parentA1);
      const p1AnnTitles = searchP1.results.announcements.map(a => a.title);
      assert.ok(p1AnnTitles.includes('Alpha General Holiday Notice'), 'Parent sees general notice in search');
      assert.ok(!p1AnnTitles.some(t => t.includes('Staff')), 'Parent does not see staff announcements in search');

      // Search term: 'Beta'
      const searchP1Beta = await searchService.globalSearch('Beta', f.parentA1);
      assert.equal(searchP1Beta.results.announcements.length, 0, 'Parent A1 finds NO Daycare Beta announcements in search');
    });

    // ─────────────────────────────────────────────────────────────────
    // Test 6: Communication Contacts API (F07)
    // ─────────────────────────────────────────────────────────────────
    await t.test('6. Contacts API returns actual daycare staff contacts for parent (F07 fix)', async () => {
      const contactsRes = await commService.listContacts(f.parentA1);
      assert.ok(Array.isArray(contactsRes.contacts));
      assert.ok(contactsRes.contacts.length >= 2, 'Should return assigned caregiver and admin office');

      const cgContact = contactsRes.contacts.find(c => c.id === f.caregiverA1.id);
      assert.ok(cgContact, 'Caregiver 1 must be present in Parent 1 contacts');
      assert.equal(cgContact.role, 'caregiver');
      assert.ok(cgContact.child_names.some(n => n.includes('Child Alpha 1')), 'Contact includes linked child name');

      const adminContact = contactsRes.contacts.find(c => c.id === f.adminA.id);
      assert.ok(adminContact, 'Admin A must be present in contacts as Daycare Office');
      assert.equal(adminContact.role, 'admin');

      // Must not contain any contact from Daycare B
      const betaContact = contactsRes.contacts.find(c => c.id === f.adminB.id);
      assert.ok(!betaContact, 'MUST NOT include staff from Daycare B');
    });
  });
});
