'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'ankelba_dev',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

async function seedRich3Days() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('══════════════════════════════════════════════════════════════════');
    console.log('   ANKELBA REALISTIC 3-DAY SEED GENERATOR (ALL ROLES & FEATURES)  ');
    console.log('══════════════════════════════════════════════════════════════════');

    // 1. Password Hashes
    const SALT_ROUNDS = 10;
    const adminPassHash = await bcrypt.hash('Admin@123!', SALT_ROUNDS);
    const carePassHash = await bcrypt.hash('Care@123!', SALT_ROUNDS);
    const parentPassHash = await bcrypt.hash('Parent@123!', SALT_ROUNDS);
    const superAdminPassHash = await bcrypt.hash('SuperAdmin@123!', SALT_ROUNDS);
    const quickPassHash = await bcrypt.hash('1234', SALT_ROUNDS);

    // 2. Ensure Daycare 1 Exists with Premium / Plus tier
    const dcCheck = await client.query('SELECT id FROM daycares WHERE id = 1');
    if (dcCheck.rows.length === 0) {
      await client.query(`
        INSERT INTO daycares (id, name, slug, contact_email, contact_phone, address, license_number, status, subscription_plan, max_children, trial_ends_at)
        VALUES (1, 'Ankelba Daycare Center', 'ankelba-center', 'center@ankelba.dev', '+251911000000', 'Bole Medhanialem, Addis Ababa', 'LIC-ADDIS-001', 'active', 'premium', 50, NOW() + INTERVAL '60 days')
      `);
    } else {
      await client.query(`
        UPDATE daycares
        SET name = 'Ankelba Daycare Center', status = 'active', subscription_plan = 'premium', max_children = 50, updated_at = NOW()
        WHERE id = 1
      `);
    }
    console.log('✅ Daycare 1 configured as Active Plus (Premium) center');

    // 3. Clean Dependent Tables for Fresh 3-Day Realistic Data
    console.log('🧹 Clearing previous transactional records for clean 3-day history...');
    await client.query('DELETE FROM daycare_payment_resolutions WHERE daycare_id = 1').catch(() => {});
    await client.query('DELETE FROM daycare_payment_requests WHERE daycare_id = 1').catch(() => {});
    await client.query('DELETE FROM child_payments WHERE daycare_id = 1').catch(() => {});
    await client.query('DELETE FROM child_invoices WHERE daycare_id = 1').catch(() => {});
    await client.query('DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE daycare_id = 1)').catch(() => {});
    await client.query('DELETE FROM order_items WHERE daycare_id = 1').catch(() => {});
    await client.query('DELETE FROM orders WHERE daycare_id = 1').catch(() => {});
    await client.query('DELETE FROM shop_stock_movements WHERE daycare_id = 1').catch(() => {});
    await client.query('DELETE FROM products WHERE daycare_id = 1').catch(() => {});
    await client.query('DELETE FROM product_categories WHERE daycare_id = 1').catch(() => {});
    await client.query('DELETE FROM guardian_verification_events WHERE daycare_id = 1').catch(() => {});
    await client.query('DELETE FROM biometric_references WHERE guardian_link_id IN (SELECT id FROM guardian_links WHERE daycare_id = 1)').catch(() => {});
    await client.query('DELETE FROM health_records WHERE daycare_id = 1').catch(() => {});
    await client.query('DELETE FROM report_activities WHERE report_id IN (SELECT id FROM daily_reports WHERE daycare_id = 1)').catch(() => {});
    await client.query('DELETE FROM report_meals WHERE report_id IN (SELECT id FROM daily_reports WHERE daycare_id = 1)').catch(() => {});
    await client.query('DELETE FROM daily_reports WHERE daycare_id = 1').catch(() => {});
    await client.query('DELETE FROM attendance WHERE daycare_id = 1').catch(() => {});
    await client.query('DELETE FROM messages WHERE daycare_id = 1').catch(() => {});
    await client.query('DELETE FROM announcements WHERE daycare_id = 1').catch(() => {});
    await client.query('DELETE FROM alerts WHERE daycare_id = 1').catch(() => {});
    await client.query('DELETE FROM events WHERE daycare_id = 1').catch(() => {});
    await client.query('DELETE FROM care_instructions WHERE child_id IN (SELECT id FROM children WHERE daycare_id = 1)').catch(() => {});
    await client.query('DELETE FROM emergency_contacts WHERE child_id IN (SELECT id FROM children WHERE daycare_id = 1)').catch(() => {});
    await client.query('DELETE FROM guardian_links WHERE daycare_id = 1').catch(() => {});
    await client.query('DELETE FROM children WHERE daycare_id = 1').catch(() => {});
    await client.query('DELETE FROM groups WHERE daycare_id = 1').catch(() => {});

    // 4. Create Users (Super Admin, Daycare Admin, 2 Caregivers, 2 Parents)
    console.log('👤 Seeding core user accounts for all roles...');
    async function upsertUser(email, name, roleId, passHash, phone) {
      const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        const id = existing.rows[0].id;
        await client.query(`
          UPDATE users
          SET name = $1, role_id = $2, password_hash = $3, phone = $4, status = 'active',
              daycare_id = $5, profile_complete = true, updated_at = NOW()
          WHERE id = $6
        `, [name, roleId, passHash, phone, roleId === 0 ? null : 1, id]);
        return id;
      } else {
        const ins = await client.query(`
          INSERT INTO users (name, email, password_hash, role_id, phone, status, daycare_id, profile_complete)
          VALUES ($1, $2, $3, $4, $5, 'active', $6, true)
          RETURNING id
        `, [name, email, passHash, roleId, phone, roleId === 0 ? null : 1]);
        return ins.rows[0].id;
      }
    }

    const superAdminId = await upsertUser('superadmin@ankelba.com', 'Platform Super Admin', 0, superAdminPassHash, '+251911999999');
    const adminId = await upsertUser('admin@ankelba.dev', 'Mekdes Alemu (Director)', 1, adminPassHash, '+251911111111');
    const caregiver1Id = await upsertUser('caregiver@ankelba.dev', 'Almaz Tadesse', 2, carePassHash, '+251911222222');
    const caregiver2Id = await upsertUser('caregiver2@ankelba.dev', 'Tigist Worku', 2, carePassHash, '+251911333333');
    const parent1Id = await upsertUser('parent@ankelba.dev', 'Hana Tesfaye', 3, parentPassHash, '+251911444444');
    const parent2Id = await upsertUser('parent2@ankelba.dev', 'Dawit Kebede', 3, parentPassHash, '+251911555555');
    const parentGmailId = await upsertUser('parent@gmail.com', 'Hana Tesfaye (Demo)', 3, quickPassHash, '+251911444444');

    // 5. Create Class Groups
    console.log('🏫 Seeding classroom groups...');
    const g1Res = await client.query(`
      INSERT INTO groups (name, description, daycare_id, lead_caregiver_id)
      VALUES ('Toddlers (1-2 yrs)', 'Nursery and early toddler play group', 1, $1)
      RETURNING id
    `, [caregiver1Id]);
    const groupToddlerId = g1Res.rows[0].id;

    const g2Res = await client.query(`
      INSERT INTO groups (name, description, daycare_id, lead_caregiver_id)
      VALUES ('Pre-K (3-5 yrs)', 'Early learning, reading readiness and social play', 1, $1)
      RETURNING id
    `, [caregiver2Id]);
    const groupPreKId = g2Res.rows[0].id;

    // 6. Create Children
    console.log('👶 Seeding 4 enrolled children across groups...');
    async function insertChild(name, dob, gender, groupId, caregiverId, fee, photoUrl) {
      const res = await client.query(`
        INSERT INTO children (full_name, dob, gender, group_id, caregiver_id, enrollment_status, daycare_id, monthly_care_fee, photo_url)
        VALUES ($1, $2, $3, $4, $5, 'active', 1, $6, $7)
        RETURNING id
      `, [name, dob, gender, groupId, caregiverId, fee, photoUrl]);
      return res.rows[0].id;
    }

    const child1Id = await insertChild('Abebe Kebede', '2023-04-15', 'male', groupToddlerId, caregiver1Id, 3500.00, 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=200');
    const child2Id = await insertChild('Sara Tadesse', '2023-08-20', 'female', groupToddlerId, caregiver1Id, 3500.00, 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200');
    const child3Id = await insertChild('Yonas Dawit', '2021-11-10', 'male', groupPreKId, caregiver2Id, 4000.00, 'https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?w=200');
    const child4Id = await insertChild('Bethlehem Alemu', '2022-02-18', 'female', groupPreKId, caregiver2Id, 4000.00, 'https://images.unsplash.com/photo-1485546246426-74dc88dec4d9?w=200');

    // 7. Guardian Links (Parent 1 linked to Child 1 & 2; Parent 2 linked to Child 3 & 4; ParentGmail linked to Child 1)
    console.log('🔗 Linking parents to children with pickup authorization...');
    async function linkGuardian(userId, childId, relationship) {
      const res = await client.query(`
        INSERT INTO guardian_links (user_id, child_id, relationship, pickup_authorized, created_by, daycare_id)
        VALUES ($1, $2, $3, true, $4, 1)
        RETURNING id
      `, [userId, childId, relationship, adminId]);
      return res.rows[0].id;
    }

    const link1 = await linkGuardian(parent1Id, child1Id, 'Mother');
    const link2 = await linkGuardian(parent1Id, child2Id, 'Mother');
    const link3 = await linkGuardian(parent2Id, child3Id, 'Father');
    const link4 = await linkGuardian(parent2Id, child4Id, 'Father');
    await linkGuardian(parentGmailId, child1Id, 'Mother');

    // Biometric References for linked guardians
    await client.query(`
      INSERT INTO biometric_references (guardian_link_id, user_id, reference_data, enrolled_by, active)
      VALUES 
        ($1, $2, 'SHA256:7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b', $3, true),
        ($4, $5, 'SHA256:9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e', $3, true)
    `, [link1, parent1Id, adminId, link3, parent2Id]);

    // 8. Care Instructions & Emergency Contacts
    console.log('📋 Adding care instructions & emergency contacts...');
    for (const cid of [child1Id, child2Id, child3Id, child4Id]) {
      await client.query(`
        INSERT INTO care_instructions (child_id, category, instruction_text) VALUES
          ($1, 'dietary', 'No artificial food colors or excessive sugars. Prefers warm water and organic fruit slices.'),
          ($1, 'allergy', 'Mild dust sensitivity. Keep spare inhaler / saline spray in cubby.'),
          ($1, 'general', 'Afternoon nap between 1:00 PM and 2:30 PM. Calmed by soft lullaby or head patting.')
      `, [cid]);

      await client.query(`
        INSERT INTO emergency_contacts (child_id, name, relationship, phone) VALUES
          ($1, 'Almaz Bekele (Aunt)', 'Aunt', '+251912345678'),
          ($1, 'Kebede Tadesse (Grandfather)', 'Grandfather', '+251987654321')
      `, [cid]);
    }

    // 9. Dates Calculation for 3 Days (Day 1: 2 days ago, Day 2: yesterday, Day 3: today)
    const now = new Date();
    const addisFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Addis_Ababa', year: 'numeric', month: '2-digit', day: '2-digit' });
    
    const day3Str = addisFormatter.format(now); // Today
    const day2Date = new Date(now.getTime() - 86400000);
    const day2Str = addisFormatter.format(day2Date); // Yesterday
    const day1Date = new Date(now.getTime() - 2 * 86400000);
    const day1Str = addisFormatter.format(day1Date); // 2 Days Ago

    console.log(`📅 Seeding 3 consecutive days: Day 1 (${day1Str}), Day 2 (${day2Str}), Day 3/Today (${day3Str})`);

    // 10. Attendance Records for All 4 Children Across 3 Days
    console.log('⏱️ Generating realistic attendance logs (Checkin/Checkout) for 3 days...');
    const allKids = [
      { id: child1Id, caregiver: caregiver1Id },
      { id: child2Id, caregiver: caregiver1Id },
      { id: child3Id, caregiver: caregiver2Id },
      { id: child4Id, caregiver: caregiver2Id }
    ];

    for (const kid of allKids) {
      // Day 1 (2 Days Ago) - Complete Full Day
      await client.query(`
        INSERT INTO attendance (child_id, recorded_by, event_type, event_time, notes, daycare_id) VALUES
          ($1, $2, 'checkin',  '${day1Str} 08:15:00+03', 'Checked in on time. High energy and ready for morning games.', 1),
          ($1, $2, 'checkout', '${day1Str} 16:30:00+03', 'Checked out with mother. Completed all daily activities cheerfully.', 1)
      `, [kid.id, kid.caregiver]);

      // Day 2 (Yesterday) - Complete Full Day
      await client.query(`
        INSERT INTO attendance (child_id, recorded_by, event_type, event_time, notes, daycare_id) VALUES
          ($1, $2, 'checkin',  '${day2Str} 08:20:00+03', 'Checked in cheerfully. Brought favorite coloring book.', 1),
          ($1, $2, 'checkout', '${day2Str} 16:45:00+03', 'Checked out safely with registered guardian. Had a peaceful nap.', 1)
      `, [kid.id, kid.caregiver]);

      // Day 3 (Today) - In Center!
      if (kid.id === child2Id) {
        // Child 2 checked in and then early checkout for doctor visit
        await client.query(`
          INSERT INTO attendance (child_id, recorded_by, event_type, event_time, notes, daycare_id) VALUES
            ($1, $2, 'checkin',  '${day3Str} 08:05:00+03', 'Early morning drop-off.', 1),
            ($1, $2, 'checkout', '${day3Str} 12:45:00+03', 'Early pickup by mother for scheduled dentist appointment.', 1)
        `, [kid.id, kid.caregiver]);
      } else {
        // Children 1, 3, 4 are actively CHECKED IN right now!
        await client.query(`
          INSERT INTO attendance (child_id, recorded_by, event_type, event_time, notes, daycare_id) VALUES
            ($1, $2, 'checkin',  '${day3Str} 08:10:00+03', 'Morning check-in. Participating in morning circle & songs.', 1)
        `, [kid.id, kid.caregiver]);
      }
    }

    // 11. Daily Activity Reports (3 Days for Each Child)
    console.log('📝 Seeding rich 3-day daily reports (Meals, Naps, Activities, Moods)...');
    for (const kid of allKids) {
      // Day 1 Report
      const rep1 = await client.query(`
        INSERT INTO daily_reports (child_id, caregiver_id, report_date, sleep_duration_min, sleep_notes, mood, behavior_notes, general_observations, daycare_id)
        VALUES ($1, $2, $3, 75, 'Fell asleep quickly with soft classical music. Rested very well.', 'happy', 'Very cooperative during cleanup and shared puzzles nicely.', 'Had an enthusiastic day! Loved sensory water play and finished all snacks.', 1)
        RETURNING id
      `, [kid.id, kid.caregiver, day1Str]);
      const rep1Id = rep1.rows[0].id;

      await client.query(`
        INSERT INTO report_meals (report_id, meal_type, description, portion) VALUES
          ($1, 'breakfast', 'Warm oats with diced bananas and cinnamon', 'good'),
          ($1, 'lunch', 'Steamed rice, mild vegetable stew and carrots', 'good'),
          ($1, 'afternoon_snack', 'Fresh papaya slices and whole-grain biscuits', 'good')
      `, [rep1Id]);

      await client.query(`
        INSERT INTO report_activities (report_id, activity_type, description, location) VALUES
          ($1, 'learning', 'Color matching blocks and animal sound flashcards', 'indoor'),
          ($1, 'play', 'Playground obstacle course and sandcastle building', 'outdoor')
      `, [rep1Id]);

      // Day 2 Report
      const rep2 = await client.query(`
        INSERT INTO daily_reports (child_id, caregiver_id, report_date, sleep_duration_min, sleep_notes, mood, behavior_notes, general_observations, daycare_id)
        VALUES ($1, $2, $3, 60, 'Calm nap on soft mat with plush toy.', 'excited', 'Eagerly participated in group storytelling and song clapping.', 'Wonderful social engagement. Helped teacher hand out paintbrushes.', 1)
        RETURNING id
      `, [kid.id, kid.caregiver, day2Str]);
      const rep2Id = rep2.rows[0].id;

      await client.query(`
        INSERT INTO report_meals (report_id, meal_type, description, portion) VALUES
          ($1, 'breakfast', 'Scrambled eggs with toasted brown bread and warm milk', 'good'),
          ($1, 'lunch', 'Soft injera with split-pea stew (kik) and cooked beets', 'good'),
          ($1, 'afternoon_snack', 'Crisp apple slices with mild honey dip', 'good')
      `, [rep2Id]);

      await client.query(`
        INSERT INTO report_activities (report_id, activity_type, description, location) VALUES
          ($1, 'learning', 'Finger painting alphabet shapes and leaf rubbing art', 'indoor'),
          ($1, 'play', 'Outdoor bubble chasing and mini soccer ball kicking', 'outdoor')
      `, [rep2Id]);

      // Day 3 Report (Today)
      const rep3 = await client.query(`
        INSERT INTO daily_reports (child_id, caregiver_id, report_date, sleep_duration_min, sleep_notes, mood, behavior_notes, general_observations, daycare_id)
        VALUES ($1, $2, $3, 85, 'Deep, refreshing mid-day nap after active outdoor games.', 'calm', 'Very attentive and kind to younger friends.', 'Creative imagination during building blocks session. Drank 3 glasses of water.', 1)
        RETURNING id
      `, [kid.id, kid.caregiver, day3Str]);
      const rep3Id = rep3.rows[0].id;

      await client.query(`
        INSERT INTO report_meals (report_id, meal_type, description, portion) VALUES
          ($1, 'breakfast', 'Traditional Kinche with light butter and fresh milk', 'good'),
          ($1, 'lunch', 'Mild Shiro with soft injera and diced cucumber salad', 'good'),
          ($1, 'afternoon_snack', 'Sweet watermelon cubes and oat crackers', 'good')
      `, [rep3Id]);

      await client.query(`
        INSERT INTO report_activities (report_id, activity_type, description, location) VALUES
          ($1, 'learning', 'Story time: Adventures of the Little Ethiopian Lion Cub', 'indoor'),
          ($1, 'play', 'Music drumming rhythms and traditional folk dancing', 'indoor')
      `, [rep3Id]);
    }

    // 12. Health & Incident Records
    console.log('🩺 Seeding routine health checks and minor playground incident...');
    await client.query(`
      INSERT INTO health_records (child_id, recorded_by, record_type, description, severity, parent_notified, recorded_at, daycare_id) VALUES
        ($1, $2, 'health', 'Routine morning temperature check: 36.6°C. Clear throat, no signs of cold or lethargy.', 'low', true, '${day1Str} 09:00:00+03', 1),
        ($1, $2, 'incident', 'Minor knee scrape while running on turf playground. Cleansed with antiseptic spray and small dinosaur bandage applied. Child returned to play within 5 minutes.', 'low', true, '${day2Str} 11:30:00+03', 1),
        ($1, $2, 'health', 'Morning wellness observation: 36.5°C. Alert, hydrated, and active.', 'low', true, '${day3Str} 08:30:00+03', 1),
        ($3, $4, 'health', 'Routine morning check: 36.7°C. Good appetite and happy mood.', 'low', true, '${day3Str} 08:45:00+03', 1)
    `, [child1Id, caregiver1Id, child3Id, caregiver2Id]);

    // 13. Direct Messages Between Parents & Caregivers
    console.log('💬 Seeding direct message communication threads...');
    await client.query(`
      INSERT INTO messages (sender_id, recipient_id, subject, body, read_at, created_at, daycare_id) VALUES
        ($1, $2, 'Abebe extra jacket', 'Good morning teacher Almaz! Abebe slept very soundly last night. I packed an extra blue fleece jacket in his cubby in case afternoon gets breezy.', NOW() - INTERVAL '1 day', '${day2Str} 07:50:00+03', 1),
        ($2, $1, 'Re: Abebe extra jacket', 'Good morning Hana! Thank you for letting me know. He is happily coloring right now and we will ensure he puts it on for courtyard playtime.', NOW() - INTERVAL '23 hours', '${day2Str} 08:15:00+03', 1),
        ($1, $2, 'Thank you!', 'Thank you so much teacher Almaz! Have a wonderful day with the little ones.', NOW() - INTERVAL '22 hours', '${day2Str} 08:30:00+03', 1),
        ($3, $4, 'Yonas Music Day', 'Hello teacher Tigist, Yonas was practicing drumming on the table all evening yesterday! He is very excited for music class today.', NOW() - INTERVAL '3 hours', '${day3Str} 08:00:00+03', 1),
        ($4, $3, 'Re: Yonas Music Day', 'Hello Dawit! He was our star drummer during our morning song circle! He has wonderful rhythm and big smiles today.', NULL, '${day3Str} 09:15:00+03', 1)
    `, [parent1Id, caregiver1Id, parent2Id, caregiver2Id]);

    // 14. Announcements, Meal Plans & Urgent Alerts
    console.log('📢 Seeding daycare announcements, alerts, and weekly meal plan...');
    await client.query(`
      INSERT INTO alerts (author_id, title, urgency, recipient_scope, daycare_id, created_at) VALUES
        ($1, 'Notice: Early Closing Friday at 4:30 PM for Staff First-Aid & Safety Certification', 'high', 'parents', 1, '${day2Str} 14:00:00+03')
    `, [adminId]);

    await client.query(`
      INSERT INTO announcements (author_id, title, body, announcement_type, audience, daycare_id, created_at) VALUES
        ($1, 'Ethiopian Cultural Heritage Celebration Next Wednesday!', 'Dear parents, next Wednesday Nov 18 we celebrate our rich cultural heritage! Children are encouraged to wear traditional Habesha Kemis or shirts. We will enjoy traditional storytelling and injera-making demonstrations.', 'general', 'parents', 1, '${day1Str} 10:00:00+03'),
        ($1, 'Weekly Balanced Nutrition Menu (Nov 9 - Nov 13)', 'MONDAY: Warm Kinche & Milk | Vegetable Rice & Lentils | Papaya Slices\nTUESDAY: Scrambled Eggs & Bread | Shiro with Soft Injera | Diced Apples\nWEDNESDAY: Oatmeal & Honey | Kik Alicha & Rice | Watermelon\nTHURSDAY: Chechebsa & Tea | Doro Alicha & Vegetables | Bananas\nFRIDAY: Toast with Peanut Butter | Pasta with Tomato Puree | Biscuits & Milk', 'meal_plan', 'parents', 1, '${day1Str} 08:00:00+03')
    `, [adminId]);

    // 15. Events Calendar
    console.log('📆 Seeding upcoming daycare calendar events...');
    await client.query(`
      INSERT INTO events (created_by, title, event_date, event_time, description, event_type, cancelled, daycare_id, version) VALUES
        ($1, 'Parent-Teacher Progress Review & Coffee', NOW() + INTERVAL '4 days', '09:30:00', 'One-on-one 15-minute consultations to discuss your child milestones, social growth, and daily routines.', 'meeting', false, 1, 1),
        ($1, 'Puppet Show & Folktale Story Hour', NOW() + INTERVAL '7 days', '10:00:00', 'Special guest puppeteers visiting our center for an interactive storytelling morning.', 'activity_day', false, 1, 1),
        ($1, 'Center Cleaning & Sanitation Day', NOW() + INTERVAL '14 days', '14:00:00', 'Deep facility cleaning and toy sterilization. Early pickup at 1:00 PM.', 'special_program', false, 1, 1)
    `, [adminId]);

    // 16. Daycare Store Products & Categories
    console.log('🛍️ Seeding daycare shop categories and products...');
    const cat1 = (await client.query(`INSERT INTO product_categories (name, daycare_id) VALUES ('Uniforms & Aprons', 1) RETURNING id`)).rows[0].id;
    const cat2 = (await client.query(`INSERT INTO product_categories (name, daycare_id) VALUES ('Learning & Art Kits', 1) RETURNING id`)).rows[0].id;
    const cat3 = (await client.query(`INSERT INTO product_categories (name, daycare_id) VALUES ('Accessories & Drinkware', 1) RETURNING id`)).rows[0].id;

    const prod1 = (await client.query(`
      INSERT INTO products (name, description, price, category_id, stock_qty, available, created_by, daycare_id, version)
      VALUES ('Ankelba Embroidered Play Apron', 'Waterproof cotton-blend apron with deep front pocket for messy art & eating.', 350.00, $1, 30, true, $2, 1, 1)
      RETURNING id
    `, [cat1, adminId])).rows[0].id;

    const prod2 = (await client.query(`
      INSERT INTO products (name, description, price, category_id, stock_qty, available, created_by, daycare_id, version)
      VALUES ('Non-Toxic Sensory Modeling Clay (6 Colors)', 'Safe wheat-flour modeling dough with shape cutters for toddler motor skills.', 220.00, $1, 45, true, $2, 1, 1)
      RETURNING id
    `, [cat2, adminId])).rows[0].id;

    const prod3 = (await client.query(`
      INSERT INTO products (name, description, price, category_id, stock_qty, available, created_by, daycare_id, version)
      VALUES ('Stainless Steel Kids Water Bottle (450ml)', 'Double-wall insulated bottle with leak-proof straw lid and carrying loop.', 450.00, $1, 20, true, $2, 1, 1)
      RETURNING id
    `, [cat3, adminId])).rows[0].id;

    // 17. Seed a Completed Store Order for Parent 1
    const order1 = (await client.query(`
      INSERT INTO orders (parent_id, total, order_status, payment_status, daycare_id, note, version, created_at, updated_at)
      VALUES ($1, 570.00, 'collected', 'paid', 1, 'Daycare apparel and art kit order', 1, '${day2Str} 15:00:00+03', '${day2Str} 15:00:00+03')
      RETURNING id
    `, [parent1Id])).rows[0].id;

    await client.query(`
      INSERT INTO order_items (order_id, product_id, quantity, unit_price, daycare_id) VALUES
        ($1, $2, 1, 350.00, 1),
        ($1, $3, 1, 220.00, 1)
    `, [order1, prod1, prod2]);

    await client.query(`
      INSERT INTO payments (order_id, method, status, gateway_ref, verified_at, verification_source)
      VALUES ($1, 'pay_at_daycare', 'paid', 'PAD-202611-001', '${day2Str} 16:30:00+03', 'manual_recorded')
    `, [order1]);

    // 18. Child Care Fee Invoices & Payment Receipts (Finances)
    console.log('💳 Seeding monthly care fee invoices and verified tuition payments...');
    // Abebe Kebede: Paid November Fee via Telebirr
    const inv1 = (await client.query(`
      INSERT INTO child_invoices (daycare_id, child_id, parent_id, invoice_type, billing_period, title, amount, amount_paid, due_date, status, notes)
      VALUES (1, $1, $2, 'care_fee', '2026-11', 'November 2026 Monthly Care Fee', 3500.00, 3500.00, '${day1Str}', 'paid', 'Full payment verified via Telebirr')
      RETURNING id
    `, [child1Id, parent1Id])).rows[0].id;

    await client.query(`
      INSERT INTO child_payments (daycare_id, invoice_id, amount_paid, payment_method, reference_code, receipt_number, recorded_by, verified_at, notes, verification_source)
      VALUES (1, $1, 3500.00, 'telebirr_transfer', 'TB-98234812', 'REC-202611-0001', $2, '${day1Str} 11:30:00+03', 'Verified Telebirr mobile transfer', 'manual_recorded')
    `, [inv1, adminId]);

    // Sara Tadesse: Paid November Fee via CBE
    const inv2 = (await client.query(`
      INSERT INTO child_invoices (daycare_id, child_id, parent_id, invoice_type, billing_period, title, amount, amount_paid, due_date, status, notes)
      VALUES (1, $1, $2, 'care_fee', '2026-11', 'November 2026 Monthly Care Fee', 3500.00, 3500.00, '${day1Str}', 'paid', 'Payment verified via Commercial Bank of Ethiopia')
      RETURNING id
    `, [child2Id, parent1Id])).rows[0].id;

    await client.query(`
      INSERT INTO child_payments (daycare_id, invoice_id, amount_paid, payment_method, reference_code, receipt_number, recorded_by, verified_at, notes, verification_source)
      VALUES (1, $1, 3500.00, 'cbe_transfer', 'FT261109A1B2', 'REC-202611-0002', $2, '${day1Str} 14:15:00+03', 'Verified CBE digital receipt', 'manual_recorded')
    `, [inv2, adminId]);

    // Yonas Dawit: Unpaid / Pending Fee (Ready for parent payment test!)
    await client.query(`
      INSERT INTO child_invoices (daycare_id, child_id, parent_id, invoice_type, billing_period, title, amount, amount_paid, due_date, status, notes)
      VALUES (1, $1, $2, 'care_fee', '2026-11', 'November 2026 Monthly Care Fee', 4000.00, 0.00, NOW() + INTERVAL '5 days', 'pending', 'Monthly tuition payable via Telebirr or CBE')
    `, [child3Id, parent2Id]);

    // 19. Commit Everything
    await client.query('COMMIT');

    console.log('══════════════════════════════════════════════════════════════════');
    console.log('   🎉 3-DAY SEED DATA GENERATION SUCCESSFULLY COMPLETED!          ');
    console.log('══════════════════════════════════════════════════════════════════');
    console.log('TEST CREDENTIALS SUMMARY:');
    console.log('  1. Daycare Admin   : admin@ankelba.dev    / Admin@123!');
    console.log('  2. Caregiver Lead 1: caregiver@ankelba.dev/ Care@123!   (Toddlers: Abebe & Sara)');
    console.log('  3. Caregiver Lead 2: caregiver2@ankelba.dev/Care@123!   (Pre-K: Yonas & Bethlehem)');
    console.log('  4. Parent 1        : parent@ankelba.dev   / Parent@123! (Children: Abebe & Sara)');
    console.log('  5. Parent 2        : parent2@ankelba.dev  / Parent@123! (Children: Yonas & Bethlehem)');
    console.log('  6. Quick Demo      : parent@gmail.com     / 1234');
    console.log('  7. Super Admin     : superadmin@ankelba.com/ SuperAdmin@123!');
    console.log('══════════════════════════════════════════════════════════════════');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error seeding 3-day data:', err);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

seedRich3Days();
