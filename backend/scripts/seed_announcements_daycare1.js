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

async function run() {
  try {
    // 1. Link parent@ankelba.dev (user_id 199) to children 1 and 2
    const links = await pool.query(
      `INSERT INTO guardian_links (child_id, user_id, relationship, pickup_authorized, created_by, daycare_id)
       VALUES 
         (1, 199, 'Mother', true, 197, 1),
         (2, 199, 'Mother', true, 197, 1)
       ON CONFLICT DO NOTHING
       RETURNING id, child_id, user_id`
    );
    console.log('Linked parent 199 to children:', links.rows);

    // 2. Insert active announcements for Daycare 1 if none exist
    const existing = await pool.query('SELECT id FROM announcements WHERE daycare_id = 1');
    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO announcements (author_id, title, body, announcement_type, audience, target_group_id, expires_at, daycare_id)
         VALUES
           (197, 'Welcome to the New Term & Fall Activities', 'We are thrilled to welcome all families and teachers to the new daycare term! Please review the updated activity schedule and ensure child care instructions are up to date.', 'general', 'all', NULL, NULL, 1),
           (197, 'Pediatric Wellness & Growth Screening Day', 'A visiting health specialist will be visiting Ankelba Daycare Center this Friday for routine developmental checks. Light snacks and parent consultations will be provided.', 'alert', 'all', NULL, NULL, 1),
           (197, 'Weekly Fresh Nutrition & Meal Schedule', 'Our nutritious weekly menu includes fresh fruits, steamed organic vegetables, teff-based porridge, and healthy wholesome meals for all classrooms.', 'meal_plan', 'all', NULL, NULL, 1)`
      );
      console.log('Seeded 3 demo announcements for Daycare 1');
    } else {
      console.log(`Daycare 1 already has ${existing.rows.length} announcements`);
    }

    const { rows: a } = await pool.query(
      'SELECT id, title, audience, announcement_type, daycare_id, created_at FROM announcements WHERE daycare_id = 1'
    );
    console.log('Current Daycare 1 announcements:', a);
  } catch (err) {
    console.error('Error seeding announcements:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
