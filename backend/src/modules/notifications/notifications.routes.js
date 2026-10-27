'use strict';
/**
 * src/modules/notifications/notifications.routes.js
 * Aggregated Notifications & Badges — all authenticated users
 */
const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const notificationsController = require('./notifications.controller');

router.get('/', auth, notificationsController.getNotifications);
router.get('/preferences', auth, async (req,res,next)=>{try{res.json(await require('./preferences').get(req.user));}catch(e){next(e);}});
router.patch('/preferences', auth, async (req,res,next)=>{try{res.json(await require('./preferences').save(req.user,req.body));}catch(e){next(e);}});

module.exports = router;
