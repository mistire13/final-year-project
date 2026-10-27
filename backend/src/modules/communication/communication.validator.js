'use strict';
/**
 * src/modules/communication/communication.validator.js
 * Validation schemas for Announcements, Direct Messages, and Urgent Alerts.
 * SRS Refs: FR-COM-01–08
 */
const { Joi } = require('../../middleware/validator');

const createAnnouncementSchema = Joi.object({
  request_key:Joi.string().min(16).max(128),
  title: Joi.string().max(200).required(),
  body: Joi.string().required(),
  announcement_type: Joi.string().valid('general', 'alert', 'meal_plan').default('general'),
  audience: Joi.string().valid('all', 'parents', 'caregivers', 'staff', 'group', 'individual').default('all'),
  target_group_id: Joi.number().integer().allow(null),
  expires_at: Joi.date().iso().allow(null),
});

const sendMessageSchema = Joi.object({
  recipient_id: Joi.number().integer().required(),
  subject: Joi.string().max(200).allow(null, ''),
  body: Joi.string().required(),
});

const createAlertSchema = Joi.object({
  title: Joi.string().max(200).required(),
  urgency: Joi.string().valid('normal', 'high').default('normal'),
  recipient_scope: Joi.string().valid('all', 'parents', 'caregivers', 'staff', 'individual').default('all'),
  target_user_id: Joi.number().integer().allow(null),
});


module.exports = {
  createAnnouncementSchema,
  sendMessageSchema,
  createAlertSchema,
};
