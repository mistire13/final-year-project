'use strict';
/**
 * Users Service — admin user management
 * SRS Refs: FR-UAM-04, FR-UAM-08
 */
const bcrypt = require('bcryptjs');
const db = require('../../config/db');
const {auditedWrite} = require('../../utils/auditedWrite');

const listUsers = async ({ page = 1, limit = 20, role, status }, actor = null) => {
  const offset = (page - 1) * limit;
  const isSuperAdmin = actor && actor.role === 'super_admin';
  const daycareId = actor ? actor.daycare_id : null;

  const conditions = [
    '($1::TEXT IS NULL OR r.name = $1)',
    '($2::TEXT IS NULL OR u.status = $2)',
  ];
  const params = [role || null, status || null];

  if (!isSuperAdmin) {
    params.push(daycareId);
    conditions.push(`u.daycare_id = $${params.length}`);
    conditions.push("r.name != 'super_admin'");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows: cols } = await db.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name IN ('phone', 'title', 'qualifications', 'emergency_contact', 'shift')"
  );
  const extraCols = cols.length > 0 ? ', u.phone, u.title, u.qualifications, u.emergency_contact, u.shift' : '';

  params.push(limit, offset);
  const { rows } = await db.query(
    `SELECT u.id, u.name, u.email, u.status, u.daycare_id, r.name AS role, u.created_at${extraCols}
     FROM users u JOIN roles r ON r.id = u.role_id
     ${whereClause}
     ORDER BY u.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const countParams = params.slice(0, params.length - 2);
  const { rows: cnt } = await db.query(
    `SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id ${whereClause}`,
    countParams
  );
  return { data: rows, total: parseInt(cnt[0].count), page: +page, limit: +limit };
};

const getUserById = async (id, actor = null) => {
  const { rows: cols } = await db.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name IN ('phone', 'title', 'qualifications', 'emergency_contact', 'shift')"
  );
  const extraCols = cols.length > 0 ? ', u.phone, u.title, u.qualifications, u.emergency_contact, u.shift' : '';

  const { rows } = await db.query(
    `SELECT u.id, u.name, u.email, u.status, u.daycare_id, r.name AS role, u.created_at, u.updated_at${extraCols}
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
    [id]
  );
  if (!rows[0]) { const e = new Error('User not found'); e.status = 404; e.statusCode = 404; throw e; }
  const user = rows[0];

  if (actor && actor.role !== 'super_admin') {
    if (user.role === 'super_admin' || user.daycare_id !== actor.daycare_id) {
      const e = new Error('User not found');
      e.status = 404;
      e.statusCode = 404;
      throw e;
    }
  }
  return user;
};

const createUser = async (body, actor) => {
  const { name, email, password, role } = body;
  const actorId = typeof actor === 'object' && actor !== null ? actor.id : actor;
  const isSuperAdmin = typeof actor === 'object' && actor !== null && actor.role === 'super_admin';
  const daycareId = typeof actor === 'object' && actor !== null ? actor.daycare_id : null;

  if (!isSuperAdmin && !['caregiver', 'parent'].includes(role)) {
    const err = new Error('Daycare administrators can only create caregiver and parent accounts');
    err.statusCode = 403;
    throw err;
  }

  const hash = await bcrypt.hash(password, 10);
  return auditedWrite(actor, 'USER_REGISTERED', 'users', async client => {
    const { rows: roles } = await client.query('SELECT id FROM roles WHERE name = $1', [role]);
    if (!roles[0]) throw Object.assign(new Error('Invalid role'), { statusCode: 422 });

    const { rows: cols } = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name IN ('phone', 'title')"
    );
    const hasDetails = cols.length > 0;

    let insertSql, vals;
    if (hasDetails) {
      insertSql = `INSERT INTO users(name, email, password_hash, role_id, daycare_id, status, phone, title, qualifications, emergency_contact, shift)
                   VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                   RETURNING id, name, email, status, daycare_id, phone, title, qualifications, emergency_contact, shift, created_at`;
      vals = [
        name.trim(),
        email.trim().toLowerCase(),
        hash,
        roles[0].id,
        daycareId,
        'active',
        body.phone ? body.phone.trim() : null,
        body.title ? body.title.trim() : null,
        body.qualifications ? body.qualifications.trim() : null,
        body.emergency_contact ? body.emergency_contact.trim() : null,
        body.shift ? body.shift.trim() : null,
      ];
    } else {
      insertSql = `INSERT INTO users(name, email, password_hash, role_id, daycare_id, status)
                   VALUES($1, $2, $3, $4, $5, $6)
                   RETURNING id, name, email, status, daycare_id, created_at`;
      vals = [name.trim(), email.trim().toLowerCase(), hash, roles[0].id, daycareId, 'active'];
    }

    const { rows } = await client.query(insertSql, vals);
    return rows[0];
  }, { role }, daycareId);
};

