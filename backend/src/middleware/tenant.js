'use strict';
/**
 * src/middleware/tenant.js
 * Multi-tenant scoping and subscription verification middleware.
 * Ensures all non-superadmin requests are strictly scoped to their assigned daycare,
 * and validates that the daycare tenant account is active and in good standing.
 *
 * SRS Refs: FR-UAM-10, FR-UAM-11, FR-DB-09
 */

const { withTenant } = require('../db/tenant-pool');

const enforceTenant = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Super Admin can access all daycares or optionally inspect a specific daycare via query ?daycare_id=X
  if (req.user.role === 'super_admin') {
    req.daycareId = req.query.daycare_id ? Number(req.query.daycare_id) : null;
    if (req.daycareId) {
      return withTenant(req.daycareId, () => next());
    }
    return next();
  }

  // All other users must be tied to a daycare
  if (!req.user.daycare_id) {
    return res.status(403).json({ error: 'User is not associated with an active daycare center.' });
  }

  // Check daycare account status
  if (req.user.daycare_status === 'pending') {
    return res.status(403).json({ error: 'Your daycare center registration is currently pending Super Admin approval.' });
  }

  if (req.user.daycare_status === 'suspended') {
    return res.status(403).json({ error: 'Your daycare center account has been suspended. Please contact platform support.' });
  }

  if (req.user.daycare_status === 'rejected') {
    return res.status(403).json({ error: 'Your daycare center application was not approved.' });
  }

  req.daycareId = Number(req.user.daycare_id);
  return withTenant(req.daycareId, () => next());
};

module.exports = { enforceTenant };
