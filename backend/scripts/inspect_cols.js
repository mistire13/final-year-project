require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { Pool } = require('pg');
const p = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
});

async function main() {
  const r = await p.query(`
    SELECT table_name, column_name, is_nullable, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name IN ('report_meals','report_activities','order_items','child_payments') 
    ORDER BY table_name, ordinal_position
  `);
  for (const row of r.rows) {
    console.log(`${row.table_name}.${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`);
  }
  await p.end();
}
main();
