'use strict';
/**
 * src/middleware/auth.js
 * JWT authentication middleware.
 * Reads token from Authorization header (Bearer) OR HttpOnly cookie.
 * Verifies signature, checks expiry, attaches req.user.
 * SRS Refs: FR-UAM-01, FR-UAM-07, NFR-SEC-07
 */
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const control = db.control || db;
const legacySecurity = require('../modules/auth/legacy-security');
const { withTenant } = require('../db/tenant-pool');

const auth = async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  try {
    // Support both HttpOnly cookie and Authorization header
    let token = null;

    // 1. Try Authorization header first (Bearer <token>)
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }

    // 2. Fall back to HttpOnly cookie (preferred for browser clients)
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'], audience: 'ankelba-legacy' });
    if (!Number.isInteger(decoded.userId) || typeof decoded.auth_state !== 'string') {
      return res.status(401).json({ error: 'Session expired, please log in again' });
    }
    const account = await legacySecurity.findAccount(control, { id: decoded.userId });
    if (!legacySecurity.activeAccount(account) || !legacySecurity.matchesState(decoded.auth_state, account)) {
      return res.status(401).json({ error: 'Session expired or account unavailable, please log in again' });
    }

    req.user = {
      id: account.id,
      role: account.role,
      daycare_id: account.daycare_id,
      daycare_name: account.daycare_name,
      daycare_status: account.daycare_status,
      subscription_plan: account.subscription_plan,
      trial_ends_at: account.trial_ends_at,
    };
    req.daycareId = account.daycare_id ? Number(account.daycare_id) : null;

    if (decoded.isImpersonating) {
      return res.status(401).json({ error: 'Impersonation sessions are no longer supported. Sign in with your own account.' });
    }

    if (req.daycareId) {
      return withTenant(req.daycareId, () => next());
    }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired, please log in again' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid session token' });
    }
    next(err);
  }
};

// Select once at startup. Preview authentication never falls back to JWTs.
const { loadDaycareAuthConfig } = require('../config/daycare-auth');
module.exports = loadDaycareAuthConfig().enabled
  ? require('../modules/daycare-auth/runtime').authenticate
  : auth;
