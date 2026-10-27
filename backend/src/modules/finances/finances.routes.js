'use strict';

/**
 * src/modules/finances/finances.routes.js
 * Express routing for daycare child care fee invoicing, receipts, and parent billing.
 *
 * SRS Refs: FR-ECM-01–16
 */

const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const { allowRoles } = require('../../middleware/rbac');
const financesController = require('./finances.controller');

// Daycare Admin: Overview statistics & KPIs
router.get(
  '/overview',
  auth,
  allowRoles('admin'),
  financesController.getOverview
);

// Daycare Admin: List invoices with status/child/period filters
router.get(
  '/invoices',
  auth,
  allowRoles('admin'),
  financesController.listInvoices
);

// Daycare Admin: Get single invoice with full payment breakdown
router.get(
  '/invoices/:id',
  auth,
  allowRoles('admin'),
  financesController.getInvoice
);

// Daycare Admin: Create one-off custom invoice
router.post(
  '/invoices',
  auth,
  allowRoles('admin'),
  financesController.createInvoice
);

// Daycare Admin: Batch auto-generate monthly care fee invoices
router.post(
  '/invoices/generate-monthly',
  auth,
  allowRoles('admin'),
  financesController.generateMonthlyInvoices
);

// Daycare Admin: Record payment & issue digital receipt
router.post(
  '/invoices/:id/payments',
  auth,
  allowRoles('admin'),
  financesController.recordPayment
);

// Parent: View linked children invoices, balances, and digital receipts
router.get(
  '/parent/my-bills',
  auth,
  allowRoles('parent'),
  financesController.getParentBills
);

module.exports = router;
