'use strict';
/**
 * src/modules/biometric/biometric.validator.js
 * Validation schemas for Biometric enrollment & guardian verification.
 * SRS Refs: FR-BIO-01–10
 */
const { Joi } = require('../../middleware/validator');

const enrollSchema = Joi.object({
  guardian_link_id: Joi.number().integer().required(),
  reference_data: Joi.string().allow('', null),
  slot_id: Joi.number().integer().min(1).max(300),
  device_id: Joi.string().allow('', null),
}).or('reference_data', 'slot_id');

const identifySchema = Joi.object({
  child_id: Joi.number().integer().required(),
  slot_id: Joi.number().integer().min(1).max(300).required(),
});

const verifySchema = Joi.object({
  child_id: Joi.number().integer().required(),
  guardian_user_id: Joi.number().integer().required(),
  method: Joi.string().valid('biometric', 'manual').required(),
  sample_data: Joi.string().allow(null, ''),
});

module.exports = {
  enrollSchema,
  identifySchema,
  verifySchema,
};
