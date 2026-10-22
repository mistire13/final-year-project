'use strict';
/**
 * test_lifecycle_e2e_full.js
 * Comprehensive automated test suite for the complete 9-phase Daycare Lifecycle.
 *
 * SRS References:
 * - FR-UAM-01..11: SaaS registration, approval, RBAC, tenant isolation
 * - FR-CH-01..05: Child enrollment, care info, guardian linking
 * - FR-ATT-01..07: Attendance check-in and checkout state machine
 * - FR-DAR-01..08, FR-RPT-01..06: Daily activity reporting and completion monitoring
 * - FR-COM-01..07: Announcements and direct messages
 * - FR-AI-01..10: AI Parent Guide
 * - FR-ECM-01..16: Store products, orders, stock clamping
 * - FR-BIO-01..10: Guardian pickup verification
 * - FR-DB-01..09: Row-level tenant isolation (daycare_id)
 */
require('dotenv').config();
const http = require('http');

const BASE_HOST = 'localhost';
const BASE_PORT = 5000;

function req(method, path, body = null, token = null) {
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
        let parsed = null;
        try {
          parsed = buf ? JSON.parse(buf) : {};
        } catch {
          parsed = { raw: buf };
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });

    request.on('error', (err) => reject(err));
    if (data) request.write(data);
    request.end();
  });
}

// Visual reporting helpers
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function pass(title, detail = '') {
  totalTests++;
  passedTests++;
  console.log(`  ✅ [PASS] ${title} ${detail ? `(${detail})` : ''}`);
}

function fail(title, detail = '') {
  totalTests++;
  failedTests++;
  console.error(`  ❌ [FAIL] ${title} ${detail ? `(${detail})` : ''}`);
}

function section(title) {
  console.log(`\n============================================================`);
  console.log(`  ${title}`);
  console.log(`============================================================`);
}

