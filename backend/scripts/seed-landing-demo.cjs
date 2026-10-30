'use strict';

// Local screenshot fixture. This script owns only the ankelba-landing-demo tenant.
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const backendRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(backendRoot, '..');
require('dotenv').config({ path: path.join(backendRoot, '.env'), quiet: true });

const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
if (!localHosts.has((process.env.DB_HOST || 'localhost').toLowerCase())) {
  throw new Error('Landing demo setup is permitted only against a local PostgreSQL host.');
}
if (process.env.NODE_ENV === 'production') throw new Error('Do not run this demo fixture in production.');

const slug = 'ankelba-landing-demo';
const name = 'Ankelba Landing Demo';
const contactEmail = 'contact.landing-demo@ankelba.example';
const accessPath = path.join(workspaceRoot, 'tmp', 'landing-demo-access.json');
const apiUrl = new URL(process.env.LANDING_DEMO_API_URL || 'http://127.0.0.1:5000/api/');
if (!localHosts.has(apiUrl.hostname) || apiUrl.protocol !== 'http:') throw new Error('Demo API verification must use local HTTP.');

const db = require('../src/config/db');
const saas = require('../src/modules/saas/saas.service');
const users = require('../src/modules/users/users.service');
const groups = require('../src/modules/groups/groups.service');
const children = require('../src/modules/children/children.service');
const profile = require('../src/modules/children/children.profile-save');
const reports = require('../src/modules/reports/reports.service');
const attendance = require('../src/modules/attendance/attendance.service');
const communication = require('../src/modules/communication/communication.service');
const events = require('../src/modules/events/events.service');
const pickup = require('../src/modules/children/pickup-guardians.service');

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Addis_Ababa', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
function dayOffset(amount) {
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
function password() { return `Demo!${crypto.randomBytes(24).toString('base64url')}Aa7`; }

function ensureIgnoredAccessFile() {
  const excludePath = execFileSync('git', ['rev-parse', '--git-path', 'info/exclude'], { cwd: workspaceRoot, encoding: 'utf8' }).trim();
  const absoluteExclude = path.resolve(workspaceRoot, excludePath);
  const content = fs.readFileSync(absoluteExclude, 'utf8');
  const rule = '/tmp/landing-demo-access.json';
  if (!content.split(/\r?\n/).includes(rule)) fs.appendFileSync(absoluteExclude, `\n${rule}\n`);
  execFileSync('git', ['check-ignore', '--quiet', 'tmp/landing-demo-access.json'], { cwd: workspaceRoot });
  fs.mkdirSync(path.dirname(accessPath), { recursive: true });
}
function saveAccess(access) { fs.writeFileSync(accessPath, `${JSON.stringify(access, null, 2)}\n`, { mode: 0o600 }); }

async function verifyThroughApi(access) {
  async function request(endpoint, init = {}) {
    const response = await fetch(new URL(endpoint, apiUrl), init);
    const value = await response.json();
    if (!response.ok) throw new Error(`Local parent API ${endpoint}: HTTP ${response.status}`);
    return value;
  }
  const auth = await request('auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: access.parent.email, password: access.parent.password }) });
  const token = auth.token || auth.data?.token;
  if (!token) throw new Error('Local parent login returned no session token.');
  const headers = { Authorization: `Bearer ${token}` };
  const me = await request('auth/me', { headers });
  const parent = me.user || me.data?.user || me;
  if (parent.daycare_id !== access.daycare.id || parent.profile_complete !== true || !parent.linked_children?.some(child => child.id === access.child.id)) {
    throw new Error('Local parent API did not return the completed demo family.');
  }
  const result = await request(`reports/daily/child/${access.child.id}`, { headers });
  const list = result.data || result.reports || [];
  if (list.length < 3) throw new Error('Local parent API did not return the three demo reports.');
  return { parentLogin: true, linkedChild: true, completeProfile: true, reportCount: list.length };
}

async function main() {
  ensureIgnoredAccessFile();
  let access = fs.existsSync(accessPath) ? JSON.parse(fs.readFileSync(accessPath, 'utf8')) : null;
  if (access && access.daycare?.slug !== slug) throw new Error('Existing access file belongs to a different fixture.');

  let center = (await db.control.query('SELECT id,name,slug,status,contact_email FROM daycares WHERE slug=$1', [slug])).rows[0];
  if (center && (center.name !== name || center.contact_email !== contactEmail || center.status !== 'active')) throw new Error('Reserved demo slug is in use by another or inactive center.');
  if (center && !access) throw new Error('Demo center exists but its local access file is missing; refusing to reset passwords.');

  if (!access) {
    access = {
      daycare: { name, slug },
      admin: { email: 'admin.landing-demo@ankelba.example', password: password() },
      caregiver: { email: 'caregiver.landing-demo@ankelba.example', password: password() },
      parent: { email: 'parent.landing-demo@ankelba.example', password: password() },
    };
    saveAccess(access);
  }

  if (!center) {
    let application = (await db.control.query("SELECT id,status,created_daycare_id FROM daycare_applications WHERE admin_email=$1 AND daycare_name=$2 ORDER BY id DESC LIMIT 1", [access.admin.email, name])).rows[0];
    if (!application) {
      const staged = await saas.registerDaycare({
        daycareName: name, contactEmail, contactPhone: '+251900000001', address: 'Addis Ababa · Local demonstration center',
        licenseNumber: 'DEMO-ONLY-LANDING', adminName: 'Selam Bekele', adminEmail: access.admin.email,
        adminPhone: '+251900000002', adminPassword: access.admin.password, requestedPlan: 'standard',
      });
      application = staged.application;
    }
    if (application.status !== 'pending') throw new Error('The fixture application is not pending and no matching active center was found.');
    const owner = (await db.control.query("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='super_admin' AND u.status='active' ORDER BY u.id LIMIT 1")).rows[0];
    if (!owner) throw new Error('An active local platform owner is required to approve the demo center.');
    const approved = await saas.approveApplication(application.id, {}, owner.id);
    center = approved.daycare;
    if (center.slug !== slug) throw new Error('Provisioning returned an unexpected daycare slug.');
    access.daycare.id = center.id;
    access.admin.id = approved.admin.id;
    saveAccess(access);
  }
  access.daycare.id = center.id;

  await db.withTenant(center.id, async () => {
    const adminRow = (await db.query("SELECT u.id,u.name,u.daycare_id,u.status,r.name AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.email=$1", [access.admin.email])).rows[0];
    if (!adminRow || adminRow.daycare_id !== center.id || adminRow.role !== 'admin' || adminRow.status !== 'active') throw new Error('Demo administrator account does not match fixture scope.');
    const admin = adminRow;
    access.admin.id = admin.id;

    let caregiver = (await db.query("SELECT u.id,u.name,u.daycare_id,u.status,r.name AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.email=$1", [access.caregiver.email])).rows[0];
    if (!caregiver) caregiver = { ...await users.createUser({ name: 'Sara Bekele', email: access.caregiver.email, password: access.caregiver.password, role: 'caregiver', phone: '+251900000003', title: 'Sunflower Group Caregiver', qualifications: 'Early childhood care and play-based learning', shift: '08:00–17:00' }, admin), role: 'caregiver' };
    if (caregiver.daycare_id !== center.id || caregiver.role !== 'caregiver' || caregiver.status !== 'active') throw new Error('Demo caregiver account does not match fixture scope.');
    access.caregiver.id = caregiver.id;

    let group = (await db.query('SELECT id,daycare_id FROM groups WHERE daycare_id=$1 AND name=$2', [center.id, 'Sunflower Group'])).rows[0];
    if (!group) group = await groups.createGroup({ name: 'Sunflower Group', description: 'Ages 3–5 · creative play, stories and discovery', lead_caregiver_id: caregiver.id }, admin);
    access.group = { id: group.id, name: 'Sunflower Group' };

    let parent = (await db.query("SELECT u.id,u.name,u.daycare_id,u.status,r.name AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.email=$1", [access.parent.email])).rows[0];
    if (parent && (parent.daycare_id !== center.id || parent.role !== 'parent' || parent.status !== 'active')) throw new Error('Demo parent account does not match fixture scope.');
    let child = parent ? (await db.query('SELECT c.id,c.daycare_id FROM children c JOIN guardian_links gl ON gl.child_id=c.id WHERE gl.user_id=$1 AND c.daycare_id=$2 AND c.full_name=$3', [parent.id, center.id, 'Liya Hana'])).rows[0] : null;
    if (!child) {
      const avatarPath = path.join(workspaceRoot, 'frontend', 'assets', 'design', '03-home-dashboard-0.jpg');
      const photo = fs.existsSync(avatarPath) ? `data:image/jpeg;base64,${fs.readFileSync(avatarPath).toString('base64')}` : null;
      const enrolled = await children.enrollFamily({
        parent: parent ? { id: parent.id, relationship: 'Mother' } : { name: 'Hana Tesfaye', email: access.parent.email, password: access.parent.password, phone: '+251900000004', relationship: 'Mother' },
        child: { full_name: 'Liya Hana', dob: `${Number(today.slice(0, 4)) - 4}-05-12`, gender: 'female', group_id: group.id, caregiver_id: caregiver.id, enrollment_status: 'active', photo_url: photo, agreement_signed: true, terms_accepted: true },
        care_instructions: [
          { category: 'general', instruction_text: 'Offer a quiet story before her afternoon nap. She enjoys a soft blanket and a calm space.' },
          { category: 'dietary', instruction_text: 'Offer water with meals and fruit for a snack. Encourage independent eating.' },
          { category: 'general', instruction_text: 'Liya enjoys painting, building blocks, picture books and outdoor play with friends.' },
        ],
        emergency_contacts: [{ name: 'Abel Tesfaye', relationship: 'Father', phone: '+251900000005' }],
      }, admin);
      parent = { ...enrolled.parent, role: 'parent' };
      child = enrolled.child;
    }
    access.parent.id = parent.id;
    access.child = { id: child.id, name: 'Liya Hana' };
    const currentProfile = await profile.execute(parent, child.id);
    if (!currentProfile.parent.profile_complete) await profile.execute(parent, child.id, { version: currentProfile.version, complete_profile: true });

    const reportsCreated = [];
    for (const offset of [0, -1, -2]) {
      const reportDate = dayOffset(offset);
      let report = (await db.query('SELECT id FROM daily_reports WHERE child_id=$1 AND daycare_id=$2 AND report_date=$3', [child.id, center.id, reportDate])).rows[0];
      if (!report) report = await reports.createReport({
        child_id: child.id, report_date: reportDate, sleep_duration_min: 75,
        sleep_notes: 'Settled after story time and rested comfortably for 1 hour 15 minutes.',
        mood: 'happy', behavior_notes: 'Shared the building blocks with friends and helped put the paints away.',
        general_observations: 'Doing great today',
        meals: [
          { meal_type: 'breakfast', description: 'Breakfast completed', portion: 'good' },
          { meal_type: 'morning_snack', description: 'Fresh banana and water', portion: 'good' },
          { meal_type: 'lunch', description: 'Vegetable rice with lentils', portion: 'good' },
          { meal_type: 'afternoon_snack', description: 'Apple slices and crackers', portion: 'fair' },
        ],
        activities: [
          { activity_type: 'learning', description: 'Colors & shapes', location: 'indoor' },
          { activity_type: 'play', description: 'Outdoor play', location: 'outdoor' },
          { activity_type: 'learning', description: 'Painting with friends', location: 'indoor' },
        ],
      }, caregiver);
      reportsCreated.push({ id: report.id, date: reportDate });
    }
    access.reports = reportsCreated;

    const checkin = (await db.query("SELECT id FROM attendance WHERE child_id=$1 AND daycare_id=$2 AND (event_time AT TIME ZONE 'Africa/Addis_Ababa')::date=$3 AND event_type='checkin' ORDER BY id DESC LIMIT 1", [child.id, center.id, today])).rows[0]
      || await attendance.recordAttendance({ child_id: child.id, event_type: 'checkin', notes: 'Local screenshot demonstration check-in.' }, admin);
    await db.query('UPDATE attendance SET event_time=$1 WHERE id=$2 AND child_id=$3 AND daycare_id=$4', [`${today}T08:04:00+03:00`, checkin.id, child.id, center.id]);

    const messages = [
      { sender: parent, recipient: caregiver, body: 'Good morning Sara. Liya was excited to bring her painting ideas today. Thank you for keeping us updated!' },
      { sender: caregiver, recipient: parent, body: 'Liya had a lovely morning. She explored colors and shapes, enjoyed her lunch and settled well for a nap. She was very helpful during cleanup time.' },
      { sender: parent, recipient: caregiver, body: 'I’m glad she settled in well. How was lunch, and did she get some rest?' },
      { sender: caregiver, recipient: parent, body: 'She enjoyed the vegetable rice and lentils, then slept for an hour and fifteen minutes. She woke up happy and ready to play.' },
      { sender: parent, recipient: caregiver, body: 'Thank you, Sara. Her father Abel will collect her at 4:30 today. His details are on her guardian list.' },
      { sender: caregiver, recipient: parent, body: 'Thanks, Hana. We’ll have her bag ready and check Abel’s guardian details at pickup. See you tomorrow!' },
    ];
    for (const message of messages) {
      const exists = (await db.query('SELECT id FROM messages WHERE daycare_id=$1 AND sender_id=$2 AND recipient_id=$3 AND body=$4', [center.id, message.sender.id, message.recipient.id, message.body])).rows[0];
      if (!exists) await communication.sendMessage({ recipient_id: message.recipient.id, subject: 'Liya’s day', body: message.body }, message.sender);
    }

    const title = 'Family afternoon';
    let event = (await db.query('SELECT id FROM events WHERE daycare_id=$1 AND title=$2 AND event_date=$3', [center.id, title, dayOffset(3)])).rows[0];
    if (!event) event = await events.createEvent({ title, event_date: dayOffset(3), event_time: '15:30', description: 'Join the Sunflower Group for stories, painting and a relaxed conversation with the caregivers.', event_type: 'meeting' }, admin);
    access.event = { id: event.id, date: dayOffset(3) };

    let guardian = (await db.query('SELECT id,version,status FROM pickup_guardians WHERE daycare_id=$1 AND child_id=$2 AND name=$3 ORDER BY id DESC LIMIT 1', [center.id, child.id, 'Abel Tesfaye'])).rows[0];
    if (!guardian) guardian = await pickup.request(child.id, { name: 'Abel Tesfaye', relationship: 'Father', phone: '+251900000005', email: 'guardian.landing-demo@ankelba.example', request_key: `landing-demo-guardian-${child.id}` }, parent);
    if (guardian.status === 'pending') guardian = await pickup.review(child.id, guardian.id, { decision: 'approved', version: guardian.version, review_note: 'Fictional demonstration guardian details checked for the local screenshot fixture.' }, admin);
    if (guardian.status !== 'approved') throw new Error('Existing demo guardian is not approved; refusing to change a reviewed state automatically.');
    access.guardian = { id: guardian.id };
    access.updatedForDate = today;
    saveAccess(access);
  });

  const verification = await verifyThroughApi(access);
  console.log(JSON.stringify({ demo: name, daycareId: center.id, adminId: access.admin.id, caregiverId: access.caregiver.id, parentId: access.parent.id, childId: access.child.id, groupId: access.group.id, reports: access.reports, event: access.event, guardianId: access.guardian.id, verification, accessFile: 'tmp/landing-demo-access.json' }, null, 2));
}

main().catch(error => { console.error(`Local landing demo setup failed: ${error.message}`); process.exitCode = 1; }).finally(() => db.closeAll());
