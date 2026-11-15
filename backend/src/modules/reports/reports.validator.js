'use strict';
/**
 * src/modules/reports/reports.validator.js
 * Validation schemas for Daily Activity Reports.
 * SRS Refs: FR-DAR-01–08
 */
const { Joi } = require('../../middleware/validator');

const createReportSchema = Joi.object({
  child_id: Joi.number().integer().required(),
  caregiver_id: Joi.number().integer().positive().allow(null).optional(),
  report_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).default(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Addis_Ababa', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())),
  sleep_duration_min: Joi.number().integer().min(0).allow(null),
  sleep_notes: Joi.string().allow(null, ''),
  mood: Joi.string().valid('happy', 'calm', 'fussy', 'tired', 'excited').allow(null),
  behavior_notes: Joi.string().allow(null, ''),
  general_observations: Joi.string().allow(null, ''),
  meals: Joi.array().items(
    Joi.object({
      meal_type: Joi.string().valid('breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner').required(),
      description: Joi.string().required(),
      portion: Joi.string().valid('good', 'fair', 'poor', 'none').allow(null),
    })
  ).default([]),
  activities: Joi.array().items(
    Joi.object({
      activity_type: Joi.string().valid('learning', 'play').required(),
      description: Joi.string().required(),
      location: Joi.string().valid('indoor', 'outdoor', 'n_a').allow(null),
    })
  ).default([]),
});

module.exports = {
  createReportSchema,
};
