'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { withCurrentDatabase } = require('./helpers/auth-test-database.cjs');
const { enrollFamilySchema } = require('../src/modules/children/children.validator');
const { updateUserSchema } = require('../src/modules/users/users.validator');
const portrait = 'data:image/png;base64,iVBORw0KGgo=';

test('registration retains parent portraits and the selected care fee through validation', () => {
  const body = { parent: { name: 'Test Parent', email: 'parent@example.invalid', password: 'Test-password-123!', photo_url: portrait },
    child: { full_name: 'Test Child', dob: '2023-01-01', gender: 'female', monthly_care_fee: 4200 } };
  const { error, value } = enrollFamilySchema.validate(body, { stripUnknown: true });
  assert.ifError(error);
  assert.equal(value.parent.photo_url, portrait);
  assert.equal(value.child.monthly_care_fee, 4200);
  assert.ok(updateUserSchema.validate({ photo_url: 'data:text/html;base64,PHNjcmlwdD4=' }).error);
  assert.ok(updateUserSchema.validate({ photo_url: 'javascript:alert(1)' }).error);
  assert.ifError(updateUserSchema.validate({ photo_url: null }).error);
});

test('family portrait persists, enrollment uses the saved guardian, and failed registration rolls back', async () => {
  await withCurrentDatabase(async ({ db, pool }) => {
    const sourceRoot = path.resolve(__dirname, '../src') + path.sep;
    for (const file of Object.keys(require.cache)) if (file.startsWith(sourceRoot)) delete require.cache[file];
    const dbFile = require.resolve('../src/config/db');
    require.cache[dbFile] = { id: dbFile, filename: dbFile, loaded: true, exports: pool };
    const children = require('../src/modules/children/children.service');
    const users = require('../src/modules/users/users.service');
    const portal = require('../src/modules/portal/portal.service');
    const biometrics = require('../src/modules/biometric/biometric.service');

    await db('roles').insert([{ id: 1, name: 'admin' }, { id: 2, name: 'caregiver' }, { id: 3, name: 'parent' }]).onConflict('id').ignore();
    const [center, otherCenter] = await db('daycares').insert(['portrait-a', 'portrait-b'].map(slug => ({
      name: slug, slug, contact_email: `${slug}@example.invalid`, status: 'active', subscription_plan: 'standard',
    }))).returning('*');
    const [adminRow, teacher] = await db('users').insert([
      { name: 'Test Admin', email: 'admin@example.invalid', role_id: 1 },
      { name: 'Test Teacher', email: 'teacher@example.invalid', role_id: 2 },
    ].map(row => ({ ...row, daycare_id: center.id, password_hash: 'synthetic', status: 'active' }))).returning('*');
    const admin = { ...adminRow, role: 'admin' };
    const [group] = await db('groups').insert({ name: 'Test Classroom', daycare_id: center.id, lead_caregiver_id: teacher.id }).returning('*');
    const body = { parent: { name: 'Test Parent', email: 'family@example.invalid', password: 'Test-password-123!', phone: '+251911222333', photo_url: portrait, relationship: 'Mother' },
      child: { full_name: 'Test Child', dob: '2023-01-01', gender: 'female', group_id: group.id, caregiver_id: teacher.id, monthly_care_fee: 4200 },
      emergency_contacts: [], care_instructions: [] };
    const enrolled = await children.enrollFamily(body, admin);
    assert.equal(enrolled.parent.photo_url, portrait);
    assert.equal(enrolled.guardian_link.user_id, enrolled.parent.id);
    assert.equal(enrolled.guardian_link.child_id, enrolled.child.id);
    assert.equal(enrolled.guardian_link.pickup_authorized, true);
    assert.equal(Number(enrolled.child.monthly_care_fee), 4200);
    assert.equal((await users.getUserById(enrolled.parent.id, admin)).photo_url, portrait);

    const date = new Date().toISOString().slice(0, 10);
    let snapshot = await portal.snapshot(date, 30, admin);
    assert.equal(snapshot.users.find(user => user.id === enrolled.parent.id).photo_url, portrait);
    assert.equal(snapshot.guardians.find(link => link.id === enrolled.guardian_link.id).enrolled, false);
    // Simulate the hardware result; no physical sensor is required by this API test.
    await biometrics.enroll({ guardian_link_id: enrolled.guardian_link.id, slot_id: 5, device_id: 'TEST-R307S' }, admin);
    snapshot = await portal.snapshot(date, 30, admin);
    assert.equal(snapshot.guardians.find(link => link.id === enrolled.guardian_link.id).enrolled, true);
    assert.equal((await biometrics.identifyGuardianBySlot(enrolled.child.id, 5, admin)).authorized, true);

    const otherAdmin = { ...admin, daycare_id: otherCenter.id };
    await assert.rejects(users.updateUser(enrolled.parent.id, { photo_url: null }, otherAdmin), error => error.statusCode === 404);
    assert.equal((await db('users').where({ id: enrolled.parent.id }).first()).photo_url, portrait);
    await assert.rejects(children.enrollFamily({ ...body, parent: { id: enrolled.parent.id, photo_url: null }, child: { ...body.child, group_id: -1 } }, admin));
    assert.equal((await db('users').where({ id: enrolled.parent.id }).first()).photo_url, portrait, 'a failed child registration cannot erase the parent portrait');
    await assert.rejects(children.enrollFamily({ ...body, parent: { ...body.parent, email: 'failed@example.invalid' }, child: { ...body.child, group_id: -1 } }, admin));
    assert.equal(await db('users').where({ email: 'failed@example.invalid' }).first(), undefined);

    const replacement = 'https://example.invalid/parent.jpg';
    assert.equal((await users.updateUser(enrolled.parent.id, { photo_url: replacement }, admin)).photo_url, replacement);
    const extra = await users.createUser({ name: 'Second Parent', email: 'second@example.invalid', password: 'Test-password-123!', role: 'parent', photo_url: portrait }, admin);
    assert.equal(extra.photo_url, portrait);
    assert.equal((await users.updateUser(extra.id, { photo_url: null }, admin)).photo_url, null);
  });
});
