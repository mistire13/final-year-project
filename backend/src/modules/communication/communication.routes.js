'use strict';
/**
 * src/modules/communication/communication.routes.js
 * Communication Routes — §8.7 | SRS: FR-COM-01–08
 */
const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const { allowRoles } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validator');
const {
  createAnnouncementSchema,
  sendMessageSchema,
  createAlertSchema,
} = require('./communication.validator');
const c = require('./communication.controller');

// Announcements
router.get('/announcements/meal-plan', auth, c.listMealPlans);
router.get('/announcements', auth, c.listAnnouncements);
router.get('/announcements/:id', auth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(422).json({ error: 'Invalid announcement' });
    // Use exactly the same expiry, tenant and group/audience policy as the feed.
    const { data } = await require('./communication.service').listAnnouncements({}, req.user);
    const item = data.find(row => row.id === id);
    if (!item) return res.status(404).json({ error: 'Announcement unavailable' });
    res.json(item);
  } catch (error) { next(error); }
});
router.post('/announcements', auth, allowRoles('admin'), validate(createAnnouncementSchema), c.createAnnouncement);

// Messages
router.get('/messages', auth, c.listMessages);
router.post('/messages', auth, validate(sendMessageSchema), c.sendMessage);
router.patch('/messages/:id/read', auth, c.markMessageRead);
router.get('/contacts', auth, c.listContacts);


// Alerts
router.get('/alerts', auth, c.listAlerts);
router.post('/alerts', auth, allowRoles('admin'), validate(createAlertSchema), c.createAlert);

module.exports = router;
