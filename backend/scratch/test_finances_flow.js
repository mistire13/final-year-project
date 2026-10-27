'use strict';
require('dotenv').config();

/**
 * test_finances_flow.js
 * End-to-end verification of Daycare Child Care Fee Invoicing, Payment Recording,
 * Digital Receipts, Multi-Tenant Isolation, and Parent Portal Billing.
 */

const http = require('http');

function req(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(path, 'http://localhost:5000');
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    };

    const request = http.request(options, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(responseBody); } catch (_) { parsed = responseBody; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });

    request.on('error', reject);
    if (data) request.write(data);
    request.end();
  });
}

async function run() {
  console.log('===============================================================');
  console.log('STARTING PHASE 2 DAYCARE FINANCES & FEE MANAGEMENT TEST SUITE');
  console.log('===============================================================\n');

  const runId = Math.floor(100000 + Math.random() * 900000);

  // 1. Super Admin Login
  console.log('1. Super Admin Authentication...');
  const saLogin = await req('POST', '/api/auth/login', {
    email: 'superadmin@ankelba.com',
    password: '1234'
  });
  if (saLogin.status !== 200 || !saLogin.body.token) {
    throw new Error('Super Admin login failed: ' + JSON.stringify(saLogin.body));
  }
  const saToken = saLogin.body.token;
  console.log('   ✔ Super Admin logged in successfully.');

  // 2. Stage a new daycare application & approve it
  console.log('\n2. Onboarding Fresh Daycare via Staging Application...');
  const daycareAdminEmail = `director_${runId}@brightstars.com`;
  const daycareAdminPassword = 'AdminPassword123!';
  const appRes = await req('POST', '/api/saas/register-daycare', {
    daycareName: `Bright Stars Academy ${runId}`,
    citySubcity: 'Addis Ababa, Bole',
    contactEmail: `contact_${runId}@brightstars.com`,
    contactPhone: '+251 91 122 3344',
    licenseNumber: `LIC-${runId}`,
    adminName: `Director Stars ${runId}`,
    adminEmail: daycareAdminEmail,
    adminPhone: '+251 91 122 3345',
    adminPassword: daycareAdminPassword,
    packageSlug: 'standard',
  });
  if (appRes.status !== 201) {
    throw new Error('Daycare application staging failed: ' + JSON.stringify(appRes.body));
  }
  const appId = appRes.body.application?.id || appRes.body.daycare?.id;
  console.log(`   ✔ Application staged (ID: ${appId}). Approving via Super Admin...`);

  const approveRes = await req('PATCH', `/api/saas/super-admin/applications/${appId}/approve`, {}, saToken);
  if (approveRes.status !== 200 || !approveRes.body.daycare?.id) {
    throw new Error('Daycare approval failed: ' + JSON.stringify(approveRes.body));
  }
  const daycareId = approveRes.body.daycare.id;
  console.log(`   ✔ Daycare approved! Daycare ID: ${daycareId}, Admin: ${daycareAdminEmail}`);

  // 3. Daycare Admin Login
  console.log('\n3. Daycare Admin Authentication...');
  const adminLogin = await req('POST', '/api/auth/login', {
    email: daycareAdminEmail,
    password: daycareAdminPassword,
  });
  if (adminLogin.status !== 200 || !adminLogin.body.token) {
    throw new Error('Daycare admin login failed: ' + JSON.stringify(adminLogin.body));
  }
  const adminToken = adminLogin.body.token;
  console.log('   ✔ Daycare Admin authenticated.');

  // 4. Create a Classroom & Children with monthly care fee
  console.log('\n4. Setting up Classroom and Active Children with Care Fees...');
  const groupRes = await req('POST', '/api/groups', {
    name: 'Toddlers Room A',
    description: 'Ages 2 to 3',
  }, adminToken);
  const groupId = groupRes.body.id || groupRes.body.group?.id;

  // Create Child 1: Abebe Kebede (monthly_care_fee: 3800.00)
  const child1Res = await req('POST', '/api/children', {
    full_name: 'Abebe Kebede',
    dob: '2023-04-10',
    gender: 'male',
    group_id: groupId,
    monthly_care_fee: 3800.00,
  }, adminToken);
  if (child1Res.status !== 201) {
    throw new Error('Create child 1 failed: ' + JSON.stringify(child1Res.body));
  }
  const child1Id = child1Res.body.id || child1Res.body.child?.id;

  // Create Child 2: Almaz Tadesse (default fee 3500.00)
  const child2Res = await req('POST', '/api/children', {
    full_name: 'Almaz Tadesse',
    dob: '2023-08-15',
    gender: 'female',
    group_id: groupId,
    monthly_care_fee: 3500.00,
  }, adminToken);
  const child2Id = child2Res.body.id || child2Res.body.child?.id;

  // Create Parent User and link to Child 1
  const parentEmail = `parent_${runId}@family.com`;
  const parentPassword = 'ParentPassword123!';
  const parentUserRes = await req('POST', '/api/users', {
    name: 'Kebede Haile',
    email: parentEmail,
    password: parentPassword,
    role: 'parent',
    phone: '+251 91 999 8888',
  }, adminToken);
  const parentId = parentUserRes.body.id || parentUserRes.body.user?.id;

  const guardianRes = await req('POST', `/api/children/${child1Id}/guardians`, {
    user_id: parentId,
    relationship: 'father',
    pickup_authorized: true,
  }, adminToken);
  if (guardianRes.status !== 201) {
    throw new Error('Add guardian failed: ' + JSON.stringify(guardianRes.body));
  }

  console.log(`   ✔ Enrolled Child 1 (ID: ${child1Id}, Fee: ETB 3,800), Child 2 (ID: ${child2Id}, Fee: ETB 3,500).`);
  console.log(`   ✔ Linked Parent: ${parentEmail} (ID: ${parentId}).`);

  // 5. Check Initial Overview (Should be 0)
  console.log('\n5. Checking Initial Financial Overview (GET /api/finances/overview)...');
  const initialOverview = await req('GET', '/api/finances/overview', null, adminToken);
  if (initialOverview.status !== 200) {
    throw new Error('Initial overview failed: ' + JSON.stringify(initialOverview.body));
  }
  console.log(`   ✔ Initial Overview: Billed: ETB ${initialOverview.body.total_billed}, Collected: ETB ${initialOverview.body.total_collected}`);

  // 6. Batch Generate Monthly Care Fees
  console.log('\n6. Batch Generating Monthly Care Fees (POST /api/finances/invoices/generate-monthly)...');
  const genRes = await req('POST', '/api/finances/invoices/generate-monthly', {
    billingPeriod: '2026-11',
    dueDate: '2026-11-10',
    defaultFee: 3500.00
  }, adminToken);
  if (genRes.status !== 201 || genRes.body.generated_count !== 2) {
    throw new Error('Monthly invoice generation failed: ' + JSON.stringify(genRes.body));
  }
  console.log(`   ✔ Generated: ${genRes.body.generated_count} invoices, Total Billed: ETB ${genRes.body.total_amount}`);

  // 7. Verify Idempotent Batch Generation
  console.log('\n7. Testing Generation Idempotency (Should skip existing)...');
  const regenRes = await req('POST', '/api/finances/invoices/generate-monthly', {
    billingPeriod: '2026-11',
    dueDate: '2026-11-10'
  }, adminToken);
  if (regenRes.status !== 201 || regenRes.body.generated_count !== 0 || regenRes.body.skipped_count !== 2) {
    throw new Error('Idempotency failed: ' + JSON.stringify(regenRes.body));
  }
  console.log(`   ✔ Idempotency Confirmed: 0 generated, 2 skipped.`);

  // 8. Fetch Invoices List with filters
  console.log('\n8. Listing Invoices with Filters (GET /api/finances/invoices)...');
  const invListRes = await req('GET', '/api/finances/invoices?billingPeriod=2026-11', null, adminToken);
  if (invListRes.status !== 200 || !Array.isArray(invListRes.body) || invListRes.body.length !== 2) {
    throw new Error('Invoices listing failed: ' + JSON.stringify(invListRes.body));
  }
  const invChild1 = invListRes.body.find(i => i.child_id === child1Id);
  const invChild2 = invListRes.body.find(i => i.child_id === child2Id);
  if (!invChild1 || parseFloat(invChild1.amount) !== 3800.00) {
    throw new Error('Child 1 invoice mismatch: ' + JSON.stringify(invChild1));
  }
  console.log(`   ✔ Found 2 invoices for 2026-11. Child 1: ETB ${invChild1.amount}, Child 2: ETB ${invChild2.amount}.`);

  // 9. Record Partial Payment (Cash at Daycare Front Desk)
  console.log('\n9. Recording Partial Payment via Cash at Daycare Front Desk...');
  const pay1Res = await req('POST', `/api/finances/invoices/${invChild1.id}/payments`, {
    amount_paid: 1800.00,
    payment_method: 'cash_at_daycare',
    notes: 'Paid at front reception desk'
  }, adminToken);
  if (pay1Res.status !== 201 || pay1Res.body.invoice?.status !== 'partially_paid') {
    throw new Error('Partial payment failed: ' + JSON.stringify(pay1Res.body));
  }
  const receipt1 = pay1Res.body.receipt;
  console.log(`   ✔ Partial Payment Recorded:`);
  console.log(`     - Receipt Number: ${receipt1.receipt_number}`);
  console.log(`     - Amount Paid: ETB ${receipt1.amount_paid}`);
  console.log(`     - Balance Remaining: ETB ${receipt1.balance_remaining}`);
  console.log(`     - Invoice Status: ${pay1Res.body.invoice.status}`);

  // 10. Record Remaining Balance Payment (Telebirr Mobile Transfer)
  console.log('\n10. Recording Final Balance via Telebirr Transfer...');
  const pay2Res = await req('POST', `/api/finances/invoices/${invChild1.id}/payments`, {
    amount_paid: 2000.00,
    payment_method: 'telebirr_transfer',
    reference_code: `TB-${runId}`,
    notes: 'Telebirr SMS notification confirmed'
  }, adminToken);
  if (pay2Res.status !== 201 || pay2Res.body.invoice?.status !== 'paid') {
    throw new Error('Full payment failed: ' + JSON.stringify(pay2Res.body));
  }
  const receipt2 = pay2Res.body.receipt;
  console.log(`   ✔ Full Payment Recorded:`);
  console.log(`     - Receipt Number: ${receipt2.receipt_number}`);
  console.log(`     - Amount Paid: ETB ${receipt2.amount_paid}`);
  console.log(`     - Balance Remaining: ETB ${receipt2.balance_remaining}`);
  console.log(`     - Reference Code: ${receipt2.reference_code}`);
  console.log(`     - Invoice Status: ${pay2Res.body.invoice.status}`);

  // 11. Overpayment Rejection Check
  console.log('\n11. Testing Overpayment Protection...');
  const overpayRes = await req('POST', `/api/finances/invoices/${invChild1.id}/payments`, {
    amount_paid: 100.00,
    payment_method: 'cash_at_daycare'
  }, adminToken);
  if (overpayRes.status !== 409) {
    throw new Error(`Expected 409 for paid invoice, got ${overpayRes.status}`);
  }
  console.log('   ✔ Overpayment correctly blocked with 409 Conflict.');

  // 12. Single Invoice Breakdown with Receipts History
  console.log('\n12. Fetching Detailed Single Invoice Breakdown (GET /api/finances/invoices/:id)...');
  const singleInvRes = await req('GET', `/api/finances/invoices/${invChild1.id}`, null, adminToken);
  if (singleInvRes.status !== 200 || singleInvRes.body.payments?.length !== 2) {
    throw new Error('Single invoice breakdown failed: ' + JSON.stringify(singleInvRes.body));
  }
  console.log(`   ✔ Invoice breakdown retrieved with ${singleInvRes.body.payments.length} digital receipts.`);

  // 13. Parent Portal Billing Access
  console.log('\n13. Parent Portal: Logging in as Parent to check bills...');
  const parentLogin = await req('POST', '/api/auth/login', {
    email: parentEmail,
    password: parentPassword,
  });
  if (parentLogin.status !== 200 || !parentLogin.body.token) {
    throw new Error('Parent login failed: ' + JSON.stringify(parentLogin.body));
  }
  const parentToken = parentLogin.body.token;

  const parentBillsRes = await req('GET', '/api/finances/parent/my-bills', null, parentToken);
  if (parentBillsRes.status !== 200 || !Array.isArray(parentBillsRes.body) || parentBillsRes.body.length === 0) {
    throw new Error('Parent bills failed: ' + JSON.stringify(parentBillsRes.body));
  }
  console.log(`   ✔ Parent successfully retrieved ${parentBillsRes.body.length} bill(s).`);
  console.log(`     Child: ${parentBillsRes.body[0].child_name}, Status: ${parentBillsRes.body[0].status}, Receipts: ${parentBillsRes.body[0].payments.length}`);

  // 14. Daycare Multi-Tenant RLS Cross-Isolation Check
  console.log('\n14. Testing Multi-Tenant Cross-Daycare Isolation...');
  // Login with another daycare's admin (mistire@ankelba.com in Daycare 28)
  // Let's create an admin in Daycare B to verify they cannot read Daycare A's invoices
  const daycareBRes = await req('POST', '/api/saas/register-daycare', {
    daycareName: `Rival Daycare ${runId}`,
    citySubcity: 'Addis Ababa, Yeka',
    contactEmail: `rival_${runId}@rival.com`,
    contactPhone: '+251 91 777 6655',
    licenseNumber: `LIC-RIV-${runId}`,
    adminName: `Rival Admin ${runId}`,
    adminEmail: `rival_admin_${runId}@rival.com`,
    adminPhone: '+251 91 777 6656',
    adminPassword: 'RivalPassword123!',
    packageSlug: 'starter',
  });
  const rivalAppId = daycareBRes.body.application?.id || daycareBRes.body.daycare?.id;
  await req('PATCH', `/api/saas/super-admin/applications/${rivalAppId}/approve`, {}, saToken);

  const rivalLogin = await req('POST', '/api/auth/login', {
    email: `rival_admin_${runId}@rival.com`,
    password: 'RivalPassword123!',
  });
  const rivalToken = rivalLogin.body.token;

  const crossReadRes = await req('GET', `/api/finances/invoices/${invChild1.id}`, null, rivalToken);
  if (crossReadRes.status !== 404) {
    throw new Error(`Cross-tenant security breach! Rival admin accessed invoice from another daycare: status ${crossReadRes.status}`);
  }
  console.log('   ✔ Cross-Tenant Isolation Verified: Daycare B received 404 when querying Daycare A invoice.');

  // 15. Final Overview Validation
  console.log('\n15. Validating Final Financial Overview...');
  const finalOverview = await req('GET', '/api/finances/overview', null, adminToken);
  console.log('   ✔ Final Overview:', JSON.stringify(finalOverview.body));
  if (parseFloat(finalOverview.body.total_collected) !== 3800.00) {
    throw new Error(`Expected total_collected 3800.00, got ${finalOverview.body.total_collected}`);
  }

  console.log('\n===============================================================');
  console.log('🎉 ALL 15 PHASE 2 FINANCES TESTS COMPLETED WITH 100% SUCCESS!');
  console.log('===============================================================\n');
}

run().catch(err => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
