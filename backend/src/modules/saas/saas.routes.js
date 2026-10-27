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
const configuredDb = require('../../config/db');
const subscriptions = require('./subscriptions.service').createSubscriptions(configuredDb.control || configuredDb);
const limited = require('express-rate-limit')({windowMs:15*60*1000,max:20,standardHeaders:true,legacyHeaders:false});
const run = fn => async (req,res,next) => { try {res.json(await fn(req));} catch(e){next(e);} };
const owner = [auth,allowRoles('super_admin')];
const admin = [auth,allowRoles('admin')];
router.get('/packages',run(()=>subscriptions.catalog()));
router.post('/application-status',limited,run(req=>subscriptions.applicationStatus(req.body)));
router.get('/super-admin/packages',...owner,run(()=>subscriptions.catalog(true)));
router.patch('/super-admin/packages/:code',...owner,run(req=>subscriptions.updatePackage(req.params.code,req.body,req.user.id)));
router.get('/super-admin/daycares/:id/subscription',...owner,run(req=>subscriptions.summary(req.params.id)));
router.post('/super-admin/daycares/:id/subscription',...owner,run(req=>subscriptions.action(req.params.id,req.body,req.user.id)));
router.get('/subscription',...admin,run(req=>subscriptions.summary(req.user.daycare_id)));

// ─── 1. Public Self-Registration ──────────────────────────────────────────
router.post(['/register-daycare', '/applications'], limited, saasController.registerDaycare);

// ─── 2. Super Admin Application Management ────────────────────────────────
router.get(
  '/super-admin/applications',
  auth,
  allowRoles('super_admin'),
  saasController.listApplications
);

router.get(
  '/super-admin/applications/:id',
  auth,
  allowRoles('super_admin'),
  saasController.getApplication
);

router.patch(
  '/super-admin/applications/:id/approve',
  auth,
  allowRoles('super_admin'),
  saasController.approveApplication
);

router.patch(
  '/super-admin/applications/:id/reject',
  auth,
  allowRoles('super_admin'),
  saasController.rejectApplication
);

router.delete(
  '/super-admin/applications/:id',
  auth,
  allowRoles('super_admin'),
  saasController.purgeApplication
);

// ─── 3. Super Admin Daycare Management Endpoints ──────────────────────────
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
  (req,res)=>res.status(409).json({error:'Use the subscription workbench to record a reason and preserve accepted terms.'})
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
