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

router.get('/', auth, allowRoles('admin', 'caregiver'), childrenController.listChildren);
router.post('/', auth, allowRoles('admin'), validate(createChildSchema), childrenController.createChild);
router.post('/enroll-family', auth, allowRoles('admin'), validate(enrollFamilySchema), childrenController.enrollFamily);
router.post('/assign-caregiver', auth, allowRoles('admin'), childrenController.assignCaregiver);
router.get('/:id', auth, allowRoles('admin', 'caregiver', 'parent'), childrenController.getChild);
router.patch('/:id', auth, allowRoles('admin'), validate(updateChildSchema), childrenController.updateChild);
router.post('/:id/guardians', auth, allowRoles('admin'), validate(addGuardianSchema), childrenController.addGuardian);
router.get('/:id/guardians', auth, allowRoles('admin', 'parent'), childrenController.getGuardians);
router.delete('/:id/guardians/:gid', auth, allowRoles('admin'), childrenController.removeGuardian);

// Emergency Contacts CRUD
router.post('/:id/contacts', auth, allowRoles('admin'), validate(contactSchema), childrenController.addContact);
router.patch('/contacts/:cid', auth, allowRoles('admin'), validate(contactSchema), childrenController.updateContact);
router.delete('/contacts/:cid', auth, allowRoles('admin'), childrenController.deleteContact);

// Care Instructions CRUD
router.post('/:id/instructions', auth, allowRoles('admin'), validate(instructionSchema), childrenController.addInstruction);
router.patch('/instructions/:iid', auth, allowRoles('admin'), validate(instructionSchema), childrenController.updateInstruction);
router.delete('/instructions/:iid', auth, allowRoles('admin'), childrenController.deleteInstruction);

module.exports = router;
