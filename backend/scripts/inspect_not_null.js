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
    SELECT table_name, column_name, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name IN ('products', 'orders', 'child_invoices', 'child_payments', 'payments')
      AND is_nullable = 'NO'
    ORDER BY table_name, ordinal_position
  `);
  for (const r of res.rows) {
    console.log(`${r.table_name}.${r.column_name}: default = ${r.column_default}`);
  }
  await pool.end();
}

check().catch(console.error);

