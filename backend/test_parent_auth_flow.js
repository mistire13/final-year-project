'use strict';
require('dotenv').config();
const http = require('http');
const app = require('./src/app');

let server;
let port;
let baseUrl;

const req = (method, path, body = null, token = null) => new Promise((resolve, reject) => {
  const url = new URL(path, baseUrl);
  const opts = {
    method,
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    headers: { 'Content-Type': 'application/json' },
  };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;

  const r = http.request(opts, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      try {
        resolve({ status: res.statusCode, body: JSON.parse(d || '{}'), headers: res.headers });
      } catch (e) {
        resolve({ status: res.statusCode, body: { raw: d }, headers: res.headers });
      }
    });
  });
  r.on('error', reject);
  if (body) r.write(JSON.stringify(body));
  r.end();
});

let passed = 0;
let failed = 0;
const assert = (condition, name, details = '') => {
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] ${name}`);
  } else {
    failed++;
    console.error(`  ❌ [FAIL] ${name} — ${details}`);
  }
};

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('      ANKELBA PARENT AUTHENTICATION & LOGIN FLOW VERIFICATION SUITE       ');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  // Start in-memory HTTP server
  server = app.listen(0);
  port = server.address().port;
  baseUrl = `http://localhost:${port}`;
  console.log(`Test server running on ephemeral port ${port}...\n`);

  try {
    // -------------------------------------------------------------
    // Test 1: Invalid Password Rejection (NFR-SEC-04)
    // -------------------------------------------------------------
    console.log('[1] Testing Invalid Credentials Rejection:');
    let res = await req('POST', '/api/auth/login', {
      email: 'parent@ankelba.dev',
      password: 'WrongPassword123!',
    });
    assert(res.status === 401, 'Invalid password returns HTTP 401 Unauthorized', `Status: ${res.status}`);
    assert(res.body?.error === 'Invalid credentials', 'Generic error message returned ("Invalid credentials")', JSON.stringify(res.body));

    // -------------------------------------------------------------
    // Test 2: Valid Parent Login (FR-UAM-01, FR-UAM-02, NFR-SEC-03)
    // -------------------------------------------------------------
    console.log('\n[2] Testing Parent Login (parent@ankelba.dev):');
    res = await req('POST', '/api/auth/login', {
      email: 'parent@ankelba.dev',
      password: 'Parent@123!',
    });
    assert(res.status === 200, 'Valid credentials return HTTP 200 OK', `Status: ${res.status}`);
    assert(typeof res.body?.token === 'string' && res.body.token.length > 50, 'JWT token returned in body', `Token: ${res.body?.token?.slice(0, 25)}...`);
    assert(res.body?.user?.role === 'parent', 'User role is "parent"', `Role: ${res.body?.user?.role}`);
    assert(res.body?.user?.email === 'parent@ankelba.dev', 'User email matches', res.body?.user?.email);
    assert(Array.isArray(res.body?.user?.linked_children), 'User payload includes linked_children array', JSON.stringify(res.body?.user?.linked_children));
    assert(res.body?.user?.linked_children?.length > 0, `Parent is linked to child (${res.body?.user?.linked_children?.[0]?.full_name})`);

    const parentToken = res.body?.token;
    const linkedChildId = res.body?.user?.linked_children?.[0]?.id;

    // -------------------------------------------------------------
    // Test 3: Session Verification via /api/auth/me (FR-UAM-01, FR-UAM-03)
    // -------------------------------------------------------------
    console.log('\n[3] Testing Session Verification (/api/auth/me):');
    res = await req('GET', '/api/auth/me', null, parentToken);
    assert(res.status === 200, 'GET /api/auth/me returns HTTP 200 OK with valid JWT', `Status: ${res.status}`);
    assert(typeof res.body?.user?.id === 'number' && res.body?.user?.id > 0, 'User ID is valid integer', `User ID: ${res.body?.user?.id}`);
    assert(res.body?.user?.role === 'parent', 'User role is confirmed "parent"', `Role: ${res.body?.user?.role}`);
    assert(Array.isArray(res.body?.user?.linked_children), 'Auth/me returns linked_children', JSON.stringify(res.body?.user?.linked_children));

    // -------------------------------------------------------------
    // Test 4: Access to Linked Child Profile (FR-CH-04, FR-UAM-05)
    // -------------------------------------------------------------
    console.log('\n[4] Testing Parent Access to Linked Child Profile:');
    res = await req('GET', `/api/children/${linkedChildId}`, null, parentToken);
    assert(res.status === 200, `GET /api/children/${linkedChildId} returns HTTP 200 OK for linked child`, `Status: ${res.status}`);
    assert(res.body?.full_name === 'Abebe Kebede', 'Child profile data returned', res.body?.full_name);

    // -------------------------------------------------------------
    // Test 5: Isolation & Unauthorized Child Access Prevention (FR-UAM-05)
    // -------------------------------------------------------------
    console.log('\n[5] Testing Parent Child Isolation (FR-UAM-05):');
    // Child 2 is Sara Tadesse (not linked to parent 24)
    res = await req('GET', '/api/children/2', null, parentToken);
    assert(res.status === 403, 'GET /api/children/2 for unlinked child is blocked with HTTP 403 Forbidden', `Status: ${res.status}`);
    assert(res.body?.error?.includes('Access denied'), 'Access denied message returned', res.body?.error);

    // -------------------------------------------------------------
    // Test 6: Admin-Only Route Protection (FR-UAM-06)
    // -------------------------------------------------------------
    console.log('\n[6] Testing RBAC Restriction on Admin Routes:');
    res = await req('GET', '/api/users', null, parentToken);
    assert(res.status === 403, 'Parent cannot access GET /api/users (Admin-only) → 403 Forbidden', `Status: ${res.status}`);

    // -------------------------------------------------------------
    // Test 7: Parent Attendance Access & Isolation (FR-ATT-04, FR-UAM-05)
    // -------------------------------------------------------------
    console.log('\n[7] Testing Attendance Access for Linked Child:');
    res = await req('GET', `/api/attendance/child/${linkedChildId}`, null, parentToken);
    assert(res.status === 200, `Parent can view attendance events for linked child ${linkedChildId}`, `Status: ${res.status}`);

    res = await req('GET', `/api/attendance/summary?child_id=${linkedChildId}`, null, parentToken);
    assert(res.status === 200, `Parent can view attendance summary for linked child ${linkedChildId}`, `Status: ${res.status}`);

    // Verify parent is blocked from other children's attendance
    res = await req('GET', `/api/attendance/child/2`, null, parentToken);
    assert(res.status === 403, `Parent is blocked from unlinked child 2 attendance (403 Forbidden)`, `Status: ${res.status}`);

    // Summary
    console.log('\n═══════════════════════════════════════════════════════════════════════════');
    console.log(`  VERIFICATION RESULTS:  ${passed} PASSED  |  ${failed} FAILED`);
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

  } catch (e) {
    console.error('Fatal test error:', e);
  } finally {
    if (server) server.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
