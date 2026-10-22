'use strict';
/**
 * src/modules/children/children.service.js
 * Business logic for Child Profile & Guardian Management.
 * SRS Refs: FR-CH-01–07, UC-03, UC-04, BR-01, BR-02
 * Architecture Plan: §8.3
 */
const db = require('../../config/db');
const bcrypt = require('bcryptjs');
const {auditedWrite,writeAudit} = require('../../utils/auditedWrite');
async function validateAssignment(client, body, daycareId = null) {
  if (body.caregiver_id) {
    const { rows } = await client.query(
      "SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1 AND u.status = 'active' AND r.name = 'caregiver' AND ($2::int IS NULL OR u.daycare_id = $2)",
      [body.caregiver_id, daycareId || null]
    );
    if (!rows.length) throw Object.assign(new Error('Choose an active caregiver from your daycare center.'), { statusCode: 422 });
  }
  if (body.group_id) {
    const { rows } = await client.query(
      "SELECT id FROM groups WHERE id = $1 AND ($2::int IS NULL OR daycare_id = $2)",
      [body.group_id, daycareId || null]
    );
    if (!rows.length) throw Object.assign(new Error('Choose a valid classroom group from your daycare center.'), { statusCode: 422 });
  }
}

/**
 * Authorization helper — Query 4 from §6.2:
 * Index-only scan on UNIQUE(child_id, user_id) index.
 */
const isParentLinked = async (parentUserId, childId) => {
  const { rows } = await db.query(
    `SELECT EXISTS(SELECT 1 FROM guardian_links WHERE user_id = $1 AND child_id = $2) AS linked`,
    [parentUserId, childId]
  );
  return rows[0].linked === true;
};

/**
 * List children (Admin sees own daycare, Caregiver sees assigned only)
 */
