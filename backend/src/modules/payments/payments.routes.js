'use strict';
/**
 * src/modules/payments/payments.routes.js
 * Payments Routes — §8.11 | SRS: FR-ECM-07–10, SI-04–05
 */
const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const { allowRoles } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validator');
const { initiatePaymentSchema } = require('./payments.validator');
const c = require('./payments.controller');
const Joi = require('joi');
const svc = require('./payments.service');

router.get('/capabilities', auth, allowRoles('parent'), (req,res)=>res.json(svc.capabilities()));
router.post('/demo', auth, allowRoles('parent'), validate(Joi.object({order_id:Joi.number().integer().positive().required()})), async (req,res,next)=>{
  try { res.json(await svc.simulatePayment(req.body,req.user)); } catch(error) { next(error); }
});

router.post('/initiate', auth, allowRoles('parent'), validate(initiatePaymentSchema), c.initiatePayment);
// Reserved callback URL. The service rejects every callback while payments are deferred.
router.post('/webhook', c.handleWebhook);
router.get('/order/:id', auth, allowRoles('admin', 'parent'), c.getPaymentByOrder);

module.exports = router;