const updateUser = async (id, body, actor) => {
  // Ensure target user belongs to actor's daycare
  await getUserById(id, actor);
  return auditedWrite(actor, 'USER_UPDATED', 'users', async client => {
    const { rows: cols } = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name IN ('phone', 'title')"
    );
    const hasDetails = cols.length > 0;

    const fields = [];
    const values = [];
    let idx = 1;

    if (body.name) {
      fields.push(`name = $${idx++}`);
      values.push(body.name.trim());
    }
    if (body.email) {
      fields.push(`email = $${idx++}`);
      values.push(body.email.trim().toLowerCase());
    }
    if (hasDetails) {
      if (body.phone !== undefined) {
        fields.push(`phone = $${idx++}`);
        values.push(body.phone ? body.phone.trim() : null);
      }
      if (body.title !== undefined) {
        fields.push(`title = $${idx++}`);
        values.push(body.title ? body.title.trim() : null);
      }
      if (body.qualifications !== undefined) {
        fields.push(`qualifications = $${idx++}`);
        values.push(body.qualifications ? body.qualifications.trim() : null);
      }
      if (body.emergency_contact !== undefined) {
        fields.push(`emergency_contact = $${idx++}`);
        values.push(body.emergency_contact ? body.emergency_contact.trim() : null);
      }
      if (body.shift !== undefined) {
        fields.push(`shift = $${idx++}`);
        values.push(body.shift ? body.shift.trim() : null);
      }
    }

    if (fields.length === 0) {
      const { rows } = await client.query('SELECT id, name, email, status, daycare_id, updated_at FROM users WHERE id = $1', [id]);
      return rows[0];
    }

    fields.push('updated_at = NOW()');
    values.push(id);

    const { rows } = await client.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, name, email, status, daycare_id, updated_at`,
      values
    );
    if (!rows[0]) throw Object.assign(new Error('User not found'), { statusCode: 404 });
    return rows[0];
  });
};

const updateStatus = async (id, status, actor) => {
  const actorId = typeof actor === 'object' && actor !== null ? actor.id : actor;
  if (Number(id) === actorId && status !== 'active') {
    throw Object.assign(new Error('You cannot deactivate your own account.'), { statusCode: 422 });
  }
  // Ensure target user belongs to actor's daycare
  await getUserById(id, actor);
  return auditedWrite(actor, 'USER_STATUS_CHANGED', 'users', async client => {
    const { rows } = await client.query(
      'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, status, daycare_id',
      [status, id]
    );
    if (!rows[0]) throw Object.assign(new Error('User not found'), { statusCode: 404 });
    return rows[0];
  }, { status });
};

/**
 * Self-service profile retrieval (any authenticated user)
 */
const getMyProfile = async (user) => {
  const { rows } = await db.query(
    `SELECT u.id, u.name, u.email, u.status, r.name AS role, u.created_at, u.updated_at
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1`,
    [user.id]
  );
  if (!rows[0]) {
    const e = new Error('User not found');
    e.status = 404;
    throw e;
  }
  const profile = rows[0];

  if (user.role === 'parent') {
    const { rows: children } = await db.query(
      `SELECT c.id, c.full_name, c.dob, c.gender, c.enrollment_status, g.name AS group_name
       FROM guardian_links gl
       JOIN children c ON c.id = gl.child_id
       LEFT JOIN groups g ON g.id = c.group_id
       WHERE gl.user_id = $1`,
      [user.id]
    );
    profile.linked_children = children;
  } else if (user.role === 'caregiver') {
    const { rows: children } = await db.query(
      `SELECT c.id, c.full_name, c.dob, c.gender, c.enrollment_status, g.name AS group_name
       FROM children c
       LEFT JOIN groups g ON g.id = c.group_id
       WHERE c.caregiver_id = $1`,
      [user.id]
    );
    profile.assigned_children = children;
  }

  return profile;
};

/**
 * Self-service profile update (name, email, phone)
 */
const updateMyProfile = async (user, { name, email, phone }) => {
  if (email) {
    const existing = await db.query(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2`,
      [email.trim(), user.id]
    );
    if (existing.rows.length > 0) {
      const e = new Error('Email is already in use by another account');
      e.status = 409;
      throw e;
    }
  }

  const { rows: cols } = await db.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone'"
  );
  const hasPhone = cols.length > 0;

  let updateSql;
  let params;

  if (hasPhone && phone !== undefined) {
    updateSql = `UPDATE users
     SET name = COALESCE($1, name),
         email = COALESCE($2, email),
         phone = $3,
         updated_at = NOW()
     WHERE id = $4
     RETURNING id, name, email, phone, status, updated_at`;
    params = [name ? name.trim() : null, email ? email.toLowerCase().trim() : null, phone ? phone.trim() : null, user.id];
  } else {
    updateSql = `UPDATE users
     SET name = COALESCE($1, name),
         email = COALESCE($2, email),
         updated_at = NOW()
     WHERE id = $3
     RETURNING id, name, email, status, updated_at`;
    params = [name ? name.trim() : null, email ? email.toLowerCase().trim() : null, user.id];
  }

  const { rows } = await db.query(updateSql, params);
  if (!rows[0]) {
    const e = new Error('User not found');
    e.status = 404;
    throw e;
  }
  return rows[0];
};

module.exports = {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  updateStatus,
  getMyProfile,
  updateMyProfile,
};
