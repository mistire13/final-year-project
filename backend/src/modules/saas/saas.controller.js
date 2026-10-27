'use strict';
/**
 * src/modules/saas/saas.controller.js
 * Controller handling public daycare registration and Super Admin platform management.
 *
 * SRS Refs: FR-UAM-09, FR-UAM-10, FR-UAM-11
 */

const saasService = require('./saas.service');

// Public: Daycare self-registration
const registerDaycare = async (req, res, next) => {
  try {
    const result = await saasService.registerDaycare(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

// Super Admin: Get platform statistics
const getStats = async (req, res, next) => {
  try {
    const stats = await saasService.getPlatformStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
};

// Super Admin: List all daycares
const listDaycares = async (req, res, next) => {
  try {
    const daycares = await saasService.listDaycares(req.query);
    res.json(daycares);
  } catch (err) {
    next(err);
  }
};

// Super Admin: Get single daycare
const getDaycare = async (req, res, next) => {
  try {
    const daycare = await saasService.getDaycareById(req.params.id);
    res.json(daycare);
  } catch (err) {
    next(err);
  }
};

// Super Admin: Approve daycare & activate 30-day trial
const approveDaycare = async (req, res, next) => {
  try {
    const daycare = await saasService.approveDaycare(
      req.params.id,
      req.body,
      req.user.id
    );
    res.json({ message: 'Daycare approved and activated successfully.', daycare });
  } catch (err) {
    next(err);
  }
};

// Super Admin: Reject daycare
const rejectDaycare = async (req, res, next) => {
  try {
    const daycare = await saasService.rejectDaycare(
      req.params.id,
      req.body.reason,
      req.user.id
    );
    res.json({ message: 'Daycare application rejected.', daycare });
  } catch (err) {
    next(err);
  }
};

// Super Admin: Suspend daycare
const suspendDaycare = async (req, res, next) => {
  try {
    const daycare = await saasService.suspendDaycare(req.params.id, req.user.id);
    res.json({ message: 'Daycare suspended.', daycare });
  } catch (err) {
    next(err);
  }
};

// Super Admin: Reactivate daycare
const activateDaycare = async (req, res, next) => {
  try {
    const daycare = await saasService.activateDaycare(req.params.id, req.user.id);
    res.json({ message: 'Daycare activated.', daycare });
  } catch (err) {
    next(err);
  }
};

// Super Admin: List all platform users across daycares
const listUsers = async (req, res, next) => {
  try {
    const users = await saasService.listUsers(req.query);
    res.json(users);
  } catch (err) {
    next(err);
  }
};

// Super Admin: List platform audit logs
const listAuditLogs = async (req, res, next) => {
  try {
    const logs = await saasService.listAuditLogs(req.query);
    res.json(logs);
  } catch (err) {
    next(err);
  }
};

// Super Admin: System health diagnostics
const getSystemHealth = async (req, res, next) => {
  try {
    const health = await saasService.getSystemHealth();
    res.json(health);
  } catch (err) {
    next(err);
  }
};

// Super Admin: Impersonate / Jump into daycare workspace directly
const impersonateDaycare = async (req, res, next) => {
  try {
    const session = await saasService.impersonateDaycare(req.params.id, req.user);
    res.json(session);
  } catch (err) {
    next(err);
  }
};

// Public/Daycare: Get active global broadcast banner
const getBroadcast = async (req, res, next) => {
  try {
    const broadcast = saasService.getBroadcast();
    res.json(broadcast);
  } catch (err) {
    next(err);
  }
};

// Super Admin: Set global platform broadcast banner
const setBroadcast = async (req, res, next) => {
  try {
    const broadcast = saasService.setBroadcast(req.body, req.user.id);
    res.json(broadcast);
  } catch (err) {
    next(err);
  }
};

// Super Admin: List daycare applications
const listApplications = async (req, res, next) => {
  try {
    const applications = await saasService.listApplications(req.query);
    res.json(applications);
  } catch (err) {
    next(err);
  }
};

// Super Admin: Get single application
const getApplication = async (req, res, next) => {
  try {
    const application = await saasService.getApplicationById(req.params.id);
    res.json(application);
  } catch (err) {
    next(err);
  }
};

// Super Admin: Approve application
const approveApplication = async (req, res, next) => {
  try {
    const result = await saasService.approveApplication(
      req.params.id,
      req.body,
      req.user.id
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// Super Admin: Reject application
const rejectApplication = async (req, res, next) => {
  try {
    const application = await saasService.rejectApplication(
      req.params.id,
      req.body.reason,
      req.user.id
    );
    res.json({ message: 'Daycare application rejected.', application });
  } catch (err) {
    next(err);
  }
};

// Super Admin: Purge rejected application
const purgeApplication = async (req, res, next) => {
  try {
    const result = await saasService.purgeApplication(req.params.id, req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  registerDaycare,
  getStats,
  listDaycares,
  getDaycare,
  approveDaycare,
  rejectDaycare,
  suspendDaycare,
  activateDaycare,

  listApplications,
  getApplication,
  approveApplication,
  rejectApplication,
  purgeApplication,

  impersonateDaycare,
  getBroadcast,
  setBroadcast,
  listUsers,
  listAuditLogs,
  getSystemHealth,
};
