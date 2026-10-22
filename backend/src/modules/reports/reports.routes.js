'use strict';
/**
 * src/modules/reports/reports.routes.js
 * Reports Routes — §8.5 | SRS: FR-DAR-01–08, FR-RPT-01–06
 */
const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const { allowRoles } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validator');
const { createReportSchema } = require('./reports.validator');
const c = require('./reports.controller');

router.get('/daily', auth, allowRoles('admin'), c.listReports);
router.get('/daily/child/:id', auth, allowRoles('admin', 'caregiver', 'parent'), c.getChildReports);
router.post('/daily', auth, allowRoles('caregiver', 'admin'), validate(createReportSchema), c.createReport);
router.get('/daily/:id', auth, allowRoles('admin', 'caregiver', 'parent'), c.getReport);

module.exports = router;
