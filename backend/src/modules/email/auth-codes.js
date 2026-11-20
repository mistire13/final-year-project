'use strict';
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const security = require('../auth/legacy-security');
const { enqueue } = require('./outbox');
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const generic = 'If this account is eligible, a verification code will be emailed. Check your inbox and spam folder.';

async function account(client, type, selector, lock = false) {
  if (type === 'platform') {
    const field = selector.id ? 'id' : 'lower(email)';
    return (await client.query(`SELECT *, 'platform' AS account_type FROM platform_accounts WHERE ${field}=$1${lock ? ' FOR UPDATE' : ''}`, [selector.id || selector.email])).rows[0];
  }
  const row = await (lock ? security.lockAccount : security.findAccount)(client, selector);
  return row && { ...row, account_type: 'daycare' };
}
const eligible = row => row?.account_type === 'platform' ? row.status === 'active' : security.activeAccount(row);
function state(row, secret = process.env.JWT_SECRET) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify([row.account_type, row.id, row.email, row.password_hash,
    row.status, row.user_revision, row.daycare_revision, row.daycare_status])).digest('hex');
}
const digest = (id, code, secret) => crypto.createHmac('sha256', secret).update(`ankelba-email-code:${id}:${code}`).digest('hex');
const equal = (a, b) => typeof a === 'string' && /^[a-f0-9]{64}$/.test(a) && crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));

