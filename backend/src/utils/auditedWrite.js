'use strict';
const db = require('../config/db');

const { withTenant, currentTenant } = require('../db/tenant-pool');

async function writeAudit(client, actor, action, table, id, metadata = {}, explicitDaycareId = null) {
  const actorId = typeof actor === 'object' && actor !== null ? actor.id : actor;
  const daycareId = explicitDaycareId !== null
    ? explicitDaycareId
    : (typeof actor === 'object' && actor !== null ? (actor.daycare_id || null) : null);
  if (!actorId) return;
  await client.query(
    'INSERT INTO audit_logs(actor_id,action,target_table,target_id,metadata,daycare_id) VALUES($1,$2,$3,$4,$5,$6)',
    [actorId, action, table, id, JSON.stringify(metadata), daycareId]
  );
}

async function auditedWrite(actor, action, table, work, metadata = {}, explicitDaycareId = null) {
  const actorId = typeof actor === 'object' && actor !== null ? actor.id : actor;
  const daycareId = explicitDaycareId !== null
    ? explicitDaycareId
    : (typeof actor === 'object' && actor !== null ? (actor.daycare_id || null) : null);

  const run = async () => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const record = await work(client);
      await writeAudit(client, actorId, action, table, record.id, metadata, daycareId);
      await client.query('COMMIT');
      return record;
    } catch(error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };

  if (daycareId && Number.isSafeInteger(Number(daycareId)) && Number(daycareId) > 0 && currentTenant() !== Number(daycareId)) {
    return withTenant(Number(daycareId), run);
  }
  return run();
}

module.exports = { auditedWrite, writeAudit };
