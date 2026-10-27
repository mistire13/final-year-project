"use strict";
/**
 * src/modules/events/events.validator.js
 * Validation schemas for Events Calendar.
 * SRS Refs: FR-EVT-01–07
 */
const { Joi } = require("../../middleware/validator");

const createEventSchema = Joi.object({
  title: Joi.string().max(200).required(),
  event_date: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .required(),
  event_time: Joi.string()
    .pattern(/^\d{2}:\d{2}(:\d{2})?$/)
    .allow(null, ""),
  description: Joi.string().allow(null, ""),
  event_type: Joi.string()
    .valid(
      "holiday",
      "meeting",
      "activity_day",
      "special_program",
      "closing_date",
    )
    .required(),
});

const updateEventSchema = Joi.object({
  version: Joi.number().integer().positive().required(),
  title: Joi.string().max(200),
  event_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/),
  event_time: Joi.string()
    .pattern(/^\d{2}:\d{2}(:\d{2})?$/)
    .allow(null, ""),
  description: Joi.string().allow(null, ""),
  event_type: Joi.string().valid(
    "holiday",
    "meeting",
    "activity_day",
    "special_program",
    "closing_date",
  ),
}).min(1);

module.exports = {
  createEventSchema,
  updateEventSchema,
  cancelEventSchema: Joi.object({
    version: Joi.number().integer().positive().required(),
  }),
};
