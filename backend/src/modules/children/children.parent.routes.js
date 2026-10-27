'use strict';
/**
 * Parent Routes — parent-safe child profile management
 * SRS Refs: FR-CH-02, FR-CH-03, FR-UAM-05
 * All routes require auth + role=parent (enforced by allowRoles).
 */
const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const { allowRoles } = require('../../middleware/rbac');
const parentService = require('./children.parent.service');

const parentOnly = [auth, allowRoles('parent')];
const profileSave = require('./children.profile-save');
router.get('/children/:id/care-profile', ...parentOnly, profileSave.get);
router.patch('/children/:id/care-profile', ...parentOnly, profileSave.save);

// List this parent's linked children
router.get('/children', ...parentOnly, parentService.listMyChildren);

// Get full profile for one linked child (care + contacts)
router.get('/children/:id', ...parentOnly, parentService.getMyChild);

// Older replacement endpoints cannot silently overwrite an editor's state.
const atomicRequired=(req,res)=>res.status(428).json({error:'Use the versioned care-profile endpoint to save this profile atomically.'});
router.put('/children/:id/profile', ...parentOnly, atomicRequired);
router.put('/children/:id/care', ...parentOnly, atomicRequired);
router.put('/children/:id/emergency-contacts', ...parentOnly, atomicRequired);
router.patch('/profile-complete', ...parentOnly, atomicRequired);

module.exports = router;
