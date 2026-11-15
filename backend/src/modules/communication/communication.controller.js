'use strict';
/**
 * src/modules/communication/communication.controller.js
 * Controller for Announcements, Messages, and Alerts.
 */
const svc = require('./communication.service');
const realtime = require('../realtime/hub');

// Announcements
const createAnnouncement = async (req, res, next) => {
  try {
    const result = await svc.createAnnouncement(req.body, req.user);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
};

const listAnnouncements = async (req, res, next) => {
  try {
    const result = await svc.listAnnouncements(req.query, req.user);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

// Messages
const sendMessage = async (req, res, next) => {
  try {
    const result = await svc.sendMessage(req.body, req.user);
    realtime.publishMessage(result);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
};

const listMessages = async (req, res, next) => {
  try {
    const result = await svc.listMessages(req.query, req.user);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

const markMessageRead = async (req, res, next) => {
  try {
    const result = await svc.markMessageRead(req.params.id, req.user);
    realtime.publishRead(result);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

// Alerts
const createAlert = async (req, res, next) => {
  try {
    const result = await svc.createAlert(req.body, req.user);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
};

const listAlerts = async (req, res, next) => {
  try {
    const result = await svc.listAlerts(req.user);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

const listMealPlans = async (req, res, next) => {
  try {
    const result = await svc.listMealPlans(req.query, req.user);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

const listContacts = async (req, res, next) => {
  try {
    const result = await svc.listContacts(req.user);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

module.exports = {
  createAnnouncement,
  listAnnouncements,
  listMealPlans,
  sendMessage,
  listMessages,
  markMessageRead,
  createAlert,
  listAlerts,
  listContacts,
};