const listChildren = async (query = {}, user) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const isSuperAdmin = user && user.role === 'super_admin';
  const daycareId = user ? user.daycare_id : null;

  const statusFilter = query.status === 'all' ? null : (query.status || 'active');
  const groupId = query.group_id ? parseInt(query.group_id, 10) : null;
  
  // Caregivers can only see their assigned children (BR-01)
  let caregiverId = query.caregiver_id ? parseInt(query.caregiver_id, 10) : null;
  if (user.role === 'caregiver') {
    caregiverId = user.id;
  }

  const conditions = [
    '($1::text IS NULL OR c.enrollment_status = $1)',
    '($2::integer IS NULL OR c.group_id = $2)',
    '($3::integer IS NULL OR c.caregiver_id = $3)',
  ];
  const params = [statusFilter, groupId, caregiverId];

  if (!isSuperAdmin) {
    params.push(daycareId);
    conditions.push(`c.daycare_id = $${params.length}`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  // Count query
  const countRes = await db.query(
    `SELECT COUNT(*) AS total FROM children c ${whereClause}`,
    params
  );
  const total = parseInt(countRes.rows[0].total, 10);

  // Data query with group and caregiver details
  params.push(limit, offset);
  const { rows } = await db.query(
    `SELECT c.id, c.full_name, c.dob, c.gender, c.enrollment_status, c.photo_url, c.daycare_id, c.created_at,
            g.name AS group_name, u.name AS caregiver_name
     FROM children c
     LEFT JOIN groups g ON g.id = c.group_id
     LEFT JOIN users u  ON u.id = c.caregiver_id
     ${whereClause}
     ORDER BY g.name NULLS LAST, c.full_name ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    data: rows,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Register new child profile (Admin only)
 * Optional transactional insertion of emergency contacts & care instructions
 */
const createChild = async (body, actor) => {
  const actorId = typeof actor === 'object' && actor !== null ? actor.id : actor;
  const daycareId = typeof actor === 'object' && actor !== null ? actor.daycare_id : null;

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await validateAssignment(client, body, daycareId);

    const insertChildText = `
      INSERT INTO children (full_name, dob, gender, group_id, caregiver_id, enrollment_status, daycare_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const childVals = [
      body.full_name,
      body.dob,
      body.gender || null,
      body.group_id || null,
      body.caregiver_id || null,
      body.enrollment_status || 'active',
      daycareId,
    ];
    const childRes = await client.query(insertChildText, childVals);
    const child = childRes.rows[0];

    // Batch insert emergency contacts if provided
    const contacts = [];
    if (Array.isArray(body.emergency_contacts) && body.emergency_contacts.length > 0) {
      for (const contact of body.emergency_contacts) {
        const contactRes = await client.query(
          `INSERT INTO emergency_contacts (child_id, name, relationship, phone)
           VALUES ($1, $2, $3, $4) RETURNING id, name, relationship, phone`,
          [child.id, contact.name, contact.relationship, contact.phone]
        );
        contacts.push(contactRes.rows[0]);
      }
    }

    // Batch insert care instructions if provided
    const instructions = [];
    if (Array.isArray(body.care_instructions) && body.care_instructions.length > 0) {
      for (const inst of body.care_instructions) {
        const instRes = await client.query(
          `INSERT INTO care_instructions (child_id, category, instruction_text)
           VALUES ($1, $2, $3) RETURNING id, category, instruction_text`,
          [child.id, inst.category, inst.instruction_text]
        );
        instructions.push(instRes.rows[0]);
      }
    }

    await writeAudit(client, actorId, 'CHILD_REGISTERED', 'children', child.id, {}, daycareId);
    await client.query('COMMIT');

    return {
      ...child,
      emergency_contacts: contacts,
      care_instructions: instructions,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Get detailed child profile (3-query pattern to avoid cartesian product)
 * Checks authorization for parents & caregivers and enforces tenant isolation.
 */
const getChild = async (id, user) => {
  const childId = parseInt(id, 10);
  const isSuperAdmin = user && user.role === 'super_admin';

  // Query 1: Child details with group & caregiver names
  const { rows: childRows } = await db.query(
    `SELECT c.*, g.name AS group_name, u.name AS caregiver_name
     FROM children c
     LEFT JOIN groups g ON g.id = c.group_id
     LEFT JOIN users u  ON u.id = c.caregiver_id
     WHERE c.id = $1`,
    [childId]
  );

  if (childRows.length === 0) {
    const err = new Error('Child profile not found');
    err.statusCode = 404;
    throw err;
  }

  const child = childRows[0];

  // Daycare isolation check
  if ((!user?.daycare_id || child.daycare_id !== user.daycare_id)) {
    const err = new Error('Child profile not found');
    err.statusCode = 404;
    throw err;
  }

  // Authorization check for parent role (FR-UAM-05)
  if (user.role === 'parent') {
    const linked = await isParentLinked(user.id, childId);
    if (!linked) {
      const err = new Error('Access denied: You are not linked to this child record');
      err.statusCode = 403;
      throw err;
    }
  }

  // Authorization check for caregiver role
  if (user.role === 'caregiver' && child.caregiver_id !== user.id) {
    const err = new Error('Access denied: You are not assigned to this child');
    err.statusCode = 403;
    throw err;
  }

  // Query 2: Emergency contacts
  const { rows: contacts } = await db.query(
    `SELECT id, name, relationship, phone FROM emergency_contacts WHERE child_id = $1 ORDER BY id ASC`,
    [childId]
  );

  // Query 3: Care instructions
  const { rows: instructions } = await db.query(
    `SELECT id, category, instruction_text FROM care_instructions WHERE child_id = $1 ORDER BY category ASC, id ASC`,
    [childId]
  );

  return {
    ...child,
    emergency_contacts: contacts,
    care_instructions: instructions,
  };
};

/**
 * Update child profile (Admin only, partial update)
 */
const updateChild = async (id, body, actor) => {
  const actorId = typeof actor === 'object' && actor !== null ? actor.id : actor;
  const isSuperAdmin = typeof actor === 'object' && actor !== null && actor.role === 'super_admin';
  const daycareId = typeof actor === 'object' && actor !== null ? actor.daycare_id : null;
  const childId = parseInt(id, 10);

  // Verify child exists and belongs to actor's daycare
  const { rows: existing } = await db.query('SELECT id, daycare_id FROM children WHERE id = $1', [childId]);
  if (!existing.length || (!isSuperAdmin && existing[0].daycare_id !== daycareId)) {
    const err = new Error('Child profile not found');
    err.statusCode = 404;
    throw err;
  }

  return auditedWrite(actor, 'CHILD_UPDATED', 'children', async client => {
    await validateAssignment(client, body, daycareId);

    const fields = [];
    const values = [];
    let idx = 1;

    const allowedKeys = ['full_name', 'dob', 'gender', 'group_id', 'caregiver_id', 'enrollment_status', 'photo_url'];

    for (const key of allowedKeys) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        fields.push(`${key} = $${idx}`);
        values.push(body[key]);
        idx++;
      }
    }

    if (fields.length === 0) {
      const err = new Error('No valid fields provided for update');
      err.statusCode = 422;
      throw err;
    }

    values.push(childId);
    const queryText = `UPDATE children SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;

    const { rows } = await client.query(queryText, values);
    return rows[0];
  }, {}, daycareId);
};

/**
 * Link parent/guardian to child (Admin only)
 */
const addGuardian = async (childId, body, actor) => {
  const actorId = typeof actor === 'object' && actor !== null ? actor.id : actor;
  const isSuperAdmin = typeof actor === 'object' && actor !== null && actor.role === 'super_admin';
  const daycareId = typeof actor === 'object' && actor !== null ? actor.daycare_id : null;

  const cId = parseInt(childId, 10);
  const targetUserId = parseInt(body.user_id, 10);

  // Verify child exists and belongs to actor's daycare
  const childCheck = await db.query(`SELECT id, daycare_id FROM children WHERE id = $1`, [cId]);
  if (childCheck.rows.length === 0 || (!isSuperAdmin && childCheck.rows[0].daycare_id !== daycareId)) {
    const err = new Error('Child profile not found');
    err.statusCode = 404;
    throw err;
  }

  // Verify target user exists, is active, has role='parent', and belongs to actor's daycare
  const userCheck = await db.query(
    `SELECT u.id, u.status, u.daycare_id, r.name AS role_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1`,
    [targetUserId]
  );

  if (
    userCheck.rows.length === 0 ||
    userCheck.rows[0].status !== 'active' ||
    userCheck.rows[0].role_name !== 'parent' ||
    (!isSuperAdmin && userCheck.rows[0].daycare_id !== daycareId)
  ) {
    const err = new Error('Target user must be an active parent account in your daycare center');
    err.statusCode = 422;
    throw err;
  }

  try {
    return await auditedWrite(actor, 'GUARDIAN_LINKED', 'guardian_links', async client => {
      const { rows } = await client.query(
        `INSERT INTO guardian_links (child_id, user_id, relationship, pickup_authorized, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [cId, targetUserId, body.relationship, body.pickup_authorized ?? false, actorId]
      );

      return rows[0];
    }, { child_id: cId, pickup_authorized: !!body.pickup_authorized }, daycareId);
  } catch (err) {
    if (err.code === '23505') {
      const dupErr = new Error('This parent is already linked to the child');
      dupErr.statusCode = 409;
      throw dupErr;
    }
    throw err;
  }
};

/**
 * Get linked guardians for a child (Admin and linked parent)
 */
const getGuardians = async (childId, user) => {
  const cId = parseInt(childId, 10);
  const isSuperAdmin = user && user.role === 'super_admin';

  const childCheck = await db.query(`SELECT id, daycare_id FROM children WHERE id = $1`, [cId]);
  if (childCheck.rows.length === 0 || ((!user?.daycare_id || childCheck.rows[0].daycare_id !== user.daycare_id))) {
    const err = new Error('Child profile not found');
    err.statusCode = 404;
    throw err;
  }

  if (user && user.role === 'parent') {
    const linked = await isParentLinked(user.id, cId);
    if (!linked) {
      const err = new Error('Access denied: You are not linked to this child record');
      err.statusCode = 403;
      throw err;
    }
  }

  const { rows } = await db.query(
    `SELECT gl.id AS guardian_link_id, u.id AS user_id, u.name, u.email,
            gl.relationship, gl.pickup_authorized,
            CASE WHEN br.id IS NOT NULL THEN TRUE ELSE FALSE END AS biometric_enrolled,
            gl.created_at
     FROM guardian_links gl
     JOIN users u ON u.id = gl.user_id
     LEFT JOIN biometric_references br ON br.guardian_link_id = gl.id AND br.active = TRUE
     WHERE gl.child_id = $1
     ORDER BY gl.created_at ASC`,
    [cId]
  );

  return { data: rows };
};

/**
 * Remove parent/guardian link (Admin only)
 */
const removeGuardian = async (childId, guardianLinkId, user = null) => {
  const cId = parseInt(childId, 10);
  const glId = parseInt(guardianLinkId, 10);
  const isSuperAdmin = user && user.role === 'super_admin';

  const childCheck = await db.query(`SELECT id, daycare_id FROM children WHERE id = $1`, [cId]);
  if (childCheck.rows.length === 0 || ((!user?.daycare_id || childCheck.rows[0].daycare_id !== user.daycare_id))) {
    const err = new Error('Child profile not found');
    err.statusCode = 404;
    throw err;
  }

  const { rows } = await db.query(
    `DELETE FROM guardian_links WHERE id = $1 AND child_id = $2 RETURNING id`,
    [glId, cId]
  );

  if (rows.length === 0) {
    const err = new Error('Guardian link not found for this child');
    err.statusCode = 404;
    throw err;
  }

  return true;
};

/**
 * Unified Family Enrollment (FR-CH-01, FR-CH-03, FR-CH-04, FR-UAM-04)
 * Atomically registers Parent user + Child profile + Guardian pickup link + Emergency contacts + Care notes
 */
const enrollFamily = async (body, actor) => {
  const actorId = typeof actor === 'object' && actor !== null ? actor.id : actor;
  const isSuperAdmin = typeof actor === 'object' && actor !== null && actor.role === 'super_admin';
  const daycareId = typeof actor === 'object' && actor !== null ? actor.daycare_id : null;

  if (typeof actor === 'object' && actor !== null && !['admin', 'super_admin'].includes(actor.role)) {
    const err = new Error('Only daycare administrators can enroll families');
    err.statusCode = 403;
    throw err;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // 1. Resolve or create parent user account
    let parentUser;
    if (body.parent?.id) {
      const { rows: pRows } = await client.query(
        `SELECT u.id, u.name, u.email, u.status, u.daycare_id, r.name AS role
         FROM users u JOIN roles r ON r.id = u.role_id
         WHERE u.id = $1`,
        [body.parent.id]
      );
      if (!pRows.length || (!isSuperAdmin && pRows[0].daycare_id !== daycareId) || pRows[0].role !== 'parent') {
        const err = new Error('Parent user not found or not an active parent in your daycare');
        err.statusCode = 422;
        throw err;
      }
      parentUser = pRows[0];
    } else {
      const pName = body.parent.name.trim();
      const pEmail = body.parent.email.trim().toLowerCase();
      const pPhone = body.parent.phone ? body.parent.phone.trim() : null;
      const pPassword = body.parent.password;

      // Uniqueness check
      const { rows: existingEmail } = await client.query(
        `SELECT id FROM users WHERE email = $1`,
        [pEmail]
      );
      if (existingEmail.length > 0) {
        const err = new Error(`An account with email "${pEmail}" already exists. Please choose a different email or select an existing parent.`);
        err.statusCode = 409;
        throw err;
      }

      const { rows: parentRole } = await client.query(`SELECT id FROM roles WHERE name = 'parent'`);
      if (!parentRole.length) {
        throw Object.assign(new Error('Parent role not configured in database'), { statusCode: 500 });
      }

      const hash = await bcrypt.hash(pPassword, 10);

      // Check phone column in users
      const { rows: cols } = await client.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone'"
      );
      const hasPhone = cols.length > 0;

      if (hasPhone) {
        const { rows: newP } = await client.query(
          `INSERT INTO users (name, email, password_hash, role_id, daycare_id, status, phone)
           VALUES ($1, $2, $3, $4, $5, 'active', $6)
           RETURNING id, name, email, status, daycare_id, phone, created_at`,
          [pName, pEmail, hash, parentRole[0].id, daycareId, pPhone]
        );
        parentUser = newP[0];
      } else {
        const { rows: newP } = await client.query(
          `INSERT INTO users (name, email, password_hash, role_id, daycare_id, status)
           VALUES ($1, $2, $3, $4, $5, 'active')
           RETURNING id, name, email, status, daycare_id, created_at`,
          [pName, pEmail, hash, parentRole[0].id, daycareId]
        );
        parentUser = newP[0];
      }
    }

    // 2. Validate child assignments (caregiver and group)
    await validateAssignment(client, body.child, daycareId);

    // 3. Insert child profile
    const insertChildSql = `
      INSERT INTO children (full_name, dob, gender, group_id, caregiver_id, enrollment_status, daycare_id, photo_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const childVals = [
      body.child.full_name.trim(),
      body.child.dob,
      body.child.gender || null,
      body.child.group_id || null,
      body.child.caregiver_id || null,
      body.child.enrollment_status || 'active',
      daycareId,
      body.child.photo_url || null,
    ];
    const { rows: childRows } = await client.query(insertChildSql, childVals);
    const child = childRows[0];

    // 4. Link parent to child as primary authorized pickup guardian
    const rel = body.parent.relationship?.trim() || 'Parent';
    const { rows: guardianRows } = await client.query(
      `INSERT INTO guardian_links (child_id, user_id, relationship, pickup_authorized, created_by)
       VALUES ($1, $2, $3, TRUE, $4)
       RETURNING *`,
      [child.id, parentUser.id, rel, actorId]
    );
    const guardianLink = guardianRows[0];

    // 5. Emergency contacts
    const contacts = [];
    if (parentUser.phone && !body.emergency_contacts?.some(c => c.phone === parentUser.phone)) {
      const { rows: autoContact } = await client.query(
        `INSERT INTO emergency_contacts (child_id, name, relationship, phone)
         VALUES ($1, $2, $3, $4) RETURNING id, name, relationship, phone`,
        [child.id, parentUser.name, rel, parentUser.phone]
      );
      contacts.push(autoContact[0]);
    }

    if (Array.isArray(body.emergency_contacts)) {
      for (const c of body.emergency_contacts) {
        if (c.name && c.phone) {
          const { rows: ec } = await client.query(
            `INSERT INTO emergency_contacts (child_id, name, relationship, phone)
             VALUES ($1, $2, $3, $4) RETURNING id, name, relationship, phone`,
            [child.id, c.name.trim(), c.relationship.trim(), c.phone.trim()]
          );
          contacts.push(ec[0]);
        }
      }
    }

    // 6. Care instructions
    const instructions = [];
    if (Array.isArray(body.care_instructions)) {
      for (const inst of body.care_instructions) {
        if (inst.category && inst.instruction_text?.trim()) {
          const { rows: ci } = await client.query(
            `INSERT INTO care_instructions (child_id, category, instruction_text)
             VALUES ($1, $2, $3) RETURNING id, category, instruction_text`,
            [child.id, inst.category, inst.instruction_text.trim()]
          );
          instructions.push(ci[0]);
        }
      }
    }

    // 7. Audit log
    await writeAudit(client, actorId, 'FAMILY_ENROLLED', 'children', child.id, {
      parent_id: parentUser.id,
      relationship: rel,
    }, daycareId);

    await client.query('COMMIT');

    return {
      child,
      parent: parentUser,
      guardian_link: guardianLink,
      emergency_contacts: contacts,
      care_instructions: instructions,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const assignCaregiver = async (body, actor) => {
  const isSuperAdmin = typeof actor === 'object' && actor !== null && actor.role === 'super_admin';
  const daycareId = typeof actor === 'object' && actor !== null ? actor.daycare_id : null;
  const caregiverId = body.caregiver_id ? parseInt(body.caregiver_id, 10) : null;
  const groupId = body.group_id ? parseInt(body.group_id, 10) : null;
  const childIds = Array.isArray(body.child_ids) ? body.child_ids.map(Number) : [];

  if (caregiverId) {
    const { rows: cg } = await db.query(
      `SELECT id FROM users WHERE id = $1 AND role_id = 2 AND status = 'active' AND ($2::boolean OR daycare_id = $3)`,
      [caregiverId, isSuperAdmin, daycareId]
    );
    if (cg.length === 0) {
      const err = new Error('Caregiver not found or inactive');
      err.statusCode = 422;
      throw err;
    }
  }

  return auditedWrite(actor, 'CAREGIVER_ASSIGNED', 'children', async client => {
    let updatedCount = 0;

    // 1. If group_id is provided, assign all active children in that group
    if (groupId) {
      const res = await client.query(
        `UPDATE children SET caregiver_id = $1 WHERE group_id = $2 AND ($3::boolean OR daycare_id = $4) RETURNING id`,
        [caregiverId, groupId, isSuperAdmin, daycareId]
      );
      updatedCount += res.rowCount;

      // Also set lead_caregiver_id on the group
      await client.query(
        `UPDATE groups SET lead_caregiver_id = $1 WHERE id = $2 AND ($3::boolean OR daycare_id = $4)`,
        [caregiverId, groupId, isSuperAdmin, daycareId]
      );
    }

    // 2. If specific child_ids are provided
    if (childIds.length > 0) {
      const res = await client.query(
        `UPDATE children SET caregiver_id = $1 WHERE id = ANY($2::int[]) AND ($3::boolean OR daycare_id = $4) RETURNING id`,
        [caregiverId, childIds, isSuperAdmin, daycareId]
      );
      updatedCount += res.rowCount;
    }

    return { success: true, updated_count: updatedCount, caregiver_id: caregiverId };
  });
};

module.exports = {
  isParentLinked,
  listChildren,
  createChild,
  getChild,
  updateChild,
  addGuardian,
  getGuardians,
  removeGuardian,
  enrollFamily,
  assignCaregiver,
};
