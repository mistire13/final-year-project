'use strict';
/**
 * src/modules/biometric/biometric.routes.js
 * Biometric Routes — §8.9 | SRS: FR-BIO-01–10
 */
const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const { allowRoles } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validator');
const { enrollSchema, identifySchema, verifySchema } = require('./biometric.validator');
const c = require('./biometric.controller');

router.get('/slots', auth, allowRoles('admin'), c.getSlots);
router.post('/identify', auth, allowRoles('admin', 'caregiver'), validate(identifySchema), c.identify);
router.post('/device-enroll', auth, allowRoles('admin'), validate(enrollSchema), c.enroll);

router.post('/enroll', auth, allowRoles('admin'), validate(enrollSchema), c.enroll);
router.post('/verify', auth, allowRoles('admin', 'caregiver'), validate(verifySchema), c.verify);
router.get('/guardian/:id', auth, allowRoles('admin'), c.getGuardianBiometric);

module.exports = router;
