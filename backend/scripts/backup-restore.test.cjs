'use strict';
/**
 * backup-restore.test.cjs
 * Automated Node test runner integration for backup and disaster recovery verification.
 *
 * SRS: FR-DB-06, FR-DB-07, AC-13, Section 6.4
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { runBackupVerification, findBinary } = require('./verify-backup.cjs');

test('CLI binaries pg_dump and pg_restore are discoverable', () => {
  const pgDump = findBinary('pg_dump');
  const pgRestore = findBinary('pg_restore');
  assert.ok(pgDump, 'pg_dump binary should be discoverable');
  assert.ok(pgRestore, 'pg_restore binary should be discoverable');
});

test('database backup, isolated restoration, and multi-tenant reconciliation pass completely', async () => {
  const logs = [];
  const customLogger = {
    log: (...args) => logs.push(args.join(' ')),
    warn: (...args) => logs.push('[WARN] ' + args.join(' ')),
    error: (...args) => logs.push('[ERROR] ' + args.join(' ')),
  };

  const result = await runBackupVerification({ logger: customLogger });
  assert.equal(result.success, true);
  assert.ok(result.tableCount >= 45, 'At least 45 tables should be restored');
  assert.ok(logs.some(l => l.includes('[PASS] Database Backup & Restore Verification Completed')));
});
