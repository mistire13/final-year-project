'use strict';

/**
 * src/modules/finances/finances.service.js
 * Daycare Child Care Fee and Invoice Management Engine.
 *
 * SRS Refs: FR-ECM-01–16, Child Care Fees & Daycare Financial Operations
 * Handles:
 * - Monthly care fee generation for active children
 * - One-off custom fee/supply invoicing
 * - Payment recording (Cash at front desk, Telebirr/CBE transfer code)
 * - Digital receipt issuance & parent bill balance tracking
 */

const db = require('../../config/db');
const logger = require('../../config/logger');

/**
 * Super/Daycare Admin: High-level financial KPIs overview for the daycare.
 */
const getOverview = async (daycareId) => {
  const dcId = parseInt(daycareId, 10);

  const [invoicesSummary, paymentsSummary, overdueSummary, recentPayments, countsRes] = await Promise.all([
    // Total billed and total collected on invoices
    db.query(`
      SELECT 
        COALESCE(SUM(amount), 0)::numeric(12,2) AS total_billed,
        COALESCE(SUM(amount_paid), 0)::numeric(12,2) AS total_collected,
        COALESCE(SUM(amount - amount_paid), 0)::numeric(12,2) AS total_outstanding
      FROM child_invoices
      WHERE daycare_id = $1 AND status != 'cancelled'
    `, [dcId]),

    // Total payments recorded
    db.query(`
      SELECT COALESCE(SUM(amount_paid), 0)::numeric(12,2) AS total_payments
      FROM child_payments
      WHERE daycare_id = $1
    `, [dcId]),

    // Overdue balance
    db.query(`
      SELECT COALESCE(SUM(amount - amount_paid), 0)::numeric(12,2) AS total_overdue
      FROM child_invoices
      WHERE daycare_id = $1 
        AND status IN ('pending', 'partially_paid') 
        AND due_date < CURRENT_DATE
    `, [dcId]),

    // Recent 8 payments with details
    db.query(`
      SELECT 
        p.id,
        p.invoice_id,
        p.amount_paid,
        p.payment_method,
        p.reference_code,
        p.receipt_number,
        p.verified_at,
        p.notes,
        c.full_name AS child_name,
        u.name AS recorded_by_name,
        ci.title AS invoice_title,
        ci.billing_period
      FROM child_payments p
      JOIN child_invoices ci ON ci.id = p.invoice_id
      JOIN children c ON c.id = ci.child_id
      JOIN users u ON u.id = p.recorded_by
      WHERE p.daycare_id = $1
      ORDER BY p.verified_at DESC
      LIMIT 8
    `, [dcId]),

    // Status distribution
    db.query(`
      SELECT status, COUNT(*)::int AS count
      FROM child_invoices
      WHERE daycare_id = $1
      GROUP BY status
    `, [dcId]),
  ]);

  const billed = parseFloat(invoicesSummary.rows[0]?.total_billed || '0');
  const collected = parseFloat(invoicesSummary.rows[0]?.total_collected || '0');
  const outstanding = parseFloat(invoicesSummary.rows[0]?.total_outstanding || '0');
  const overdue = parseFloat(overdueSummary.rows[0]?.total_overdue || '0');

  const statusCounts = {
    pending: 0,
    partially_paid: 0,
    paid: 0,
    overdue: 0,
    cancelled: 0,
    total: 0,
  };

  countsRes.rows.forEach(r => {
    if (statusCounts[r.status] !== undefined) {
      statusCounts[r.status] = r.count;
    }
    statusCounts.total += r.count;
  });

  const collectionRate = billed > 0 ? Math.round((collected / billed) * 100) : 0;

  return {
    total_billed: billed,
    total_collected: collected,
    total_outstanding: outstanding,
    total_overdue: overdue,
    collection_rate_percent: collectionRate,
    invoices_count: statusCounts,
    recent_payments: recentPayments.rows,
  };
};

/**
 * List invoices with filters and child/parent information.
 */
