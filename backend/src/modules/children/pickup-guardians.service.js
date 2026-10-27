'use strict';

const crypto = require('crypto');
const db = require('../../config/db');
const { auditedWrite, writeAudit } = require('../../utils/auditedWrite');
const {transaction} = require('../auth/legacy-security');
const fail = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode });

async function assertChild(client, childId, actor, review = false) {
  const { rows: [current] } = await client.query(`SELECT u.id,u.status,u.daycare_id,r.name AS role,d.status AS daycare_status
    FROM users u JOIN roles r ON r.id=u.role_id JOIN daycares d ON d.id=u.daycare_id
    WHERE u.id=$1 FOR SHARE OF u,d`, [actor.id]);
  if (!current || current.status !== 'active' || current.daycare_status !== 'active' ||
      current.daycare_id !== actor.daycare_id || !['admin','parent'].includes(current.role) ||
      (review && current.role !== 'admin')) throw fail('Access denied.', 403);
  const { rows: [child] } = await client.query('SELECT id,daycare_id FROM children WHERE id=$1 AND daycare_id=$2', [childId, current.daycare_id]);
  if (!child) throw fail('Child profile not found.', 404);
  if (current.role === 'parent') {
    const { rows } = await client.query('SELECT id FROM guardian_links WHERE child_id=$1 AND user_id=$2 FOR SHARE', [child.id, current.id]);
    if (!rows.length) throw fail('Access denied.', 403);
  }
  return child;
}

async function list(childId, actor) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await assertChild(client, childId, actor);
    const { rows } = await client.query(`SELECT id AS pickup_guardian_id,child_id,name,relationship,phone,email,status,
      review_note,reviewed_at,created_at,version,(status='approved') AS pickup_authorized
      FROM pickup_guardians WHERE child_id=$1 ORDER BY created_at DESC,id DESC`, [childId]);
    await client.query('COMMIT');
    return { data: rows };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function request(childId, body, actor) {
  const input = { name: body.name.trim(), relationship: body.relationship.trim(), phone: body.phone.replace(/[() -]/g, ''), email: body.email?.trim().toLowerCase() || null };
  const hash = crypto.createHash('sha256').update(JSON.stringify({ child_id: Number(childId), ...input })).digest('hex');
  try {
    return await transaction(db, async client => {
      const child = await assertChild(client, childId, actor);
      // Serialize requests by this account so a retried request returns its original result.
      await client.query('SELECT pg_advisory_xact_lock($1,$2)', [actor.daycare_id, actor.id]);
      const { rows: [previous] } = await client.query('SELECT * FROM pickup_guardians WHERE daycare_id=$1 AND requested_by=$2 AND request_key=$3', [actor.daycare_id, actor.id, body.request_key]);
      if (previous) {
        if (previous.request_hash !== hash) throw fail('This request key was already used for different details.', 409);
        return previous;
      }
      const { rows: [record] } = await client.query(`INSERT INTO pickup_guardians(daycare_id,child_id,requested_by,name,relationship,phone,email,request_key,request_hash)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [child.daycare_id, child.id, actor.id, input.name, input.relationship, input.phone, input.email, body.request_key, hash]);
      await writeAudit(client,actor,'PICKUP_GUARDIAN_REQUESTED','pickup_guardians',record.id,{child_id:Number(childId)});
      return record;
    });
  } catch (error) {
    if (error.code === '23505') throw fail('This adult already has a pending request or approved pickup contact for this child.', 409);
    throw error;
  }
}

async function review(childId, requestId, body, actor) {
  return auditedWrite(actor, 'PICKUP_GUARDIAN_' + body.decision.toUpperCase(), 'pickup_guardians', async client => {
    await assertChild(client, childId, actor, true);
    const { rows: [record] } = await client.query('SELECT * FROM pickup_guardians WHERE id=$1 AND child_id=$2 AND daycare_id=$3 FOR UPDATE', [requestId, childId, actor.daycare_id]);
    if (!record) throw fail('Guardian request not found.', 404);
    if (record.version !== body.version) throw fail('Guardian request changed. Reload before reviewing.', 409);
    if (!((record.status === 'pending' && ['approved','rejected'].includes(body.decision)) ||
          (record.status === 'approved' && body.decision === 'revoked'))) throw fail('This guardian decision is no longer available.', 409);
    const { rows: [updated] } = await client.query(`UPDATE pickup_guardians SET status=$1,reviewed_by=$2,review_note=$3,reviewed_at=NOW()
      WHERE id=$4 RETURNING *`, [body.decision, actor.id, body.review_note.trim(), record.id]);
    return updated;
  }, { child_id: Number(childId), decision: body.decision });
}

module.exports = { list, request, review };
