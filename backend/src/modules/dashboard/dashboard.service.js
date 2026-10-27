'use strict';
/**
 * src/modules/dashboard/dashboard.service.js
 * Admin Dashboard Aggregated Statistics.
 */
const db = require('../../config/db');

const getStats = async (user) => {
  const isSuper = user && user.role === 'super_admin';
  const daycareId = user?.daycare_id || null;

  // Run all aggregation queries in parallel
  const [
    enrollmentRes,
    attendanceRes,
    reportsRes,
    healthRes,
    ordersRes,
    messagesRes,
  ] = await Promise.all([
    // Enrollment counts by status
    db.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE enrollment_status = 'active')   AS active,
        COUNT(*) FILTER (WHERE enrollment_status = 'inactive') AS inactive,
        COUNT(*) FILTER (WHERE enrollment_status = 'waitlist') AS waitlist
      FROM children
      WHERE ($1::boolean = TRUE OR daycare_id = $2)
    `, [isSuper, daycareId]),
    // Today's attendance summary (LATERAL join taking latest event today for accurate presence counting)
    db.query(`
      SELECT
        COUNT(c.id)::integer AS total_enrolled,
        COUNT(a.event_type) FILTER (WHERE a.event_type = 'checkin')::integer  AS checked_in,
        COUNT(a.event_type) FILTER (WHERE a.event_type = 'checkout')::integer AS checked_out,
        COUNT(a.event_type) FILTER (WHERE a.event_type = 'absent')::integer   AS absent
      FROM children c
      LEFT JOIN LATERAL (
        SELECT event_type FROM attendance
        WHERE child_id = c.id
          AND (event_time AT TIME ZONE 'Africa/Addis_Ababa')::date = (clock_timestamp() AT TIME ZONE 'Africa/Addis_Ababa')::date
        ORDER BY event_time DESC, id DESC LIMIT 1
      ) a ON TRUE
      WHERE c.enrollment_status = 'active'
        AND ($1::boolean = TRUE OR c.daycare_id = $2)
    `, [isSuper, daycareId]),
    // Today's daily reports
    db.query(`
      SELECT
        COUNT(dr.id)::integer AS submitted_today,
        (COUNT(c.id) - COUNT(dr.id))::integer AS missing_today
      FROM children c
      LEFT JOIN daily_reports dr ON dr.child_id = c.id
        AND dr.report_date = (clock_timestamp() AT TIME ZONE 'Africa/Addis_Ababa')::date
      WHERE c.enrollment_status = 'active'
        AND ($1::boolean = TRUE OR c.daycare_id = $2)
    `, [isSuper, daycareId]),
    // Unnotified health/incident records
    db.query(`
      SELECT COUNT(*) AS unnotified_health_count
      FROM health_records
      WHERE parent_notified = FALSE
        AND ($1::boolean = TRUE OR daycare_id = $2)
    `, [isSuper, daycareId]),
    // Pending orders count and revenue
    db.query(`
      SELECT
        COUNT(*) FILTER (WHERE order_status = 'placed')   AS pending_orders,
        COUNT(*) FILTER (WHERE order_status = 'confirmed') AS confirmed_orders,
        COALESCE(SUM(total) FILTER (WHERE payment_status = 'paid' AND NOT EXISTS(SELECT 1 FROM payments p WHERE p.order_id=orders.id AND p.method='demo')), 0) AS total_revenue
      FROM orders
      WHERE ($1::boolean = TRUE OR daycare_id = $2)
    `, [isSuper, daycareId]),
    // Unread messages count
    db.query(`
      SELECT COUNT(*) AS unread_messages
      FROM messages
      WHERE read_at IS NULL
        AND ($1::boolean = TRUE OR daycare_id = $2 OR recipient_id = $3)
    `, [isSuper, daycareId, user?.id || null]),
  ]);

  return {
    enrollment: enrollmentRes.rows[0],
    attendance_today: attendanceRes.rows[0],
    reports_today: reportsRes.rows[0],
    health: healthRes.rows[0],
    orders: ordersRes.rows[0],
    messages: messagesRes.rows[0],
    generated_at: new Date().toISOString(),
  };
};

module.exports = { getStats };
