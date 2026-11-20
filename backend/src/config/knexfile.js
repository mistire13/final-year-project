'use strict';
require('dns').setDefaultResultOrder?.('ipv4first');
/**
 * src/config/knexfile.js
 * Knex configuration — used EXCLUSIVELY for migrations and seeds.
 * Service layer queries use the raw pg pool from db.js for performance.
 * SRS Refs: FR-DB-01, §6.6 backend plan
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

/** @type {import('knex').Knex.Config} */
module.exports = {
  client: 'pg',
  connection: {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME     || 'ankelba_dev',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 30000,
  },
  migrations: {
    directory: require('path').resolve(__dirname, '../db/migrations'),
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: require('path').resolve(__dirname, '../db/seeds'),
  },
  pool: {
    min: 0,
    max: 5,
    acquireTimeoutMillis: 60000,
  },
};
