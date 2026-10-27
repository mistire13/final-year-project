'use strict';
require('dotenv').config();
const db = require('../src/config/db');
const financesService = require('../src/modules/finances/finances.service');

async function seed() {
  const dcId = 28;
  const adminId = 159;

  // Check children in daycare 28
  const children = (await db.query('SELECT id, full_name FROM children WHERE daycare_id = $1', [dcId])).rows;
  console.log(`Daycare 28 has ${children.length} children.`);

  // If no children, create two sample children for Daycare 28
  if (children.length === 0) {
    const c1 = await db.query(`
      INSERT INTO children (full_name, dob, gender, enrollment_status, daycare_id, monthly_care_fee)
      VALUES ('Sara Yohannes', '2023-03-12', 'female', 'active', $1, 3800.00)
      RETURNING id, full_name
    `, [dcId]);
    const c2 = await db.query(`
      INSERT INTO children (full_name, dob, gender, enrollment_status, daycare_id, monthly_care_fee)
      VALUES ('Dawit Bekele', '2023-06-25', 'male', 'active', $1, 3500.00)
      RETURNING id, full_name
    `, [dcId]);
    console.log('Created sample children:', c1.rows[0], c2.rows[0]);
  }

  // Generate monthly invoices for current month
  const currentPeriod = new Date().toISOString().slice(0, 7);
  const genResult = await financesService.generateMonthlyInvoices(dcId, {
    billingPeriod: currentPeriod,
    dueDate: `${currentPeriod}-10`,
    defaultFee: 3500.00
  }, adminId);
  console.log('Generated invoices:', genResult);

  // Record a payment on the first invoice
  const invs = await financesService.listInvoices(dcId, { billingPeriod: currentPeriod });
  if (invs.length > 0 && parseFloat(invs[0].amount_paid) === 0) {
    const payRes = await financesService.recordPayment(dcId, invs[0].id, {
      amount_paid: 2000.00,
      payment_method: 'telebirr_transfer',
      reference_code: 'TB-99881122',
      notes: 'Initial deposit via Telebirr'
    }, adminId);
    console.log('Recorded sample payment:', payRes.receipt);
  }

  const overview = await financesService.getOverview(dcId);
  console.log('Daycare 28 Overview:', overview);
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
