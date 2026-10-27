'use strict';

const crypto = require('node:crypto');

// Migration 018 decouples security changes from profile edits. JSON lookup keeps
// older databases compatible until migration; exact epoch text is the fallback.
const ACCOUNT_FIELDS = `u.id, u.name, u.email, u.password_hash, u.status, to_jsonb(u)->>'phone' AS phone,
  u.profile_complete, u.daycare_id, r.name AS role,
  COALESCE(to_jsonb(u)->>'security_revision', extract(epoch from u.updated_at)::text) AS user_revision,
  COALESCE(to_jsonb(d)->>'security_revision', extract(epoch from d.updated_at)::text) AS daycare_revision,
  d.name AS daycare_name, d.status AS daycare_status, d.subscription_plan, d.trial_ends_at`;
const ACCOUNT_JOIN = 'FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN daycares d ON d.id = u.daycare_id';

function secret() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  return process.env.JWT_SECRET;
}

function authState(account) {
  return crypto.createHmac('sha256', secret()).update(JSON.stringify([
    'ankelba-legacy-auth-state-v1', account.id, account.role, account.email,
    account.password_hash, account.status, account.user_revision,
    account.daycare_id, account.daycare_status, account.daycare_revision,
  ])).digest('hex');
}

function matchesState(value, account) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
    && crypto.timingSafeEqual(Buffer.from(value, 'hex'), Buffer.from(authState(account), 'hex'));
}

function activeAccount(account) {
  return Boolean(account && account.status === 'active'
    && (account.role === 'super_admin' || (account.daycare_id && account.daycare_status === 'active')));
}

async function findAccount(client, selector) {
  const field = selector.id !== undefined ? 'u.id' : 'u.email';
  const value = selector.id !== undefined ? selector.id : selector.email;
  return (await client.query(`SELECT ${ACCOUNT_FIELDS} ${ACCOUNT_JOIN} WHERE ${field} = $1`, [value])).rows[0];
}

// All credential operations lock daycare -> account -> reset records, so they
// cannot race suspension, credential replacement, or one another.
async function lockAccount(client, selector) {
  const hint = await findAccount(client, selector);
  if (!hint) return null;
  if (hint.daycare_id) {
    await client.query('SELECT id FROM daycares WHERE id = $1 FOR SHARE', [hint.daycare_id]);
  }
  const account = (await client.query(`SELECT ${ACCOUNT_FIELDS} ${ACCOUNT_JOIN}
    WHERE u.id = $1 FOR UPDATE OF u`, [hint.id])).rows[0];
  if (!account || account.daycare_id !== hint.daycare_id
    || (selector.email !== undefined && account.email !== selector.email)) return null;
  return account;
}

async function transaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { authState, matchesState, activeAccount, findAccount, lockAccount, transaction };
