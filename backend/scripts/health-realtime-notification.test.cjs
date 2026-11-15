'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const hasPushColumn of [true, false]) {
  test(`staff health notification publishes a health invalidation ${hasPushColumn ? 'with' : 'without'} the optional column`, async () => {
    const emitted = [];
    let insertSql = '';
    const client = {
      async query(sql) {
        if (sql.includes('SELECT h.*,c.caregiver_id')) return { rows: [{ id: 10, child_id: 11, caregiver_id: 2, record_type: 'incident', description: 'private', parent_notified: false }] };
        if (sql.includes('information_schema.columns')) return { rowCount: hasPushColumn ? 1 : 0 };
        if (sql.includes('INSERT INTO messages')) {
          insertSql = sql;
          return { rowCount: 1, rows: [{ id: 12, sender_id: 2, recipient_id: 3, daycare_id: 4 }] };
        }
        return { rows: [], rowCount: 1 };
      },
      release() {},
    };
    const db = {
      query: async () => ({ rows: [{ id: 10, daycare_id: 4, caregiver_id: 2 }] }),
      connect: async () => client,
    };
    const module = { exports: {} };
    const source = fs.readFileSync(path.join(__dirname, '../src/modules/health/health.service.js'), 'utf8');
    vm.runInNewContext(source, { module, exports: module.exports, require(name) {
      if (name === '../../config/db') return db;
      if (name === '../children/children.service') return {};
      if (name === '../audit/audit.service') return {};
      if (name === '../realtime/hub') return { publishMessage: value => emitted.push(value) };
      throw new Error(`Unexpected import: ${name}`);
    } });
    await module.exports.markNotified(10, { id: 2, daycare_id: 4, role: 'caregiver' });
    assert.equal(insertSql.includes('push_event_type'), hasPushColumn);
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].push_event_type, 'health');
  });
}
