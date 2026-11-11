'use strict';
/**
 * src/modules/store/store.routes.js
 * Store Routes — §8.10 | SRS: FR-ECM-01–16
 */
const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const { allowRoles } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validator');
const { requirePackageFeature } = require('../saas/package-features');
const db = require('../../config/db');
const requireShop = requirePackageFeature('shop', db);
const {
  createProductSchema,
  updateProductSchema,
  placeOrderSchema,
  updateOrderStatusSchema,
  categorySchema,
} = require('./store.validator');
const c = require('./store.controller');

router.get('/categories', auth, requireShop, c.listCategories);
router.post('/categories', auth, allowRoles('admin'), requireShop, validate(categorySchema), c.createCategory);
router.patch('/categories/:id', auth, allowRoles('admin'), requireShop, validate(categorySchema), c.updateCategory);
router.delete('/categories/:id', auth, allowRoles('admin'), requireShop, c.deleteCategory);

router.get('/products', auth, requireShop, c.listProducts);
router.post('/products', auth, allowRoles('admin'), requireShop, validate(createProductSchema), c.createProduct);
router.patch('/products/:id', auth, allowRoles('admin'), requireShop, validate(updateProductSchema), c.updateProduct);

router.get('/orders', auth, allowRoles('admin'), c.listAllOrders);
router.get('/orders/my', auth, allowRoles('parent'), c.listMyOrders);
router.post('/orders', auth, allowRoles('parent'), requireShop, validate(placeOrderSchema), c.placeOrder);
router.patch('/orders/:id/status', auth, allowRoles('admin'), validate(updateOrderStatusSchema), c.updateOrderStatus);
router.post('/orders/:id/refund', auth, allowRoles('admin'), async(req,res,next)=>{
  try{res.json(await require('./store-refunds.service').createRefundService(require('../../config/db')).record(req.params.id,req.user,req.body));}catch(error){next(error);}
});

module.exports = router;