function createEmailAuth({ pool, enabled = false, secret = process.env.JWT_SECRET, now = () => new Date() }) {
  async function request({ email, purpose = 'reset', account_type = 'daycare' }) {
    if (!enabled) throw fail('Email delivery is unavailable. Contact your daycare administrator.', 503);
    const id = crypto.randomUUID(), code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const normalized = String(email).trim().toLowerCase();
    await security.transaction(pool, async c => {
      const user = await account(c, account_type, { email: normalized }, true);
      if (!eligible(user)) return;
      const recent = (await c.query(`SELECT count(*)::int AS count, max(created_at) AS last FROM email_challenges
        WHERE email=$1 AND created_at>$2::timestamptz-INTERVAL '15 minutes'`, [normalized, now()])).rows[0];
      // Same public response for unknown, throttled, suspended and eligible accounts.
      if (recent.count >= 5 || (recent.last && now() - new Date(recent.last) < 60000)) return;
      const userId = account_type === 'platform' ? null : user.id, platformId = account_type === 'platform' ? user.id : null;
      await c.query(`UPDATE email_challenges SET consumed_at=$4 WHERE purpose=$1 AND consumed_at IS NULL
        AND (user_id=$2 OR platform_account_id=$3)`, [purpose, userId, platformId, now()]);
      const expires = new Date(now().getTime() + 10 * 60 * 1000);
      await c.query(`INSERT INTO email_challenges(id,user_id,platform_account_id,email,purpose,code_hash,auth_state,expires_at,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id, userId, platformId, normalized, purpose, digest(id, code, secret), state(user, secret), expires, now()]);
      await enqueue(c, { recipient: normalized, kind: purpose === 'reset' ? 'password_reset' : 'email_verification',
        userId, platformId, daycareId: user.daycare_id, challengeId: id, expiresAt: expires,
        subject: purpose === 'reset' ? 'Your Ankelba password reset code' : 'Verify your Ankelba email',
        text: `Your Ankelba verification code is: ${code}\n\nThis code expires in 10 minutes and can be used once.\nDo not share this code. If you did not request it, ignore this email.` }, secret);
    });
    return { message: generic, request_id: id, expires_in: 600, resend_after: 60 };
  }

  async function confirm({ request_id, code, new_password }) {
    if (new_password !== undefined && (new_password.length < 12 || Buffer.byteLength(new_password, 'utf8') > 72)) {
      throw fail('Use a password of at least 12 characters and at most 72 UTF-8 bytes.', 422);
    }
    const hint = (await pool.query('SELECT * FROM email_challenges WHERE id=$1', [request_id])).rows[0];
    if (!hint) throw fail('The code is invalid or expired. Request a new code.');
    // Account first, challenge second: all requests/resets use the same lock order.
    const outcome = await security.transaction(pool, async c => {
      const type = hint.platform_account_id ? 'platform' : 'daycare';
      const user = await account(c, type, { id: hint.platform_account_id || hint.user_id }, true);
      const challenge = (await c.query('SELECT * FROM email_challenges WHERE id=$1 FOR UPDATE', [request_id])).rows[0];
      if (!eligible(user) || !challenge || challenge.consumed_at || new Date(challenge.expires_at) <= now()
        || challenge.attempts >= 5 || !equal(challenge.auth_state, state(user, secret)) || user.email.toLowerCase() !== challenge.email) return false;
      const valid = equal(challenge.code_hash, digest(request_id, code, secret));
      await c.query('UPDATE email_challenges SET attempts=attempts+1 WHERE id=$1', [request_id]);
      if (!valid) return false; // Commit failed attempts; throwing here would roll them back.
      if (challenge.purpose === 'reset' && !new_password) return false;
      if (challenge.purpose === 'verify' && new_password !== undefined) return false;
      const table = type === 'platform' ? 'platform_accounts' : 'users';
      if (challenge.purpose === 'reset') {
        const passwordHash = await bcrypt.hash(new_password, 12);
        await c.query(`UPDATE ${table} SET password_hash=$1,email_verified_at=NOW(),updated_at=NOW() WHERE id=$2`, [passwordHash, user.id]);
        if (type === 'daycare') {
          await c.query('UPDATE password_reset_tokens SET used=TRUE WHERE user_id=$1', [user.id]);
          await c.query('UPDATE daycare_password_reset_tokens SET consumed_at=NOW() WHERE user_id=$1 AND consumed_at IS NULL', [user.id]);
        } else {
          await c.query('UPDATE platform_password_reset_tokens SET consumed_at=NOW() WHERE platform_account_id=$1 AND consumed_at IS NULL', [user.id]);
          await enqueue(c, { recipient: user.email, kind: 'password_changed', platformId: user.id,
            subject: 'Your Ankelba password changed', text: 'Your Ankelba password was changed. If this was not you, contact your platform administrator immediately.' }, secret);
        }
        for (const table of ['auth_sessions', 'auth_challenges']) {
          await c.query(`UPDATE ${table} SET revoked_at=NOW() WHERE ${type === 'platform' ? 'platform_account_id' : 'user_id'}=$1 AND revoked_at IS NULL`, [user.id]);
        }
        await c.query(`UPDATE email_challenges SET consumed_at=NOW() WHERE ${type === 'platform' ? 'platform_account_id' : 'user_id'}=$1 AND consumed_at IS NULL`, [user.id]);
        if (type === 'platform') await c.query(`INSERT INTO platform_audit_events(actor_kind,action,target_type,target_id,outcome,metadata)
          VALUES('system','platform.auth.password_reset','platform_account',$1,'success','{"method":"email_code"}')`, [String(user.id)]);
        else await c.query(`INSERT INTO audit_logs(actor_id,daycare_id,action,target_table,target_id,metadata)
          VALUES($1,$2,'PASSWORD_RESET','users',$1,'{"method":"email_code"}')`, [user.id, user.daycare_id]);
      } else {
        await c.query(`UPDATE ${table} SET email_verified_at=NOW() WHERE id=$1`, [user.id]);
        await c.query('UPDATE email_challenges SET consumed_at=NOW() WHERE id=$1', [request_id]);
      }
      return challenge.purpose;
    });
    if (!outcome) throw fail('The code is invalid or expired. Request a new code.');
    return { verified: true, message: outcome === 'reset' ? 'Password reset. Sign in with your new password.' : 'Email verified.' };
  }
  return { request, confirm };
}
module.exports = { createEmailAuth, account, eligible, state };
