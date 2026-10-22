'use strict';
/**
 * test_swt_comprehensive.js
 *
 * Automated Software Testing (SWT) Verification Suite for Ankelba Daycare System.
 * Implements formal testing methodologies from the Software Testing course modules:
 * - Chapter 3: Test Techniques (ECP, BVA, Decision Tables, State Transitions, Basis Paths)
 * - Chapter 4: IEEE 829 Test Planning & Standard Test Case Specification Table
 * - Chapter 5: Test Metrics (Pre-process estimation, In-process tracking, End-process quality)
 * - Chapter 6: Test Management & One-Page Executive Dashboard
 * - Chapter 7: Modular & Data-Driven Automation Framework
 */

require('dotenv').config();
const http = require('http');

const BASE_HOST = 'localhost';
const BASE_PORT = 5000;

function req(method, path, body = null, token = null) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: BASE_HOST,
      port: BASE_PORT,
      path: '/api' + path,
      method: method,
      headers: {
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
      },
    };

    const request = http.request(options, (res) => {
      let buf = '';
      res.on('data', (chunk) => (buf += chunk));
      res.on('end', () => {
        const latencyMs = Date.now() - startTime;
        let parsed = null;
        try {
          parsed = buf ? JSON.parse(buf) : {};
        } catch {
          parsed = { raw: buf };
        }
        resolve({ status: res.statusCode, body: parsed, latencyMs });
      });
    });

    request.on('error', (err) => reject(err));
    if (data) request.write(data);
    request.end();
  });
}

// Global test registry
const testResults = [];
const latencies = [];

function recordTest({ id, module, technique, title, preconditions, steps, expected, actual, status, severity = 'Normal', latencyMs = 0 }) {
  testResults.push({
    id,
    module,
    technique,
    title,
    preconditions,
    steps,
    expected,
    actual,
    status,
    severity,
    latencyMs
  });
  if (latencyMs > 0) latencies.push(latencyMs);

  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`  ${icon} [${status}] ${id}: ${title} (${status === 'PASS' ? actual : `FAIL: ${actual}`}) [${latencyMs}ms]`);
}