const listInvoices = async (daycareId, { status, childId, billingPeriod, search, limit = 50, offset = 0 } = {}) => {
  const dcId = parseInt(daycareId, 10);
  const params = [dcId];
  const whereClauses = ['ci.daycare_id = $1'];

  if (status && status !== 'all') {
    if (status === 'overdue') {
      whereClauses.push(`(ci.status IN ('pending', 'partially_paid') AND ci.due_date < CURRENT_DATE)`);
    } else {
      params.push(status);
      whereClauses.push(`ci.status = $${params.length}`);
    }
  }

  if (childId) {
    params.push(parseInt(childId, 10));
    whereClauses.push(`ci.child_id = $${params.length}`);
  }

  if (billingPeriod && billingPeriod.trim()) {
    params.push(billingPeriod.trim());
    whereClauses.push(`ci.billing_period = $${params.length}`);
  }

  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    const sIdx = params.length;
    whereClauses.push(`(
      LOWER(ci.title) LIKE $${sIdx} OR 
      LOWER(c.full_name) LIKE $${sIdx} OR 
      LOWER(COALESCE(u.name, '')) LIKE $${sIdx}
    )`);
  }

  const querySql = `
    SELECT 
      ci.id,
      ci.daycare_id,
      ci.child_id,
      ci.parent_id,
      ci.invoice_type,
      ci.billing_period,
      ci.title,
      ci.amount,
      ci.amount_paid,
      (ci.amount - ci.amount_paid) AS balance_remaining,
      ci.due_date,
      ci.status,
      ci.notes,
      ci.created_at,
      ci.updated_at,
      c.full_name AS child_name,
      c.photo_url AS child_photo,
      g.name AS group_name,
      u.name AS parent_name,
      u.email AS parent_email,
      u.phone AS parent_phone
    FROM child_invoices ci
    JOIN children c ON c.id = ci.child_id
    LEFT JOIN groups g ON g.id = c.group_id
    LEFT JOIN users u ON u.id = ci.parent_id
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY 
      CASE WHEN ci.status = 'pending' THEN 0 WHEN ci.status = 'partially_paid' THEN 1 ELSE 2 END,
      ci.due_date DESC,
      ci.id DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;

  params.push(parseInt(limit, 10) || 50);
  params.push(parseInt(offset, 10) || 0);

  const { rows } = await db.query(querySql, params);
  return rows;
};

/**
 * Get single invoice detailed breakdown with payments history.
 */
const getInvoiceById = async (daycareId, invoiceId) => {
  const dcId = parseInt(daycareId, 10);
  const invId = parseInt(invoiceId, 10);

  const invoiceRes = await db.query(`
    SELECT 
      ci.*,
      (ci.amount - ci.amount_paid) AS balance_remaining,
      c.full_name AS child_name,
      c.photo_url AS child_photo,
      c.dob AS child_dob,
      g.name AS group_name,
      u.name AS parent_name,
      u.email AS parent_email,
      u.phone AS parent_phone,
      d.name AS daycare_name,
      d.contact_phone AS daycare_phone,
      d.contact_email AS daycare_email,
      d.address AS daycare_address
    FROM child_invoices ci
    JOIN children c ON c.id = ci.child_id
    LEFT JOIN groups g ON g.id = c.group_id
    LEFT JOIN users u ON u.id = ci.parent_id
    JOIN daycares d ON d.id = ci.daycare_id
    WHERE ci.id = $1 AND ci.daycare_id = $2
  `, [invId, dcId]);

  if (!invoiceRes.rows[0]) {
    const err = new Error('Invoice not found.');
    err.statusCode = 404;
    throw err;
  }

  const invoice = invoiceRes.rows[0];

  const paymentsRes = await db.query(`
    SELECT 
      p.*,
      u.name AS recorded_by_name
    FROM child_payments p
    JOIN users u ON u.id = p.recorded_by
    WHERE p.invoice_id = $1 AND p.daycare_id = $2
    ORDER BY p.verified_at DESC
  `, [invId, dcId]);

  invoice.payments = paymentsRes.rows;
  return invoice;
};

/**
 * Create a single invoice (e.g. registration fee, custom care service, supplies).
 */
const createInvoice = async (daycareId, data, actorId) => {
  const dcId = parseInt(daycareId, 10);
  const { child_id, parent_id, invoice_type = 'custom', billing_period, title, amount, due_date, notes } = data;

  if (!child_id) {
    const err = new Error('Child ID is required.');
    err.statusCode = 422;
    throw err;
  }
  if (!title || !title.trim()) {
    const err = new Error('Invoice title is required.');
    err.statusCode = 422;
    throw err;
  }
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    const err = new Error('Amount must be a positive number.');
    err.statusCode = 422;
    throw err;
  }
  if (!due_date) {
    const err = new Error('Due date is required.');
    err.statusCode = 422;
    throw err;
  }

  // Verify child belongs to this daycare
  const childRes = await db.query('SELECT id, full_name FROM children WHERE id = $1 AND daycare_id = $2', [child_id, dcId]);
  if (!childRes.rows[0]) {
    const err = new Error('Child not found in this daycare.');
    err.statusCode = 404;
    throw err;
  }

  // Determine parent_id if not explicitly provided
  let effectiveParentId = parent_id ? parseInt(parent_id, 10) : null;
  if (!effectiveParentId) {
    const guardianRes = await db.query(`
      SELECT user_id 
      FROM guardian_links 
      WHERE child_id = $1 AND daycare_id = $2 
      ORDER BY CASE WHEN relationship IN ('mother', 'father', 'primary_guardian', 'parent') THEN 0 ELSE 1 END, id ASC 
      LIMIT 1
    `, [child_id, dcId]);
    if (guardianRes.rows[0]) {
      effectiveParentId = guardianRes.rows[0].user_id;
    }
  }

  const period = (billing_period && billing_period.trim()) ? billing_period.trim() : new Date().toISOString().slice(0, 7);

  const insertRes = await db.query(`
    INSERT INTO child_invoices (
      daycare_id, child_id, parent_id, invoice_type, billing_period,
      title, amount, amount_paid, due_date, status, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0.00, $8, 'pending', $9)
    RETURNING *
  `, [
    dcId,
    child_id,
    effectiveParentId,
    invoice_type,
    period,
    title.trim(),
    numericAmount,
    due_date,
    notes ? notes.trim() : null,
  ]);

  logger.info(`Child invoice created: ID ${insertRes.rows[0].id} for child ${child_id} (ETB ${numericAmount}) by ${actorId}`);
  return insertRes.rows[0];
};

/**
 * Auto-generate monthly child care fee invoices for all active children in the daycare.
 * Idempotent: Skips children already invoiced for the specified billing period.
 */
const generateMonthlyInvoices = async (daycareId, { billingPeriod, dueDate, defaultFee = 3500.00 }, actorId) => {
  const dcId = parseInt(daycareId, 10);

  if (!billingPeriod || !/^\d{4}-\d{2}$/.test(billingPeriod.trim())) {
    const err = new Error('Valid billing period in YYYY-MM format is required (e.g. 2026-11).');
    err.statusCode = 422;
    throw err;
  }
  const period = billingPeriod.trim();

  const finalDueDate = dueDate ? dueDate : `${period}-10`;
  const fallbackFee = parseFloat(defaultFee) || 3500.00;

  // Query all active children in this daycare with their linked primary parent
  const activeChildren = (await db.query(`
    SELECT 
      c.id,
      c.full_name,
      COALESCE(c.monthly_care_fee, $2) AS care_fee,
      (
        SELECT user_id 
        FROM guardian_links 
        WHERE child_id = c.id AND daycare_id = $1 
        ORDER BY CASE WHEN relationship IN ('mother', 'father', 'primary_guardian', 'parent') THEN 0 ELSE 1 END, id ASC 
        LIMIT 1
      ) AS parent_id
    FROM children c
    WHERE c.daycare_id = $1 AND c.enrollment_status = 'active'
    ORDER BY c.full_name ASC
  `, [dcId, fallbackFee])).rows;

  if (activeChildren.length === 0) {
    return {
      message: 'No active children found in this daycare center.',
      generated_count: 0,
      skipped_count: 0,
      total_amount: 0,
      billing_period: period,
    };
  }

  // Check which children already have an invoice for this period
  const existingInvoices = (await db.query(`
    SELECT child_id 
    FROM child_invoices 
    WHERE daycare_id = $1 AND billing_period = $2 AND invoice_type = 'care_fee'
  `, [dcId, period])).rows.map(r => r.child_id);

  const existingSet = new Set(existingInvoices);

  const client = await db.connect();
  let generatedCount = 0;
  let skippedCount = 0;
  let totalBilled = 0;

  try {
    await client.query('BEGIN');

    for (const child of activeChildren) {
      if (existingSet.has(child.id)) {
        skippedCount++;
        continue;
      }

      const fee = parseFloat(child.care_fee) || fallbackFee;
      const title = `${period} Monthly Care Fee — ${child.full_name}`;

      await client.query(`
        INSERT INTO child_invoices (
          daycare_id, child_id, parent_id, invoice_type, billing_period,
          title, amount, amount_paid, due_date, status
        ) VALUES ($1, $2, $3, 'care_fee', $4, $5, $6, 0.00, $7, 'pending')
      `, [
        dcId,
        child.id,
        child.parent_id || null,
        period,
        title,
        fee,
        finalDueDate,
      ]);

      generatedCount++;
      totalBilled += fee;
    }

    if (generatedCount > 0 && actorId) {
      await client.query(`
        INSERT INTO audit_logs (actor_id, action, target_table, target_id, daycare_id, metadata)
        VALUES ($1, 'INVOICES_MONTHLY_GENERATED', 'daycares', $2, $2, $3)
      `, [
        actorId,
        dcId,
        JSON.stringify({ billing_period: period, generated_count: generatedCount, total_billed: totalBilled }),
      ]);
    }

    await client.query('COMMIT');
    logger.info(`Monthly invoices generated for Daycare ${dcId}: ${generatedCount} generated, ${skippedCount} skipped, ETB ${totalBilled}`);

    return {
      message: `Successfully generated ${generatedCount} invoices for period ${period}. (${skippedCount} already had invoices).`,
      generated_count: generatedCount,
      skipped_count: skippedCount,
      total_amount: totalBilled,
      billing_period: period,
      due_date: finalDueDate,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Record payment against a child invoice.
 * Supports Cash at Daycare, Telebirr Transfer code, or CBE Transfer code.
 * Issues an immutable digital receipt.
 */
const recordPayment = async (daycareId, invoiceId, data, actorId) => {
  const dcId = parseInt(daycareId, 10);
  const invId = parseInt(invoiceId, 10);
  const { amount_paid, payment_method, reference_code, notes } = data;

  const paymentAmount = parseFloat(amount_paid);
  if (isNaN(paymentAmount) || paymentAmount <= 0) {
    const err = new Error('Payment amount must be a positive number.');
    err.statusCode = 422;
    throw err;
  }

  const validMethods = ['cash_at_daycare', 'telebirr_transfer', 'cbe_transfer', 'digital_gateway'];
  if (!payment_method || !validMethods.includes(payment_method)) {
    const err = new Error(`Payment method must be one of: ${validMethods.join(', ')}`);
    err.statusCode = 422;
    throw err;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Lock invoice for update
    const invoiceRes = await client.query(`
      SELECT 
        ci.*,
        c.full_name AS child_name,
        u.name AS parent_name,
        d.name AS daycare_name
      FROM child_invoices ci
      JOIN children c ON c.id = ci.child_id
      LEFT JOIN users u ON u.id = ci.parent_id
      JOIN daycares d ON d.id = ci.daycare_id
      WHERE ci.id = $1 AND ci.daycare_id = $2
      FOR UPDATE OF ci
    `, [invId, dcId]);

    const invoice = invoiceRes.rows[0];
    if (!invoice) {
      const err = new Error('Invoice not found.');
      err.statusCode = 404;
      throw err;
    }

    if (invoice.status === 'paid') {
      const err = new Error('This invoice is already fully paid.');
      err.statusCode = 409;
      throw err;
    }
    if (invoice.status === 'cancelled') {
      const err = new Error('Cannot record payment for a cancelled invoice.');
      err.statusCode = 409;
      throw err;
    }

    const currentPaid = parseFloat(invoice.amount_paid) || 0;
    const totalDue = parseFloat(invoice.amount);
    const balanceRemaining = totalDue - currentPaid;

    if (paymentAmount > balanceRemaining + 0.01) {
      const err = new Error(`Payment amount (ETB ${paymentAmount}) exceeds the remaining balance (ETB ${balanceRemaining.toFixed(2)}).`);
      err.statusCode = 422;
      throw err;
    }

    // Generate unique receipt number
    const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const receiptNumber = `REC-${dateStamp}-${randomSuffix}`;

    // 1. Insert into child_payments
    const paymentRes = await client.query(`
      INSERT INTO child_payments (
        daycare_id, invoice_id, amount_paid, payment_method, reference_code,
        receipt_number, recorded_by, verified_at, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
      RETURNING *
    `, [
      dcId,
      invId,
      paymentAmount,
      payment_method,
      reference_code ? reference_code.trim() : null,
      receiptNumber,
      actorId,
      notes ? notes.trim() : null,
    ]);

    const newPayment = paymentRes.rows[0];

    // 2. Update child_invoices
    const updatedPaid = currentPaid + paymentAmount;
    const newStatus = (updatedPaid >= totalDue - 0.01) ? 'paid' : 'partially_paid';

    const updatedInvoiceRes = await client.query(`
      UPDATE child_invoices
      SET amount_paid = $1,
          status = $2,
          updated_at = NOW()
      WHERE id = $3 AND daycare_id = $4
      RETURNING *
    `, [updatedPaid, newStatus, invId, dcId]);

    // 3. Audit log
    await client.query(`
      INSERT INTO audit_logs (actor_id, action, target_table, target_id, daycare_id, metadata)
      VALUES ($1, 'CHILD_PAYMENT_RECORDED', 'daycares', $2, $2, $3)
    `, [
      actorId,
      dcId,
      JSON.stringify({
        invoice_id: invId,
        payment_id: newPayment.id,
        amount_paid: paymentAmount,
        receipt_number: receiptNumber,
        payment_method,
      }),
    ]);

    await client.query('COMMIT');
    logger.info(`Payment recorded for Invoice ${invId}: ETB ${paymentAmount} via ${payment_method} (Receipt: ${receiptNumber})`);

    return {
      message: 'Payment recorded and digital receipt issued successfully.',
      payment: newPayment,
      invoice: updatedInvoiceRes.rows[0],
      receipt: {
        receipt_number: receiptNumber,
        invoice_id: invId,
        title: invoice.title,
        daycare_name: invoice.daycare_name,
        child_name: invoice.child_name,
        parent_name: invoice.parent_name || 'N/A',
        amount_paid: paymentAmount,
        total_invoice_amount: totalDue,
        balance_remaining: Math.max(0, totalDue - updatedPaid),
        payment_method,
        reference_code: reference_code || null,
        verified_at: newPayment.verified_at,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Parent Portal: Retrieve all bills, payment history and balances for a parent's children.
 */
const listParentInvoices = async (parentId, daycareId) => {
  const pId = parseInt(parentId, 10);
  const dcId = parseInt(daycareId, 10);

  const { rows } = await db.query(`
    SELECT 
      ci.id,
      ci.daycare_id,
      ci.child_id,
      ci.invoice_type,
      ci.billing_period,
      ci.title,
      ci.amount,
      ci.amount_paid,
      (ci.amount - ci.amount_paid) AS balance_remaining,
      ci.due_date,
      ci.status,
      ci.notes,
      ci.created_at,
      c.full_name AS child_name,
      c.photo_url AS child_photo,
      d.name AS daycare_name,
      d.contact_phone AS daycare_phone,
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', cp.id,
          'amount_paid', cp.amount_paid,
          'payment_method', cp.payment_method,
          'reference_code', cp.reference_code,
          'receipt_number', cp.receipt_number,
          'verified_at', cp.verified_at
        ) ORDER BY cp.verified_at DESC)
        FROM child_payments cp
        WHERE cp.invoice_id = ci.id AND cp.daycare_id = ci.daycare_id
      ), '[]'::json) AS payments
    FROM child_invoices ci
    JOIN children c ON c.id = ci.child_id
    JOIN daycares d ON d.id = ci.daycare_id
    WHERE ci.daycare_id = $1 
      AND (
        ci.parent_id = $2 
        OR ci.child_id IN (SELECT child_id FROM guardian_links WHERE user_id = $2 AND daycare_id = $1)
      )
    ORDER BY ci.due_date DESC, ci.id DESC
  `, [dcId, pId]);

  return rows;
};

module.exports = {
  getOverview,
  listInvoices,
  getInvoiceById,
  createInvoice,
  generateMonthlyInvoices,
  recordPayment,
  listParentInvoices,
};
