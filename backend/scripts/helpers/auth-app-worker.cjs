'use strict';

// Imported only by the isolated app-wiring test. Refuse to load the actual app
// (which imports its configured pool) until the child environment is guarded.
const assert = require('node:assert/strict');
assert.equal(process.env.NODE_ENV, 'test');
assert.match(process.env.DB_NAME || '', /^ankelba_auth_test_\d+_\d+_[a-f0-9]{8}$/);
assert.ok(process.env.AUTH_TEST_FORBIDDEN_DB, 'A forbidden application database must be supplied');
assert.notEqual(process.env.DB_NAME, process.env.AUTH_TEST_FORBIDDEN_DB);
assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST));
assert.ok(['true', 'false'].includes(process.env.DAYCARE_AUTH_ENABLED));
assert.equal(typeof process.send, 'function', 'Run this worker only as an IPC child');

let server;
let pool;
let stopping = false;

async function shutdown() {
  if (stopping) return;
  stopping = true;
  let failed = false;
  try {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  } catch { failed = true; }
  try { if (pool) await pool.closeAll(); } catch { failed = true; }
  if (process.connected) process.send({ type: 'stopped', failed }, () => process.disconnect());
  process.exitCode = failed ? 1 : 0;
}

process.on('message', message => { if (message?.type === 'shutdown') void shutdown(); });
process.on('disconnect', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });

(async () => {
  try {
    const app = require('../../src/app');
    pool = require('../../src/config/db');
    const location = await pool.query('SELECT current_database() AS name');
    assert.equal(location.rows[0].name, process.env.DB_NAME);
    server = app.listen(0, '127.0.0.1', () => {
      process.send({ type: 'ready', port: server.address().port, database: location.rows[0].name });
    });
    server.on('error', () => { if (process.connected) process.send({ type: 'startup-error' }); void shutdown(); });
  } catch {
    // Never send SQL, configuration values, credentials or stacks over IPC.
    if (process.connected) process.send({ type: 'startup-error' });
    await shutdown();
    process.exitCode = 1;
  }
})();
