'use strict';
/**
 * src/modules/notifications/notifications.service.js
 * Aggregated Notifications Inbox Service — §8.7, §8.10, §8.6
 * Computes badge counts and aggregates recent items for navigation headers.
 */
const db = require('../../config/db');
const { listAlerts, listAnnouncements } = require('../communication/communication.service');

const getNotifications = async (user) => {
  if (!user?.daycare_id || !['admin', 'caregiver', 'parent'].includes(user.role)) {
    throw Object.assign(new Error('Daycare account required'), { statusCode: 403 });
  }
  const userId = user.id;
  const userRole = user.role;

  // 1. Unread direct messages
  const { rows: unreadMsgRows } = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM messages
     WHERE recipient_id = $1 AND daycare_id = $2 AND read_at IS NULL`,
    [userId, user.daycare_id]
  );
  const unreadMessagesCount = unreadMsgRows[0]?.count || 0;

  // Recent unread messages (up to 5)
  const { rows: recentMessages } = await db.query(
    `SELECT m.id, m.sender_id, u.name AS sender_name, m.subject, m.body, m.created_at
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.recipient_id = $1 AND m.daycare_id = $2 AND m.read_at IS NULL
     ORDER BY m.created_at DESC
     LIMIT 5`,
    [userId, user.daycare_id]
  );

  // Use the same tenant and audience policy as the alerts endpoint.
  const { data: alerts } = await listAlerts(user);
  const {rows:[settings]}=await db.query("SELECT COALESCE(to_jsonb(u)->'ui_preferences'->'read_alert_ids','[]'::jsonb) AS read_alert_ids, COALESCE(to_jsonb(u)->'ui_preferences'->'read_announcement_ids','[]'::jsonb) AS read_announcement_ids FROM users u WHERE id=$1 AND daycare_id=$2",[user.id,user.daycare_id]);
  const unreadAlerts=alerts.filter(item=>!(settings?.read_alert_ids||[]).includes(item.id));
  const activeAlertsCount = unreadAlerts.length;
  const recentAlerts = unreadAlerts.slice(0, 20);

  // 2b. Center Announcements (FR-COM-02, FR-COM-04)
  const { data: announcements } = await listAnnouncements({}, user);
  const readAnnIds = settings?.read_announcement_ids || [];
  const unreadAnnouncements = announcements.filter(item => !readAnnIds.includes(item.id));
  const unreadAnnouncementsCount = unreadAnnouncements.length;
  const recentAnnouncements = unreadAnnouncements.slice(0, 10);

  let unnotifiedHealthCount = 0;
  let unpaidOrdersCount = 0;

  // 3. Role-specific items
  if (userRole === 'admin' || userRole === 'caregiver') {
    // Unnotified health/incident records (FR-HIR-04)
    const { rows: healthRows } = await db.query(
      `SELECT COUNT(*)::int AS count
       FROM health_records h
       JOIN children c ON c.id = h.child_id AND c.daycare_id = h.daycare_id
       WHERE h.parent_notified = FALSE AND h.daycare_id = $1
         AND ($2::text = 'admin' OR c.caregiver_id = $3)`,
      [user.daycare_id, userRole, userId]
    );
    unnotifiedHealthCount = healthRows[0]?.count || 0;
  }

  if (userRole === 'parent') {
    // Unpaid orders for this parent
    const { rows: orderRows } = await db.query(
      `SELECT COUNT(*)::int AS count
       FROM orders
       WHERE parent_id = $1 AND daycare_id = $2 AND payment_status = 'unpaid' AND order_status != 'cancelled'`,
      [userId, user.daycare_id]
    );
    unpaidOrdersCount = orderRows[0]?.count || 0;
  }

  const totalBadges =
    unreadMessagesCount +
    activeAlertsCount +
    unreadAnnouncementsCount +
    unnotifiedHealthCount +
    unpaidOrdersCount;

  return {
    total_badges: totalBadges,
    unread_messages: {
      count: unreadMessagesCount,
      recent: recentMessages,
    },
    alerts: {
      count: activeAlertsCount,
      recent: recentAlerts,
    },
    announcements: {
      count: unreadAnnouncementsCount,
      recent: recentAnnouncements,
      all: announcements.slice(0, 20),
    },
    unnotified_health_records: {
      count: unnotifiedHealthCount,
    },
    unpaid_orders: {
      count: unpaidOrdersCount,
    },
  };
};

module.exports = {
  getNotifications,
};