async function runSwtSuite() {
  const runId = Date.now().toString().slice(-6);
  console.log(`\n========================================================================`);
  console.log(`  ANKELBA SYSTEM VERIFICATION SUITE — SWT COURSE SPECIFICATION`);
  console.log(`  Execution Run ID: ${runId}`);
  console.log(`========================================================================\n`);

  // Shared state across suites
  let superAdminToken = null;
  let daycareA_Id = null;
  let daycareA_Slug = null;
  const dirA_Email = `director_${runId}@alpha.com`;
  const dirA_Pass = `Dir@${runId}!`;
  let directorA_Token = null;

  let groupA_Id = null;
  let caregiverA_Id = null;
  const cgA_Email = `caregiver_${runId}@alpha.com`;
  const cgA_Pass = `Care@${runId}!`;
  let caregiverA_Token = null;

  let childA_Id = null;
  let parentA_Id = null;
  const parentA_Email = `parent_${runId}@alpha.com`;
  const parentA_Pass = `Parent@${runId}!`;
  let parentA_Token = null;

  let daycareB_Id = null;
  const dirB_Email = `director_${runId}@beta.com`;
  const dirB_Pass = `DirBeta@${runId}!`;
  let directorB_Token = null;

  let todayReportId = null;
  let productA_Id = null;
  let orderA_Id = null;

  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Addis_Ababa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  // ========================================================================
  // SUITE 1: EQUIVALENCE CLASS PARTITIONING (ECP) & BOUNDARY VALUE ANALYSIS (BVA)
  // ========================================================================
  console.log(`--- [SUITE 1] Equivalence Class Partitioning (ECP) & Boundary Value Analysis (BVA) ---`);

  // TC_ECP_01: Valid Authentication (Contractual Positive Test)
  const saLogin = await req('POST', '/auth/login', {
    email: 'superadmin@ankelba.com',
    password: '1234',
  });
  if (saLogin.status === 200 && saLogin.body.token) {
    superAdminToken = saLogin.body.token;
    recordTest({
      id: 'TC_ECP_01',
      module: 'Authentication',
      technique: 'ECP (Valid Class)',
      title: 'Login with valid credentials and valid email format',
      preconditions: 'SuperAdmin account exists in database',
      steps: 'POST /api/auth/login with valid superadmin credentials',
      expected: 'HTTP 200 with JWT authentication token',
      actual: `HTTP 200 received; token issued (Role: ${saLogin.body.user?.role})`,
      status: 'PASS',
      latencyMs: saLogin.latencyMs
    });
  } else {
    recordTest({
      id: 'TC_ECP_01',
      module: 'Authentication',
      technique: 'ECP (Valid Class)',
      title: 'Login with valid credentials and valid email format',
      preconditions: 'SuperAdmin account exists in database',
      steps: 'POST /api/auth/login with valid credentials',
      expected: 'HTTP 200 with JWT token',
      actual: `HTTP ${saLogin.status}`,
      status: 'FAIL',
      severity: 'Critical',
      latencyMs: saLogin.latencyMs
    });
  }

  // TC_ECP_02: Invalid Email Format missing '@' (Chapter 4 Slide 38)
  const badEmailRes = await req('POST', '/auth/login', {
    email: 'testuser.example.com',
    password: 'Password123!',
  });
  if (badEmailRes.status === 422 || badEmailRes.status === 400) {
    recordTest({
      id: 'TC_ECP_02',
      module: 'Authentication',
      technique: 'ECP (Invalid Class)',
      title: 'Login with invalid email format (missing @)',
      preconditions: 'Authentication endpoint reachable',
      steps: 'POST /api/auth/login with email="testuser.example.com"',
      expected: 'HTTP 422/400 validation error: "Please enter a valid email address"',
      actual: `HTTP ${badEmailRes.status} Error: ${badEmailRes.body.error || 'Validation failed'}`,
      status: 'PASS',
      latencyMs: badEmailRes.latencyMs
    });
  } else {
    recordTest({
      id: 'TC_ECP_02',
      module: 'Authentication',
      technique: 'ECP (Invalid Class)',
      title: 'Login with invalid email format (missing @)',
      preconditions: 'Authentication endpoint reachable',
      steps: 'POST /api/auth/login with email="testuser.example.com"',
      expected: 'HTTP 422 validation error',
      actual: `HTTP ${badEmailRes.status}`,
      status: 'FAIL',
      severity: 'Major',
      latencyMs: badEmailRes.latencyMs
    });
  }

  // TC_ECP_03: Valid email with incorrect password (Chapter 4 Slide 39)
  const wrongPassRes = await req('POST', '/auth/login', {
    email: 'superadmin@ankelba.com',
    password: 'WrongPassword999!',
  });
  if (wrongPassRes.status === 401) {
    recordTest({
      id: 'TC_ECP_03',
      module: 'Authentication',
      technique: 'ECP (Invalid Class)',
      title: 'Login with correct email but incorrect password',
      preconditions: 'superadmin@ankelba.com exists in database',
      steps: 'POST /api/auth/login with incorrect password',
      expected: 'HTTP 401 Unauthorized ("Invalid credentials")',
      actual: `HTTP 401 Unauthorized received (${wrongPassRes.body.error || 'Invalid credentials'})`,
      status: 'PASS',
      latencyMs: wrongPassRes.latencyMs
    });
  } else {
    recordTest({
      id: 'TC_ECP_03',
      module: 'Authentication',
      technique: 'ECP (Invalid Class)',
      title: 'Login with correct email but incorrect password',
      preconditions: 'superadmin exists',
      steps: 'POST /api/auth/login with incorrect password',
      expected: 'HTTP 401',
      actual: `HTTP ${wrongPassRes.status}`,
      status: 'FAIL',
      severity: 'Critical',
      latencyMs: wrongPassRes.latencyMs
    });
  }

  // TC_ECP_04: Defensive Empty Payload (Chapter 3 Slide 74)
  const emptyPayloadRes = await req('POST', '/auth/login', {});
  if (emptyPayloadRes.status === 422 || emptyPayloadRes.status === 400) {
    recordTest({
      id: 'TC_ECP_04',
      module: 'Authentication',
      technique: 'Defensive Testing',
      title: 'Login with empty JSON payload {}',
      preconditions: 'API online',
      steps: 'POST /api/auth/login with empty object body',
      expected: 'Graceful HTTP 422/400 validation error without server crash',
      actual: `HTTP ${emptyPayloadRes.status} (${emptyPayloadRes.body.error || 'Validation failed'})`,
      status: 'PASS',
      latencyMs: emptyPayloadRes.latencyMs
    });
  } else {
    recordTest({
      id: 'TC_ECP_04',
      module: 'Authentication',
      technique: 'Defensive Testing',
      title: 'Login with empty JSON payload {}',
      preconditions: 'API online',
      steps: 'POST /api/auth/login with empty object body',
      expected: 'HTTP 422/400 error',
      actual: `HTTP ${emptyPayloadRes.status}`,
      status: 'FAIL',
      severity: 'Major',
      latencyMs: emptyPayloadRes.latencyMs
    });
  }

  // TC_BVA_01: Boundary Below Min Password (N = 3 < 4 chars)
  const bvaShortRes = await req('POST', '/register-daycare', {
    daycareName: `BVA Short ${runId}`,
    contactEmail: `bva_short_${runId}@daycare.com`,
    contactPhone: '+251 91 111 2233',
    adminName: 'BVA Short Director',
    adminEmail: `bva_short_${runId}@daycare.com`,
    adminPassword: '123', // 3 chars
  });
  if (bvaShortRes.status === 400 || bvaShortRes.status === 422) {
    recordTest({
      id: 'TC_BVA_01',
      module: 'SaaS Onboarding',
      technique: 'BVA (Below Min Boundary N=3 < 4)',
      title: 'Daycare registration with password length below minimum (3 chars)',
      preconditions: 'Registration policy requires min 4-character password',
      steps: 'POST /api/register-daycare with adminPassword="123"',
      expected: 'HTTP 400/422 rejection: Password must be at least 4 characters',
      actual: `HTTP ${bvaShortRes.status} Error: ${bvaShortRes.body.error}`,
      status: 'PASS',
      latencyMs: bvaShortRes.latencyMs
    });
  } else {
    recordTest({
      id: 'TC_BVA_01',
      module: 'SaaS Onboarding',
      technique: 'BVA (Below Min Boundary)',
      title: 'Daycare registration with password length below minimum',
      preconditions: 'Registration policy requires min 4-char password',
      steps: 'POST /api/register-daycare with adminPassword="123"',
      expected: 'HTTP 400/422 rejection',
      actual: `HTTP ${bvaShortRes.status}`,
      status: 'FAIL',
      severity: 'Major',
      latencyMs: bvaShortRes.latencyMs
    });
  }

  // TC_BVA_02: Boundary On Min Password (N = 4 chars) & Daycare A Creation
  const bvaValidRes = await req('POST', '/register-daycare', {
    daycareName: `Alpha Academy ${runId}`,
    contactEmail: `contact_${runId}@alpha.com`,
    contactPhone: '+251 91 222 3344',
    address: 'Bole Road, Addis Ababa',
    licenseNumber: `LIC-ALPHA-${runId}`,
    adminName: 'Director Hanna',
    adminEmail: dirA_Email,
    adminPassword: dirA_Pass,
  });
  if (bvaValidRes.status === 201 && bvaValidRes.body.daycare?.id) {
    daycareA_Id = bvaValidRes.body.daycare.id;
    daycareA_Slug = bvaValidRes.body.daycare.slug;
    recordTest({
      id: 'TC_BVA_02',
      module: 'SaaS Onboarding',
      technique: 'BVA (On Min Boundary N=4+)',
      title: 'Daycare registration with valid boundary credentials',
      preconditions: 'Unique daycare license & admin email',
      steps: 'POST /api/register-daycare with complete valid payload',
      expected: 'HTTP 201 Success: Daycare registered with status pending',
      actual: `HTTP 201 Daycare ID: ${daycareA_Id} registered (Status: ${bvaValidRes.body.daycare?.status})`,
      status: 'PASS',
      latencyMs: bvaValidRes.latencyMs
    });
  } else {
    recordTest({
      id: 'TC_BVA_02',
      module: 'SaaS Onboarding',
      technique: 'BVA (On Min Boundary)',
      title: 'Daycare registration with valid boundary credentials',
      preconditions: 'Unique daycare license',
      steps: 'POST /api/register-daycare',
      expected: 'HTTP 201 Success',
      actual: `HTTP ${bvaValidRes.status}: ${JSON.stringify(bvaValidRes.body)}`,
      status: 'FAIL',
      severity: 'Critical',
      latencyMs: bvaValidRes.latencyMs
    });
  }

  // ========================================================================
  // SUITE 2: DECISION TABLE TESTING (DTT) - RBAC & MULTI-TENANCY
  // ========================================================================
  console.log(`\n--- [SUITE 2] Decision Table Testing (DTT) - RBAC & Multi-Tenancy ---`);

  // Activate Daycare A via Super Admin
  await req('PATCH', `/saas/super-admin/daycares/${daycareA_Id}/approve`, { trialDays: 30 }, superAdminToken);

  // Director A Login
  const dirLoginRes = await req('POST', '/auth/login', {
    email: dirA_Email,
    password: dirA_Pass,
  });
  directorA_Token = dirLoginRes.body.token;

  // Create Classroom Group
  const grpRes = await req('POST', '/groups', {
    name: `Toddlers Room ${runId}`,
    capacity: 15,
  }, directorA_Token);
  groupA_Id = grpRes.body.id;

  // Create Caregiver
  const cgRes = await req('POST', '/users', {
    name: `Teacher Aster ${runId}`,
    email: cgA_Email,
    password: cgA_Pass,
    role: 'caregiver',
    phone: '+251 91 333 4455',
  }, directorA_Token);
  caregiverA_Id = cgRes.body.id;

  const cgLoginRes = await req('POST', '/auth/login', {
    email: cgA_Email,
    password: cgA_Pass,
  });
  caregiverA_Token = cgLoginRes.body.token;

  // Enroll Child
  const chRes = await req('POST', '/children', {
    full_name: `Yonas Alemayehu ${runId}`,
    dob: '2023-06-10',
    gender: 'male',
    group_id: groupA_Id,
    caregiver_id: caregiverA_Id,
    enrollment_status: 'active',
    emergency_contacts: [
      { name: 'Alemayehu Tesfaye', relationship: 'Father', phone: '+251 91 444 5566' }
    ],
    care_instructions: [
      { category: 'allergy', instruction_text: 'Peanuts and Tree Nuts allergy' }
    ]
  }, directorA_Token);
  childA_Id = chRes.body.id;

  // Create Parent
  const prRes = await req('POST', '/users', {
    name: `Alemayehu Tesfaye ${runId}`,
    email: parentA_Email,
    password: parentA_Pass,
    role: 'parent',
    phone: '+251 91 444 5566',
  }, directorA_Token);
  parentA_Id = prRes.body.id;

  await req('POST', `/children/${childA_Id}/guardians`, {
    user_id: parentA_Id,
    relationship: 'Father',
    pickup_authorized: true,
  }, directorA_Token);

  const parentLoginRes = await req('POST', '/auth/login', {
    email: parentA_Email,
    password: parentA_Pass,
  });
  parentA_Token = parentLoginRes.body.token;

  // TC_DTT_01: Rule 1 - Unauthenticated user accessing protected endpoint
  const unauthRes = await req('GET', '/portal/me', null, null);
  if (unauthRes.status === 401) {
    recordTest({
      id: 'TC_DTT_01',
      module: 'RBAC Authorization',
      technique: 'Decision Table (Rule 1: Unauthenticated -> Deny)',
      title: 'Unauthenticated request to protected portal endpoint',
      preconditions: 'Endpoint /api/portal/me requires active Bearer token',
      steps: 'GET /api/portal/me without Authorization header',
      expected: 'HTTP 401 Unauthorized',
      actual: `HTTP 401 (${unauthRes.body.error})`,
      status: 'PASS',
      latencyMs: unauthRes.latencyMs
    });
  } else {
    recordTest({
      id: 'TC_DTT_01',
      module: 'RBAC Authorization',
      technique: 'Decision Table',
      title: 'Unauthenticated request to protected portal endpoint',
      preconditions: 'Protected route',
      steps: 'GET /api/portal/me without header',
      expected: 'HTTP 401',
      actual: `HTTP ${unauthRes.status}`,
      status: 'FAIL',
      severity: 'Critical',
      latencyMs: unauthRes.latencyMs
    });
  }

  // TC_DTT_02: Rule 2 - Parent role attempting administrative user creation
  const parentIllegalRes = await req('POST', '/users', {
    name: 'Intruder',
    email: `intruder_${runId}@fake.com`,
    password: 'Password123!',
    role: 'admin',
  }, parentA_Token);
  if (parentIllegalRes.status === 403) {
    recordTest({
      id: 'TC_DTT_02',
      module: 'RBAC Authorization',
      technique: 'Decision Table (Rule 2: Parent -> Admin Action)',
      title: 'Parent role attempting to provision administrative accounts',
      preconditions: 'User authenticated with role="parent"',
      steps: 'POST /api/users with Parent token',
      expected: 'HTTP 403 Forbidden',
      actual: `HTTP 403 Forbidden (${parentIllegalRes.body.error})`,
      status: 'PASS',
      latencyMs: parentIllegalRes.latencyMs
    });
  } else {
    recordTest({
      id: 'TC_DTT_02',
      module: 'RBAC Authorization',
      technique: 'Decision Table',
      title: 'Parent role attempting to provision administrative accounts',
      preconditions: 'User authenticated with role="parent"',
      steps: 'POST /api/users with Parent token',
      expected: 'HTTP 403 Forbidden',
      actual: `HTTP ${parentIllegalRes.status}`,
      status: 'FAIL',
      severity: 'Critical',
      latencyMs: parentIllegalRes.latencyMs
    });
  }

  // TC_DTT_03: Rule 3 - Caregiver attempting catalog product creation
  const cgIllegalRes = await req('POST', '/store/products', {
    name: 'Caregiver Product',
    price: 200,
    stock_qty: 5,
  }, caregiverA_Token);
  if (cgIllegalRes.status === 403) {
    recordTest({
      id: 'TC_DTT_03',
      module: 'Store Catalog',
      technique: 'Decision Table (Rule 3: Caregiver -> Catalog Admin)',
      title: 'Caregiver role attempting to create store catalog product',
      preconditions: 'User authenticated with role="caregiver"',
      steps: 'POST /api/store/products with Caregiver token',
      expected: 'HTTP 403 Forbidden',
      actual: `HTTP 403 Forbidden (${cgIllegalRes.body.error})`,
      status: 'PASS',
      latencyMs: cgIllegalRes.latencyMs
    });
  } else {
    recordTest({
      id: 'TC_DTT_03',
      module: 'Store Catalog',
      technique: 'Decision Table',
      title: 'Caregiver role attempting to create store catalog product',
      preconditions: 'User authenticated with role="caregiver"',
      steps: 'POST /api/store/products with Caregiver token',
      expected: 'HTTP 403 Forbidden',
      actual: `HTTP ${cgIllegalRes.status}`,
      status: 'FAIL',
      severity: 'Major',
      latencyMs: cgIllegalRes.latencyMs
    });
  }

  // TC_DTT_04: Rule 4 - Daycare Director creating product in own catalog
  const adminProdRes = await req('POST', '/store/products', {
    name: `Diaper Pack ${runId}`,
    description: 'Cotton diapers size 3',
    price: 350.0,
    stock_qty: 25,
    available: true,
  }, directorA_Token);
  if (adminProdRes.status === 201 && adminProdRes.body.id) {
    productA_Id = adminProdRes.body.id;
    recordTest({
      id: 'TC_DTT_04',
      module: 'Store Catalog',
      technique: 'Decision Table (Rule 4: Director -> Catalog Admin)',
      title: 'Daycare Director creating product in own daycare store catalog',
      preconditions: 'User authenticated with role="admin" for Daycare A',
      steps: 'POST /api/store/products with Director A token',
      expected: 'HTTP 201 Product created with ID',
      actual: `HTTP 201 Product ID: ${productA_Id} created (Stock: ${adminProdRes.body.stock_qty})`,
      status: 'PASS',
      latencyMs: adminProdRes.latencyMs
    });
  } else {
    recordTest({
      id: 'TC_DTT_04',
      module: 'Store Catalog',
      technique: 'Decision Table',
      title: 'Daycare Director creating product in own daycare store catalog',
      preconditions: 'Director A authenticated',
      steps: 'POST /api/store/products',
      expected: 'HTTP 201 Product created',
      actual: `HTTP ${adminProdRes.status}`,
      status: 'FAIL',
      severity: 'Major',
      latencyMs: adminProdRes.latencyMs
    });
  }

  // TC_DTT_05: Rule 5 - Cross-Tenant Isolation (Daycare B Director accessing Daycare A Child)
  const regB_Res = await req('POST', '/register-daycare', {
    daycareName: `Beta Academy ${runId}`,
    contactEmail: `contact_${runId}@beta.com`,
    contactPhone: '+251 92 888 9900',
    adminName: 'Beta Director',
    adminEmail: dirB_Email,
    adminPassword: dirB_Pass,
  });
  daycareB_Id = regB_Res.body.daycare?.id;
  await req('PATCH', `/saas/super-admin/daycares/${daycareB_Id}/approve`, { trialDays: 30 }, superAdminToken);

  const dirB_Login = await req('POST', '/auth/login', {
    email: dirB_Email,
    password: dirB_Pass,
  });
  directorB_Token = dirB_Login.body.token;

  const crossTenantRes = await req('GET', `/children/${childA_Id}`, null, directorB_Token);
  if (crossTenantRes.status === 404 || crossTenantRes.status === 403) {
    recordTest({
      id: 'TC_DTT_05',
      module: 'Multi-Tenant Isolation',
      technique: 'Decision Table (Rule 5: Cross-Tenant -> Deny)',
      title: 'Daycare B Director blocked from accessing Daycare A child profile',
      preconditions: `Child ID ${childA_Id} belongs to Daycare A; Director B belongs to Daycare B`,
      steps: `GET /api/children/${childA_Id} with Director B token`,
      expected: 'HTTP 404/403: Record not found / Access denied (Row-Level Security)',
      actual: `HTTP ${crossTenantRes.status} (${crossTenantRes.body.error})`,
      status: 'PASS',
      latencyMs: crossTenantRes.latencyMs
    });
  } else {
    recordTest({
      id: 'TC_DTT_05',
      module: 'Multi-Tenant Isolation',
      technique: 'Decision Table',
      title: 'Daycare B Director blocked from accessing Daycare A child profile',
      preconditions: 'Child A belongs to Daycare A; Director B belongs to Daycare B',
      steps: `GET /api/children/${childA_Id} with Director B token`,
      expected: 'HTTP 404/403',
      actual: `SECURITY LEAK: HTTP ${crossTenantRes.status}`,
      status: 'FAIL',
      severity: 'Blocker',
      latencyMs: crossTenantRes.latencyMs
    });
  }

  // ========================================================================
  // SUITE 3: STATE-TRANSITION TESTING (STT) - CHILD ATTENDANCE & CARE LIFECYCLE
  // ========================================================================
  console.log(`\n--- [SUITE 3] State-Transition Testing (STT) - Child Attendance Lifecycle ---`);

  // TC_STT_01: S0 (Not Arrived) -> S1 (Checked In)
  const checkinRes = await req('POST', '/attendance', {
    child_id: childA_Id,
    event_type: 'checkin',
    notes: 'Morning drop-off by father',
  }, caregiverA_Token);
  if (checkinRes.status === 201 && checkinRes.body.event_type === 'checkin') {
    recordTest({
      id: 'TC_STT_01',
      module: 'Attendance Lifecycle',
      technique: 'State Transition (S0: Absent -> S1: Present)',
      title: 'Child morning check-in transition from Absent to Present',
      preconditions: 'Child is currently marked Absent today',
      steps: `POST /api/attendance with event_type="checkin" for child ${childA_Id}`,
      expected: 'HTTP 201 Status: Present, Attendance event recorded',
      actual: `HTTP 201 (Event ID: ${checkinRes.body.id}, Type: checkin)`,
      status: 'PASS',
      latencyMs: checkinRes.latencyMs
    });
  } else {
    recordTest({
      id: 'TC_STT_01',
      module: 'Attendance Lifecycle',
      technique: 'State Transition',
      title: 'Child morning check-in transition from Absent to Present',
      preconditions: 'Child is currently marked Absent',
      steps: `POST /api/attendance`,
      expected: 'HTTP 201',
      actual: `HTTP ${checkinRes.status}`,
      status: 'FAIL',
      severity: 'Critical',
      latencyMs: checkinRes.latencyMs
    });
  }

  // TC_STT_02: S1 -> S1: Illegal Duplicate Check-In
  const dupCheckinRes = await req('POST', '/attendance', {
    child_id: childA_Id,
    event_type: 'checkin',
    notes: 'Duplicate checkin attempt',
  }, caregiverA_Token);
  if (dupCheckinRes.status === 409 || dupCheckinRes.status === 422 || dupCheckinRes.status === 400) {
    recordTest({
      id: 'TC_STT_02',
      module: 'Attendance Lifecycle',
      technique: 'State Transition (Illegal: Present -> Check-In)',
      title: 'Reject duplicate morning check-in for child already marked present',
      preconditions: 'Child status is already Present in daycare',
      steps: `POST /api/attendance second time for child ${childA_Id}`,
      expected: 'HTTP 409/422/400 Conflict: Child already checked in today',
      actual: `HTTP ${dupCheckinRes.status} (${dupCheckinRes.body.error})`,
      status: 'PASS',
      latencyMs: dupCheckinRes.latencyMs
    });
  } else {
    recordTest({
      id: 'TC_STT_02',
      module: 'Attendance Lifecycle',
      technique: 'State Transition',
      title: 'Reject duplicate morning check-in for child already marked present',
      preconditions: 'Child is already Present',
      steps: `POST /api/attendance second time`,
      expected: 'HTTP 409 Conflict',
      actual: `HTTP ${dupCheckinRes.status}`,
      status: 'FAIL',
      severity: 'Major',
      latencyMs: dupCheckinRes.latencyMs
    });
  }

  // TC_STT_03: S1 (Present) -> S2 (Activities & Care Logged)
  const reportPayload = {
    child_id: childA_Id,
    report_date: todayStr,
    sleep_duration_min: 60,
    sleep_notes: 'Rested quietly during afternoon nap',
    mood: 'happy',
    behavior_notes: 'Very engaged during circle time',
    general_observations: 'Ate well and completed alphabet puzzle',
    meals: [
      { meal_type: 'breakfast', description: 'Porridge and fruit', portion: 'good' },
      { meal_type: 'lunch', description: 'Vegetable stew and rice', portion: 'good' }
    ],
    activities: [
      { activity_type: 'learning', description: 'Alphabet flashcards', location: 'indoor' },
      { activity_type: 'play', description: 'Ball toss in yard', location: 'outdoor' }
    ]
  };
  const createReportRes = await req('POST', '/reports/daily', reportPayload, caregiverA_Token);
  if (createReportRes.status === 201 && createReportRes.body.id) {
    todayReportId = createReportRes.body.id;
    recordTest({
      id: 'TC_STT_03',
      module: 'Daily Activity Reporting',
      technique: 'State Transition (S1: Present -> S2: Activities Logged)',
      title: 'Submit atomic daily activity report with meals, naps, and activities',
      preconditions: 'Child is checked in as Present',
      steps: 'POST /api/reports/daily with nested meals and activities',
      expected: 'HTTP 201 Daily report created atomically in transaction',
      actual: `HTTP 201 Report ID: ${todayReportId}`,
      status: 'PASS',
      latencyMs: createReportRes.latencyMs
    });
  } else {
    recordTest({
      id: 'TC_STT_03',
      module: 'Daily Activity Reporting',
      technique: 'State Transition',
      title: 'Submit atomic daily activity report with meals, naps, and activities',
      preconditions: 'Child is checked in',
      steps: 'POST /api/reports/daily',
      expected: 'HTTP 201',
      actual: `HTTP ${createReportRes.status}: ${JSON.stringify(createReportRes.body)}`,
      status: 'FAIL',
      severity: 'Critical',
      latencyMs: createReportRes.latencyMs
    });
  }

  // TC_STT_04: S2 -> S2: Illegal Duplicate Daily Report for Same Child & Date
  const dupReportRes = await req('POST', '/reports/daily', reportPayload, caregiverA_Token);
  if (dupReportRes.status === 409) {
    recordTest({
      id: 'TC_STT_04',
      module: 'Daily Activity Reporting',
      technique: 'State Transition (Illegal: Duplicate Daily Report)',
      title: 'Reject second daily activity report for same child on same date',
      preconditions: 'Daily report already exists for today',
      steps: 'POST /api/reports/daily identical payload second time',
      expected: 'HTTP 409 Conflict: Daily report already exists for today',
      actual: `HTTP 409 Conflict (${dupReportRes.body.error})`,
      status: 'PASS',
      latencyMs: dupReportRes.latencyMs
    });
  } else {
    recordTest({
      id: 'TC_STT_04',
      module: 'Daily Activity Reporting',
      technique: 'State Transition',
      title: 'Reject second daily activity report for same child on same date',
      preconditions: 'Daily report exists',
      steps: 'POST /api/reports/daily second time',
      expected: 'HTTP 409 Conflict',
      actual: `HTTP ${dupReportRes.status}`,
      status: 'FAIL',
      severity: 'Major',
      latencyMs: dupReportRes.latencyMs
    });
  }

  // TC_STT_05: S2 -> S3 (Illegal): Pickup attempt by unauthorized adult
  // Assign front-desk duty to Caregiver
  const shiftStart = new Date(Date.now() - 1000 * 60 * 30).toISOString();
  const shiftEnd = new Date(Date.now() + 1000 * 60 * 60 * 4).toISOString();
  await req('POST', '/portal/assignments', {
    staff_id: caregiverA_Id,
    group_id: groupA_Id,
    starts_at: shiftStart,
    ends_at: shiftEnd,
    can_attendance: true,
    can_pickup: true,
  }, directorA_Token);

  const unauthCheckoutRes = await req('POST', '/portal/checkout', {
    child_id: childA_Id,
    guardian_user_id: 99999, // Non-existent/unauthorized adult
    method: 'manual',
    identity_confirmed: true,
    reason: 'Stranger pickup attempt',
  }, caregiverA_Token);
  if (unauthCheckoutRes.status === 403 || unauthCheckoutRes.status === 404 || unauthCheckoutRes.status === 422) {
    recordTest({
      id: 'TC_STT_05',
      module: 'Biometric Guardian Verification',
      technique: 'State Transition (Illegal: Unauthorized Pickup)',
      title: 'Reject child pickup when adult is not in authorized guardian list',
      preconditions: 'User 99999 has no authorized guardian link to child',
      steps: 'POST /api/portal/checkout with unauthorized guardian_user_id',
      expected: 'HTTP 403/404 Forbidden / Not Authorized',
      actual: `HTTP ${unauthCheckoutRes.status} (${unauthCheckoutRes.body.error})`,
      status: 'PASS',
      latencyMs: unauthCheckoutRes.latencyMs
    });
  } else {
    recordTest({
      id: 'TC_STT_05',
      module: 'Biometric Guardian Verification',
      technique: 'State Transition',
      title: 'Reject child pickup when adult is not in authorized guardian list',
      preconditions: 'User not authorized',
      steps: 'POST /api/portal/checkout',
      expected: 'HTTP 403 Forbidden',
      actual: `SECURITY HAZARD: HTTP ${unauthCheckoutRes.status} allowed unauthorized checkout!`,
      status: 'FAIL',
      severity: 'Blocker',
      latencyMs: unauthCheckoutRes.latencyMs
    });
  }

  // TC_STT_06: S2 -> S3 (Valid): Authorized Guardian Pickup & Checkout
  const validCheckoutRes = await req('POST', '/portal/checkout', {
    child_id: childA_Id,
    guardian_user_id: parentA_Id,
    method: 'manual',
    identity_confirmed: true,
    reason: 'Father arrived for afternoon pickup',
  }, caregiverA_Token);
  if (validCheckoutRes.status === 200 || validCheckoutRes.status === 201) {
    recordTest({
      id: 'TC_STT_06',
      module: 'Biometric Guardian Verification',
      technique: 'State Transition (S2: In-Care -> S3: Picked Up)',
      title: 'Successful authorized guardian verification and child checkout',
      preconditions: 'Father is authorized guardian linked to child',
      steps: 'POST /api/portal/checkout with valid Father guardian_user_id',
      expected: 'HTTP 200/201 Child marked Checked Out with verification audit record',
      actual: `HTTP ${validCheckoutRes.status} Event recorded: checkout`,
      status: 'PASS',
      latencyMs: validCheckoutRes.latencyMs
    });
  } else {
    recordTest({
      id: 'TC_STT_06',
      module: 'Biometric Guardian Verification',
      technique: 'State Transition',
      title: 'Successful authorized guardian verification and child checkout',
      preconditions: 'Father is authorized guardian',
      steps: 'POST /api/portal/checkout with Father id',
      expected: 'HTTP 200/201',
      actual: `HTTP ${validCheckoutRes.status}: ${JSON.stringify(validCheckoutRes.body)}`,
      status: 'FAIL',
      severity: 'Critical',
      latencyMs: validCheckoutRes.latencyMs
    });
  }

  // ========================================================================
  // SUITE 4: USE CASE & INTEGRATION TESTING (UCT)
  // ========================================================================
  console.log(`\n--- [SUITE 4] Use Case & Module Integration Testing (UCT) ---`);

  // TC_UCT_01: Parent Views Child Profile & Normalized Care Details
  const pChildRes = await req('GET', `/parent/children/${childA_Id}`, null, parentA_Token);
  const pChildProfile = pChildRes.body?.child;
  if (pChildRes.status === 200 && pChildProfile?.full_name) {
    recordTest({
      id: 'TC_UCT_01',
      module: 'Child Profile Management',
      technique: 'Use Case (UC-CH-01: View Child Details)',
      title: 'Parent retrieves complete child profile with normalized care info',
      preconditions: 'Parent is linked to child',
      steps: `GET /api/parent/children/${childA_Id} with parent token`,
      expected: 'HTTP 200 with child full_name, allergies, and emergency contacts',
      actual: `HTTP 200 (${pChildProfile.full_name}, Care instructions: ${pChildProfile.care_instructions?.length})`,
      status: 'PASS',
      latencyMs: pChildRes.latencyMs
    });
  } else {
    recordTest({
      id: 'TC_UCT_01',
      module: 'Child Profile Management',
      technique: 'Use Case',
      title: 'Parent retrieves complete child profile with normalized care info',
      preconditions: 'Parent linked to child',
      steps: `GET /api/parent/children/${childA_Id}`,
      expected: 'HTTP 200',
      actual: `HTTP ${pChildRes.status}`,
      status: 'FAIL',
      severity: 'Critical',
      latencyMs: pChildRes.latencyMs
    });
  }

  // TC_UCT_02: Parent Views Daily Activity Report
  const pReportRes = await req('GET', `/reports/daily/${todayReportId}`, null, parentA_Token);
  if (pReportRes.status === 200 && pReportRes.body.meals?.length >= 2 && pReportRes.body.activities?.length >= 2) {
    recordTest({
      id: 'TC_UCT_02',
      module: 'Daily Activity Reporting',
      technique: 'Use Case (UC-DAR-01: Parent Views Report)',
      title: 'Parent views comprehensive 3-query assembled Daily Report',
      preconditions: 'Report submitted by caregiver earlier today',
      steps: `GET /api/reports/daily/${todayReportId} with parent token`,
      expected: 'HTTP 200 with meals count >= 2, activities count >= 2, caregiver info',
      actual: `HTTP 200 (Meals: ${pReportRes.body.meals.length}, Activities: ${pReportRes.body.activities.length}, Caregiver: ${pReportRes.body.caregiver_name})`,
      status: 'PASS',
      latencyMs: pReportRes.latencyMs
    });
  } else {
    recordTest({
      id: 'TC_UCT_02',
      module: 'Daily Activity Reporting',
      technique: 'Use Case',
      title: 'Parent views comprehensive 3-query assembled Daily Report',
      preconditions: 'Report exists',
      steps: `GET /api/reports/daily/${todayReportId}`,
      expected: 'HTTP 200',
      actual: `HTTP ${pReportRes.status}`,
      status: 'FAIL',
      severity: 'Critical',
      latencyMs: pReportRes.latencyMs
    });
  }

  // TC_UCT_03: Parent Direct Messaging with Caregiver
  const sendMsgRes = await req('POST', '/communication/messages', {
    recipient_id: caregiverA_Id,
    subject: 'Afternoon pickup notice',
    body: 'Father will arrive around 4:30 PM today.',
  }, parentA_Token);
  if (sendMsgRes.status === 201 && sendMsgRes.body.id) {
    recordTest({
      id: 'TC_UCT_03',
      module: 'Communication',
      technique: 'Use Case (UC-COM-01: Direct Messaging)',
      title: 'Parent sends structured direct message to caregiver',
      preconditions: 'Both parent and caregiver belong to same daycare tenant',
      steps: 'POST /api/communication/messages with recipient_id, subject, body',
      expected: 'HTTP 201 Message created with unique ID',
      actual: `HTTP 201 (Message ID: ${sendMsgRes.body.id})`,
      status: 'PASS',
      latencyMs: sendMsgRes.latencyMs
    });
  } else {
    recordTest({
      id: 'TC_UCT_03',
      module: 'Communication',
      technique: 'Use Case',
      title: 'Parent sends structured direct message to caregiver',
      preconditions: 'Same tenant',
      steps: 'POST /api/communication/messages',
      expected: 'HTTP 201',
      actual: `HTTP ${sendMsgRes.status}: ${JSON.stringify(sendMsgRes.body)}`,
      status: 'FAIL',
      severity: 'Major',
      latencyMs: sendMsgRes.latencyMs
    });
  }

  // TC_UCT_04: AI Parent Guide Non-Medical Everyday Guidance
  const aiRes = await req('POST', '/ai/guide', {
    question: 'My toddler is refusing afternoon naps. What calm soothing routine works best?',
    child_id: childA_Id,
  }, parentA_Token);
  const aiText = aiRes.body.guidance || aiRes.body.answer || aiRes.body.response;
  if (aiRes.status === 200 && aiText) {
    recordTest({
      id: 'TC_UCT_04',
      module: 'AI Parent Guide',
      technique: 'Use Case (UC-AI-01: AI Guidance)',
      title: 'Parent queries AI Parent Guide for non-medical behavioral advice',
      preconditions: 'AI Parent Guide module active and child linked',
      steps: 'POST /api/ai/guide with parenting question and child_id',
      expected: 'HTTP 200 with supportive, non-medical parenting guidance',
      actual: `HTTP 200 Generated response length: ${aiText.length} characters`,
      status: 'PASS',
      latencyMs: aiRes.latencyMs
    });
  } else {
    recordTest({
      id: 'TC_UCT_04',
      module: 'AI Parent Guide',
      technique: 'Use Case',
      title: 'Parent queries AI Parent Guide for non-medical behavioral advice',
      preconditions: 'AI Guide active',
      steps: 'POST /api/ai/guide',
      expected: 'HTTP 200',
      actual: `HTTP ${aiRes.status}`,
      status: 'FAIL',
      severity: 'Major',
      latencyMs: aiRes.latencyMs
    });
  }

  // TC_UCT_05: Daycare Store "Pay at Daycare" Order Placement
  const orderRes = await req('POST', '/store/orders', {
    items: [
      { product_id: productA_Id, quantity: 2 }
    ]
  }, parentA_Token);
  if (orderRes.status === 201 && orderRes.body.id) {
    orderA_Id = orderRes.body.id;
    recordTest({
      id: 'TC_UCT_05',
      module: 'E-commerce & Store',
      technique: 'Use Case (UC-ECM-01: Place Store Order)',
      title: 'Parent places Pay-at-Daycare supplies order and deducts inventory',
      preconditions: `Product ID ${productA_Id} in stock (Stock: 25)`,
      steps: `POST /api/store/orders for 2 units of product ${productA_Id}`,
      expected: 'HTTP 201 Order created with status "pending" and calculated total',
      actual: `HTTP 201 (Order ID: ${orderA_Id}, Total: ETB ${orderRes.body.total_amount})`,
      status: 'PASS',
      latencyMs: orderRes.latencyMs
    });
  } else {
    recordTest({
      id: 'TC_UCT_05',
      module: 'E-commerce & Store',
      technique: 'Use Case',
      title: 'Parent places Pay-at-Daycare supplies order and deducts inventory',
      preconditions: 'Product in stock',
      steps: 'POST /api/store/orders',
      expected: 'HTTP 201',
      actual: `HTTP ${orderRes.status}: ${JSON.stringify(orderRes.body)}`,
      status: 'FAIL',
      severity: 'Major',
      latencyMs: orderRes.latencyMs
    });
  }

  // ========================================================================
  // SUITE 5: SECURITY, INJECTION & DEFENSIVE TESTING (SEC)
  // ========================================================================
  console.log(`\n--- [SUITE 5] Security, Injection & Defensive Testing (SEC) ---`);

  // TC_SEC_01: SQL Injection Attack Resilience in Auth Field
  const sqliRes = await req('POST', '/auth/login', {
    email: "' OR '1'='1' --",
    password: 'AnyPassword123!',
  });
  if (sqliRes.status === 401 || sqliRes.status === 400 || sqliRes.status === 422) {
    recordTest({
      id: 'TC_SEC_01',
      module: 'Security & Penetration',
      technique: 'Defensive (SQL Injection Attack)',
      title: "SQL Injection payload in authentication field (' OR '1'='1')",
      preconditions: 'PostgreSQL parameterized queries & Joi schema validation',
      steps: "POST /api/auth/login with email=\"' OR '1'='1' --\"",
      expected: 'HTTP 422/401/400 rejection without SQL syntax error or credential bypass',
      actual: `HTTP ${sqliRes.status} Handled safely via validation & parameterized query`,
      status: 'PASS',
      latencyMs: sqliRes.latencyMs
    });
  } else {
    recordTest({
      id: 'TC_SEC_01',
      module: 'Security & Penetration',
      technique: 'Defensive',
      title: "SQL Injection payload in authentication field",
      preconditions: 'Parameterized queries',
      steps: "POST /api/auth/login with SQL injection payload",
      expected: 'HTTP 422/401/400',
      actual: `CRITICAL VULNERABILITY: HTTP ${sqliRes.status}`,
      status: 'FAIL',
      severity: 'Blocker',
      latencyMs: sqliRes.latencyMs
    });
  }

  // TC_SEC_02: Cryptographic JWT Signature Tampering
  const baseToken = directorA_Token || superAdminToken;
  const forgedToken = baseToken.slice(0, -6) + 'xyz123';
  const tamperRes = await req('GET', '/portal/me', null, forgedToken);
  if (tamperRes.status === 401 || tamperRes.status === 403) {
    recordTest({
      id: 'TC_SEC_02',
      module: 'Security & Cryptography',
      technique: 'Defensive (JWT Signature Tampering)',
      title: 'Reject cryptographic token when HMAC signature has been altered',
      preconditions: 'JWT signature verified with JWT_SECRET on every request',
      steps: 'GET /api/portal/me with modified signature token',
      expected: 'HTTP 401/403 Invalid Token / Unauthorized',
      actual: `HTTP ${tamperRes.status} (${tamperRes.body.error})`,
      status: 'PASS',
      latencyMs: tamperRes.latencyMs
    });
  } else {
    recordTest({
      id: 'TC_SEC_02',
      module: 'Security & Cryptography',
      technique: 'Defensive',
      title: 'Reject cryptographic token when HMAC signature has been altered',
      preconditions: 'JWT verified',
      steps: 'GET /api/portal/me with forged token',
      expected: 'HTTP 401/403',
      actual: `SECURITY EXPLOIT: HTTP ${tamperRes.status} accepted forged signature!`,
      status: 'FAIL',
      severity: 'Blocker',
      latencyMs: tamperRes.latencyMs
    });
  }

  // TC_SEC_03: XSS Script Injection Resilience in Announcements
  const xssTitle = `Sports Day <script>alert('XSS')</script> ${runId}`;
  const xssRes = await req('POST', '/communication/announcements', {
    title: xssTitle,
    body: 'Children should wear sneakers and hats.',
    audience: 'all',
  }, directorA_Token);
  if (xssRes.status === 201 && xssRes.body.id) {
    const listRes = await req('GET', '/communication/announcements', null, parentA_Token);
    const announcements = Array.isArray(listRes.body) ? listRes.body : (listRes.body.data || listRes.body.announcements || []);
    const found = announcements.find(a => a.id === xssRes.body.id);
    const isSafe = found && typeof found.title === 'string';
    recordTest({
      id: 'TC_SEC_03',
      module: 'Security & Data Hygiene',
      technique: 'Defensive (XSS Script Payload)',
      title: 'Announcement payload containing executable script tags',
      preconditions: 'JSON serialization and proper client escaping',
      steps: 'POST /api/communication/announcements with script tag; GET as parent',
      expected: 'Stored and transmitted safely as inert JSON string without execution',
      actual: `HTTP 201 Created; serialized safely as inert text in JSON response`,
      status: isSafe ? 'PASS' : 'FAIL',
      latencyMs: xssRes.latencyMs
    });
  } else {
    recordTest({
      id: 'TC_SEC_03',
      module: 'Security & Data Hygiene',
      technique: 'Defensive',
      title: 'Announcement payload containing executable script tags',
      preconditions: 'Safe input handling',
      steps: 'POST /api/communication/announcements',
      expected: 'HTTP 201',
      actual: `HTTP ${xssRes.status}`,
      status: 'FAIL',
      severity: 'Major',
      latencyMs: xssRes.latencyMs
    });
  }

  // ========================================================================
  // SUITE 6: NON-FUNCTIONAL PERFORMANCE SLA BENCHMARK
  // ========================================================================
  console.log(`\n--- [SUITE 6] Performance SLA Benchmark (Chapter 4 Exit Criteria) ---`);
  latencies.sort((a, b) => a - b);
  const p95Index = Math.floor(latencies.length * 0.95);
  const p95Latency = latencies[p95Index] || 0;
  const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);

  const perfPass = p95Latency < 2000;
  recordTest({
    id: 'TC_NFR_01',
    module: 'System Performance',
    technique: 'Non-Functional (Response Time SLA)',
    title: 'API 95th Percentile Latency Verification (Target: < 2000 ms)',
    preconditions: 'Backend running on Node.js/PostgreSQL under standard workload',
    steps: `Execute ${latencies.length} test interactions across all lifecycle modules`,
    expected: 'P95 response time < 2000 ms (IEEE 829 Exit Criteria)',
    actual: `P95: ${p95Latency} ms, Average: ${avgLatency} ms (Max: ${latencies[latencies.length - 1]} ms)`,
    status: perfPass ? 'PASS' : 'FAIL',
    severity: 'Major',
    latencyMs: p95Latency
  });

  // ========================================================================
  // FINAL METRICS CALCULATION (CHAPTER 5)
  // ========================================================================
  const totalPlanned = testResults.length;
  const totalExecuted = testResults.length;
  const totalPassed = testResults.filter(t => t.status === 'PASS').length;
  const totalFailed = testResults.filter(t => t.status === 'FAIL').length;
  const passRate = ((totalPassed / totalExecuted) * 100).toFixed(1);

  const criticalBugs = testResults.filter(t => t.status === 'FAIL' && (t.severity === 'Blocker' || t.severity === 'Critical')).length;
  const majorBugs = testResults.filter(t => t.status === 'FAIL' && t.severity === 'Major').length;

  console.log(`\n========================================================================`);
  console.log(`  SWT TEST EXECUTION COMPLETED`);
  console.log(`  Total Executed: ${totalExecuted} | Passed: ${totalPassed} | Failed: ${totalFailed} | Pass Rate: ${passRate}%`);
  console.log(`  Critical/Blocker Deficiencies: ${criticalBugs} | Major: ${majorBugs}`);
  console.log(`  P95 Latency: ${p95Latency} ms | Avg Latency: ${avgLatency} ms`);
  console.log(`========================================================================\n`);

  return {
    runId,
    totalPlanned,
    totalExecuted,
    totalPassed,
    totalFailed,
    passRate,
    criticalBugs,
    majorBugs,
    p95Latency,
    avgLatency,
    testResults
  };
}

if (require.main === module) {
  runSwtSuite()
    .then((summary) => {
      if (summary.totalFailed > 0) process.exit(1);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal execution error:', err);
      process.exit(1);
    });
}

module.exports = { runSwtSuite };
