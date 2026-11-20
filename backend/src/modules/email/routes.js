'use strict';
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { Joi, validate } = require('../../middleware/validator');
const db = require('../../config/db');
const { mailer } = require('./transport');
const service = require('./auth-codes').createEmailAuth({ pool: db.control || db, enabled: !!mailer });
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(rateLimit({ windowMs: 15 * 60000, max: 30, standardHeaders: true, legacyHeaders: false,
  message: { message: 'Too many code requests or attempts. Try again later.' } }));
const action = fn => async (req, res, next) => { try { res.json(await fn(req.body)); } catch (error) { next(error); } };
router.get('/status', require('../../middleware/auth'), async (req, res, next) => {
  try {
    const user = (await (db.control || db).query('SELECT email,email_verified_at,ui_preferences FROM users WHERE id=$1', [req.user.id])).rows[0];
    res.json({ email: user.email, verified: !!user.email_verified_at, email_updates: user.ui_preferences?.notifications?.email !== false });
  } catch (error) { next(error); }
});
router.post('/request-code', validate(Joi.object({ email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(255).required(),
  purpose: Joi.string().valid('reset', 'verify').default('reset'), account_type: Joi.string().valid('daycare', 'platform').default('daycare') })), action(service.request));
router.post('/confirm-code', validate(Joi.object({ request_id: Joi.string().uuid().required(), code: Joi.string().pattern(/^\d{6}$/).required(),
  new_password: Joi.string().min(12).max(72) })), action(service.confirm));
module.exports = router;
