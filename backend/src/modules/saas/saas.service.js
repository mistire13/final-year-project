'use strict';
/**
 * src/modules/saas/saas.service.js
 * SaaS multi-tenant governance, public daycare onboarding, and Super Admin business logic.
 *
 * SRS Refs: FR-UAM-09, FR-UAM-10, FR-UAM-11, FR-DB-09
 */

const bcrypt = require('bcryptjs');
const configuredDb = require('../../config/db');
const db = configuredDb.control || configuredDb;
const childCountsSource = configuredDb.control ? 'platform_child_census()'
  : "(SELECT daycare_id,count(*) AS child_count,count(*) FILTER(WHERE enrollment_status='active') AS active_child_count FROM children GROUP BY daycare_id)";
const logger = require('../../config/logger');
const { termsFor } = require('./subscriptions.service');
const Joi = require('joi');


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
 * Staged into daycare_applications table with status 'pending'.
 * Does NOT pollute primary 'daycares' or 'users' tables until Super Admin approves.
 */
const registerDaycare = async (data) => {
  const schema = Joi.object({
    daycareName: Joi.string().trim().min(2).max(200).optional(),
    daycare_name: Joi.string().trim().min(2).max(200).optional(),
    contactEmail: Joi.string().trim().email({ tlds: { allow: false } }).max(255).optional(),
    contact_email: Joi.string().trim().email({ tlds: { allow: false } }).max(255).optional(),
    contactPhone: Joi.string().trim().max(50).allow('').optional(),
    contact_phone: Joi.string().trim().max(50).allow('').optional(),
    address: Joi.string().trim().max(500).allow('').optional(),
    citySubcity: Joi.string().trim().max(500).allow('').optional(),
    city_subcity: Joi.string().trim().max(500).allow('').optional(),
    licenseNumber: Joi.string().trim().max(100).allow('').optional(),
    license_number: Joi.string().trim().max(100).allow('').optional(),
    adminName: Joi.string().trim().min(2).max(200).optional(),
    admin_name: Joi.string().trim().min(2).max(200).optional(),
    adminEmail: Joi.string().trim().email({ tlds: { allow: false } }).max(255).optional(),
    admin_email: Joi.string().trim().email({ tlds: { allow: false } }).max(255).optional(),
    adminPhone: Joi.string().trim().max(50).allow('').optional(),
    admin_phone: Joi.string().trim().max(50).allow('').optional(),
    adminPassword: Joi.string().min(4).max(72).optional(),
    admin_password: Joi.string().min(4).max(72).optional(),
    requestedPlan: Joi.string().valid('trial', 'standard', 'premium').default('standard'),
    requested_plan: Joi.string().valid('trial', 'standard', 'premium').optional(),
    billingCycle: Joi.string().valid('monthly', 'annual').default('monthly'),
    billing_cycle: Joi.string().valid('monthly', 'annual').optional(),
    termsVersion: Joi.number().integer().min(1).optional(),
  });

  const checked = schema.validate(data, { allowUnknown: true });
  if (checked.error) throw Object.assign(new Error(checked.error.details[0].message), { statusCode: 422 });

  const daycareName = checked.value.daycareName || checked.value.daycare_name;
  const contactEmail = checked.value.contactEmail || checked.value.contact_email;
  const contactPhone = checked.value.contactPhone || checked.value.contact_phone || 'N/A';
  const address = checked.value.address || checked.value.citySubcity || checked.value.city_subcity || 'Addis Ababa';
  const licenseNumber = checked.value.licenseNumber || checked.value.license_number || 'N/A';
  const adminName = checked.value.adminName || checked.value.admin_name;
  const adminEmail = checked.value.adminEmail || checked.value.admin_email;
  const adminPhone = checked.value.adminPhone || checked.value.admin_phone || contactPhone || 'N/A';
  const adminPassword = checked.value.adminPassword || checked.value.admin_password;
  const requestedPlan = checked.value.requested_plan || checked.value.requestedPlan || 'standard';

  if (!daycareName || !daycareName.trim()) {
    throw Object.assign(new Error('Daycare name is required.'), { statusCode: 422, status: 422 });
  }
  if (!contactEmail || !contactEmail.trim()) {
    throw Object.assign(new Error('Contact email is required.'), { statusCode: 422, status: 422 });
  }
  if (!adminName || !adminName.trim()) {
    throw Object.assign(new Error('Administrator name is required.'), { statusCode: 422, status: 422 });
  }
  if (!adminEmail || !adminEmail.trim()) {
    throw Object.assign(new Error('Administrator email is required.'), { statusCode: 422, status: 422 });
  }
  if (!adminPassword || adminPassword.length < 4) {
    throw Object.assign(new Error('Administrator password must be at least 4 characters.'), { statusCode: 422, status: 422 });
  }
  if (Buffer.byteLength(adminPassword, 'utf8') > 72) {
    throw Object.assign(new Error('Password must be at most 72 UTF-8 bytes.'), { statusCode: 422, status: 422 });
  }

  const normalizedAdminEmail = adminEmail.toLowerCase().trim();
  const normalizedContactEmail = contactEmail.toLowerCase().trim();

  // Check if admin email already exists in users
  const existingUser = await db.query('SELECT id FROM users WHERE LOWER(email) = $1', [normalizedAdminEmail]);
  if (existingUser.rows.length > 0) {
    throw Object.assign(new Error('An account with this administrator email is already registered.'), { statusCode: 409, status: 409 });
  }

  // Check if admin email already has an active or pending application
  const existingApp = await db.query('SELECT id FROM daycare_applications WHERE LOWER(admin_email) = $1 AND status = \'pending\'', [normalizedAdminEmail]);
  if (existingApp.rows.length > 0) {
    throw Object.assign(new Error('An application with this administrator email is already pending review.'), { statusCode: 409, status: 409 });
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const insertRes = await db.query(
    `INSERT INTO daycare_applications (
      daycare_name, city_subcity, contact_email, contact_phone, license_number,
      admin_name, admin_email, admin_phone, password_hash, requested_plan, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
    RETURNING *`,
    [
      daycareName.trim(),
      address.trim(),
      normalizedContactEmail,
      contactPhone.trim(),
      licenseNumber.trim(),
      adminName.trim(),
      normalizedAdminEmail,
      adminPhone.trim(),
      passwordHash,
      requestedPlan,
    ]
  );

  const app = insertRes.rows[0];
  logger.info(`New daycare application staged: "${app.daycare_name}" (Application ID: ${app.id})`);

  return {
    message: 'Registration submitted successfully. Awaiting Super Admin review and approval.',
    application: {
      id: app.id,
      daycare_name: app.daycare_name,
      admin_name: app.admin_name,
      admin_email: app.admin_email,
      status: app.status,
      created_at: app.created_at,
    },
    daycare: {
      id: app.id,
      name: app.daycare_name,
      slug: slugify(app.daycare_name),
      status: app.status,
    },
  };
};

/**
 * Super Admin: Platform-wide summary KPIs.
 */
const getPlatformStats = async () => {
  const [daycaresCount, pendingCount, activeCount, suspendedCount, childrenCount, usersCount, trialCount, standardCount, premiumCount] = await Promise.all([
    db.query('SELECT COUNT(*)::int AS count FROM daycares'),
    db.query("SELECT (SELECT COUNT(*)::int FROM daycares WHERE status = 'pending') + (SELECT COUNT(*)::int FROM daycare_applications WHERE status = 'pending') AS count"),
    db.query("SELECT COUNT(*)::int AS count FROM daycares WHERE status = 'active'"),
    db.query("SELECT COUNT(*)::int AS count FROM daycares WHERE status = 'suspended'"),
    db.query(`SELECT COALESCE(SUM(child_count),0)::int AS count FROM ${childCountsSource} counts`),
    db.query('SELECT COUNT(*)::int AS count FROM users'),
    db.query("SELECT COUNT(*)::int AS count FROM daycares WHERE subscription_status = 'trialing' AND status = 'active' AND trial_ends_at > NOW()"),
    db.query("SELECT COUNT(*)::int AS count FROM daycares WHERE subscription_plan = 'standard' AND status = 'active'"),
    db.query("SELECT COUNT(*)::int AS count FROM daycares WHERE subscription_plan = 'premium' AND status = 'active'"),
  ]);

  return {
    total_daycares: daycaresCount.rows[0].count,
    pending_approvals: pendingCount.rows[0].count,
    active_daycares: activeCount.rows[0].count,
    suspended_daycares: suspendedCount.rows[0].count,
    total_children: childrenCount.rows[0].count,
    total_users: usersCount.rows[0].count,
    active_trials: trialCount.rows[0].count,
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
      d.requested_plan,
      d.trial_ends_at,
      d.billing_cycle,d.subscription_status,d.subscription_terms,d.subscription_ends_at,
      d.max_children,
      d.created_at,
      d.updated_at,
      d.version,
      (SELECT name FROM users WHERE daycare_id = d.id AND role_id = 1 ORDER BY id ASC LIMIT 1) AS admin_name,
      (SELECT email FROM users WHERE daycare_id = d.id AND role_id = 1 ORDER BY id ASC LIMIT 1) AS admin_email,
      COALESCE(MAX(c.child_count),0)::int AS children_count,
      COALESCE(MAX(c.active_child_count),0)::int AS active_children_count,
      COUNT(DISTINCT u.id)::int AS staff_count
    FROM daycares d
    LEFT JOIN ${childCountsSource} c ON c.daycare_id = d.id
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

  // If requesting pending daycares or all, also include pending staged applications
  if (!status || status === 'pending' || status === 'all') {
    const appParams = [];
    let appSql = `
      SELECT 
        id,
        daycare_name AS name,
        LOWER(REGEXP_REPLACE(daycare_name, '[^a-zA-Z0-9]+', '-', 'g')) AS slug,
        contact_email,
        contact_phone,
        city_subcity AS address,
        license_number,
        status,
        requested_plan AS subscription_plan,
        requested_plan,
        NULL::timestamp with time zone AS trial_ends_at,
        'monthly' AS billing_cycle,
        'pending' AS subscription_status,
        NULL::jsonb AS subscription_terms,
        NULL::timestamp with time zone AS subscription_ends_at,
        100 AS max_children,
        created_at,
        updated_at,
        1 AS version,
        admin_name,
        admin_email,
        0 AS children_count,
        0 AS active_children_count,
        0 AS staff_count,
        true AS is_application
      FROM daycare_applications
      WHERE status = 'pending'
    `;
    if (search && search.trim()) {
      appParams.push(`%${search.trim().toLowerCase()}%`);
      appSql += ` AND (LOWER(daycare_name) LIKE $${appParams.length} OR LOWER(contact_email) LIKE $${appParams.length} OR LOWER(admin_email) LIKE $${appParams.length})`;
    }
    appSql += ` ORDER BY created_at DESC`;
    const appRes = await db.query(appSql, appParams);
    if (status === 'pending') {
      return [...appRes.rows, ...rows];
    }
    rows.unshift(...appRes.rows);
  }

  return rows;
};

/**
 * Super Admin: List daycare applications from staging table.
 */
const listApplications = async ({ status = 'all', search } = {}) => {
  let sql = `
    SELECT id, daycare_name, city_subcity, contact_email, contact_phone,
           license_number, admin_name, admin_email, admin_phone,
           requested_plan, status, rejection_reason, created_daycare_id,
           reviewed_by, reviewed_at, created_at, updated_at
    FROM daycare_applications
  `;
  const params = [];
  const whereClauses = [];

  if (status && status !== 'all') {
    params.push(status);
    whereClauses.push(`status = $${params.length}`);
  }

  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    whereClauses.push(`(LOWER(daycare_name) LIKE $${params.length} OR LOWER(admin_email) LIKE $${params.length} OR LOWER(contact_email) LIKE $${params.length})`);
  }

  if (whereClauses.length > 0) {
    sql += ` WHERE ${whereClauses.join(' AND ')}`;
  }

  sql += ` ORDER BY CASE WHEN status = 'pending' THEN 0 WHEN status = 'approved' THEN 1 ELSE 2 END, created_at DESC`;

  const { rows } = await db.query(sql, params);
  return rows;
};

/**
 * Super Admin: Get single daycare application details.
 */
const getApplicationById = async (id) => {
  const { rows } = await db.query(
    `SELECT id, daycare_name, city_subcity, contact_email, contact_phone,
            license_number, admin_name, admin_email, admin_phone,
            requested_plan, status, rejection_reason, created_daycare_id,
            reviewed_by, reviewed_at, created_at, updated_at
     FROM daycare_applications WHERE id = $1`,
    [id]
  );
  if (!rows[0]) {
    throw Object.assign(new Error('Daycare application not found.'), { statusCode: 404, status: 404 });
  }
  return rows[0];
};

/**
 * Super Admin: Approve staged application atomically.
 * Creates records in 'daycares' and 'users' only upon approval!
 */
const approveApplication = async (id, { trialDays = 30, plan } = {}, actorId) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const appRes = await client.query('SELECT * FROM daycare_applications WHERE id = $1 FOR UPDATE', [id]);
    const app = appRes.rows[0];
    if (!app) {
      throw Object.assign(new Error('Daycare application not found.'), { statusCode: 404, status: 404 });
    }
    if (app.status !== 'pending') {
      throw Object.assign(new Error(`Application is no longer pending (current status: ${app.status}).`), { statusCode: 409, status: 409 });
    }

    const assignedPlan = plan || app.requested_plan || 'standard';
    const trialPeriod = Number(trialDays) || 30;

    // Check if user email was registered in the meantime
    const existingUser = await client.query('SELECT id FROM users WHERE LOWER(email) = $1', [app.admin_email.toLowerCase()]);
    if (existingUser.rows.length > 0) {
      throw Object.assign(new Error('An account with this administrator email is already registered.'), { statusCode: 409, status: 409 });
    }

    // Generate unique slug
    let baseSlug = slugify(app.daycare_name) || 'daycare';
    let slug = baseSlug;
    const existingSlug = await client.query('SELECT id FROM daycares WHERE slug = $1', [slug]);
    if (existingSlug.rows.length > 0) {
      slug = `${baseSlug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    // Fetch subscription package terms
    const pkgRes = await client.query('SELECT * FROM subscription_packages WHERE code = $1', [assignedPlan]);
    const pkgOffer = pkgRes.rows[0];
    const maxChildren = pkgOffer?.max_children || (assignedPlan === 'premium' ? 150 : 50);
    const terms = pkgOffer ? termsFor(pkgOffer, 'monthly') : { code: assignedPlan, name: assignedPlan, max_children: maxChildren, trial_days: trialPeriod, currency: 'ETB', billing_cycle: 'monthly' };

    // 1. Insert into daycares
    const daycareRes = await client.query(
      `INSERT INTO daycares (
        name, slug, contact_email, contact_phone, address, license_number,
        status, subscription_plan, requested_plan, subscription_status, trial_ends_at, billing_cycle,
        subscription_terms, max_children, version
      ) VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $7, 'trialing', NOW() + ($8 || ' days')::interval, 'monthly', $9, $10, 1)
      RETURNING *`,
      [
        app.daycare_name,
        slug,
        app.contact_email,
        app.contact_phone,
        app.city_subcity,
        app.license_number,
        assignedPlan,
        `${trialPeriod}`,
        JSON.stringify(terms),
        maxChildren,
      ]
    );
    const newDaycare = daycareRes.rows[0];

    // 2. Insert into users (Admin account, active)
    const userRes = await client.query(
      `INSERT INTO users (
        name, email, password_hash, phone, role_id, status, daycare_id, profile_complete
      ) VALUES ($1, $2, $3, $4, 1, 'active', $5, true)
      RETURNING id, name, email, role_id, status, daycare_id`,
      [
        app.admin_name,
        app.admin_email.toLowerCase(),
        app.password_hash,
        app.admin_phone,
        newDaycare.id,
      ]
    );
    const newAdmin = userRes.rows[0];

    // 3. Update application status
    const updatedAppRes = await client.query(
      `UPDATE daycare_applications
       SET status = 'approved',
           created_daycare_id = $1,
           reviewed_by = $2,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [newDaycare.id, actorId || null, id]
    );

    // 4. Record audit log & subscription event
    await client.query(
      `INSERT INTO subscription_events (daycare_id, actor_id, action, reason, details, request_key)
       VALUES ($1, $2, 'trial_started', 'Daycare application approved', $3, $4)`,
      [newDaycare.id, actorId || null, JSON.stringify({ trial_days: trialPeriod, plan: assignedPlan }), `app-approval-${id}`]
    );

    await client.query(
      `INSERT INTO audit_logs (actor_id, action, target_table, target_id, daycare_id, metadata)
       VALUES ($1, 'DAYCARE_APPLICATION_APPROVED', 'daycares', $2, $2, $3)`,
      [actorId || newAdmin.id, newDaycare.id, JSON.stringify({ application_id: id })]
    );

    await client.query('COMMIT');
    logger.info(`Daycare application ${id} approved by ${actorId}. Created daycare ${newDaycare.id} and admin ${newAdmin.id}`);

    return {
      message: 'Daycare application approved and activated successfully.',
      daycare: newDaycare,
      admin: newAdmin,
      application: updatedAppRes.rows[0],
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Super Admin: Reject staged application.
 */
const rejectApplication = async (id, reason, actorId) => {
  const note = typeof reason === 'string' ? reason.trim() : '';
  if (note.length < 5 || note.length > 2000) {
    throw Object.assign(new Error('Provide a review reason of at least 5 characters.'), { statusCode: 422, status: 422 });
  }

  const { rows } = await db.query(
    `UPDATE daycare_applications
     SET status = 'rejected',
         rejection_reason = $1,
         reviewed_by = $2,
         reviewed_at = NOW(),
         updated_at = NOW()
     WHERE id = $3 AND status = 'pending'
     RETURNING *`,
    [note, actorId || null, id]
  );

  if (!rows[0]) {
    throw Object.assign(new Error('This application is no longer pending review.'), { statusCode: 409, status: 409 });
  }

  if (actorId) {
    await db.query(
      `INSERT INTO audit_logs (actor_id, action, target_table, target_id, metadata)
       VALUES ($1, 'DAYCARE_APPLICATION_REJECTED', 'daycares', $2, $3)`,
      [actorId, id, JSON.stringify({ reason: note })]
    );
  }

  logger.info(`Daycare application ${id} rejected by ${actorId}`);
  return rows[0];
};

/**
 * Super Admin: Purge rejected application to prevent database bloat.
 */
const purgeApplication = async (id, actorId) => {
  const { rows } = await db.query(
    `DELETE FROM daycare_applications WHERE id = $1 AND status = 'rejected' RETURNING id, daycare_name`,
    [id]
  );
  if (!rows[0]) {
    throw Object.assign(new Error('Only rejected applications can be purged, or application was not found.'), { statusCode: 400, status: 400 });
  }

  if (actorId) {
    await db.query(
      `INSERT INTO audit_logs (actor_id, action, target_table, target_id, metadata)
       VALUES ($1, 'DAYCARE_APPLICATION_PURGED', 'daycares', $2, $3)`,
      [actorId, id, JSON.stringify({ daycare_name: rows[0].daycare_name })]
    );
  }

  return { message: 'Rejected application purged successfully.', purged_id: id };
};

/**
 * Super Admin: Get single daycare detailed breakdown.
 */
const getDaycareById = async (id) => {
  const { rows } = await db.query(
    `SELECT d.*, 
            (SELECT name FROM users WHERE daycare_id = d.id AND role_id = 1 ORDER BY id ASC LIMIT 1) AS admin_name,
            (SELECT email FROM users WHERE daycare_id = d.id AND role_id = 1 ORDER BY id ASC LIMIT 1) AS admin_email,
            COALESCE(MAX(c.child_count),0)::int AS children_count,
            COALESCE(MAX(c.active_child_count),0)::int AS active_children_count,
            COUNT(DISTINCT u.id)::int AS staff_count
     FROM daycares d
     LEFT JOIN ${childCountsSource} c ON c.daycare_id = d.id
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
 * Automatically delegates to staged applications if id matches an application.
 */
const approveDaycare = async (id, { trialDays, plan } = {}, actorId) => {
  // 1. Check if id is an application in daycare_applications
  const appCheck = await db.query('SELECT id, status FROM daycare_applications WHERE id = $1', [id]);
  if (appCheck.rows.length > 0 && appCheck.rows[0].status === 'pending') {
    const result = await approveApplication(id, { trialDays, plan }, actorId);
    return result.daycare;
  }

  // 2. Fallback to existing daycares table approval
  const application=(await db.query('SELECT * FROM daycares WHERE id=$1',[id])).rows[0];
  if(!application || application.status!=='pending') throw Object.assign(new Error('This application is no longer pending.'),{statusCode:409});
  const accepted=application.subscription_terms;
  if(accepted) {
    if((plan!==undefined && plan!==accepted.code)||(trialDays!==undefined && Number(trialDays)!==accepted.trial_days)) throw Object.assign(new Error('Approval must retain the package and trial terms accepted by the applicant.'),{statusCode:422});
    plan=accepted.code;trialDays=accepted.trial_days;
  } else {plan=plan || application.requested_plan || 'standard';if(plan==='trial')plan='standard';trialDays=trialDays || 30;}
  if (!['trial', 'standard', 'premium'].includes(plan) || !Number.isInteger(Number(trialDays)) || Number(trialDays) < 1 || Number(trialDays) > 180) {
    throw Object.assign(new Error('Choose a valid plan and trial length between 1 and 180 days.'), { statusCode: 422 });
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const locked=(await client.query('SELECT * FROM daycares WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!locked || locked.status!=='pending' || locked.version!==application.version) throw Object.assign(new Error('Application changed. Refresh before approval.'),{statusCode:409});

    const daycareRes = await client.query(
      `UPDATE daycares
       SET status = 'active',
           subscription_plan = $2,
           subscription_status = 'trialing',
           trial_ends_at = NOW() + ($3 || ' days')::interval,
           updated_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [id, plan, `${trialDays}`]
    );

    if (!daycareRes.rows[0]) {
      const err = new Error('This application is no longer pending. Refresh before reviewing it again.');
      err.status = 409;
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
    await client.query(`INSERT INTO subscription_events(daycare_id,actor_id,action,reason,details,request_key)
      VALUES($1,$2,'trial_started','Daycare application approved',$3,$4)`,[id,actorId,JSON.stringify({terms:accepted || null,trial_days:trialDays}),`approval-${id}`]);
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
  // Check if id is an application in daycare_applications
  const appCheck = await db.query('SELECT id, status FROM daycare_applications WHERE id = $1', [id]);
  if (appCheck.rows.length > 0 && appCheck.rows[0].status === 'pending') {
    return await rejectApplication(id, reason, actorId);
  }

  const note = typeof reason === 'string' ? reason.trim() : '';
  if (note.length < 12 || note.length > 2000) throw Object.assign(new Error('Provide a review reason between 12 and 2000 characters.'), { statusCode: 422 });
  return changeDaycareStatus(id, 'pending', 'rejected', 'DAYCARE_REJECTED', actorId, { reason: note }, true);
};

// A lifecycle transition, account restriction and its evidence must commit together.
async function changeDaycareStatus(id, expected, status, action, actorId, metadata = {}, deactivateAdmin = false) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'UPDATE daycares SET status=$2,updated_at=NOW() WHERE id=$1 AND status=$3 RETURNING *', [id, status, expected]
    );
    if (!rows[0]) throw Object.assign(new Error(`Daycare is no longer ${expected}. Refresh before trying again.`), { statusCode: 409 });
    if (deactivateAdmin) await client.query("UPDATE users SET status='inactive' WHERE daycare_id=$1 AND role_id=1", [id]);
    await client.query(
      "INSERT INTO audit_logs(actor_id,action,target_table,target_id,daycare_id,metadata) VALUES($1,$2,'daycares',$3,$3,$4)",
      [actorId, action, id, JSON.stringify(metadata)]
    );
    await client.query('COMMIT');
    return rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

/**
 * Super Admin: Suspend an active daycare center.
 */
const suspendDaycare = async (id, actorId) => {
  return changeDaycareStatus(id, 'active', 'suspended', 'DAYCARE_SUSPENDED', actorId);
};

/**
 * Super Admin: Reactivate a suspended daycare center.
 */
const activateDaycare = async (id, actorId) => {
  return changeDaycareStatus(id, 'suspended', 'active', 'DAYCARE_REACTIVATED', actorId);
};

/**
 * Keep the former impersonation endpoint closed, including internal callers.
 */
const impersonateDaycare = async () => {
  throw Object.assign(new Error('Platform operators cannot impersonate daycare accounts.'), { statusCode: 403 });
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

  const pageSize = Math.min(100,Math.max(1,parseInt(limit,10)||50));
  const pageOffset = Math.max(0,parseInt(offset,10)||0);
  const {rows:[count]} = await db.query(`SELECT COUNT(*)::int AS total FROM (${sql}) directory`,params);
  sql += ` ORDER BY u.created_at DESC, u.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(pageSize,pageOffset);

  const { rows } = await db.query(sql, params);
  return {data:rows,total:count.total,limit:pageSize,offset:pageOffset};
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
        (SELECT COALESCE(SUM(child_count),0) FROM ${childCountsSource} counts) AS children_count,
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
      tenant_isolation: 'Tenant policies configured; this endpoint does not run isolation acceptance tests',
      rbac_enforced: true,
      jwt_state_revocation: true,
      pickup_biometrics: 'Device integration unavailable; approved manual verification only',
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

  listApplications,
  getApplicationById,
  approveApplication,
  rejectApplication,
  purgeApplication,

  impersonateDaycare,
  getBroadcast,
  setBroadcast,
  listUsers,
  listAuditLogs,
  getSystemHealth,
};
