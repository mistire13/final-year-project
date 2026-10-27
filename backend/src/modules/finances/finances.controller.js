'use strict';

/**
 * src/modules/finances/finances.controller.js
 * Controller handling child care fee invoicing, payment receipts, and parent billing.
 *
 * SRS Refs: FR-ECM-01–16, Daycare Child Care Fee Management
 */

const financesService = require('./finances.service');

// Daycare Admin: Overview statistics
const getOverview = async (req, res, next) => {
  try {
    const daycareId = req.user.daycare_id;
    const overview = await financesService.getOverview(daycareId);
    res.json(overview);
  } catch (err) {
    next(err);
  }
};

// Daycare Admin: List invoices
const listInvoices = async (req, res, next) => {
  try {
    const daycareId = req.user.daycare_id;
    const invoices = await financesService.listInvoices(daycareId, req.query);
    res.json(invoices);
  } catch (err) {
    next(err);
  }
};

// Daycare Admin: Get single invoice with payment breakdown
const getInvoice = async (req, res, next) => {
  try {
    const daycareId = req.user.daycare_id;
    const invoice = await financesService.getInvoiceById(daycareId, req.params.id);
    res.json(invoice);
  } catch (err) {
    next(err);
  }
};

// Daycare Admin: Create one-off invoice
const createInvoice = async (req, res, next) => {
  try {
    const daycareId = req.user.daycare_id;
    const invoice = await financesService.createInvoice(daycareId, req.body, req.user.id);
    res.status(201).json({ message: 'Invoice created successfully.', invoice });
  } catch (err) {
    next(err);
  }
};

// Daycare Admin: Batch generate monthly care fees
const generateMonthlyInvoices = async (req, res, next) => {
  try {
    const daycareId = req.user.daycare_id;
    const result = await financesService.generateMonthlyInvoices(daycareId, req.body, req.user.id);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

// Daycare Admin: Record payment & issue receipt
const recordPayment = async (req, res, next) => {
  try {
    const daycareId = req.user.daycare_id;
    const result = await financesService.recordPayment(daycareId, req.params.id, req.body, req.user.id);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

// Parent: View linked child bills & receipts
const getParentBills = async (req, res, next) => {
  try {
    const parentId = req.user.id;
    const daycareId = req.user.daycare_id;
    const bills = await financesService.listParentInvoices(parentId, daycareId);
    res.json(bills);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getOverview,
  listInvoices,
  getInvoice,
  createInvoice,
  generateMonthlyInvoices,
  recordPayment,
  getParentBills,
};
