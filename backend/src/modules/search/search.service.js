'use strict';
/**
 * src/modules/search/search.service.js
 * Global Search Service — multi-entity search scoped to user role permissions.
 */
const db = require('../../config/db');
const {getDaycareFeatures}=require('../saas/package-features');

const globalSearch = async (searchTerm, user) => {
  const q = (searchTerm || '').trim();
  if (q.length < 2) {
    const err = new Error('Search query must be at least 2 characters');
    err.statusCode = 422;
    throw err;
  }

  const term = `%${q}%`;
  const results = {
    children: [],
    users: [],
    products: [],
    events: [],
    announcements: [],
  };

  const isSuper = user.role === 'super_admin';
  const daycareId = user.daycare_id || null;
  const isParent = user.role === 'parent';

  // 1. Children search (Role scoped & daycare scoped)
  if (user.role === 'admin' || isSuper) {
    const { rows } = await db.query(
      `SELECT c.id, c.full_name, c.dob, c.gender, c.enrollment_status, g.name AS group_name
       FROM children c
       LEFT JOIN groups g ON g.id = c.group_id
       WHERE c.full_name ILIKE $1
         AND ($2::boolean = TRUE OR c.daycare_id = $3)
       LIMIT 10`,
      [term, isSuper, daycareId]
    );
    results.children = rows;
  } else if (user.role === 'caregiver') {
    const { rows } = await db.query(
      `SELECT c.id, c.full_name, c.dob, c.gender, c.enrollment_status, g.name AS group_name
       FROM children c
       LEFT JOIN groups g ON g.id = c.group_id
       WHERE c.caregiver_id = $1 AND c.full_name ILIKE $2
         AND ($3::boolean = TRUE OR c.daycare_id = $4)
       LIMIT 10`,
      [user.id, term, isSuper, daycareId]
    );
    results.children = rows;
  } else if (isParent) {
    const { rows } = await db.query(
      `SELECT c.id, c.full_name, c.dob, c.gender, c.enrollment_status, g.name AS group_name
       FROM guardian_links gl
       JOIN children c ON c.id = gl.child_id
       LEFT JOIN groups g ON g.id = c.group_id
       WHERE gl.user_id = $1 AND c.full_name ILIKE $2
         AND ($3::boolean = TRUE OR c.daycare_id = $4)
       LIMIT 10`,
      [user.id, term, isSuper, daycareId]
    );
    results.children = rows;
  }

  // 2. Users search (Admin only, tenant scoped, hide super_admins from tenant admins)
  if (user.role === 'admin' || isSuper) {
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.status, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE (u.name ILIKE $1 OR u.email ILIKE $1)
         AND ($2::boolean = TRUE OR (r.name != 'super_admin' AND u.daycare_id = $3))
       LIMIT 10`,
      [term, isSuper, daycareId]
    );
    results.users = rows;
  }

  const featureAccess=await getDaycareFeatures(db,daycareId);
  // 3. Products search (Tenant scoped)
  if(featureAccess.features.shop){
  const { rows: prodRows } = await db.query(
    `SELECT p.id, p.name, p.price, p.stock_qty, p.available, c.name AS category_name
     FROM products p
     LEFT JOIN product_categories c ON c.id = p.category_id
     WHERE (p.name ILIKE $1 OR p.description ILIKE $1)
       AND (p.available = TRUE OR $2 = 'admin' OR $3::boolean = TRUE)
       AND ($3::boolean = TRUE OR p.daycare_id = $4)
     LIMIT 10`,
    [term, user.role, isSuper, daycareId]
  );
  results.products = prodRows;
  }

  // 4. Events search (Tenant scoped)
  const { rows: eventRows } = await db.query(
    `SELECT id, title, description, event_date, event_time, event_type
     FROM events
     WHERE (title ILIKE $1 OR description ILIKE $1)
       AND cancelled = FALSE
       AND ($2::boolean = TRUE OR daycare_id = $3)
     ORDER BY event_date ASC
     LIMIT 10`,
    [term, isSuper, daycareId]
  );
  results.events = eventRows;

  // 5. Announcements search (Tenant scoped & audience checked)
  const isAdmin = user.role === 'admin';
  const isCaregiver = user.role === 'caregiver';

  const { rows: annRows } = await db.query(
    `SELECT a.id, a.title, a.body, a.announcement_type, a.audience, a.created_at
     FROM announcements a
     WHERE (a.title ILIKE $1 OR a.body ILIKE $1)
       AND (a.expires_at IS NULL OR a.expires_at > NOW())
       AND ($2::boolean = TRUE OR a.daycare_id = $3)
       AND (
         $4::boolean = TRUE -- super_admin or admin
         OR (
           $5::boolean = TRUE -- parent
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
           $7::boolean = TRUE -- caregiver
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
     ORDER BY a.created_at DESC
     LIMIT 10`,
    [term, isSuper, daycareId, (isSuper || isAdmin), isParent, user.id, isCaregiver]
  );
  results.announcements = annRows;


  const totalMatches =
    results.children.length +
    results.users.length +
    results.products.length +
    results.events.length +
    results.announcements.length;

  return {
    query: q,
    total_matches: totalMatches,
    results,
  };
};

module.exports = {
  globalSearch,
};
