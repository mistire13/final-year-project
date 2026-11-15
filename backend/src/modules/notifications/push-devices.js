'use strict';
const db = require('../../config/db');
const TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{8,200}\]$/;

function checkedToken(value) {
  if (typeof value !== 'string' || !TOKEN.test(value)) {
    throw Object.assign(new Error('Invalid notification token'), { statusCode: 422 });
  }
  return value;
}

async function register(user, token, session) {
  const value = checkedToken(token);
  if(!session || !['legacy','modern'].includes(session.kind) || !session.state || !session.expires_at)
    throw Object.assign(new Error('A valid session is required for push notifications'), {statusCode:403});
  await db.query('SELECT public.register_push_token($1,$2,$3,$4,$5)', [value,user.id,session.kind,session.state,session.expires_at]);
}

async function unregister(user, token) {
  await db.query('DELETE FROM push_devices WHERE daycare_id=$1 AND user_id=$2 AND token=$3',
    [user.daycare_id,user.id,checkedToken(token)]);
}

module.exports = { register, unregister, checkedToken };
