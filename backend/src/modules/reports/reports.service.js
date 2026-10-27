'use strict';
/**
 * src/modules/reports/reports.service.js
 * Business logic for Daily Activity Reporting & Completion Monitoring.
 * SRS Refs: FR-DAR-01–08, FR-RPT-01–06, UC-06
 * Architecture Plan: §6.2 Query 3 & 6
 */
const db = require('../../config/db');
const { writeAudit } = require('../../utils/auditedWrite');
const { isParentLinked } = require('../children/children.service');

/**
 * Submit daily activity report in a database transaction.
 */
const createReport = async (body, user) => {
  const childId = parseInt(body.child_id, 10);
  const reportDate = body.report_date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Addis_Ababa', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  // 1. Verify child exists & belongs to daycare & check caregiver assignment
  const { rows: childRows } = await db.query(
    `SELECT id, caregiver_id, daycare_id FROM children WHERE id = $1`,
    [childId]
  );
  if (childRows.length === 0) {
    const err = new Error('Child profile not found');
    err.statusCode = 404;
    throw err;
  }

  const child = childRows[0];
  if ((!user?.daycare_id || child.daycare_id !== user.daycare_id)) {
    const err = new Error('Child profile not found');
    err.statusCode = 404;
    throw err;
  }

  if (user.role === 'caregiver' && child.caregiver_id !== user.id) {
    const err = new Error('Access denied: You are not assigned to this child');
    err.statusCode = 403;
    throw err;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // 2. Insert daily report header stamped with child's daycare_id
    const insertHeaderSql = `
      INSERT INTO daily_reports
        (child_id, caregiver_id, report_date, sleep_duration_min, sleep_notes, mood, behavior_notes, general_observations, daycare_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const headerVals = [
      childId,
      user.id,
      reportDate,
      body.sleep_duration_min ?? null,
      body.sleep_notes || null,
      body.mood || null,
      body.behavior_notes || null,
      body.general_observations || null,
      child.daycare_id,
    ];

    let reportHeader;
    try {
      const headerRes = await client.query(insertHeaderSql, headerVals);
      reportHeader = headerRes.rows[0];
    } catch (dbErr) {
      if (dbErr.code === '23505') {
        const dupErr = new Error(`A daily report for this child on ${reportDate} already exists`);
        dupErr.statusCode = 409;
        throw dupErr;
      }
      throw dbErr;
    }

    // 3. Insert report meals
    const meals = [];
    if (Array.isArray(body.meals) && body.meals.length > 0) {
      for (const m of body.meals) {
        const mealRes = await client.query(
          `INSERT INTO report_meals (report_id, meal_type, description, portion)
           VALUES ($1, $2, $3, $4)
           RETURNING id, meal_type, description, portion`,
          [reportHeader.id, m.meal_type, m.description, m.portion || null]
        );
        meals.push(mealRes.rows[0]);
      }
    }

    // 4. Insert report activities
    const activities = [];
    if (Array.isArray(body.activities) && body.activities.length > 0) {
      for (const a of body.activities) {
        const actRes = await client.query(
          `INSERT INTO report_activities (report_id, activity_type, description, location)
           VALUES ($1, $2, $3, $4)
           RETURNING id, activity_type, description, location`,
          [reportHeader.id, a.activity_type, a.description, a.location || null]
        );
        activities.push(actRes.rows[0]);
      }
    }

    await writeAudit(client,user,'DAILY_REPORT_CREATED','daily_reports',reportHeader.id,{child_id:childId,report_date:reportDate});
    await client.query('COMMIT');

    return {
      ...reportHeader,
      meals,
      activities,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Fetch detailed daily report using 3-query pattern.
 */
const getReport = async (reportIdParam, user) => {
  const reportId = parseInt(reportIdParam, 10);

  // Query 1: Header + caregiver & child names
  const { rows: headerRows } = await db.query(
    `SELECT dr.*, u.name AS caregiver_name, c.full_name AS child_name, c.daycare_id AS child_daycare_id, c.caregiver_id AS child_caregiver_id
     FROM daily_reports dr
     JOIN users u ON u.id = dr.caregiver_id
     JOIN children c ON c.id = dr.child_id
     WHERE dr.id = $1`,
    [reportId]
  );

  if (headerRows.length === 0) {
    const err = new Error('Daily report not found');
    err.statusCode = 404;
    throw err;
  }

  const report = headerRows[0];
  const reportDaycareId = report.daycare_id || report.child_daycare_id;
  if ((!user?.daycare_id || reportDaycareId !== user.daycare_id)) {
    const err = new Error('Daily report not found');
    err.statusCode = 404;
    throw err;
  }

  // RBAC checks
  if (user.role === 'parent') {
    const linked = await isParentLinked(user.id, report.child_id);
    if (!linked) {
      const err = new Error('Access denied: You are not linked to this child record');
      err.statusCode = 403;
      throw err;
    }
  } else if (user.role === 'caregiver' && report.child_caregiver_id !== user.id) {
    const err = new Error('Access denied: You are not assigned to this child');
    err.statusCode = 403;
    throw err;
  }

  // Query 2: Meals
  const { rows: meals } = await db.query(
    `SELECT id, meal_type, description, portion FROM report_meals WHERE report_id = $1 ORDER BY id ASC`,
    [reportId]
  );

  // Query 3: Activities
  const { rows: activities } = await db.query(
    `SELECT id, activity_type, description, location FROM report_activities WHERE report_id = $1 ORDER BY id ASC`,
    [reportId]
  );

  return {
    ...report,
    meals,
    activities,
  };
};

/**
 * List daily reports history for a child.
 */
const getChildReports = async (childIdParam, query = {}, user) => {
  const childId = parseInt(childIdParam, 10);

  const { rows: childRows } = await db.query(
    `SELECT id, caregiver_id, daycare_id FROM children WHERE id = $1`,
    [childId]
  );
  if (childRows.length === 0) {
    const err = new Error('Child profile not found');
    err.statusCode = 404;
    throw err;
  }

  const child = childRows[0];
  if ((!user?.daycare_id || child.daycare_id !== user.daycare_id)) {
    const err = new Error('Child profile not found');
    err.statusCode = 404;
    throw err;
  }

  if (user.role === 'parent') {
    const linked = await isParentLinked(user.id, childId);
    if (!linked) {
      const err = new Error('Access denied: You are not linked to this child record');
      err.statusCode = 403;
      throw err;
    }
  } else if (user.role === 'caregiver' && child.caregiver_id !== user.id) {
    const err = new Error('Access denied: You are not assigned to this child');
    err.statusCode = 403;
    throw err;
  }

  const startDate = query.startDate || null;
  const endDate = query.endDate || null;

  const { rows } = await db.query(
    `SELECT dr.id, dr.child_id, dr.report_date, dr.mood, dr.sleep_duration_min, dr.submitted_at, dr.daycare_id,
            u.name AS caregiver_name
     FROM daily_reports dr
     JOIN users u ON u.id = dr.caregiver_id
     WHERE dr.child_id = $1
       AND ($2::date IS NULL OR dr.report_date >= $2::date)
       AND ($3::date IS NULL OR dr.report_date <= $3::date)
     ORDER BY dr.report_date DESC`,
    [childId, startDate, endDate]
  );

  return { data: rows };
};

/**
 * Admin Caregiver Completion Monitor (Architecture Plan §6.2 Query 6).
 */
const listReports = async (query = {}, user) => {
  const targetDate = query.date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Addis_Ababa', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const isSuper = user && user.role === 'super_admin';
  const daycareId = user?.daycare_id || null;

  const { rows: monitor } = await db.query(
    `SELECT u.id AS caregiver_id, u.name AS caregiver_name,
            COUNT(c.id)::integer AS assigned_children,
            COUNT(dr.id)::integer AS reports_submitted,
            (COUNT(c.id) - COUNT(dr.id))::integer AS reports_missing
     FROM users u
     LEFT JOIN children c ON c.caregiver_id = u.id AND c.enrollment_status = 'active'
     LEFT JOIN daily_reports dr ON dr.child_id = c.id AND dr.report_date = $1::date
     WHERE u.role_id = (SELECT id FROM roles WHERE name = 'caregiver')
       AND u.status = 'active'
       AND ($2::boolean = TRUE OR u.daycare_id = $3)
     GROUP BY u.id, u.name
     ORDER BY reports_missing DESC, u.name ASC`,
    [targetDate, isSuper, daycareId]
  );

  return {
    date: targetDate,
    monitor,
    caregivers: monitor,
  };
};

module.exports = {
  createReport,
  getReport,
  getChildReports,
  listReports,
};
