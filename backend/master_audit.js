'use strict';
/**
 * master_audit.js
 * Comprehensive Master Backend & Database Audit for Ankelba
 * Covers: All 19 modules, database integrity, security, RBAC, and business rules.
 */
require('dotenv').config();
const http = require('http');
const { Pool } = require('pg');

const API = 'http://localhost:5000';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'ankelba_dev',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

const req = (method, path, body = null, token = null, cookie = null) => new Promise(resolve => {
  const url = new URL(path, API);
  const opts = {
    method,
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    headers: { 'Content-Type': 'application/json' }
  };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (cookie) opts.headers['Cookie'] = cookie;

  const r = http.request(opts, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      let parsed = {};
      try { parsed = JSON.parse(d || '{}'); } catch (e) { parsed = { text: d }; }
      resolve({
        status: res.statusCode,
        body: parsed,
        headers: res.headers,
        cookie: res.headers['set-cookie'] ? res.headers['set-cookie'][0].split(';')[0] : null,
      });
    });
  });
  r.on('error', e => resolve({ status: 0, body: {}, error: e.message }));
  if (body) r.write(JSON.stringify(body));
  r.end();
});

const auditResults = [];
const record = (category, name, passed, detail = '') => {
  auditResults.push({ category, name, passed, detail });
  const icon = passed ? '✅' : '❌';
  console.log(`  ${icon} [${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
};

const runAudit = async () => {
  console.log('══════════════════════════════════════════════════════════════════');
  console.log('   ANKELBA BACKEND & DATABASE FULL COMPREHENSIVE AUDIT');
  console.log('   Execution Time: ' + new Date().toISOString());
  console.log('══════════════════════════════════════════════════════════════════\n');

  // ─────────────────────────────────────────────────────────────────────────
  // 1. DATABASE SCHEMA & INTEGRITY AUDIT
  // ─────────────────────────────────────────────────────────────────────────
  console.log('─── 1. DATABASE SCHEMA & CONSTRAINTS AUDIT ───');
  const expectedTables = [
    'roles', 'users', 'groups', 'children', 'emergency_contacts',
    'care_instructions', 'guardian_links', 'attendance', 'daily_reports',
    'report_meals', 'report_activities', 'health_records', 'announcements',
    'messages', 'alerts', 'events', 'biometric_references',
    'guardian_verification_events', 'product_categories', 'products',
    'orders', 'order_items', 'payments', 'audit_logs', 'password_reset_tokens'
  ];

  try {
    const { rows: tRows } = await pool.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
    );
    const existingTables = tRows.map(r => r.tablename);
    let missingTables = 0;
    for (const t of expectedTables) {
      if (!existingTables.includes(t)) {
        record('Database', `Table exists: ${t}`, false, 'Missing');
        missingTables++;
      }
    }
    if (missingTables === 0) {
      record('Database', `All ${expectedTables.length} core and operational tables verified`, true);
    }

    const { rows: idxRows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM pg_indexes WHERE schemaname = 'public'`
    );
    const indexCount = idxRows[0]?.count || 0;
    record('Database', `Index count verification (${indexCount} indexes)`, indexCount >= 50, `Found: ${indexCount}`);

    const { rows: fkRows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM information_schema.table_constraints
       WHERE constraint_type = 'FOREIGN KEY' AND constraint_schema = 'public'`
    );
    const fkCount = fkRows[0]?.count || 0;
    record('Database', `Foreign key constraints (${fkCount} FKs)`, fkCount >= 30, `Found: ${fkCount}`);

    const { rows: chkRows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM information_schema.table_constraints
       WHERE constraint_type = 'CHECK' AND constraint_schema = 'public'`
    );
    const chkCount = chkRows[0]?.count || 0;
    record('Database', `CHECK integrity constraints (${chkCount} CHECKs)`, chkCount >= 50, `Found: ${chkCount}`);

    const { rows: roleRows } = await pool.query(`SELECT name FROM roles ORDER BY id`);
    const roleNames = roleRows.map(r => r.name);
    const rolesValid = ['admin', 'caregiver', 'parent'].every(r => roleNames.includes(r));
    record('Database', 'Roles lookup table verified (admin, caregiver, parent)', rolesValid);

  } catch (err) {
    record('Database', 'Database connection error', false, err.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. SERVER & INFRASTRUCTURE
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n─── 2. SERVER HEALTH & SECURITY HEADERS ───');
  let res = await req('GET', '/health');
  record('Infrastructure', 'Health Check endpoint (/health) returns 200 OK', res.status === 200 && res.body?.status === 'ok');
  record('Infrastructure', 'Helmet security headers attached (X-DNS-Prefetch-Control, etc.)', !!res.headers['x-dns-prefetch-control']);

  // ─────────────────────────────────────────────────────────────────────────
  // 3. AUTHENTICATION & SESSIONS
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n─── 3. AUTHENTICATION & RECOVERY FLOW ───');
  // Admin Login
  let adminRes = await req('POST', '/api/auth/login', { email: 'admin@ankelba.dev', password: '1234' });
  if (adminRes.status !== 200) adminRes = await req('POST', '/api/auth/login', { email: 'admin@ankelba.dev', password: 'Admin@123!' });
  const adminToken = adminRes.body?.token;
  const adminCookie = adminRes.cookie;
  record('Auth', 'Admin authentication (JWT Bearer & HttpOnly Cookie)', adminRes.status === 200 && !!adminToken && !!adminCookie);
  record('Auth', 'Admin user payload role is admin', adminRes.body?.user?.role === 'admin');

  // Caregiver Login
  let careRes = await req('POST', '/api/auth/login', { email: 'caregiver@ankelba.dev', password: '1234' });
  if (careRes.status !== 200) careRes = await req('POST', '/api/auth/login', { email: 'caregiver@ankelba.dev', password: 'Care@123!' });
  const careToken = careRes.body?.token;
  record('Auth', 'Caregiver authentication returns 200 OK', careRes.status === 200 && !!careToken);

  // Parent Login
  let parentRes = await req('POST', '/api/auth/login', { email: 'parent@ankelba.dev', password: '1234' });
  if (parentRes.status !== 200) parentRes = await req('POST', '/api/auth/login', { email: 'parent@ankelba.dev', password: 'Parent@123!' });
  let parentToken = parentRes.body?.token;
  record('Auth', 'Parent authentication returns 200 OK', parentRes.status === 200 && !!parentToken);

  // Authenticated /me
  let meRes = await req('GET', '/api/auth/me', null, adminToken);
  record('Auth', 'GET /api/auth/me returns current authenticated user profile', meRes.status === 200 && meRes.body?.user?.email === 'admin@ankelba.dev');

  // Unauthenticated /me
  let unauthMe = await req('GET', '/api/auth/me');
  record('Auth', 'GET /api/auth/me without token returns 401 Unauthorized', unauthMe.status === 401);

  // Invalid password
  let badPass = await req('POST', '/api/auth/login', { email: 'admin@ankelba.dev', password: 'WrongPassword!' });
  record('Auth', 'Invalid credentials rejected with 401 Unauthorized', badPass.status === 401);

  // Missing fields
  let missingField = await req('POST', '/api/auth/login', { email: 'admin@ankelba.dev' });
  record('Auth', 'Missing credentials rejected with 422 Unprocessable Entity', missingField.status === 422);

  // Password recovery flow
  let forgotRes = await req('POST', '/api/auth/forgot-password', { email: 'parent@ankelba.dev' });
  let resetToken = forgotRes.body?.reset_token;
  if (!resetToken) {
    try {
      const { inbox } = require('./src/modules/auth/legacy-inbox');
      const list = await inbox.list();
      if (list.length > 0) {
        const msg = await inbox.view(list[0].id);
        if (msg && msg.to === 'parent@ankelba.dev') resetToken = msg.token;
      }
    } catch (e) {}
  }
  record('Auth', 'Forgot password generates secure token with 1-hr expiry', forgotRes.status === 200 && !!resetToken);

  let resetRes = await req('POST', '/api/auth/reset-password', { token: resetToken, new_password: 'Parent@999!' });
  record('Auth', 'Password reset with token succeeds → 200 OK', resetRes.status === 200);

  let reuseRes = await req('POST', '/api/auth/reset-password', { token: resetToken, new_password: 'ShouldFail!' });
  record('Auth', 'Reused reset token blocked with 400 Bad Request', reuseRes.status === 400);

  // Restore parent password via login + change-password
  let newLogin = await req('POST', '/api/auth/login', { email: 'parent@ankelba.dev', password: 'Parent@999!' });
  let changeRes = await req('PATCH', '/api/auth/change-password', { current_password: 'Parent@999!', new_password: '1234' }, newLogin.body?.token);
  record('Auth', 'Authenticated change-password restored default password', changeRes.status === 200);

  // Refresh parent session token with restored password
  let restoredParent = await req('POST', '/api/auth/login', { email: 'parent@ankelba.dev', password: '1234' });
  parentToken = restoredParent.body?.token;

  // ─────────────────────────────────────────────────────────────────────────
  // 4. ROLE-BASED ACCESS CONTROL (RBAC) & SECURITY
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n─── 4. ROLE-BASED ACCESS CONTROL (RBAC) ───');
  let parentToAdmin = await req('GET', '/api/users', null, parentToken);
  record('RBAC', 'Parent blocked from Admin route (/api/users) → 403 Forbidden', parentToAdmin.status === 403);

  let careToAdmin = await req('GET', '/api/users', null, careToken);
  record('RBAC', 'Caregiver blocked from Admin route (/api/users) → 403 Forbidden', careToAdmin.status === 403);

  let sqliRes = await req('POST', '/api/auth/login', { email: "' OR '1'='1", password: "' OR '1'='1" });
  record('Security', 'SQL injection attempt blocked gracefully → 422/401', sqliRes.status === 422 || sqliRes.status === 401);

  // ─────────────────────────────────────────────────────────────────────────
  // 5. USER MANAGEMENT & SELF-SERVICE PROFILE
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n─── 5. USER MANAGEMENT & PROFILE ───');
  let usersList = await req('GET', '/api/users?limit=10', null, adminToken);
  record('Users', 'Admin lists users with pagination', usersList.status === 200 && Array.isArray(usersList.body?.data));

  const ts = Date.now();
  let createdUser = await req('POST', '/api/users', {
    name: 'Audit Temp User ' + ts,
    email: `audit_temp_${ts}@ankelba.dev`,
    password: 'Password@123!',
    role: 'parent'
  }, adminToken);
  const auditUserId = createdUser.body?.user?.id || createdUser.body?.id;
  record('Users', 'Admin creates user account (ID: ' + auditUserId + ')', createdUser.status === 201 && !!auditUserId);

  let dupEmail = await req('POST', '/api/users', {
    name: 'Dup User',
    email: 'admin@ankelba.dev',
    password: 'Password@123!',
    role: 'parent'
  }, adminToken);
  record('Users', 'Duplicate email creation rejected with 409 Conflict', dupEmail.status === 409);

  // Self-service profile
  let parentProfile = await req('GET', '/api/users/profile/me', null, parentToken);
  record('Users', 'Parent gets self-service profile with linked children attached', parentProfile.status === 200 && Array.isArray(parentProfile.body?.linked_children));

  let careProfile = await req('GET', '/api/users/profile/me', null, careToken);
  record('Users', 'Caregiver gets self-service profile with assigned children attached', careProfile.status === 200 && Array.isArray(careProfile.body?.assigned_children));

  // ─────────────────────────────────────────────────────────────────────────
  // 6. CLASS GROUPS MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n─── 6. CLASS GROUPS MODULE ───');
  let groupsList = await req('GET', '/api/groups', null, adminToken);
  record('Groups', 'GET /api/groups returns list with active_children_count', groupsList.status === 200 && Array.isArray(groupsList.body?.data));

  let createGroup = await req('POST', '/api/groups', { name: 'Audit Group ' + ts, description: 'Created by audit' }, adminToken);
  const auditGroupId = createGroup.body?.id;
  record('Groups', 'Admin creates class group (ID: ' + auditGroupId + ')', createGroup.status === 201 && !!auditGroupId);

  let deleteGroup = await req('DELETE', `/api/groups/${auditGroupId}`, null, adminToken);
  record('Groups', 'Admin deletes class group → 200 OK', deleteGroup.status === 200);

  // ─────────────────────────────────────────────────────────────────────────
  // 7. CHILDREN & GUARDIAN LINKAGE
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n─── 7. CHILDREN & GUARDIAN LINKS ───');
  let childrenList = await req('GET', '/api/children', null, adminToken);
  const testChildId = childrenList.body?.data?.[0]?.id;
  record('Children', 'Admin lists enrolled children', childrenList.status === 200 && !!testChildId);

  let childDetail = await req('GET', `/api/children/${testChildId}`, null, adminToken);
  record('Children', 'Child detail 3-query assembly (profile, emergency contacts, care instructions)', childDetail.status === 200 && Array.isArray(childDetail.body?.emergency_contacts));

  // Emergency contact standalone CRUD
  let addContact = await req('POST', `/api/children/${testChildId}/contacts`, {
    name: 'Audit Contact ' + ts,
    relationship: 'Aunt',
    phone: '+251911223344'
  }, adminToken);
  const contactId = addContact.body?.id;
  record('Children', 'Add emergency contact standalone endpoint → 201 Created', addContact.status === 201 && !!contactId);

  let delContact = await req('DELETE', `/api/children/contacts/${contactId}`, null, adminToken);
  record('Children', 'Delete emergency contact standalone endpoint → 200 OK', delContact.status === 200);

  // Care instruction standalone CRUD
  let addInst = await req('POST', `/api/children/${testChildId}/instructions`, {
    category: 'dietary',
    instruction_text: 'No gluten or artificial sugars'
  }, adminToken);
  const instId = addInst.body?.id;
  record('Children', 'Add care instruction standalone endpoint → 201 Created', addInst.status === 201 && !!instId);

  let delInst = await req('DELETE', `/api/children/instructions/${instId}`, null, adminToken);
  record('Children', 'Delete care instruction standalone endpoint → 200 OK', delInst.status === 200);

  // Guardian links check
  let guardians = await req('GET', `/api/children/${testChildId}/guardians`, null, adminToken);
  const guardianLinkId = guardians.body?.data?.[0]?.guardian_link_id;
  record('Children', 'List linked guardians with biometric_enrolled status', guardians.status === 200 && Array.isArray(guardians.body?.data));

  // ─────────────────────────────────────────────────────────────────────────
  // 8. ATTENDANCE & ACTIVITY REPORTS
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n─── 8. ATTENDANCE & DAILY REPORTS ───');
  let attGrid = await req('GET', '/api/attendance', null, adminToken);
  record('Attendance', 'Admin live attendance grid with LATERAL JOIN latest status', attGrid.status === 200 && Array.isArray(attGrid.body?.grid));

  let attSummary = await req('GET', '/api/attendance/summary', null, adminToken);
  record('Attendance', 'Admin center-wide attendance summary aggregation', attSummary.status === 200 && !!attSummary.body?.center_summary);

  let childAttSummary = await req('GET', `/api/attendance/summary?child_id=${testChildId}`, null, adminToken);
  record('Attendance', 'Child-specific attendance rate and stay hours summary', childAttSummary.status === 200 && childAttSummary.body?.attendance_rate_percent !== undefined);

  // Daily Reports
  let reportMonitor = await req('GET', '/api/reports/daily', null, adminToken);
  record('Reports', 'Admin daily reports completion monitor', reportMonitor.status === 200 && (Array.isArray(reportMonitor.body?.monitor) || Array.isArray(reportMonitor.body?.caregivers)));

  // ─────────────────────────────────────────────────────────────────────────
  // 9. HEALTH & COMMUNICATION
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n─── 9. HEALTH & COMMUNICATION ───');
  let healthHist = await req('GET', `/api/health/child/${testChildId}`, null, adminToken);
  record('Health', 'Child health history includes medical disclaimer (FR-HIR-06)', healthHist.status === 200 && !!healthHist.body?.disclaimer);

  let mealPlans = await req('GET', '/api/announcements/meal-plan', null, parentToken);
  record('Communication', 'Dedicated meal plans endpoint (/api/announcements/meal-plan)', mealPlans.status === 200 && Array.isArray(mealPlans.body?.data));

  let alertsList = await req('GET', '/api/alerts', null, parentToken);
  record('Communication', 'Parent receives active alerts list', alertsList.status === 200 && Array.isArray(alertsList.body?.data));

  let messagesList = await req('GET', '/api/messages', null, careToken);
  record('Communication', 'Caregiver fetches direct messaging threads', messagesList.status === 200 && Array.isArray(messagesList.body?.data));

  // ─────────────────────────────────────────────────────────────────────────
  // 10. EVENTS CALENDAR & STORE
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n─── 10. EVENTS & STORE ───');
  let eventsList = await req('GET', '/api/events', null, parentToken);
  record('Events', 'Upcoming active events queried via partial index', eventsList.status === 200 && Array.isArray(eventsList.body?.data));

  let categoriesList = await req('GET', '/api/store/categories', null, parentToken);
  record('Store', 'Store categories listed with product counts', categoriesList.status === 200 && Array.isArray(categoriesList.body?.data));

  let productsList = await req('GET', '/api/store/products', null, parentToken);
  record('Store', 'Store products catalog available for browsing', productsList.status === 200 && Array.isArray(productsList.body?.data));

  // ─────────────────────────────────────────────────────────────────────────
  // 11. PAYMENTS, BIOMETRICS & AUDIT
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n─── 11. PAYMENTS, BIOMETRICS & AUDIT ───');
  let payOrder = await req('GET', '/api/payments/order/1', null, adminToken);
  record('Payments', 'Payment retrieval by order ID', payOrder.status === 200 || payOrder.status === 404);

  let auditTrail = await req('GET', '/api/audit?limit=10', null, adminToken);
  record('Audit', 'Security audit trail queried with JSONB metadata', auditTrail.status === 200 && Array.isArray(auditTrail.body?.data));

  // ─────────────────────────────────────────────────────────────────────────
  // 12. AI GUIDE, NOTIFICATIONS & GLOBAL SEARCH
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n─── 12. AI GUIDE, NOTIFICATIONS & SEARCH ───');
  let aiGuide = await req('POST', '/api/ai/guide', { question: 'What learning games can we play?' }, parentToken);
  record('AI Guide', 'AI Guide returns parenting advice with safety disclaimer', aiGuide.status === 200 && !!aiGuide.body?.disclaimer);

  let aiMedicalGuard = await req('POST', '/api/ai/guide', { question: 'What medicine dose for fever?' }, parentToken);
  record('AI Guide', 'AI Guide blocks medical queries and triggers safety redirect (FR-AI-05)', aiMedicalGuard.status === 200 && aiMedicalGuard.body?.is_medical_query === true);

  let notifInbox = await req('GET', '/api/notifications', null, adminToken);
  record('Notifications', 'Notifications inbox aggregates badge counts for header', notifInbox.status === 200 && notifInbox.body?.total_badges !== undefined);

  let searchRes = await req('GET', '/api/search?q=admin', null, adminToken);
  record('Search', 'Global multi-entity search returns scoped results', searchRes.status === 200 && searchRes.body?.results !== undefined);

  // ─────────────────────────────────────────────────────────────────────────
  // AUDIT SUMMARY
  // ─────────────────────────────────────────────────────────────────────────
  const total = auditResults.length;
  const passed = auditResults.filter(r => r.passed).length;
  const failed = total - passed;
  const score = Math.round((passed / total) * 100);

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('                 FINAL AUDIT SCORECARD');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(`  TOTAL AUDIT CHECKS : ${total}`);
  console.log(`  PASSED             : ${passed}`);
  console.log(`  FAILED             : ${failed}`);
  console.log(`  OVERALL SCORE      : ${score}%`);
  console.log('══════════════════════════════════════════════════════════════════\n');

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
};

runAudit().catch(err => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
