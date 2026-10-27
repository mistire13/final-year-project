'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
const context = new AsyncLocalStorage();
function withTenant(daycareId, work) {
  if (!Number.isSafeInteger(Number(daycareId)) || Number(daycareId) <= 0) throw new Error('Verified daycare context required');
  return context.run({ daycareId: Number(daycareId) }, work);
}
function currentTenant() {
  return context.getStore()?.daycareId || null;
}
function createTenantPool(pool) {
  async function connect() {
    const daycare = context.getStore()?.daycareId;
    const client = await pool.connect();
    let transaction = false;
    let released = false;
    let pending = 0;
    let queue = Promise.resolve();
    const establish = () => client.query(
      "SELECT set_config('app.daycare_id',$1,true), set_config('app.current_daycare_id',$1,true)",
      [daycare ? String(daycare) : '']
    );
    async function execute(sql, values) {
        if (released) throw new Error('Client already released');
        const rawSql = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        const command = rawSql.trim().replace(/;$/, '').toUpperCase();
        if (command === 'BEGIN' || command.startsWith('BEGIN ') || command === 'START TRANSACTION') {
          if (transaction) throw new Error('Nested transaction is not supported');
          // Mark before sending: a failed connection/BEGIN must not be reused.
          transaction = true;
          const result = await client.query(sql, values);
          await establish();
          return result;
        }
        if (command === 'COMMIT' || command === 'ROLLBACK') {
          const result = await client.query(sql, values);
          transaction = false;
          return result;
        }
        if (transaction) return client.query(sql, values);
        transaction = true;
        try {
          await client.query('BEGIN');
          await establish();
          const result = await client.query(sql, values);
          await client.query('COMMIT');
          transaction = false;
          return result;
        } catch (error) {
          try {
            await client.query('ROLLBACK');
            transaction = false;
          } catch (_) { /* release destroys a client whose cleanup failed */ }
          throw error;
        }
    }
    return {
      query(sql, values) {
        if (released) return Promise.reject(new Error('Client already released'));
        // pg queues statements, but each automatic transaction has several
        // statements. Queue the entire operation so they cannot interleave.
        pending++;
        const result = queue.then(() => execute(sql, values)).finally(() => { pending--; });
        queue = result.catch(() => {});
        return result;
      },
      release(error) {
        if (released) return;
        released = true;
        // Never return an open/aborted transaction to the pool.
        client.release(error || transaction || pending ? true : undefined);
      },
    };
  }
  return {
    connect,
    async query(sql, values) {
      const client = await connect();
      try { return await client.query(sql, values); } finally { client.release(); }
    },
    end: () => pool.end(),
    on: (...args) => pool.on(...args),
    withTenant,
    currentTenant,
    get totalCount() { return pool.totalCount; },
    get idleCount() { return pool.idleCount; },
    get waitingCount() { return pool.waitingCount; },
    rawPool: pool,
  };
}
module.exports = { createTenantPool, withTenant, currentTenant };

