'use strict';
/**
 * src/modules/payments/payments.service.js
 * Business logic for Daycare Payments & Gateway Integration.
 * SRS Refs: FR-ECM-07–10, TBD-02 (Chapa), NFR-REL-03
 */
const db = require('../../config/db');
const { transaction } = require('../auth/legacy-security');
const { writeAudit } = require('../../utils/auditedWrite');

const demoEnabled = () => process.env.NODE_ENV === 'development' && process.env.ENABLE_DEMO_PAYMENTS === 'true';
const capabilities = () => ({ demo_enabled: demoEnabled(), online_enabled: false });

// A separate demo operation never acknowledges gateway callbacks or moves money.
const simulatePayment = async (body, user) => {
  if (!demoEnabled()) throw Object.assign(new Error('Demo payments are disabled.'), { statusCode: 503 });
  return transaction(db, async client => {
    const {rows:[order]} = await client.query(
      'SELECT * FROM orders WHERE id=$1 AND daycare_id=$2 AND parent_id=$3 FOR UPDATE',
      [body.order_id,user.daycare_id,user.id]);
    if (!order) throw Object.assign(new Error('Order not found.'), {statusCode:404});
    if (order.order_status === 'cancelled') throw Object.assign(new Error('A cancelled order cannot be paid.'), {statusCode:409});
    const {rows:[payment]} = await client.query('SELECT * FROM payments WHERE order_id=$1 FOR UPDATE',[order.id]);
    if (!payment) throw Object.assign(new Error('Payment record not found.'),{statusCode:404});
    if (order.payment_status === 'paid') {
      if (!['demo','no_charge'].includes(payment.method)) throw Object.assign(new Error('This order already has a recorded payment.'),{statusCode:409});
      return { ...payment, simulated: payment.method === 'demo', total: order.total };
    }
    if (order.payment_status !== 'unpaid' || payment.status !== 'unpaid') throw Object.assign(new Error('This payment cannot be simulated in its current state.'),{statusCode:409});
    const reference = `DEMO-${user.daycare_id}-${order.id}`;
    await client.query("UPDATE orders SET payment_status='paid',updated_at=NOW() WHERE id=$1",[order.id]);
    const {rows:[result]} = await client.query("UPDATE payments SET method='demo',status='paid',gateway_ref=$2,verified_at=NOW() WHERE id=$1 RETURNING *",[payment.id,reference]);
    await writeAudit(client,user,'DEMO_PAYMENT_SUCCEEDED','orders',order.id,{simulated:true,reference,total:order.total,money_transferred:false});
    return {...result,simulated:true,total:order.total};
  });
};

/**
 * Payment processing is deferred until a verified provider integration exists.
 * Keep this guard in the service so internal callers cannot bypass the HTTP route.
 * Do not add an environment switch that re-enables the former unverified flow.
 */
const paymentUnavailable = () => {
  const err = new Error('Payment processing is not available yet.');
  err.statusCode = 503;
  err.code = 'PAYMENTS_UNAVAILABLE';
  return err;
};

const initiatePayment = async () => {
  throw paymentUnavailable();
};

/**
 * Never acknowledge or apply an unverified payment callback. Replacing this guard
 * requires provider signature/transaction verification and idempotent transitions.
 */
const handleWebhook = async () => {
  throw paymentUnavailable();
};

/**
 * Retrieve payment status for an order.
 */
const getPaymentByOrder = async (orderIdParam, user) => {
  const orderId = parseInt(orderIdParam, 10);

  const { rows } = await db.query(
    `SELECT p.id, p.order_id, p.method, p.gateway_ref, p.status, p.verified_at, p.created_at,
            o.parent_id, o.total, o.order_status
     FROM payments p
     JOIN orders o ON o.id = p.order_id
     WHERE p.order_id = $1 AND o.daycare_id=$2`,
    [orderId,user.daycare_id]
  );

  if (rows.length === 0) {
    const err = new Error('Payment record not found for this order');
    err.statusCode = 404;
    throw err;
  }

  const record = rows[0];

  if (user.role === 'parent' && record.parent_id !== user.id) {
    const err = new Error('Forbidden: You do not own this order');
    err.statusCode = 403;
    throw err;
  }

  return record;
};

module.exports = {
  capabilities,
  simulatePayment,
  initiatePayment,
  handleWebhook,
  getPaymentByOrder,
};
