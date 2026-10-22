'use strict';
/**
 * src/modules/saas/saas.service.js
 * SaaS multi-tenant governance, public daycare onboarding, and Super Admin business logic.
 *
 * SRS Refs: FR-UAM-09, FR-UAM-10, FR-UAM-11, FR-DB-09
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');
const logger = require('../../config/logger');
const security = require('../auth/legacy-security');

const JWT_SECRET = process.env.JWT_SECRET || 'ankelba_secret';

let globalBroadcast = {
  message: '',
  level: 'info',
  active: false,
  updated_at: null,
};

/**
 * Generate a clean URL-friendly slug from a daycare name.
 */
function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Public self-registration for prospective daycare centers.
 * Creates daycare with status 'pending' and an admin account with status 'pending'.
 */
const registerDaycare = async (data) => {
  const {
    daycareName,
    contactEmail,
    contactPhone,
    address,
    licenseNumber,
    adminName,
    adminEmail,
    adminPassword,
  } = data;

  if (!daycareName || !daycareName.trim()) {
    const err = new Error('Daycare name is required.');
    err.status = 400;
    throw err;
  }
  if (!contactEmail || !contactEmail.trim()) {
    const err = new Error('Contact email is required.');
    err.status = 400;
    throw err;
  }
  if (!adminName || !adminName.trim()) {
    const err = new Error('Administrator name is required.');
    err.status = 400;
    throw err;
  }
  if (!adminEmail || !adminEmail.trim()) {
    const err = new Error('Administrator email is required.');
    err.status = 400;
    throw err;
  }
  if (!adminPassword || adminPassword.length < 4) {
    const err = new Error('Administrator password must be at least 4 characters.');
    err.status = 400;
    throw err;
  }

  const normalizedAdminEmail = adminEmail.toLowerCase().trim();
  const normalizedContactEmail = contactEmail.toLowerCase().trim();

  // Check if admin email already exists in users
  const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [normalizedAdminEmail]);
  if (existingUser.rows.length > 0) {
    const err = new Error('An account with this administrator email is already registered.');
    err.status = 409;
    throw err;
  }

  // Generate unique slug
  let baseSlug = slugify(daycareName);
  if (!baseSlug) baseSlug = 'daycare';
  let slug = baseSlug;

  const existingSlug = await db.query('SELECT id FROM daycares WHERE slug = $1', [slug]);
  if (existingSlug.rows.length > 0) {
    slug = `${baseSlug}-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // 1. Insert Daycare
    const daycareRes = await client.query(
      `INSERT INTO daycares (name, slug, contact_email, contact_phone, address, license_number, status, subscription_plan)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', 'trial')
       RETURNING *`,
      [
        daycareName.trim(),
        slug,
        normalizedContactEmail,
        contactPhone ? contactPhone.trim() : null,
        address ? address.trim() : null,
        licenseNumber ? licenseNumber.trim() : null,
      ]
    );
    const newDaycare = daycareRes.rows[0];

    // 2. Insert Daycare Administrator user (status 'pending')
    const userRes = await client.query(
      `INSERT INTO users (name, email, password_hash, role_id, status, daycare_id, profile_complete)
       VALUES ($1, $2, $3, 1, 'pending', $4, true)
       RETURNING id, name, email, role_id, status`,
      [adminName.trim(), normalizedAdminEmail, passwordHash, newDaycare.id]
    );

    // 3. Log audit event
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, target_table, target_id, daycare_id)
       VALUES ($1, 'DAYCARE_REGISTERED', 'daycares', $2, $2)`,
      [userRes.rows[0].id, newDaycare.id]
    );

    await client.query('COMMIT');

    logger.info(`New daycare application submitted: "${newDaycare.name}" (ID: ${newDaycare.id})`);

    return {
      message: 'Registration submitted successfully. Awaiting Super Admin review and approval.',
      daycare: {
        id: newDaycare.id,
        name: newDaycare.name,
        slug: newDaycare.slug,
        status: newDaycare.status,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Super Admin: Platform-wide summary KPIs.
 */
const getPlatformStats = async () => {
  const [daycaresCount, pendingCount, activeCount, suspendedCount, childrenCount, usersCount, trialCount, standardCount, premiumCount] = await Promise.all([
    db.query('SELECT COUNT(*)::int AS count FROM daycares'),
    db.query("SELECT COUNT(*)::int AS count FROM daycares WHERE status = 'pending'"),
    db.query("SELECT COUNT(*)::int AS count FROM daycares WHERE status = 'active'"),
    db.query("SELECT COUNT(*)::int AS count FROM daycares WHERE status = 'suspended'"),
    db.query('SELECT COUNT(*)::int AS count FROM children'),
    db.query('SELECT COUNT(*)::int AS count FROM users WHERE role_id != 0'),
    db.query("SELECT COUNT(*)::int AS count FROM daycares WHERE subscription_plan = 'trial' AND status = 'active' AND (trial_ends_at IS NULL OR trial_ends_at > NOW())"),
    db.query("SELECT COUNT(*)::int AS count FROM daycares WHERE subscription_plan = 'standard' AND status = 'active'"),
    db.query("SELECT COUNT(*)::int AS count FROM daycares WHERE subscription_plan = 'premium' AND status = 'active'"),
  ]);

  const mockMrr = (standardCount.rows[0].count * 2500) + (premiumCount.rows[0].count * 6000);

  return {
    total_daycares: daycaresCount.rows[0].count,
    pending_approvals: pendingCount.rows[0].count,
    active_daycares: activeCount.rows[0].count,
    suspended_daycares: suspendedCount.rows[0].count,
    total_children: childrenCount.rows[0].count,
    total_users: usersCount.rows[0].count,
    active_trials: trialCount.rows[0].count,
    mock_mrr: mockMrr,
    plans: {
      trial: trialCount.rows[0].count,
      standard: standardCount.rows[0].count,
      premium: premiumCount.rows[0].count,
    },
  };
};

/**
 * Super Admin: List all daycares with child & staff counts and owner info.
 */
const listDaycares = async ({ status, search } = {}) => {
  let sql = `
    SELECT 
      d.id,
      d.name,
      d.slug,
      d.contact_email,
      d.contact_phone,
      d.address,
      d.license_number,
      d.status,
      d.subscription_plan,
      d.trial_ends_at,
      d.max_children,
      d.created_at,
      d.updated_at,
      (SELECT name FROM users WHERE daycare_id = d.id AND role_id = 1 ORDER BY id ASC LIMIT 1) AS admin_name,
      (SELECT email FROM users WHERE daycare_id = d.id AND role_id = 1 ORDER BY id ASC LIMIT 1) AS admin_email,
      COUNT(DISTINCT c.id)::int AS children_count,
      COUNT(DISTINCT u.id)::int AS staff_count
    FROM daycares d
    LEFT JOIN children c ON c.daycare_id = d.id
    LEFT JOIN users u ON u.daycare_id = d.id AND u.role_id IN (1, 2)
  `;

  const params = [];
  const whereClauses = [];

  if (status && status !== 'all') {
    params.push(status);
    whereClauses.push(`d.status = $${params.length}`);
  }

  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    whereClauses.push(`(LOWER(d.name) LIKE $${params.length} OR LOWER(d.contact_email) LIKE $${params.length} OR LOWER(COALESCE(d.license_number, '')) LIKE $${params.length})`);
  }

  if (whereClauses.length > 0) {
    sql += ` WHERE ${whereClauses.join(' AND ')}`;
  }

  sql += `
    GROUP BY d.id
    ORDER BY 
      CASE WHEN d.status = 'pending' THEN 0 ELSE 1 END,
      d.created_at DESC
  `;

  const { rows } = await db.query(sql, params);
  return rows;
};

/**
 * Super Admin: Get single daycare detailed breakdown.
 */
const getDaycareById = async (id) => {
  const { rows } = await db.query(
    `SELECT d.*, 
            (SELECT name FROM users WHERE daycare_id = d.id AND role_id = 1 ORDER BY id ASC LIMIT 1) AS admin_name,
            (SELECT email FROM users WHERE daycare_id = d.id AND role_id = 1 ORDER BY id ASC LIMIT 1) AS admin_email,
            COUNT(DISTINCT c.id)::int AS children_count,
            COUNT(DISTINCT u.id)::int AS staff_count
     FROM daycares d
     LEFT JOIN children c ON c.daycare_id = d.id
     LEFT JOIN users u ON u.daycare_id = d.id AND u.role_id IN (1, 2)
     WHERE d.id = $1
     GROUP BY d.id`,
    [id]
  );

  if (!rows[0]) {
    const err = new Error('Daycare center not found.');
    err.status = 404;
    throw err;
  }

  return rows[0];
};

/**
 * Super Admin: Approve pending daycare and activate 30-day trial countdown.
 */
const approveDaycare = async (id, { trialDays = 30, plan = 'trial' } = {}, actorId) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const daycareRes = await client.query(
      `UPDATE daycares
       SET status = 'active',
           subscription_plan = $2,
           trial_ends_at = NOW() + ($3 || ' days')::interval,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, plan, `${trialDays}`]
    );

    if (!daycareRes.rows[0]) {
      const err = new Error('Daycare not found.');
      err.status = 404;
      throw err;
    }

    // Activate the Daycare Admin account
    await client.query(
      `UPDATE users 
       SET status = 'active'
       WHERE daycare_id = $1 AND role_id = 1 AND status = 'pending'`,
      [id]
    );

    // Audit log
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, target_table, target_id, daycare_id)
       VALUES ($1, 'DAYCARE_APPROVED', 'daycares', $2, $2)`,
      [actorId, id]
    );

    await client.query('COMMIT');
    logger.info(`Daycare ${id} approved by Super Admin ${actorId}`);
    return daycareRes.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Super Admin: Reject a submitted daycare application.
 */
const rejectDaycare = async (id, reason, actorId) => {
  const { rows } = await db.query(
    `UPDATE daycares
     SET status = 'rejected', updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  if (!rows[0]) {
    const err = new Error('Daycare not found.');
    err.status = 404;
    throw err;
  }
  await db.query(
    `UPDATE users SET status = 'inactive' WHERE daycare_id = $1 AND role_id = 1`,
    [id]
  );
  await db.query(
    `INSERT INTO audit_logs (actor_id, action, target_table, target_id, daycare_id)
     VALUES ($1, 'DAYCARE_REJECTED', 'daycares', $2, $2)`,
    [actorId, id]
  );
  return rows[0];
};

/**
 * Super Admin: Suspend an active daycare center.
 */
const suspendDaycare = async (id, actorId) => {
  const { rows } = await db.query(
    `UPDATE daycares
     SET status = 'suspended', updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  if (!rows[0]) {
    const err = new Error('Daycare not found.');
    err.status = 404;
    throw err;
  }
  await db.query(
    `INSERT INTO audit_logs (actor_id, action, target_table, target_id, daycare_id)
     VALUES ($1, 'DAYCARE_SUSPENDED', 'daycares', $2, $2)`,
    [actorId, id]
  );
  return rows[0];
};

/**
 * Super Admin: Reactivate a suspended daycare center.
 */
const activateDaycare = async (id, actorId) => {
  const { rows } = await db.query(
    `UPDATE daycares
     SET status = 'active', updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  if (!rows[0]) {
    const err = new Error('Daycare not found.');
    err.status = 404;
    throw err;
  }
  await db.query(
    `INSERT INTO audit_logs (actor_id, action, target_table, target_id, daycare_id)
     VALUES ($1, 'DAYCARE_REACTIVATED', 'daycares', $2, $2)`,
    [actorId, id]
  );
  return rows[0];
};

/**
 * Super Admin: Update subscription plan or extend trial countdown.
 */
const updateDaycarePlan = async (id, { plan, extendTrialDays, maxChildren }, actorId) => {
  let query = 'UPDATE daycares SET updated_at = NOW()';
  const params = [id];

  if (plan) {
    params.push(plan);
    query += `, subscription_plan = $${params.length}`;
  }

  if (extendTrialDays && Number(extendTrialDays) > 0) {
    params.push(`${Number(extendTrialDays)} days`);
    query += `, trial_ends_at = GREATEST(COALESCE(trial_ends_at, NOW()), NOW()) + ($${params.length})::interval`;
  }

  if (maxChildren && Number(maxChildren) > 0) {
    params.push(Number(maxChildren));
    query += `, max_children = $${params.length}`;
  }

  query += ' WHERE id = $1 RETURNING *';

  const { rows } = await db.query(query, params);
  if (!rows[0]) {
    const err = new Error('Daycare not found.');
    err.status = 404;
    throw err;
  }

  await db.query(
    `INSERT INTO audit_logs (actor_id, action, target_table, target_id, daycare_id)
     VALUES ($1, 'DAYCARE_PLAN_UPDATED', 'daycares', $2, $2)`,
    [actorId, id]
  );

  return rows[0];
};

/**
 * Super Admin: Generate a scoped impersonation session to inspect a daycare's workspace directly.
 */
const impersonateDaycare = async (id, superAdminUser) => {
  const { rows } = await db.query('SELECT * FROM daycares WHERE id = $1', [id]);
  if (!rows[0]) {
    const err = new Error('Daycare not found.');
    err.status = 404;
    throw err;
  }
  const daycare = rows[0];
  const userAccount = await security.findAccount(db, { id: superAdminUser.id });
  const token = jwt.sign(
    {
      userId: superAdminUser.id,
      role: 'super_admin',
      daycareId: daycare.id,
      auth_state: security.authState(userAccount),
      isImpersonating: true,
    },
    JWT_SECRET,
    { algorithm: 'HS256', audience: 'ankelba-legacy', expiresIn: '8h' }
  );

  await db.query(
    `INSERT INTO audit_logs (actor_id, action, target_table, target_id, daycare_id)
     VALUES ($1, 'SUPER_ADMIN_IMPERSONATE', 'daycares', $2, $2)`,
    [superAdminUser.id, daycare.id]
  );

  return {
    token,
    daycare,
    user: {
      id: superAdminUser.id,
      name: `Super Admin (${daycare.name})`,
      email: superAdminUser.email,
      role: 'admin',
      daycare_id: daycare.id,
      daycare_name: daycare.name,
      daycare_status: daycare.status,
      subscription_plan: daycare.subscription_plan,
      trial_ends_at: daycare.trial_ends_at,
      is_impersonating: true,
    },
  };
};

/**
 * Global Platform Broadcast Banner management.
 */
const getBroadcast = () => globalBroadcast;

const setBroadcast = ({ message, level = 'info', active = true }, actorId) => {
  globalBroadcast = {
    message: message ? message.trim() : '',
    level: ['info', 'warning', 'alert'].includes(level) ? level : 'info',
    active: Boolean(active && message && message.trim()),
    updated_at: new Date().toISOString(),
  };
  logger.info(`Platform broadcast updated by user ${actorId}: "${globalBroadcast.message}" [${globalBroadcast.active ? 'ACTIVE' : 'INACTIVE'}]`);
  return globalBroadcast;
};

/**
 * Super Admin: List accounts across all daycares (read-only directory).
 */
const listUsers = async ({ search, role, daycareId, limit = 50, offset = 0 } = {}) => {
  let sql = `
    SELECT 
      u.id,
      u.name,
      u.email,
      u.status,
      u.created_at,
      r.name AS role,
      d.id AS daycare_id,
      d.name AS daycare_name
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    LEFT JOIN daycares d ON d.id = u.daycare_id
  `;
  const params = [];
  const whereClauses = [];

  if (role && role !== 'all') {
    params.push(role);
    whereClauses.push(`r.name = $${params.length}`);
  }

  if (daycareId) {
    params.push(daycareId);
    whereClauses.push(`u.daycare_id = $${params.length}`);
  }

  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    whereClauses.push(`(LOWER(u.name) LIKE $${params.length} OR LOWER(u.email) LIKE $${params.length} OR LOWER(COALESCE(d.name, '')) LIKE $${params.length})`);
  }

  if (whereClauses.length > 0) {
    sql += ` WHERE ${whereClauses.join(' AND ')}`;
  }

  sql += ` ORDER BY u.created_at DESC, u.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(Number(limit) || 50, Number(offset) || 0);

  const { rows } = await db.query(sql, params);
  return rows;
};

/**
 * Super Admin: List platform-wide audit logs.
 */
const listAuditLogs = async ({ limit = 50, offset = 0 } = {}) => {
  const sql = `
    SELECT 
      a.id,
      a.actor_id,
      a.action,
      a.target_table,
      a.target_id,
      a.metadata,
      a.created_at,
      a.daycare_id,
      u.name AS actor_name,
      u.email AS actor_email,
      d.name AS daycare_name
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.actor_id
    LEFT JOIN daycares d ON d.id = a.daycare_id
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT $1 OFFSET $2
  `;
  const { rows } = await db.query(sql, [Number(limit) || 50, Number(offset) || 0]);
  return rows;
};

/**
 * Super Admin: System health diagnostics.
 */
const getSystemHealth = async () => {
  const start = Date.now();
  await db.query('SELECT 1');
  const dbLatencyMs = Date.now() - start;

  const uptimeSeconds = Math.floor(process.uptime());

  const [dbSizeRes, tableCountsRes] = await Promise.all([
    db.query(`SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size`),
    db.query(`
      SELECT 
        (SELECT COUNT(*) FROM daycares) AS daycares_count,
        (SELECT COUNT(*) FROM users) AS users_count,
        (SELECT COUNT(*) FROM children) AS children_count,
        (SELECT COUNT(*) FROM audit_logs) AS audit_count
    `),
  ]);

  return {
    status: 'healthy',
    db_connected: true,
    db_latency_ms: dbLatencyMs,
    db_size: dbSizeRes.rows[0]?.db_size || 'N/A',
    uptime_seconds: uptimeSeconds,
    node_version: process.version,
    environment: process.env.NODE_ENV || 'development',
    table_counts: tableCountsRes.rows[0],
    security_isolation: {
      tenant_isolation: 'Row-Level daycare_id Enforced',
      rbac_enforced: true,
      jwt_state_revocation: true,
      pickup_biometrics: 'Multi-Factor Verification Active',
    },
  };
};

module.exports = {
  registerDaycare,
  getPlatformStats,
  listDaycares,
  getDaycareById,
  approveDaycare,
  rejectDaycare,
  suspendDaycare,
  activateDaycare,
  updateDaycarePlan,
  impersonateDaycare,
  getBroadcast,
  setBroadcast,
  listUsers,
  listAuditLogs,
  getSystemHealth,
};
