'use strict';
const { Joi } = require('../../middleware/validator');

const createUserSchema = Joi.object({
  name:     Joi.string().trim().max(150).required(),
  email:    Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(255).required(),
  password: Joi.string().min(8).max(128).required(),
  role:     Joi.string().valid('caregiver', 'parent').required(),
  phone:    Joi.string().trim().max(50).allow('', null),
  title:    Joi.string().trim().max(100).allow('', null),
  qualifications: Joi.string().trim().max(1000).allow('', null),
  emergency_contact: Joi.string().trim().max(255).allow('', null),
  shift:    Joi.string().trim().max(100).allow('', null),
});

const updateUserSchema = Joi.object({
  name:  Joi.string().trim().max(150),
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(255),
  phone: Joi.string().trim().max(50).allow('', null),
  title: Joi.string().trim().max(100).allow('', null),
  qualifications: Joi.string().trim().max(1000).allow('', null),
  emergency_contact: Joi.string().trim().max(255).allow('', null),
  shift: Joi.string().trim().max(100).allow('', null),
}).min(1);

const updateStatusSchema = Joi.object({
  status: Joi.string().valid('active', 'inactive').required(),
});

const updateMyProfileSchema = Joi.object({
  name:  Joi.string().trim().max(150),
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(255),
  phone: Joi.string().trim().max(50).allow('', null),
}).min(1);

module.exports = { createUserSchema, updateUserSchema, updateStatusSchema, updateMyProfileSchema };
