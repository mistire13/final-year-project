'use strict';
/**
 * Children Routes — §8.3
 * SRS Refs: FR-CH-01–07, UC-03, UC-04
 */
const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const { allowRoles } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validator');
const { contactSchema, instructionSchema, createChildSchema, updateChildSchema, addGuardianSchema, enrollFamilySchema } = require('./children.validator');
const childrenController = require('./children.controller');
const pickupGuardians = require('./pickup-guardians.service');
const { Joi } = require('../../middleware/validator');
const pickupRequest = Joi.object({name:Joi.string().trim().min(2).max(150).required(),relationship:Joi.string().trim().min(2).max(80).required(),phone:Joi.string().trim().pattern(/^[+0-9() -]{7,30}$/).required(),email:Joi.string().trim().email({tlds:{allow:false}}).max(254).allow('',null),request_key:Joi.string().trim().min(16).max(128).required()});
const pickupReview = Joi.object({decision:Joi.string().valid('approved','rejected','revoked').required(),version:Joi.number().integer().positive().required(),review_note:Joi.string().trim().min(12).max(1000).required()});
const pickupAction = action => async (req,res,next) => {try {res.json(await action(req));} catch(error) {next(error);}};

router.get('/', auth, allowRoles('admin', 'caregiver'), childrenController.listChildren);
router.post('/', auth, allowRoles('admin'), validate(createChildSchema), childrenController.createChild);
router.post('/enroll-family', auth, allowRoles('admin'), validate(enrollFamilySchema), childrenController.enrollFamily);
router.post('/assign-caregiver', auth, allowRoles('admin'), childrenController.assignCaregiver);
router.get('/:id', auth, allowRoles('admin', 'caregiver', 'parent'), childrenController.getChild);
router.patch('/:id', auth, allowRoles('admin'), validate(updateChildSchema), childrenController.updateChild);
router.post('/:id/guardians', auth, allowRoles('admin'), validate(addGuardianSchema), childrenController.addGuardian);
router.get('/:id/guardians', auth, allowRoles('admin', 'parent'), childrenController.getGuardians);
router.delete('/:id/guardians/:gid', auth, allowRoles('admin'), childrenController.removeGuardian);
router.get('/:id/pickup-guardians', auth, allowRoles('admin','parent'), pickupAction(req=>pickupGuardians.list(req.params.id,req.user)));
router.post('/:id/pickup-guardians', auth, allowRoles('admin','parent'), validate(pickupRequest), pickupAction(req=>pickupGuardians.request(req.params.id,req.body,req.user)));
router.patch('/:id/pickup-guardians/:requestId', auth, allowRoles('admin'), validate(pickupReview), pickupAction(req=>pickupGuardians.review(req.params.id,req.params.requestId,req.body,req.user)));

// Emergency Contacts CRUD
router.post('/:id/contacts', auth, allowRoles('admin'), validate(contactSchema), childrenController.addContact);
router.patch('/contacts/:cid', auth, allowRoles('admin'), validate(contactSchema), childrenController.updateContact);
router.delete('/contacts/:cid', auth, allowRoles('admin'), childrenController.deleteContact);

// Care Instructions CRUD
router.post('/:id/instructions', auth, allowRoles('admin'), validate(instructionSchema), childrenController.addInstruction);
router.patch('/instructions/:iid', auth, allowRoles('admin'), validate(instructionSchema), childrenController.updateInstruction);
router.delete('/instructions/:iid', auth, allowRoles('admin'), childrenController.deleteInstruction);

module.exports = router;
