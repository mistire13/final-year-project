"use strict";
/**
 * src/modules/events/events.service.js
 * Business logic for Events Calendar (soft-delete, partial index query).
 * SRS Refs: FR-EVT-01–07, FR-DB-02
 */
const db = require("../../config/db");
const { auditedWrite } = require('../../utils/auditedWrite');

/**
 * List upcoming non-cancelled events.
 * Uses idx_evt_active_future partial index.
 */
/**
 * List upcoming non-cancelled events.
 * Uses idx_evt_active_future partial index.
 */
const listEvents = async (query = {}, user) => {
  const typeFilter = query.type || null;
  const includePast = query.include_past === "true";
  const isSuper = user && user.role === "super_admin";
  const daycareId = user?.daycare_id || null;

  let sql = `
    SELECT e.id, e.title, e.event_date, e.event_time, e.description, e.event_type, e.cancelled, e.updated_at, e.daycare_id, e.version,
           u.name AS created_by_name
    FROM events e
    JOIN users u ON u.id = e.created_by
    WHERE e.cancelled = FALSE
  `;

  const params = [];
  if (!includePast) {
    sql += ` AND e.event_date >= CURRENT_DATE`;
  }
  if (typeFilter) {
    params.push(typeFilter);
    sql += ` AND e.event_type = $${params.length}`;
  }
  if (!isSuper) {
    params.push(daycareId);
    sql += ` AND (e.daycare_id = $${params.length})`;
  }

  sql += ` ORDER BY e.event_date ASC, e.event_time ASC NULLS LAST`;

  const { rows } = await db.query(sql, params);
  return { data: rows };
};

/**
 * Create a new event (Admin only).
 */
const createEvent = async (body, user) => {
  return auditedWrite(user,'EVENT_CREATED','events',async client=>{
  const daycareId =
    user.role === "super_admin" ? body.daycare_id || null : user.daycare_id;
  const { rows } = await client.query(
    `INSERT INTO events (created_by, title, event_date, event_time, description, event_type, daycare_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      user.id,
      body.title,
      body.event_date,
      body.event_time || null,
      body.description || null,
      body.event_type,
      daycareId,
    ],
  );
  return rows[0];
  });
};

/**
 * Update event details (Admin only).
 */
const updateEvent = async (eventIdParam, body, user) => {
  const eventId = parseInt(eventIdParam, 10);

  const { rows: existingRows } = await db.query(
    `SELECT id, daycare_id FROM events WHERE id = $1 AND cancelled = FALSE`,
    [eventId],
  );
  if (existingRows.length === 0) {
    const err = new Error("Event not found or cancelled");
    err.statusCode = 404;
    throw err;
  }
  const existing = existingRows[0];
  if (!user?.daycare_id || existing.daycare_id !== user.daycare_id) {
    const err = new Error("Event not found or cancelled");
    err.statusCode = 404;
    throw err;
  }

  if (!Number.isSafeInteger(body.version) || body.version < 1)
    throw Object.assign(new Error("Reload the event before saving."), {
      statusCode: 422,
    });
  const fields = [];
  const vals = [];
  let idx = 1;

  if (body.title !== undefined) {
    fields.push(`title = $${idx++}`);
    vals.push(body.title);
  }
  if (body.event_date !== undefined) {
    fields.push(`event_date = $${idx++}`);
    vals.push(body.event_date);
  }
  if (body.event_time !== undefined) {
    fields.push(`event_time = $${idx++}`);
    vals.push(body.event_time || null);
  }
  if (body.description !== undefined) {
    fields.push(`description = $${idx++}`);
    vals.push(body.description || null);
  }
  if (body.event_type !== undefined) {
    fields.push(`event_type = $${idx++}`);
    vals.push(body.event_type);
  }

  if (fields.length === 0) {
    const err = new Error("No fields provided for update");
    err.statusCode = 422;
    throw err;
  }

  fields.push(`updated_at = NOW()`);
  vals.push(eventId, body.version);

  const { rows } = await db.query(
    `UPDATE events SET ${fields.join(", ")} WHERE id = $${idx} AND version = $${idx + 1} AND cancelled = FALSE RETURNING *`,
    vals,
  );

  if (!rows.length)
    throw Object.assign(new Error("Event changed. Reload before saving."), {
      statusCode: 409,
    });
  return rows[0];
};

/**
 * Soft-delete an event by setting cancelled = TRUE (Admin only).
 */
const cancelEvent = async (eventIdParam, user, body = {}) => {
  const eventId = parseInt(eventIdParam, 10);

  const { rows: existingRows } = await db.query(
    `SELECT id, daycare_id FROM events WHERE id = $1`,
    [eventId],
  );
  if (existingRows.length === 0) {
    const err = new Error("Event not found");
    err.statusCode = 404;
    throw err;
  }
  const existing = existingRows[0];
  if (!user?.daycare_id || existing.daycare_id !== user.daycare_id) {
    const err = new Error("Event not found");
    err.statusCode = 404;
    throw err;
  }

  if (!Number.isSafeInteger(body.version) || body.version < 1)
    throw Object.assign(new Error("Reload the event before cancelling."), {
      statusCode: 422,
    });
  const { rows } = await db.query(
    `UPDATE events SET cancelled = TRUE, updated_at = NOW() WHERE id = $1 AND version = $2 AND cancelled = FALSE RETURNING *`,
    [eventId, body.version],
  );
  if (!rows.length)
    throw Object.assign(new Error("Event changed. Reload before cancelling."), {
      statusCode: 409,
    });
  return { message: "Event successfully cancelled", event: rows[0] };
};

module.exports = {
  listEvents,
  createEvent,
  updateEvent,
  cancelEvent,
};
