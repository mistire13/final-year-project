'use strict';
/**
 * src/modules/saas/saas.routes.js
 * SaaS public registration and Super Admin governance routes.
 *
 * SRS Refs: FR-UAM-09, FR-UAM-10, FR-UAM-11
 */

const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const { allowRoles } = require('../../middleware/rbac');
const saasController = require('./saas.controller');

// ─── 1. Public Self-Registration ──────────────────────────────────────────
router.post('/register-daycare', saasController.registerDaycare);

// ─── 2. Super Admin Management Endpoints ──────────────────────────────────
router.get(
  '/super-admin/stats',
  auth,
  allowRoles('super_admin'),
  saasController.getStats
);

router.get(
  '/super-admin/daycares',
  auth,
  allowRoles('super_admin'),
  saasController.listDaycares
);

router.get(
  '/super-admin/daycares/:id',
  auth,
  allowRoles('super_admin'),
  saasController.getDaycare
);

router.patch(
  '/super-admin/daycares/:id/approve',
  auth,
  allowRoles('super_admin'),
  saasController.approveDaycare
);

router.patch(
  '/super-admin/daycares/:id/reject',
  auth,
  allowRoles('super_admin'),
  saasController.rejectDaycare
);

router.patch(
  '/super-admin/daycares/:id/suspend',
  auth,
  allowRoles('super_admin'),
  saasController.suspendDaycare
);

router.patch(
  '/super-admin/daycares/:id/activate',
  auth,
  allowRoles('super_admin'),
  saasController.activateDaycare
);

router.patch(
  '/super-admin/daycares/:id/plan',
  auth,
  allowRoles('super_admin'),
  saasController.updatePlan
);

router.get(
  '/super-admin/users',
  auth,
  allowRoles('super_admin'),
  saasController.listUsers
);

router.get(
  '/super-admin/audit-logs',
  auth,
  allowRoles('super_admin'),
  saasController.listAuditLogs
);

router.get(
  '/super-admin/system-health',
  auth,
  allowRoles('super_admin'),
  saasController.getSystemHealth
);

router.post(
  '/super-admin/daycares/:id/impersonate',
  auth,
  allowRoles('super_admin'),
  saasController.impersonateDaycare
);

router.get('/broadcast', saasController.getBroadcast);

router.post(
  '/super-admin/broadcast',
  auth,
  allowRoles('super_admin'),
  saasController.setBroadcast
);

module.exports = router;
