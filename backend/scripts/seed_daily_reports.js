'use strict';
require('dotenv').config();
const db = require('../src/config/db');

async function seedDailyReports() {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    console.log('--- Seeding Daily Reports and Attendance for Child 1 (Liya Hana) ---');

    // 1. Verify child 1 exists
    const childRes = await client.query('SELECT id, full_name, caregiver_id, daycare_id FROM children WHERE id = 1');
    if (childRes.rows.length === 0) {
      throw new Error('Child ID 1 not found');
    }
    const child = childRes.rows[0];
    const caregiverId = child.caregiver_id || 23;
    const daycareId = child.daycare_id || 1;

    // 2. Ensure caregiver has status active & daycare_id 1
    await client.query('UPDATE users SET status = $1, daycare_id = $2 WHERE id = $3', ['active', daycareId, caregiverId]);

    // 3. Clear existing daily reports for child 1 to start fresh
    await client.query('DELETE FROM daily_reports WHERE child_id = 1');
    await client.query('DELETE FROM attendance WHERE child_id = 1');

    // 4. Determine dates (today and yesterday in Africa/Addis_Ababa)
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Addis_Ababa', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Addis_Ababa', year: 'numeric', month: '2-digit', day: '2-digit' }).format(yesterdayDate);

    console.log(`Seeding reports for dates: Today=${today}, Yesterday=${yesterday}`);

    // 5. Insert today's report
    const r1 = await client.query(
      `INSERT INTO daily_reports
        (child_id, caregiver_id, report_date, sleep_duration_min, sleep_notes, mood, behavior_notes, general_observations, daycare_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        child.id,
        caregiverId,
        today,
        75,
        'Fell asleep quickly with soft lullaby music, rested well.',
        'happy',
        'Very cooperative and shared toys nicely with friends during circle time.',
        'Liya had an enthusiastic, cheerful day! Loved the sensory water play and finished all afternoon snacks.',
        daycareId
      ]
    );
    const r1Id = r1.rows[0].id;

    // Insert meals for today's report
    await client.query(
      `INSERT INTO report_meals (report_id, meal_type, description, portion) VALUES
       ($1, 'breakfast', 'Oatmeal with sliced bananas and honey', 'good'),
       ($1, 'lunch', 'Steamed rice, lentils, and diced vegetables', 'good'),
       ($1, 'afternoon_snack', 'Apple slices and whole wheat crackers', 'good')`,
      [r1Id]
    );

    // Insert activities for today's report
    await client.query(
      `INSERT INTO report_activities (report_id, activity_type, description, location) VALUES
       ($1, 'learning', 'Alphabet letter tracing and shape recognition blocks', 'indoor'),
       ($1, 'play', 'Playground slide and sandbox sensory games', 'outdoor')`,
      [r1Id]
    );

    // 6. Insert yesterday's report
    const r2 = await client.query(
      `INSERT INTO daily_reports
        (child_id, caregiver_id, report_date, sleep_duration_min, sleep_notes, mood, behavior_notes, general_observations, daycare_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        child.id,
        caregiverId,
        yesterday,
        60,
        'Rested comfortably for 1 hour after lunch.',
        'calm',
        'Calm and focused during morning storytelling.',
        'Liya participated with great excitement in song time and finger painting.',
        daycareId
      ]
    );
    const r2Id = r2.rows[0].id;

    await client.query(
      `INSERT INTO report_meals (report_id, meal_type, description, portion) VALUES
       ($1, 'breakfast', 'Warm whole wheat pancakes with berry compote', 'good'),
       ($1, 'lunch', 'Vegetable soup with soft bread roll', 'good')`,
      [r2Id]
    );

    await client.query(
      `INSERT INTO report_activities (report_id, activity_type, description, location) VALUES
       ($1, 'learning', 'Animal sounds flashcards and song recitation', 'indoor'),
       ($1, 'play', 'Building wooden train tracks with classmates', 'indoor')`,
      [r2Id]
    );

    // 7. Insert today's checkin attendance
    const checkinTime = new Date();
    checkinTime.setHours(8, 4, 0, 0);

    await client.query(
      `INSERT INTO attendance (child_id, recorded_by, event_type, event_time, notes, daycare_id)
       VALUES ($1, $2, 'checkin', $3, 'Checked in by mother, cheerful mood', $4)`,
      [child.id, caregiverId, checkinTime.toISOString(), daycareId]
    );

    await client.query('COMMIT');
    console.log(`✅ Successfully seeded daily reports (IDs: ${r1Id}, ${r2Id}) and attendance for child ${child.id}!`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error seeding reports:', err);
    throw err;
  } finally {
    client.release();
    await db.end();
  }
}

seedDailyReports();
