const { Pool } = require('pg');
require('dotenv').config({ path: 'backend/.env' });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'ankelba_dev',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'mistre'
});

async function check() {
  const res = await pool.query(`
    SELECT conname, pg_get_constraintdef(c.oid) as def
    FROM pg_constraint c
    WHERE conrelid::regclass::text IN ('child_invoices', 'child_payments')
      AND contype = 'c'
  `);
  for (const r of res.rows) {
    console.log(r.conname, ':', r.def);
  }
  await pool.end();
}

check().catch(console.error);