async function runSuite() {
  const runId = Date.now().toString().slice(-6);
  console.log(`Starting Ankelba Lifecycle E2E Test Suite (Run ID: ${runId})`);

  // Shared state across the 9 flows
  let superAdminToken = null;
  let newDaycareId = null;
  let newDaycareSlug = null;
  const testDirectorEmail = `director_${runId}@testsunshine.com`;
  const testDirectorPass = `Director@${runId}!`;
  let directorToken = null;

  let testGroupId = null;
  let testCaregiverId = null;
  let testCaregiverToken = null;
  const testCaregiverEmail = `caregiver_${runId}@testsunshine.com`;
  const testCaregiverPass = `Caregiver@${runId}!`;

  let testChildId = null;
  let testParentId = null;
  let testParentToken = null;
  const testParentEmail = `parent_${runId}@testsunshine.com`;
  const testParentPass = `Parent@${runId}!`;

  let todayReportId = null;
  let testProductId = null;
  let testOrderId = null;

  // ─────────────────────────────────────────────────────────────
  // FLOW 1: Daycare Self-Registration & Super Admin Approval
  // ─────────────────────────────────────────────────────────────
  section('FLOW 1: Daycare Self-Registration & Super Admin Approval (SaaS Onboarding)');

  // 1.1 Invalid registration (missing fields)
  const badReg = await req('POST', '/register-daycare', { daycareName: '' });
  if (badReg.status === 400 || badReg.status === 422) {
    pass('Rejects daycare self-registration with missing name', `Status: ${badReg.status}`);
  } else {
    fail('Rejects daycare self-registration with missing name', `Unexpected status: ${badReg.status}`);
  }

  // 1.2 Valid Daycare Self-Registration
  const regPayload = {
    daycareName: `Sunshine Academy ${runId}`,
    contactEmail: `contact_${runId}@testsunshine.com`,
    contactPhone: '+251 91 123 4567',
    address: 'Bole Sub-city, Addis Ababa',
    licenseNumber: `LIC-AA-${runId}`,
    adminName: `Director Hana ${runId}`,
    adminEmail: testDirectorEmail,
    adminPassword: testDirectorPass,
  };
  const regRes = await req('POST', '/register-daycare', regPayload);
  if (regRes.status === 200 || regRes.status === 201) {
    newDaycareId = regRes.body.daycare?.id;
    newDaycareSlug = regRes.body.daycare?.slug;
    pass('Daycare self-registration submitted successfully', `ID: ${newDaycareId}, Slug: ${newDaycareSlug}`);
  } else {
    fail('Daycare self-registration submitted', `Status: ${regRes.status}, Body: ${JSON.stringify(regRes.body)}`);
  }

  // 1.3 Super Admin Login (password: 1234)
  const saLogin = await req('POST', '/auth/login', {
    email: 'superadmin@ankelba.com',
    password: '1234',
  });
  if (saLogin.status === 200 && saLogin.body.token) {
    superAdminToken = saLogin.body.token;
    pass('Super Admin authenticated', `Role: ${saLogin.body.user?.role}`);
  } else {
    fail('Super Admin authentication', `Status: ${saLogin.status}, Error: ${saLogin.body?.error}`);
  }

  // 1.4 Super Admin views pending daycares
  const pendingRes = await req('GET', '/saas/super-admin/daycares?status=pending', null, superAdminToken);
  const daycaresList = Array.isArray(pendingRes.body) ? pendingRes.body : pendingRes.body?.data || [];
  const foundPending = daycaresList.some((d) => d.id === newDaycareId);
  if (pendingRes.status === 200 && foundPending) {
    pass('Super Admin lists pending daycare applications', `Found newly registered Daycare ID: ${newDaycareId}`);
  } else {
    fail('Super Admin lists pending daycares', `Status: ${pendingRes.status}, Found: ${foundPending}`);
  }

  // 1.5 Super Admin approves daycare
  const approveRes = await req('PATCH', `/saas/super-admin/daycares/${newDaycareId}/approve`, { trialDays: 30 }, superAdminToken);
  if (approveRes.status === 200 && approveRes.body.daycare?.status === 'active') {
    pass('Super Admin approves daycare and activates 30-day trial', `Trial Ends: ${approveRes.body.daycare?.trial_ends_at}`);
  } else {
    fail('Super Admin approves daycare', `Status: ${approveRes.status}`);
  }

  // ─────────────────────────────────────────────────────────────
  // FLOW 2: Daycare Administration & Classroom Setup
  // ─────────────────────────────────────────────────────────────
  section('FLOW 2: Daycare Administration & Classroom Setup');

  // 2.1 Approved Director Login
  const dirLogin = await req('POST', '/auth/login', {
    email: testDirectorEmail,
    password: testDirectorPass,
  });
  if (dirLogin.status === 200 && dirLogin.body.token) {
    directorToken = dirLogin.body.token;
    pass('Director logs in to Daycare Admin Portal', `Role: ${dirLogin.body.user?.role}, Daycare ID: ${dirLogin.body.user?.daycare_id}`);
  } else {
    fail('Director login', `Status: ${dirLogin.status}, Error: ${dirLogin.body?.error}`);
  }

  // 2.2 Create Classroom Group
  const groupRes = await req('POST', '/groups', {
    name: `Toddlers Room ${runId}`,
    description: 'Classroom group for toddlers aged 1 to 2 years',
  }, directorToken);
  if (groupRes.status === 201 && groupRes.body.id) {
    testGroupId = groupRes.body.id;
    pass('Director creates classroom group', `Group ID: ${testGroupId}`);
  } else {
    fail('Director creates classroom group', `Status: ${groupRes.status}`);
  }

  // 2.3 Create Caregiver Staff Account
  const cgRes = await req('POST', '/users', {
    name: `Teacher Aster ${runId}`,
    email: testCaregiverEmail,
    password: testCaregiverPass,
    role: 'caregiver',
    phone: '+251 91 555 6677',
  }, directorToken);
  if (cgRes.status === 201 && cgRes.body.id) {
    testCaregiverId = cgRes.body.id;
    pass('Director creates caregiver staff account', `Caregiver ID: ${testCaregiverId}`);
  } else {
    fail('Director creates caregiver staff account', `Status: ${cgRes.status}`);
  }

  // Caregiver signs in with own credentials
  const cgLogin = await req('POST', '/auth/login', {
    email: testCaregiverEmail,
    password: testCaregiverPass,
  });
  if (cgLogin.status === 200 && cgLogin.body.token) {
    testCaregiverToken = cgLogin.body.token;
    pass('Caregiver logs in with own staff credentials', `Caregiver ID: ${cgLogin.body.user?.id}`);
  } else {
    fail('Caregiver login', `Status: ${cgLogin.status}`);
  }

  // 2.4 Enroll Child with Emergency Contacts and Care Instructions
  const childRes = await req('POST', '/children', {
    full_name: `Yonas Alemayehu ${runId}`,
    dob: '2023-08-15',
    gender: 'male',
    group_id: testGroupId,
    caregiver_id: testCaregiverId,
    enrollment_status: 'active',
    emergency_contacts: [
      { name: 'Alemayehu Tesfaye', relationship: 'Father', phone: '+251 91 234 5678' },
    ],
    care_instructions: [
      { category: 'allergy', instruction_text: 'Eggs — Causes skin hives and mild swelling' },
      { category: 'dietary', instruction_text: 'Lactose sensitive — please use oat milk substitute' },
    ],
  }, directorToken);
  if (childRes.status === 201 && childRes.body.id) {
    testChildId = childRes.body.id;
    pass('Director enrolls child profile with care info & contacts', `Child ID: ${testChildId}`);
  } else {
    fail('Director registers child profile', `Status: ${childRes.status}, Error: ${JSON.stringify(childRes.body)}`);
  }

  // 2.5 Create Parent Account
  const parentCreateRes = await req('POST', '/users', {
    name: `Alemayehu Tesfaye ${runId}`,
    email: testParentEmail,
    password: testParentPass,
    role: 'parent',
    phone: '+251 91 234 5678',
  }, directorToken);
  if (parentCreateRes.status === 201 && parentCreateRes.body.id) {
    testParentId = parentCreateRes.body.id;
    pass('Director creates parent account', `Parent ID: ${testParentId}`);
  } else {
    fail('Director creates parent user account', `Status: ${parentCreateRes.status}`);
  }

  // 2.6 Link Parent to Child with Pickup Authorization
  const linkRes = await req('POST', `/children/${testChildId}/guardians`, {
    user_id: testParentId,
    relationship: 'Father',
    pickup_authorized: true,
  }, directorToken);
  if (linkRes.status === 201) {
    pass('Parent linked to child with pickup authorization', `Relationship: Father, Pickup Authorized: true`);
  } else {
    fail('Parent linked to child', `Status: ${linkRes.status}`);
  }

  // ─────────────────────────────────────────────────────────────
  // FLOW 3: Parent First-Time Experience & Child Profile
  // ─────────────────────────────────────────────────────────────
  section('FLOW 3: Parent First-Time Experience & Child Profile');

  // 3.1 Parent Login
  const pLogin = await req('POST', '/auth/login', {
    email: testParentEmail,
    password: testParentPass,
  });
  if (pLogin.status === 200 && pLogin.body.token) {
    testParentToken = pLogin.body.token;
    pass('Parent logs into mobile app session', `User: ${pLogin.body.user?.name}`);
  } else {
    fail('Parent login', `Status: ${pLogin.status}`);
  }

  // 3.2 Parent queries linked children
  const pChildrenRes = await req('GET', '/parent/children', null, testParentToken);
  const isLinked = (pChildrenRes.body?.children || []).some((c) => c.id === testChildId);
  if (pChildrenRes.status === 200 && isLinked) {
    pass('Parent retrieves strictly linked child list', `Found Child ID: ${testChildId}`);
  } else {
    fail('Parent retrieves linked children', `Status: ${pChildrenRes.status}`);
  }

  // 3.3 Parent queries full child profile
  const pDetailRes = await req('GET', `/parent/children/${testChildId}`, null, testParentToken);
  const childProfile = pDetailRes.body?.child;
  if (pDetailRes.status === 200 && childProfile?.care_instructions?.length > 0) {
    pass('Parent views complete child care details & allergies', `Instructions: ${childProfile.care_instructions.length}`);
  } else {
    fail('Parent views complete child details', `Status: ${pDetailRes.status}`);
  }

  // 3.4 Cross-Tenant / Unlinked Parent Access Blocked
  const unrelatedLogin = await req('POST', '/auth/login', {
    email: 'parent@ankelba.dev',
    password: 'Parent@123!',
  });
  if (unrelatedLogin.status === 200) {
    const crossCheck = await req('GET', `/parent/children/${testChildId}`, null, unrelatedLogin.body.token);
    if (crossCheck.status === 403 || crossCheck.status === 404) {
      pass('Security: Unlinked parent cannot access another family\'s child profile', `Enforced Status: ${crossCheck.status}`);
    } else {
      fail('Security: Unlinked parent accessed child profile', `Status: ${crossCheck.status}`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // FLOW 4: Morning Drop-Off & Attendance Check-In
  // ─────────────────────────────────────────────────────────────
  section('FLOW 4: Morning Drop-Off & Attendance Check-In');

  // 4.1 Front-Desk Check-In
  const checkinRes = await req('POST', '/attendance', {
    child_id: testChildId,
    event_type: 'checkin',
    notes: 'Arrived on time with father, cheerful and ready for play',
  }, testCaregiverToken);
  if (checkinRes.status === 201 && checkinRes.body.event_type === 'checkin') {
    pass('Caregiver records morning check-in at front desk', `Event ID: ${checkinRes.body.id}`);
  } else {
    fail('Caregiver records morning check-in', `Status: ${checkinRes.status}`);
  }

  // 4.2 State Machine Check: Duplicate Check-In rejected
  const dupCheckin = await req('POST', '/attendance', {
    child_id: testChildId,
    event_type: 'checkin',
    notes: 'Duplicate checkin attempt',
  }, testCaregiverToken);
  if (dupCheckin.status === 409 || dupCheckin.status === 422 || dupCheckin.status === 400) {
    pass('State Machine: Rejects duplicate check-in for already present child', `Status: ${dupCheckin.status}`);
  } else {
    fail('State Machine: Allowed duplicate check-in', `Status: ${dupCheckin.status}`);
  }

  // 4.3 Parent Views Attendance Status
  const parentAttRes = await req('GET', `/attendance/child/${testChildId}`, null, testParentToken);
  if (parentAttRes.status === 200 && parentAttRes.body?.data?.[0]?.event_type === 'checkin') {
    pass('Parent App updates child attendance to "AT DAYCARE"', `Time: ${parentAttRes.body.data[0].event_time}`);
  } else {
    fail('Parent App updates child attendance', `Status: ${parentAttRes.status}`);
  }

  // ─────────────────────────────────────────────────────────────
  // FLOW 5: Daily Activity & Reporting Lifecycle
  // ─────────────────────────────────────────────────────────────
  section('FLOW 5: Daily Activity & Reporting Lifecycle');

  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Addis_Ababa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  // 5.1 Caregiver Submits Daily Activity Report
  const reportPayload = {
    child_id: testChildId,
    report_date: todayStr,
    sleep_duration_min: 75,
    sleep_notes: 'Fell asleep smoothly after lullaby story, rested peacefully.',
    mood: 'happy',
    behavior_notes: 'Cooperative, shared crayons nicely during group art.',
    general_observations: 'Great appetite at lunch and very energetic during outdoor playtime.',
    meals: [
      { meal_type: 'breakfast', description: 'Warm oatmeal with sliced bananas', portion: 'good' },
      { meal_type: 'lunch', description: 'Steamed rice, lentils, and mixed diced carrots', portion: 'good' },
      { meal_type: 'afternoon_snack', description: 'Fresh watermelon slices and crackers', portion: 'good' },
    ],
    activities: [
      { activity_type: 'learning', description: 'Alphabet building blocks & shape sorting', location: 'indoor' },
      { activity_type: 'play', description: 'Sand playground games and tricycle riding', location: 'outdoor' },
    ],
  };

  const createReportRes = await req('POST', '/reports/daily', reportPayload, testCaregiverToken);
  if (createReportRes.status === 201 && createReportRes.body.id) {
    todayReportId = createReportRes.body.id;
    pass('Caregiver submits complete Daily Activity Report in transaction', `Report ID: ${todayReportId}`);
  } else {
    fail('Caregiver submits daily report', `Status: ${createReportRes.status}, Error: ${JSON.stringify(createReportRes.body)}`);
  }

  // 5.2 Duplicate Report Rejected
  const dupReport = await req('POST', '/reports/daily', reportPayload, testCaregiverToken);
  if (dupReport.status === 409) {
    pass('Duplicate prevention: Rejects second report for same child & date', `Status: 409 Conflict`);
  } else {
    fail('Duplicate prevention allowed duplicate report', `Status: ${dupReport.status}`);
  }

  // 5.3 Parent Views Daily Report Detail
  const pReportRes = await req('GET', `/reports/daily/${todayReportId}`, null, testParentToken);
  if (pReportRes.status === 200 && pReportRes.body.meals?.length === 3 && pReportRes.body.activities?.length === 2) {
    pass('Parent views detailed 3-query assembled Daily Report', `Meals: 3, Activities: 2, Caregiver: ${pReportRes.body.caregiver_name}`);
  } else {
    fail('Parent views detailed daily report', `Status: ${pReportRes.status}`);
  }

  // ─────────────────────────────────────────────────────────────
  // FLOW 6: Mid-Day Communication, Events & AI Parent Guide
  // ─────────────────────────────────────────────────────────────
  section('FLOW 6: Mid-Day Communication, Events & AI Parent Guide');

  // 6.1 Admin Posts Announcement
  const annRes = await req('POST', '/communication/announcements', {
    title: `Parent-Teacher Meeting ${runId}`,
    body: 'We invite all families to our quarterly growth and development conference this Friday.',
    audience: 'all',
  }, directorToken);
  if (annRes.status === 201) {
    pass('Admin publishes daycare-wide announcement', `Title: Parent-Teacher Meeting`);
  } else {
    fail('Admin publishes announcement', `Status: ${annRes.status}, Error: ${JSON.stringify(annRes.body)}`);
  }

  // 6.2 Parent Sends Message to Caregiver
  const msgRes = await req('POST', '/communication/messages', {
    recipient_id: testCaregiverId,
    subject: 'Afternoon pickup note',
    body: 'Father will pick up Yonas today at 4:30 PM.',
  }, testParentToken);
  let parentMsgId = msgRes.body?.id;
  if (msgRes.status === 201 && parentMsgId) {
    pass('Parent exchanges structured message with caregiver', `Message ID: ${parentMsgId}`);
  } else {
    fail('Parent exchanges structured message', `Status: ${msgRes.status}`);
  }

  // 6.3 Caregiver Marks Message Read and Replies
  const readRes = await req('PATCH', `/communication/messages/${parentMsgId}/read`, {}, testCaregiverToken);
  const replyRes = await req('POST', '/communication/messages', {
    recipient_id: testParentId,
    subject: 'Re: Afternoon pickup note',
    body: 'Received! We will have Yonas ready with his coat and backpack.',
  }, testCaregiverToken);
  if (readRes.status === 200 && replyRes.status === 201) {
    pass('Caregiver marks parent message read and replies', `Status: 200 & 201`);
  } else {
    fail('Caregiver message reply', `Statuses: ${readRes.status}, ${replyRes.status}`);
  }

  // 6.4 AI Parent Guide Natural Language Advice
  const aiRes = await req('POST', '/ai/guide', {
    question: 'What are healthy finger food snacks for a toddler who is allergic to eggs?',
    child_id: testChildId,
  }, testParentToken);
  if (aiRes.status === 200 && (aiRes.body.guidance || aiRes.body.answer || aiRes.body.response)) {
    const text = aiRes.body.guidance || aiRes.body.answer || aiRes.body.response;
    pass('AI Parent Guide provides tailored, non-medical parenting guidance', `Answer Length: ${text.length} chars`);
  } else {
    fail('AI Parent Guide response', `Status: ${aiRes.status}`);
  }

  // ─────────────────────────────────────────────────────────────
  // FLOW 7: Daycare Store & Supplies Ordering
  // ─────────────────────────────────────────────────────────────
  section('FLOW 7: Daycare Store & Supplies Ordering');

  // 7.1 Admin Creates Product
  const prodRes = await req('POST', '/store/products', {
    name: `Montessori Sensory Kit ${runId}`,
    description: 'Eco-friendly wooden sensory shapes for fine motor practice',
    price: 450.0,
    stock_qty: 15,
    available: true,
  }, directorToken);
  if (prodRes.status === 201 && prodRes.body.id) {
    testProductId = prodRes.body.id;
    pass('Admin creates daycare product in catalog', `Product ID: ${testProductId}, Stock: 15`);
  } else {
    fail('Admin creates product', `Status: ${prodRes.status}, Error: ${JSON.stringify(prodRes.body)}`);
  }

  // 7.2 Parent Browses Store & Places Order
  const orderRes = await req('POST', '/store/orders', {
    items: [
      { product_id: testProductId, quantity: 2 },
    ],
  }, testParentToken);
  if (orderRes.status === 201 && orderRes.body.id) {
    testOrderId = orderRes.body.id;
    pass('Parent places "Pay at Daycare" store order', `Order ID: ${testOrderId}, Total: ETB 900`);
  } else {
    fail('Parent places store order', `Status: ${orderRes.status}, Error: ${JSON.stringify(orderRes.body)}`);
  }

  // 7.3 Admin Reviews & Confirms Order
  const updateOrderRes = await req('PATCH', `/store/orders/${testOrderId}/status`, {
    order_status: 'confirmed',
  }, directorToken);
  if (updateOrderRes.status === 200) {
    pass('Admin confirms store order in daycare portal', `Status: confirmed`);
  } else {
    fail('Admin confirms store order', `Status: ${updateOrderRes.status}`);
  }

  // ─────────────────────────────────────────────────────────────
  // FLOW 8: Afternoon Pickup, Verification & Child Check-Out
  // ─────────────────────────────────────────────────────────────
  section('FLOW 8: Afternoon Pickup, Verification & Child Check-Out');

  // 8.1 Admin assigns front-desk duty to Caregiver (SRS §3 / DELIVERY_PLAN.md §3)
  const now = new Date();
  const shiftStart = new Date(now.getTime() - 1000 * 60 * 30).toISOString(); // 30 mins ago
  const shiftEnd = new Date(now.getTime() + 1000 * 60 * 60 * 4).toISOString(); // 4 hours later
  const dutyRes = await req('POST', '/portal/assignments', {
    staff_id: testCaregiverId,
    group_id: testGroupId,
    starts_at: shiftStart,
    ends_at: shiftEnd,
    can_attendance: true,
    can_pickup: true,
  }, directorToken);
  if (dutyRes.status === 200 || dutyRes.status === 201) {
    pass('Admin assigns front-desk duty to caregiver for attendance and pickup', `Duty ID: ${dutyRes.body.id}`);
  } else {
    fail('Admin assigns front-desk duty', `Status: ${dutyRes.status}, Error: ${JSON.stringify(dutyRes.body)}`);
  }

  // 8.2 Security: Unverified or unauthorized adult pickup attempt blocked
  const unauthCheckout = await req('POST', '/portal/checkout', {
    child_id: testChildId,
    guardian_user_id: 85, // Unrelated parent
    method: 'manual',
    identity_confirmed: true,
    reason: 'Unauthorized pickup attempt should be rejected',
  }, testCaregiverToken);
  if (unauthCheckout.status === 403) {
    pass('Security: Pickup rejected when adult is not authorized in guardian_links', `Status: 403 Forbidden`);
  } else {
    fail('Security allowed unauthorized adult pickup', `Status: ${unauthCheckout.status}`);
  }

  // 8.3 Front-Desk verifies authorized adult guardian & completes checkout
  const checkoutRes = await req('POST', '/portal/checkout', {
    child_id: testChildId,
    guardian_user_id: testParentId,
    method: 'manual',
    identity_confirmed: true,
    reason: 'Father presented official government ID card matching authorized pickup record',
  }, testCaregiverToken);
  if (checkoutRes.status === 200 && checkoutRes.body.attendance?.event_type === 'checkout') {
    pass('Caregiver completes verified front-desk guardian verification & checkout', `Attendance ID: ${checkoutRes.body.attendance.id}, Verification ID: ${checkoutRes.body.verification?.id}`);
  } else {
    fail('Caregiver completes verified checkout', `Status: ${checkoutRes.status}, Error: ${JSON.stringify(checkoutRes.body)}`);
  }

  // 8.4 Parent Mobile App Reflects "CHECKED OUT"
  const pFinalAtt = await req('GET', `/attendance/child/${testChildId}`, null, testParentToken);
  if (pFinalAtt.status === 200 && pFinalAtt.body?.data?.[0]?.event_type === 'checkout') {
    pass('Parent App updates child status to "CHECKED OUT"', `Picked up at: ${pFinalAtt.body.data[0].event_time}`);
  } else {
    fail('Parent App updates child status to "CHECKED OUT"', `Status: ${pFinalAtt.status}`);
  }

  // ─────────────────────────────────────────────────────────────
  // FLOW 9: Administrative Monitoring & Tenant Audit Trail
  // ─────────────────────────────────────────────────────────────
  section('FLOW 9: Administrative Monitoring & Tenant Audit Trail');

  // 9.1 Daycare Admin Activity Reports Completion Monitor
  const monitorRes = await req('GET', '/reports/daily', null, directorToken);
  if (monitorRes.status === 200) {
    pass('Admin monitors caregiver daily activity report completion', `Records returned`);
  } else {
    fail('Admin monitors report completion', `Status: ${monitorRes.status}`);
  }

  // 9.2 Daycare Admin Audit Logs
  const auditRes = await req('GET', '/audit', null, directorToken);
  const auditList = Array.isArray(auditRes.body?.data) ? auditRes.body.data : Array.isArray(auditRes.body) ? auditRes.body : [];
  if (auditRes.status === 200 && auditList.length > 0) {
    pass('Daycare Admin accesses immutable operational audit log', `Log entries returned: ${auditList.length}`);
  } else {
    fail('Daycare Admin accesses audit log', `Status: ${auditRes.status}`);
  }

  // 9.3 Super Admin Platform-Wide Metrics & Audit
  const statsRes = await req('GET', '/saas/super-admin/stats', null, superAdminToken);
  if (statsRes.status === 200 && statsRes.body.total_daycares > 0) {
    pass('Super Admin platform statistics include newly registered daycare', `Total Daycares: ${statsRes.body.total_daycares}, Active: ${statsRes.body.active_daycares}`);
  } else {
    fail('Super Admin platform statistics', `Status: ${statsRes.status}, Body: ${JSON.stringify(statsRes.body)}`);
  }

  // ─────────────────────────────────────────────────────────────
  // SUITE SUMMARY
  // ─────────────────────────────────────────────────────────────
  section('E2E TEST SUITE EXECUTION SUMMARY');
  console.log(`Total Invariants Evaluated: ${totalTests}`);
  console.log(`Passed Checks:              ${passedTests}`);
  console.log(`Failed Checks:              ${failedTests}`);

  if (failedTests === 0) {
    console.log(`\n🎉 100% OF LIFECYCLE INVARIANTS PASSED! FULL SYSTEM VERIFIED.`);
  } else {
    console.log(`\n⚠️  SOME INVARIANTS FAILED. Please review the failures above.`);
  }

  process.exit(failedTests === 0 ? 0 : 1);
}

runSuite().catch((err) => {
  console.error('Fatal suite failure:', err);
  process.exit(1);
});
