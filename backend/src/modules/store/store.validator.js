"use strict";
/**
 * src/modules/store/store.validator.js
 * Validation schemas for Products & E-Commerce Orders.
 * SRS Refs: FR-ECM-01–16
 */
const { Joi } = require("../../middleware/validator");

const createProductSchema = Joi.object({
  name: Joi.string().max(200).required(),
  description: Joi.string().allow(null, ""),
  price: Joi.number().min(0).precision(2).required(),
  category_id: Joi.number().integer().allow(null),
  stock_qty: Joi.number().integer().min(0).default(0),
  available: Joi.boolean().default(true),
  image_url: Joi.string().allow(null, ""),
});

const updateProductSchema = Joi.object({
  version: Joi.number().integer().positive().required(),
  name: Joi.string().max(200),
  description: Joi.string().allow(null, ""),
  price: Joi.number().min(0).precision(2),
  category_id: Joi.number().integer().allow(null),
  stock_qty: Joi.number().integer().min(0),
  available: Joi.boolean(),
  image_url: Joi.string().allow(null, ""),
}).min(1);

const crypto = require("crypto");

const placeOrderSchema = Joi.object({
  note: Joi.string().trim().max(2000).allow("").default(""),
  idempotency_key: Joi.string()
    .pattern(/^[A-Za-z0-9_-]{16,128}$/)
    .optional()
    .default(() => crypto.randomBytes(16).toString("hex")),
  items: Joi.array()
    .items(
      Joi.object({
        product_id: Joi.number().integer().required(),
        quantity: Joi.number().integer().min(1).required(),
      }),
    )
    .min(1)
    .required(),
});

const updateOrderStatusSchema = Joi.object({
  version: Joi.number().integer().positive().optional(),
  order_status: Joi.string().valid(
    "placed",
    "confirmed",
    "ready_for_pickup",
    "collected",
    "cancelled",
  ),
  payment_status: Joi.string().valid("unpaid", "pending", "paid", "failed"),
}).or("order_status", "payment_status");

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
