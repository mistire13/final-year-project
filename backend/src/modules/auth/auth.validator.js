'use strict';
/**
 * Auth Validators — Joi schemas for auth endpoints
 * SRS Refs: NFR-USA-03, NFR-SEC-04
 */
const { Joi } = require('../../middleware/validator');

const loginSchema = Joi.object({
  email:    Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(255).required()
              .messages({ 'string.email': 'Please enter a valid email address', 'any.required': 'Email is required' }),
  password: Joi.string().min(4).max(128).required()
              .messages({ 'string.min': 'Password must be at least 4 characters', 'any.required': 'Password is required' }),
});

const registerSchema = Joi.object({
  name:     Joi.string().trim().max(255).required()
              .messages({ 'string.empty': 'Please enter your full name', 'any.required': 'Please enter your full name' }),
  email:    Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(255).required()
              .messages({ 'string.email': 'Please enter a valid email address', 'any.required': 'Email is required' }),
  password: Joi.string().min(6).max(128).required()
              .messages({ 'string.min': 'Password must be at least 6 characters', 'any.required': 'Password is required' }),
  phone:    Joi.string().allow(null, '').optional(),
});

const recoveryEmail = Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(255).required();
const newPassword = Joi.string().min(12).max(72).required();
const forgotPasswordSchema = Joi.object({ email: recoveryEmail });
const resetPasswordSchema = Joi.object({ token: Joi.string().pattern(/^lr1\.[a-f0-9]{64}\.[a-f0-9]{64}$/).required(), new_password: newPassword });
const changePasswordSchema = Joi.object({ current_password: Joi.string().max(128).required(), new_password: newPassword });

module.exports = { loginSchema, registerSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema };

