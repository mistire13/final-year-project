'use strict';
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'ankelba_dev',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});
(async () => {
  const { rows } = await pool.query(
    "SELECT column_name, data_type, character_maximum_length FROM information_schema.columns WHERE table_name = 'children' ORDER BY ordinal_position"
  );
  console.table(rows);
  await pool.end();
  process.exit(0);
})();
