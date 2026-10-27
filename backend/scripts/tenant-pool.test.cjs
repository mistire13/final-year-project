'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTenantPool, withTenant } = require('../src/db/tenant-pool');

function fakePool(fail = () => false) {
  const calls = [], releases = [];
  return { calls, releases, pool: { async connect() { return {
    async query(sql, values) {
      calls.push({ sql, values });
      await new Promise(resolve => setImmediate(resolve));
      if (fail(sql)) throw new Error('Synthetic connection failure');
      return { rows: [] };
    },
    release(error) { releases.push(error); },
  }; } } };
}

test('automatic transactions on one checked-out client cannot interleave', async () => {
  const fixture = fakePool();
  await withTenant(17, async () => {
    const client = await createTenantPool(fixture.pool).connect();
    try { await Promise.all([client.query('SELECT 1'), client.query('SELECT 2')]); }
    finally { client.release(); }
  });
  assert.deepEqual(fixture.calls.map(c => c.sql.startsWith('SELECT set_config') ? 'CONTEXT' : c.sql),
    ['BEGIN','CONTEXT','SELECT 1','COMMIT','BEGIN','CONTEXT','SELECT 2','COMMIT']);
  assert.deepEqual(fixture.calls.filter(c => c.values).map(c => c.values), [['17'],['17']]);
  assert.deepEqual(fixture.releases, [undefined]);
});

test('failed rollback destroys the pooled connection', async () => {
  const fixture = fakePool(sql => sql === 'SELECT broken' || sql === 'ROLLBACK');
  await assert.rejects(withTenant(1, () => createTenantPool(fixture.pool).query('SELECT broken')), /Synthetic/);
  assert.deepEqual(fixture.releases, [true]);
});

test('context failure rolls back before returning the connection', async () => {
  const fixture = fakePool(sql => sql.startsWith('SELECT set_config'));
  await assert.rejects(withTenant(1, () => createTenantPool(fixture.pool).query('SELECT 1')), /Synthetic/);
  assert.equal(fixture.calls.at(-1).sql, 'ROLLBACK');
  assert.deepEqual(fixture.releases, [undefined]);
});

test('open transactions and premature release destroy connections', async () => {
  const fixture = fakePool();
  const pool = createTenantPool(fixture.pool);
  const client = await pool.connect();
  await client.query('BEGIN');
  client.release();
  await assert.rejects(client.query('SELECT 1'), /released/);
  const pendingClient = await pool.connect();
  const pending = pendingClient.query('SELECT 2');
  pendingClient.release();
  await assert.rejects(pending, /released/);
  assert.deepEqual(fixture.releases, [true,true]);
});

test('work without tenant context explicitly clears both database settings', async () => {
  const fixture = fakePool();
  await createTenantPool(fixture.pool).query('SELECT 1');
  assert.deepEqual(fixture.calls.find(c => c.values).values, ['']);
  for (const id of [null, undefined, '', 0, -1, 1.5, 'invalid']) assert.throws(() => withTenant(id, () => {}), /Verified/);
});
