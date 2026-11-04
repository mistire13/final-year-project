'use strict';
/**
 * src/middleware/rbac.js
 * Role-Based Access Control middleware factory.
 * Pattern from §11 of backend_architecture_plan_v2.md
 * SRS Refs: FR-UAM-03, NFR-SEC-02
 *
 * Usage:
 *   router.post('/children', auth, allowRoles('admin'), createChild);
 *   router.get('/children/:id', auth, allowRoles('admin','caregiver','parent'), getChild);
 *
 * Note: Parent routes additionally check child linkage at the SERVICE layer
 * using isParentLinked(userId, childId) — role alone is not enough (FR-UAM-05, BR-01).
 */

/**
 * Factory function — returns middleware that enforces role membership.
 * @param {...string} roles - Allowed role names (e.g. 'admin', 'caregiver', 'parent')
 * @returns {Function} Express middleware
 */
const allowRoles = (...roles) => {
 const middleware = (req, res, next) => {
  if (!req.user) {
    // Auth middleware should have run first; defensive check
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  next();
 };
 // Machine-readable policy for route coverage; never accepted from client input.
 middleware.allowedRoles = Object.freeze([...roles]);
 return middleware;
};

module.exports = { allowRoles };
