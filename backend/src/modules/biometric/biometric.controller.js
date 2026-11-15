'use strict';
/**
 * src/modules/biometric/biometric.controller.js
 * Controller for Biometric Enrollment & Verification.
 */
const svc = require('./biometric.service');

const enroll = async (req, res, next) => {
  try {
    const result = await svc.enroll(req.body, req.user);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
};

const getSlots = async (req, res, next) => {
  try {
    const result = await svc.getAvailableSlots(req.user);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

const identify = async (req, res, next) => {
  try {
    const result = await svc.identifyGuardianBySlot(req.body.child_id, req.body.slot_id, req.user);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

const verify = async (req, res, next) => {
  try {
    const result = await svc.verify(req.body, req.user);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

const getGuardianBiometric = async (req, res, next) => {
  try {
    const result = await svc.getGuardianBiometric(req.params.id, req.user);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

module.exports = {
  enroll,
  getSlots,
  identify,
  verify,
  getGuardianBiometric,
};
