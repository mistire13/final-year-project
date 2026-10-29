"use strict";
const db = require("../../config/db");
const Joi = require("joi");
const schema = Joi.object({
  notifications: Joi.object({
    activity: Joi.boolean(),
    messages: Joi.boolean(),
    announcements: Joi.boolean(),
  }).min(1),
  reminder: Joi.object({
    event_id: Joi.number().integer().positive().required(),
    enabled: Joi.boolean().required(),
  }),
  read_alert_id: Joi.number().integer().positive(),
  read_announcement_id: Joi.number().integer().positive(),
  food: Joi.object({
    cuisine: Joi.string().max(300).allow(""),
    diet: Joi.string().max(1000).allow(""),
    ai_consent: Joi.boolean(),
  }).min(1),
})
  .min(1)
  .unknown(false);
async function get(user) {
  const {
    rows: [row],
  } = await db.query(
    "SELECT ui_preferences FROM users WHERE id=$1 AND daycare_id=$2",
    [user.id, user.daycare_id],
  );
  if (!row)
    throw Object.assign(new Error("Account unavailable"), { statusCode: 403 });
  return row.ui_preferences;
}
async function save(user, input) {
  const { value, error } = schema.validate(input);
  if (error)
    throw Object.assign(new Error("Invalid preference update"), {
      statusCode: 422,
    });
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const {
      rows: [row],
    } = await client.query(
      "SELECT ui_preferences FROM users WHERE id=$1 AND daycare_id=$2 FOR UPDATE",
      [user.id, user.daycare_id],
    );
    if (!row)
      throw Object.assign(new Error("Account unavailable"), {
        statusCode: 403,
      });
    const prefs = row.ui_preferences;
    if (value.notifications)
      prefs.notifications = { ...prefs.notifications, ...value.notifications };
    if (value.food) prefs.food = { ...prefs.food, ...value.food };
    if (value.reminder) {
      const event = (
        await client.query(
          "SELECT id FROM events WHERE id=$1 AND daycare_id=$2 AND NOT cancelled",
          [value.reminder.event_id, user.daycare_id],
        )
      ).rows[0];
      if (!event)
        throw Object.assign(new Error("Event unavailable"), {
          statusCode: 404,
        });
      prefs.reminders = [
        ...new Set([
          ...(prefs.reminders || []).filter((id) => id !== event.id),
          ...(value.reminder.enabled ? [event.id] : []),
        ]),
      ];
    }
    if (value.read_alert_id) {
      const { data } =
        await require("../communication/communication.service").listAlerts(
          user,
        );
      if (!data.some((a) => a.id === value.read_alert_id))
        throw Object.assign(new Error("Alert unavailable"), {
          statusCode: 404,
        });
      prefs.read_alert_ids = [
        ...new Set([...(prefs.read_alert_ids || []), value.read_alert_id]),
      ].slice(-500);
    }
    if (value.read_announcement_id) {
      const { data } =
        await require("../communication/communication.service").listAnnouncements(
          {},
          user,
        );
      if (!data.some((a) => a.id === value.read_announcement_id))
        throw Object.assign(new Error("Announcement unavailable"), {
          statusCode: 404,
        });
      prefs.read_announcement_ids = [
        ...new Set([...(prefs.read_announcement_ids || []), value.read_announcement_id]),
      ].slice(-500);
    }
    await client.query(
      "UPDATE users SET ui_preferences=$1::jsonb WHERE id=$2 AND daycare_id=$3",
      [JSON.stringify(prefs), user.id, user.daycare_id],
    );
    await client.query("COMMIT");
    return prefs;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
module.exports = { get, save };
