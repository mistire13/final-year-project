'use strict';
/**
 * src/config/db.js
 * PostgreSQL connection pool — shared across all service modules.
 * Configuration from §6.6 of backend_architecture_plan_v2.md
 * SRS Refs: FR-DB-01, NFR-PERF-01
 */
const { Pool, types } = require('pg');
// Calendar dates must not shift when the server's timezone changes.
types.setTypeParser(1082, value => value);
const logger = require('./logger');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME     || 'ankelba_dev',
  user:     process.env.APP_DB_USER || 'ankelba_tenant_app',
  password: process.env.APP_DB_PASSWORD,

  // Pool settings — tuned for a small pilot daycare workload (§6.6)
  max:                    10,    // max 10 concurrent DB connections
  min:                    2,     // keep 2 alive at idle (avoids cold-start latency)
  idleTimeoutMillis:      30000, // close idle connections after 30s
  connectionTimeoutMillis: 3000, // fail fast if pool is exhausted
});

const { createTenantPool } = require('../db/tenant-pool');

// Log unexpected pool errors without crashing the process (NFR-MNT-03)
pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { message: err.message });
});

const tenantPool = createTenantPool(pool);

// Authentication must look up identity before a tenant is known. Its separate
// role can access identity/governance tables, never private child records.
const control = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'ankelba_dev',
  user: process.env.CONTROL_DB_USER || 'ankelba_control_app',
  password: process.env.CONTROL_DB_PASSWORD,
  max: 4, connectionTimeoutMillis: 3000,
});
control.on('error', err => logger.error('Control database pool error', { message: err.message }));
tenantPool.control = control;
tenantPool.verifyRuntime = () => require('../db/runtime-policy').verifyRuntime(pool, control);
tenantPool.closeAll = () => Promise.all([pool.end(), control.end()]);

module.exports = tenantPool;

