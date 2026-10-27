"use strict";
/**
 * src/modules/events/events.routes.js
 * Events Routes — §8.12 | SRS: FR-EVT-01–07
 */
const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const { allowRoles } = require("../../middleware/rbac");
const { validate } = require("../../middleware/validator");
const {
  createEventSchema,
  updateEventSchema,
  cancelEventSchema,
} = require("./events.validator");
const c = require("./events.controller");

router.get("/", auth, c.listEvents);
router.post(
  "/",
  auth,
  allowRoles("admin"),
  validate(createEventSchema),
  c.createEvent,
);
router.patch(
  "/:id",
  auth,
  allowRoles("admin"),
  validate(updateEventSchema),
  c.updateEvent,
);
router.delete(
  "/:id",
  auth,
  allowRoles("admin"),
  validate(cancelEventSchema),
  c.cancelEvent,
);

module.exports = router;
