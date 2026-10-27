'use strict';
require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env') });
const { Client } = require('pg');
// Explicit maintenance command: runtime RLS would hide rows and falsely report
// a clean audit. Migration credentials are used only in a read-only transaction.
const db = new Client(require('../src/config/knexfile').connection);
const { inspect } = require('../src/db/tenant-integrity');
const { inspectEvidence } = require('../src/db/tenant-evidence-integrity');
(async () => {
  await db.connect();
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  // PostgreSQL raises instead of silently filtering any table under RLS.
  await db.query('SET LOCAL row_security=off');
  const findings = [...await inspect(sql => db.query(sql)), ...await inspectEvidence(sql => db.query(sql))];
  await db.query('ROLLBACK');
  console.log(JSON.stringify({ scope: 'all_daycares', read_only: true, findings }, null, 2));
  if (findings.length) process.exitCode = 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.end());
