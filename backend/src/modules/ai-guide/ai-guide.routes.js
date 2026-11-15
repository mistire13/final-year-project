'use strict';
/**
 * src/modules/ai-guide/ai-guide.routes.js
 * AI Guide Routes — §8.8 | SRS: FR-AI-01–10
 */
const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const { allowRoles } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validator');
const { aiGuideSchema } = require('./ai-guide.validator');
const c = require('./ai-guide.controller');

// Only parents can access the AI Parent Guide (§8.8)
router.post('/guide', auth, allowRoles('parent'), validate(aiGuideSchema), c.getGuidance);
router.get('/history', auth, allowRoles('parent'), c.getHistory);

module.exports = router;
