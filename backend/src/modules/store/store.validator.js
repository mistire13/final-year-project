'use strict';
/**
 * src/modules/store/store.validator.js
 * Validation schemas for Products & E-Commerce Orders.
 * SRS Refs: FR-ECM-01–16
 */
const { Joi } = require('../../middleware/validator');

const createProductSchema = Joi.object({
  name: Joi.string().max(200).required(),
  description: Joi.string().allow(null, ''),
  price: Joi.number().min(0).precision(2).required(),
  category_id: Joi.number().integer().allow(null),
  stock_qty: Joi.number().integer().min(0).default(0),
  available: Joi.boolean().default(true),
  image_url: Joi.string().allow(null, ''),
});

const updateProductSchema = Joi.object({
  name: Joi.string().max(200),
  description: Joi.string().allow(null, ''),
  price: Joi.number().min(0).precision(2),
  category_id: Joi.number().integer().allow(null),
  stock_qty: Joi.number().integer().min(0),
  available: Joi.boolean(),
  image_url: Joi.string().allow(null, ''),
}).min(1);

const placeOrderSchema = Joi.object({
  items: Joi.array().items(
    Joi.object({
      product_id: Joi.number().integer().required(),
      quantity: Joi.number().integer().min(1).required(),
    })
  ).min(1).required(),
});

const updateOrderStatusSchema = Joi.object({
  order_status: Joi.string().valid('placed', 'confirmed', 'ready_for_pickup', 'collected', 'cancelled'),
  payment_status: Joi.string().valid('unpaid', 'pending', 'paid', 'failed'),
}).min(1);

const categorySchema = Joi.object({
  name: Joi.string().max(50).trim().required(),
});

module.exports = {
  createProductSchema,
  updateProductSchema,
  placeOrderSchema,
  updateOrderStatusSchema,
  categorySchema,
};
