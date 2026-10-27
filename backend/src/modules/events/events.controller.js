"use strict";
/**
 * src/modules/events/events.controller.js
 * Controller for Events Calendar.
 */
const svc = require("./events.service");

const listEvents = async (req, res, next) => {
  try {
    const result = await svc.listEvents(req.query, req.user);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

const createEvent = async (req, res, next) => {
  try {
    const result = await svc.createEvent(req.body, req.user);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
};

const updateEvent = async (req, res, next) => {
  try {
    const result = await svc.updateEvent(req.params.id, req.body, req.user);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

const cancelEvent = async (req, res, next) => {
  try {
    const result = await svc.cancelEvent(req.params.id, req.user, req.body);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listEvents,
  createEvent,
  updateEvent,
  cancelEvent,
};
