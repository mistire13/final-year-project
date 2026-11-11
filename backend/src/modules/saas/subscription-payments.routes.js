'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');
const auth = require('../../middleware/auth');
const { allowRoles } = require('../../middleware/rbac');
const db = require('../../config/db');
const { createPaymentService } = require('./subscription-payments.service');
const ocr = require('./subscription-payments.ocr');

const router = express.Router();
const service = createPaymentService(db.control || db);
const subscriptions = require('./subscriptions.service').createSubscriptions(db.control || db);
const limited = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });
const id = (req, res, next) => Joi.string().guid({ version: 'uuidv4' }).required().validate(req.params.id).error
  ? res.status(404).json({ error: 'Payment session not found.' }) : next();
const run = fn => async (req, res, next) => { try { res.json(await fn(req)); } catch (error) { next(error); } };
router.get('/payment-settings', limited, run(() => service.publicSettings()));
router.post('/payment-intents', limited, run(req => service.create(req.body)));
router.post('/payment-intents/:id/status', limited, id, run(req => service.status(req.params.id,req.body)));
router.post('/payment-intents/:id/verify', limited, id, run(req => service.verify(req.params.id,req.body)));
router.post('/payment-intents/:id/ocr', limited, id,
  express.raw({ type: ['image/png','image/jpeg'], limit:'3mb' }), run(async req => {
    await service.status(req.params.id,{token:req.get('x-payment-token')});
    return ocr.extract(req.body,req.get('content-type'));
  }));
router.post('/subscription/payment-intents', auth, allowRoles('admin'), run(req => service.createRenewal(req.user.daycare_id,req.user.id,req.body)));
router.post('/subscription/payment-intents/:id/resume', auth, allowRoles('admin'), id,
  run(req => service.resumeRenewal(req.user.daycare_id,req.params.id,req.body)));
router.post('/subscription/payment-intents/:id/apply', auth, allowRoles('admin'), id, run(async req => {
  const payment = await service.status(req.params.id,req.body);
  if (!['verified','consumed'].includes(payment.status)) throw Object.assign(new Error('Payment is not yet verified.'), { statusCode: 409 });
  return subscriptions.applyVerifiedRenewal(req.user.daycare_id,req.params.id,req.user.id);
}));
router.get('/super-admin/payment-intents', auth, allowRoles('super_admin'), run(req => service.list(req.query)));
router.get('/super-admin/subscription-payment-settings', auth, allowRoles('super_admin'), run(() => service.getSettings()));
router.patch('/super-admin/subscription-payment-settings', auth, allowRoles('super_admin'),
  run(req => service.updateSettings(req.body,req.user.id)));
router.post('/super-admin/payment-intents/:id/resolve', auth, allowRoles('super_admin'), id,
  run(req => service.resolve(req.params.id,req.body,req.user.id)));
router.post('/super-admin/payment-intents/:id/review', auth, allowRoles('super_admin'), id,
  run(req => service.review(req.params.id,req.body,req.user.id)));
router.post('/super-admin/daycares/:id/renewal-restart', auth, allowRoles('super_admin'),
  run(req => subscriptions.authorizeRenewalRestart(req.params.id,req.body,req.user.id)));
router.post('/super-admin/payment-intents/:id/apply', auth, allowRoles('super_admin'), id, run(async req => {
  const {error,value} = Joi.object({version:Joi.number().integer().min(1).required(),reason:Joi.string().trim().min(12).max(1000).required(),
    acknowledge_restart:Joi.boolean().valid(true).required()}).validate(req.body);
  if (error) throw Object.assign(new Error(error.details[0].message),{statusCode:422});
  const {rows} = await (db.control || db).query('SELECT daycare_id FROM subscription_payment_intents WHERE id=$1',[req.params.id]);
  if (!rows[0]?.daycare_id) throw Object.assign(new Error('Renewal payment not found.'),{statusCode:404});
  return subscriptions.applyVerifiedRenewal(rows[0].daycare_id,req.params.id,req.user.id,
    {expectedVersion:value.version,restartOverdue:true,reason:value.reason});
}));
router.post('/super-admin/payment-intents/:id/recover', auth, allowRoles('super_admin'), id,
  run(req => service.recover(req.params.id,req.body,req.user.id)));
module.exports = router;
