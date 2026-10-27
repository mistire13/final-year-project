'use strict';
/**
 * src/modules/children/children.validator.js
 * Validation schemas for child profile registration, updates, and guardian linking.
 * SRS Refs: FR-CH-01, FR-CH-02, FR-CH-03, FR-CH-04
 */
const { Joi } = require('../../middleware/validator');

const createChildSchema = Joi.object({
  full_name: Joi.string().max(150).required(),
  dob: Joi.date().iso().max('now').raw().required(),
  gender: Joi.string().valid('male', 'female', 'other'),
  group_id: Joi.number().integer().allow(null),
  caregiver_id: Joi.number().integer().allow(null),
  monthly_care_fee: Joi.number().precision(2).positive().allow(null).optional(),
  enrollment_status: Joi.string().valid('active', 'inactive', 'waitlist').default('active'),
  emergency_contacts: Joi.array().items(
    Joi.object({
      name: Joi.string().max(150).required(),
      relationship: Joi.string().max(80).required(),
      phone: Joi.string().max(30).required(),
    })
  ),
  care_instructions: Joi.array().items(
    Joi.object({
      category: Joi.string().valid('allergy', 'dietary', 'medical_note', 'general').required(),
      instruction_text: Joi.string().required(),
    })
  ),
});

const updateChildSchema = Joi.object({
  version: Joi.number().integer().positive().required(),
  full_name: Joi.string().max(150),
  dob: Joi.date().iso().max('now').raw(),
  gender: Joi.string().valid('male', 'female', 'other'),
  group_id: Joi.number().integer().allow(null),
  caregiver_id: Joi.number().integer().allow(null),
  monthly_care_fee: Joi.number().precision(2).positive().allow(null).optional(),
  enrollment_status: Joi.string().valid('active', 'inactive', 'waitlist'),
  photo_url: Joi.string().max(255).allow(null, ''),
}).min(1);

const addGuardianSchema = Joi.object({
  user_id: Joi.number().integer().required(),
  relationship: Joi.string().max(80).required(),
  pickup_authorized: Joi.boolean().default(false),
});

const contactSchema = Joi.object({child_version:Joi.number().integer().positive().required(),name:Joi.string().trim().max(150).required(),relationship:Joi.string().trim().max(80).required(),phone:Joi.string().trim().max(30).pattern(/^[+0-9() -]{7,30}$/).required()});
const instructionSchema = Joi.object({child_version:Joi.number().integer().positive().required(),category:Joi.string().valid('allergy','dietary','medical_note','general').required(),instruction_text:Joi.string().trim().max(4000).required()});

const enrollFamilySchema = Joi.object({
  parent: Joi.object({
    id: Joi.number().integer().allow(null),
    name: Joi.string().trim().max(100).when('id', { is: Joi.exist(), then: Joi.optional(), otherwise: Joi.required() }),
    email: Joi.string().trim().email({tlds:{allow:false}}).lowercase().when('id', { is: Joi.exist(), then: Joi.optional(), otherwise: Joi.required() }),
    phone: Joi.string().trim().max(50).allow('', null),
    password: Joi.string().min(8).when('id', { is: Joi.exist(), then: Joi.optional(), otherwise: Joi.required() }),
    relationship: Joi.string().trim().max(80).default('Parent'),
  }).required(),
  child: Joi.object({
    full_name: Joi.string().trim().max(150).required(),
    dob: Joi.date().iso().max('now').raw().required(),
    gender: Joi.string().valid('male', 'female', 'other').allow(null, ''),
    group_id: Joi.number().integer().allow(null),
    new_group_name: Joi.string().trim().min(2).max(100),
    caregiver_id: Joi.number().integer().allow(null),
    photo_url: Joi.string().max(255).allow(null, ''),
    enrollment_status: Joi.string().valid('active', 'inactive', 'waitlist').default('active'),
  }).required(),
  emergency_contacts: Joi.array().items(
    Joi.object({
      name: Joi.string().trim().max(150).required(),
      relationship: Joi.string().trim().max(80).required(),
      phone: Joi.string().trim().max(30).required(),
    })
  ).default([]),
  care_instructions: Joi.array().items(
    Joi.object({
      category: Joi.string().valid('allergy', 'dietary', 'medical_note', 'general').required(),
      instruction_text: Joi.string().trim().required(),
    })
  ).default([]),
});

module.exports = {
  contactSchema,
  instructionSchema,
  createChildSchema,
  updateChildSchema,
  addGuardianSchema,
  enrollFamilySchema,
};

