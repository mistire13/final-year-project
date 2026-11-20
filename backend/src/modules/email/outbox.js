'use strict';
const crypto = require('node:crypto');
function key(secret = process.env.JWT_SECRET) {
  if (!secret || secret.length < 32) throw new Error('Email encryption is unavailable');
  return crypto.hkdfSync('sha256', Buffer.from(secret), Buffer.alloc(0), Buffer.from('ankelba-email-outbox-v1'), 32);
}
function seal(value, id, secret) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key(secret), iv);
  cipher.setAAD(Buffer.from(id));
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return JSON.stringify({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
}
function open(value, id, secret) {
  const data = JSON.parse(value), decipher = crypto.createDecipheriv('aes-256-gcm', key(secret), Buffer.from(data.iv, 'base64'));
  decipher.setAAD(Buffer.from(id)); decipher.setAuthTag(Buffer.from(data.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data.data, 'base64')), decipher.final()]).toString('utf8'));
}
async function enqueue(client, { recipient, kind, subject, text, userId = null, platformId = null, daycareId = null, challengeId = null, expiresAt, priority = 100 }, secret) {
  const id = crypto.randomUUID();
  await client.query(`INSERT INTO email_outbox(id,daycare_id,user_id,platform_account_id,recipient,kind,dedupe_key,protected_payload,challenge_id,expires_at,priority)
    VALUES($1::uuid,$2,$3,$4,$5,$6,$1::text,$7,$8,$9,$10)`,
  [id, daycareId, userId, platformId, recipient, kind, seal({ subject, text }, id, secret), challengeId, expiresAt || new Date(Date.now() + 86400000), priority]);
  return id;
}
module.exports = { seal, open, enqueue };
