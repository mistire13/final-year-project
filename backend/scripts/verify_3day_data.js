const { Pool } = require('pg');
require('dotenv').config({ path: 'backend/.env' });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'ankelba_dev',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'mistre'
});

async function verify() {
  console.log('--- VERIFYING SEEDED DATABASE COUNTS ---');
  const tables = [
    'users',
    'daycares',
    'groups',
    'children',
    'guardian_links',
    'care_instructions',
    'emergency_contacts',
    'biometric_references',
    'attendance',
    'daily_reports',
    'report_meals',
    'report_activities',
    'health_records',
    'messages',
    'announcements',
    'alerts',
    'events',
    'product_categories',
    'products',
    'orders',
    'order_items',
    'payments',
    'child_invoices',
    'child_payments'
  ];

  for (const t of tables) {
    const res = await pool.query(`SELECT COUNT(*) as count FROM ${t}`);
    console.log(`  - ${t.padEnd(22)}: ${res.rows[0].count} records`);
  }

  // Daily Reports breakdown by date
  console.log('\n--- DAILY REPORTS BY DATE ---');
  const repByDate = await pool.query(`
    SELECT report_date, count(*) as count 
    FROM daily_reports 
    GROUP BY report_date 
    ORDER BY report_date ASC
  `);
  console.table(repByDate.rows);

  // Attendance breakdown by event_type and date
  console.log('\n--- ATTENDANCE BY DATE & EVENT ---');
  const attByDate = await pool.query(`
    SELECT DATE(event_time) as date, event_type, count(*) as count
    FROM attendance
    GROUP BY DATE(event_time), event_type
    ORDER BY date ASC, event_type ASC
  `);
  console.table(attByDate.rows);

  // Invoices & Payments summary
  console.log('\n--- INVOICES & PAYMENTS ---');
  const invRes = await pool.query(`
    SELECT ci.id, ci.title, ci.amount, ci.amount_paid, ci.status, c.full_name as child_name
    FROM child_invoices ci
    JOIN children c ON c.id = ci.child_id
    ORDER BY ci.id ASC
  `);
  console.table(invRes.rows);

  await pool.end();
}

verify().catch(console.error);
