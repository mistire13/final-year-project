'use strict';
/**
 * src/modules/communication/communication.service.js
 * Business logic for Announcements, Direct Messages, and Urgent Alerts.
 * SRS Refs: FR-COM-01–08, UC-07
 */
const db = require('../../config/db');
const {transaction} = require('../auth/legacy-security');
const {writeAudit} = require('../../utils/auditedWrite');
const crypto = require('node:crypto');

// ─────────────────────────────────────────────────────────────
// 1. ANNOUNCEMENTS
// ─────────────────────────────────────────────────────────────
const createAnnouncement = async (body, user) => {
  const isSuper = user.role === 'super_admin';
  const daycareId = isSuper ? (body.daycare_id || null) : user.daycare_id;

  if (!isSuper && !daycareId) {
    const err = new Error('Tenant context required to create an announcement');
    err.statusCode = 400;
    throw err;
  }

  if (body.target_group_id) {
    const { rows: grpRows } = await db.query(
      `SELECT id, daycare_id FROM groups WHERE id = $1`,
      [body.target_group_id]
    );
    if (grpRows.length === 0 || (!isSuper && grpRows[0].daycare_id !== daycareId)) {
      const err = new Error('Target group not found in this daycare');
      err.statusCode = 404;
      throw err;
    }
  }

  return transaction(db,async client=>{
  const input={title:body.title,body:body.body,announcement_type:body.announcement_type||'general',audience:body.audience||'all',target_group_id:body.target_group_id||null,expires_at:body.expires_at?new Date(body.expires_at).toISOString():null};
  const requestHash=crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
  if(body.request_key){
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`announcement:${daycareId}:${user.id}:${body.request_key}`]);
    const {rows:[previous]}=await client.query('SELECT * FROM announcements WHERE daycare_id=$1 AND author_id=$2 AND request_key=$3',[daycareId,user.id,body.request_key]);
    if(previous){
      if(previous.request_hash!==requestHash)throw Object.assign(new Error('This announcement was already submitted with different content. Check Communication before publishing a new announcement.'),{statusCode:409});
      return previous;
    }
  }
  const { rows } = await client.query(
    `INSERT INTO announcements (author_id, title, body, announcement_type, audience, target_group_id, expires_at, daycare_id, request_key, request_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      user.id,
      body.title,
      body.body,
      body.announcement_type || 'general',
      body.audience || 'all',
      body.target_group_id || null,
      body.expires_at || null,
      daycareId,
      body.request_key||null,
      requestHash,
    ]
  );
  await writeAudit(client,user,'ANNOUNCEMENT_CREATED','announcements',rows[0].id,{audience:input.audience});
  return rows[0];
  });
};

const listAnnouncements = async (query = {}, user) => {
  const typeFilter = query.type || null;
  const isSuper = user.role === 'super_admin';
  const isAdmin = user.role === 'admin';
  const isCaregiver = user.role === 'caregiver';
  const isParent = user.role === 'parent';
  const daycareId = user.daycare_id || null;

  if (!isSuper && !daycareId) {
    return { data: [] };
  }

  const { rows } = await db.query(
    `SELECT a.id, a.title, a.body, a.announcement_type, a.audience, a.target_group_id, a.expires_at, a.created_at, a.daycare_id,
            u.name AS author_name, g.name AS target_group_name
     FROM announcements a
     JOIN users u ON u.id = a.author_id
     LEFT JOIN groups g ON g.id = a.target_group_id
     WHERE (a.expires_at IS NULL OR a.expires_at > NOW())
       AND ($1::text IS NULL OR a.announcement_type = $1)
       AND ($2::boolean = TRUE OR a.daycare_id = $3)
       AND (
         $4::boolean = TRUE
         OR (
           $5::boolean = TRUE
           AND (a.audience IN ('all', 'parents') OR a.audience = 'group')
           AND (
             a.target_group_id IS NULL
             OR EXISTS (
               SELECT 1 FROM guardian_links gl
               JOIN children c ON c.id = gl.child_id
               WHERE gl.user_id = $6 AND c.group_id = a.target_group_id
             )
           )
         )
         OR (
           $7::boolean = TRUE
           AND (a.audience IN ('all', 'caregivers', 'staff') OR a.audience = 'group')
           AND (
             a.target_group_id IS NULL
             OR EXISTS (
               SELECT 1 FROM children c
               WHERE c.caregiver_id = $6 AND c.group_id = a.target_group_id
             )
           )
         )
       )
     ORDER BY a.created_at DESC`,
    [typeFilter, isSuper, daycareId, (isSuper || isAdmin), isParent, user.id, isCaregiver]
  );

  return { data: rows };
};

const listMealPlans = async (query = {}, user) => {
  const groupId = query.group_id === undefined ? null : Number(query.group_id);
  if (groupId !== null && (!Number.isSafeInteger(groupId) || groupId <= 0)) {
    throw Object.assign(new Error('Invalid group'), { statusCode: 422 });
  }
  if (groupId !== null && ['parent', 'caregiver'].includes(user.role)) {
    const { rows } = await db.query(`SELECT 1 FROM children c
      WHERE c.daycare_id = $1 AND c.group_id = $2
        AND (($3::text = 'caregiver' AND c.caregiver_id = $4)
          OR ($3::text = 'parent' AND EXISTS (
            SELECT 1 FROM guardian_links gl WHERE gl.child_id = c.id AND gl.user_id = $4)))
      LIMIT 1`, [user.daycare_id, groupId, user.role, user.id]);
    if (!rows.length) return { data: [] };
  }
  const { data } = await listAnnouncements({ type: 'meal_plan' }, user);
  // Filtering can only narrow the authorized audience.
  return { data: data.filter(item => groupId === null || item.target_group_id === null || item.target_group_id === groupId) };
};

const sendMessage = async (body, user) => {
  const recipientId = parseInt(body.recipient_id, 10);
  const isSuper = user.role === 'super_admin';
  const daycareId = user.daycare_id || null;

  if (!isSuper && !daycareId) {
    const err = new Error('Tenant context required to send a message');
    err.statusCode = 400;
    throw err;
  }

  // Verify recipient exists, is active, and belongs to the same daycare
  const { rows: recipRows } = await db.query(
    `SELECT u.id, u.name, u.status, u.daycare_id, r.name AS role
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1`,
    [recipientId]
  );
  if (recipRows.length === 0 || recipRows[0].status !== 'active') {
    const err = new Error('Recipient user not found or inactive');
    err.statusCode = 404;
    throw err;
  }

  const recipient = recipRows[0];
  if (!isSuper && recipient.daycare_id !== daycareId) {
    const err = new Error('Recipient user not found or inactive');
    err.statusCode = 404;
    throw err;
  }

  // Role permissions check:
  // - Parent can only message staff (admin or caregiver) in their daycare
  if (user.role === 'parent' && recipient.role !== 'admin' && recipient.role !== 'caregiver') {
    const err = new Error('Parents may only send messages to daycare staff');
    err.statusCode = 403;
    throw err;
  }

  const msgDaycareId = isSuper ? (recipient.daycare_id || daycareId) : daycareId;

  const { rows } = await db.query(
    `INSERT INTO messages (sender_id, recipient_id, subject, body, daycare_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [user.id, recipientId, body.subject || null, body.body, msgDaycareId]
  );

  return rows[0];
};

const listMessages = async (query = {}, user) => {
  const withUserId = query.with_user_id ? parseInt(query.with_user_id, 10) : null;
  const isSuper = user.role === 'super_admin';
  const daycareId = user.daycare_id || null;

  if (!isSuper && !daycareId) {
    return { data: [] };
  }

  // If with_user_id is passed, verify they are in the same daycare (unless super_admin)
  if (withUserId && !isSuper) {
    const { rows: withRows } = await db.query(
      `SELECT id, daycare_id FROM users WHERE id = $1`,
      [withUserId]
    );
    if (withRows.length === 0 || withRows[0].daycare_id !== daycareId) {
      return { data: [] };
    }
  }

  const { rows } = await db.query(
    `SELECT m.id, m.sender_id, m.recipient_id, m.subject, m.body, m.read_at, m.created_at, m.daycare_id,
            s.name AS sender_name, r.name AS recipient_name
     FROM messages m
     JOIN users s ON s.id = m.sender_id
     JOIN users r ON r.id = m.recipient_id
     WHERE (m.sender_id = $1 OR m.recipient_id = $1)
       AND ($2::integer IS NULL OR m.sender_id = $2 OR m.recipient_id = $2)
       AND ($3::boolean = TRUE OR m.daycare_id = $4)
     ORDER BY m.created_at DESC`,
    [user.id, withUserId, isSuper, daycareId]
  );

  return { data: rows };
};

const markMessageRead = async (messageIdParam, user) => {
  const msgId = parseInt(messageIdParam, 10);
  const isSuper = user.role === 'super_admin';
  const daycareId = user.daycare_id || null;

  const { rows } = await db.query(
    `UPDATE messages SET read_at = NOW() 
     WHERE id = $1 AND recipient_id = $2 
       AND ($3::boolean = TRUE OR daycare_id = $4)
     RETURNING *`,
    [msgId, user.id, isSuper, daycareId]
  );

  if (rows.length === 0) {
    const err = new Error('Message not found or you are not the recipient');
    err.statusCode = 404;
    throw err;
  }

  return rows[0];
};

// ─────────────────────────────────────────────────────────────
// 3. URGENT ALERTS
// ─────────────────────────────────────────────────────────────
const createAlert = async (body, user) => {
  const targetUserId = body.target_user_id ? parseInt(body.target_user_id, 10) : null;
  const isSuper = user.role === 'super_admin';
  const daycareId = isSuper ? (body.daycare_id || null) : user.daycare_id;

  if (!isSuper && !daycareId) {
    const err = new Error('Tenant context required to create an alert');
    err.statusCode = 400;
    throw err;
  }

  if (targetUserId) {
    const { rows: targetRows } = await db.query(
      `SELECT id, status, daycare_id FROM users WHERE id = $1`,
      [targetUserId]
    );
    if (targetRows.length === 0 || targetRows[0].status !== 'active') {
      const err = new Error('Target user not found or inactive');
      err.statusCode = 404;
      throw err;
    }
    if (!isSuper && targetRows[0].daycare_id !== daycareId) {
      const err = new Error('Target user not found or inactive');
      err.statusCode = 404;
      throw err;
    }
  }

  const { rows } = await db.query(
    `INSERT INTO alerts (author_id, title, urgency, recipient_scope, target_user_id, daycare_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      user.id,
      body.title,
      body.urgency || 'normal',
      body.recipient_scope || 'all',
      targetUserId,
      daycareId,
    ]
  );

  return rows[0];
};

const listAlerts = async (user) => {
  const isSuper = user.role === 'super_admin';
  const isAdmin = user.role === 'admin';
  const isCaregiver = user.role === 'caregiver';
  const isParent = user.role === 'parent';
  const daycareId = user.daycare_id || null;

  if (!isSuper && !daycareId) {
    return { data: [] };
  }

  const { rows } = await db.query(
    `SELECT al.id, al.title, al.urgency, al.recipient_scope, al.created_at, al.daycare_id,
            u.name AS author_name
     FROM alerts al
     JOIN users u ON u.id = al.author_id
     WHERE ($1::boolean = TRUE OR al.daycare_id = $2)
       AND (
         $3::boolean = TRUE
         OR (
           $4::boolean = TRUE
           AND (al.recipient_scope IN ('all', 'parents') OR (al.recipient_scope = 'individual' AND al.target_user_id = $5))
         )
         OR (
           $6::boolean = TRUE
           AND (al.recipient_scope IN ('all', 'caregivers', 'staff') OR (al.recipient_scope = 'individual' AND al.target_user_id = $5))
         )
       )
     ORDER BY al.created_at DESC`,
    [isSuper, daycareId, (isSuper || isAdmin), isParent, user.id, isCaregiver]
  );

  return { data: rows };
};

// ─────────────────────────────────────────────────────────────
// 4. COMMUNICATION CONTACTS (For safe messaging targeting)
// ─────────────────────────────────────────────────────────────
const listContacts = async (user) => {
  const isSuper = user.role === 'super_admin';
  const daycareId = user.daycare_id || null;

  if (!isSuper && !daycareId) {
    return { contacts: [] };
  }

  if (user.role === 'parent') {
    // 1. Assigned caregivers for this parent's linked children
    const { rows: assignedCgRows } = await db.query(
      `SELECT DISTINCT u.id, u.name, u.email, 'caregiver' AS role, 'Assigned Caregiver' AS title,
              ARRAY_AGG(DISTINCT c.full_name) AS child_names
       FROM guardian_links gl
       JOIN children c ON c.id = gl.child_id
       JOIN users u ON u.id = c.caregiver_id
       WHERE gl.user_id = $1 AND u.status = 'active'
         AND ($2::boolean = TRUE OR u.daycare_id = $3)
       GROUP BY u.id, u.name, u.email`,
      [user.id, isSuper, daycareId]
    );

    // 2. Daycare office / admin(s)
    const { rows: officeRows } = await db.query(
      `SELECT u.id, u.name, u.email, 'admin' AS role, 'Daycare Office & Administration' AS title
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'admin' AND u.status = 'active'
         AND ($1::boolean = TRUE OR u.daycare_id = $2)
       ORDER BY u.id ASC`,
      [isSuper, daycareId]
    );

    // 3. Fallback: if no caregiver is assigned to children yet, show active caregivers
    let generalCgRows = [];
    if (assignedCgRows.length === 0) {
      const { rows } = await db.query(
        `SELECT u.id, u.name, u.email, 'caregiver' AS role, 'Daycare Caregiver' AS title
         FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE r.name = 'caregiver' AND u.status = 'active'
           AND ($1::boolean = TRUE OR u.daycare_id = $2)
         ORDER BY u.id ASC`,
        [isSuper, daycareId]
      );
      generalCgRows = rows;
    }

    const assignedIds = new Set(assignedCgRows.map(c => c.id));
    const uniqueGeneral = generalCgRows.filter(c => !assignedIds.has(c.id));

    return { contacts: [...assignedCgRows, ...officeRows, ...uniqueGeneral] };
  }

  // Caregiver or Admin
  const { rows } = await db.query(
    `SELECT u.id, u.name, u.email, r.name AS role,
            CASE 
              WHEN r.name = 'admin' THEN 'Daycare Office & Administration'
              WHEN r.name = 'caregiver' THEN 'Caregiver / Teacher'
              ELSE 'Parent / Guardian'
            END AS title
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.id != $1 AND u.status = 'active'
       AND ($2::boolean = TRUE OR u.daycare_id = $3)
     ORDER BY r.name ASC, u.name ASC`,
    [user.id, isSuper, daycareId]
  );

  return { contacts: rows };
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
