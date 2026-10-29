'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const db = require('../../config/db');
const control = db.control || db;
const { withTenant } = require('../../db/tenant-pool');
const logger = require('../../config/logger');
const security = require('./legacy-security');
const { inbox } = require('./legacy-inbox');

const failure = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const RECOVERY_MESSAGE = 'If that email is registered and active, password reset instructions have been issued.';
const RESET_PATTERN = /^lr1\.[a-f0-9]{64}\.[a-f0-9]{64}$/;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function emailValue(value) {
  if (typeof value !== 'string' || value.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    throw failure(422, 'A valid email is required');
  }
  return value.trim().toLowerCase();
}

function validateNewPassword(value) {
  if (typeof value !== 'string' || value.length < 4 || Buffer.byteLength(value, 'utf8') > 72) {
    throw failure(422, 'New password must have at least 4 characters and at most 72 UTF-8 bytes');
  }
}

async function publicProfile(user) {
  const result = {
    id: user.id, name: user.name, email: user.email, phone:user.phone || null, role: user.role, status: user.status,
    daycare_id: user.daycare_id, daycare_name: user.daycare_name, daycare_status: user.daycare_status,
    subscription_plan: user.subscription_plan, trial_ends_at: user.trial_ends_at,
    profile_complete: user.profile_complete,
  };
  if (user.role === 'parent') {
    result.linked_children = (await withTenant(user.daycare_id, () => db.query(
      `SELECT c.id, c.full_name, c.dob, c.gender, c.enrollment_status, c.photo_url, g.name AS group_name, gl.relationship
       FROM guardian_links gl JOIN children c ON c.id = gl.child_id LEFT JOIN groups g ON g.id = c.group_id
       WHERE gl.user_id = $1 AND c.daycare_id = $2`, [user.id, user.daycare_id]))).rows;
  }
  return result;
}

const login = async (email, password) => {
  const user = await security.findAccount(control, { email: emailValue(email) });
  if (!user || typeof password !== 'string' || !await bcrypt.compare(password, user.password_hash)) {
    throw failure(401, 'Invalid credentials');
  }
  if (!security.activeAccount(user)) throw failure(403, 'Account or daycare is inactive or unavailable');
  const token = jwt.sign({ userId: user.id, role: user.role, daycareId: user.daycare_id, auth_state: security.authState(user) },
    process.env.JWT_SECRET, { algorithm: 'HS256', audience: 'ankelba-legacy', expiresIn: process.env.JWT_EXPIRES_IN || '24h' });
  logger.info(`User ${user.id} (${user.role}) authenticated`);
  return { token, user: await publicProfile(user) };
};

const getCurrentUser = async userId => {
  const user = await security.findAccount(control, { id: userId });
  if (!security.activeAccount(user)) throw failure(401, 'Account or daycare is inactive or unavailable');
  return publicProfile(user);
};

// Development/test delivery only. A public response never contains a token,
// account identifier, expiry, or inbox ID, whether or not the account exists.
const forgotPassword = async email => {
  const normalizedEmail = emailValue(email);
  inbox.assertAvailable();
  await security.transaction(control, async client => {
    const user = await security.lockAccount(client, { email: normalizedEmail });
    if (!security.activeAccount(user)) return;
    // Bound local delivery per account as well as the router's IP rate limit.
    const recent = (await client.query(`SELECT count(*)::int AS count FROM password_reset_tokens
      WHERE user_id = $1 AND created_at > clock_timestamp() - interval '15 minutes'`, [user.id])).rows[0];
    if (Number(recent.count) >= 5) return;
    const rawToken = `lr1.${crypto.randomBytes(32).toString('hex')}.${security.authState(user)}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await client.query('UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE', [user.id]);
    await client.query('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, hash(rawToken), expiresAt]);
    // Write encrypted mail before commit; delivery failure rolls back the token.
    // If commit fails, a leftover encrypted message cannot reset any account.
    await inbox.enqueue({ to: user.email, subject: 'Reset your Ankelba password', token: rawToken, expires_at: expiresAt });
  });
  return { message: RECOVERY_MESSAGE };
};

const resetPassword = async (rawToken, newPassword) => {
  // Reject tokens from the former publicly disclosed-token flow as well.
  if (typeof rawToken !== 'string' || !RESET_PATTERN.test(rawToken)) throw failure(400, 'Invalid or expired reset token');
  validateNewPassword(newPassword);
  const tokenHash = hash(rawToken);
  const newHash = await bcrypt.hash(newPassword, 12);
  await security.transaction(control, async client => {
    const hint = (await client.query('SELECT user_id FROM password_reset_tokens WHERE token_hash = $1', [tokenHash])).rows[0];
    const user = hint && await security.lockAccount(client, { id: hint.user_id });
    if (!security.activeAccount(user) || !security.matchesState(rawToken.split('.')[2], user)) {
      throw failure(400, 'Invalid or expired reset token');
    }
    const record = (await client.query(`SELECT id FROM password_reset_tokens WHERE token_hash = $1
      AND user_id = $2 AND used = FALSE AND expires_at > clock_timestamp() FOR UPDATE`, [tokenHash, user.id])).rows[0];
    if (!record) throw failure(400, 'Invalid or expired reset token');
    await client.query('UPDATE users SET password_hash = $1, updated_at = clock_timestamp() WHERE id = $2', [newHash, user.id]);
    await client.query('UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE', [user.id]);
  });
  return { message: 'Password has been reset successfully. Please sign in again.' };
};

const changePassword = async (userId, currentPassword, newPassword) => {
  validateNewPassword(newPassword);
  if (typeof currentPassword !== 'string' || currentPassword.length > 128) throw failure(422, 'Current password is required');
  if (currentPassword === newPassword) throw failure(422, 'New password must be different from current password');
  const newHash = await bcrypt.hash(newPassword, 12);
  await security.transaction(control, async client => {
    const user = await security.lockAccount(client, { id: userId });
    if (!security.activeAccount(user) || !await bcrypt.compare(currentPassword, user.password_hash)) {
      throw failure(401, 'Current password is incorrect or account is unavailable');
    }
    await client.query('UPDATE users SET password_hash = $1, updated_at = clock_timestamp() WHERE id = $2', [newHash, userId]);
    await client.query('UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE', [userId]);
  });
  return { message: 'Password changed successfully. Please sign in again.' };
};

// Keep the service closed as well as its HTTP route. Parent enrollment belongs
// to the daycare administrator and never fabricates a child or pickup permission.
const register = async () => {
  throw failure(403, 'Public parent registration is unavailable. Contact your daycare administrator to create your account.');
};

module.exports = { login, register, getCurrentUser, forgotPassword, resetPassword, changePassword };

