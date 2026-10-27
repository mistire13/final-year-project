'use strict';
/**
 * Seed 002 — Test Users
 * Creates one test account per role for development and testing (NFR-TST-02).
 *
 * CREDENTIALS (for dev/test ONLY — NEVER use in production):
 *   admin@ankelba.dev     /  Admin@123!
 *   caregiver@ankelba.dev /  Care@123!
 *   parent@ankelba.dev    /  Parent@123!
 */
const bcrypt = require('bcryptjs');

exports.seed = async (knex) => {
  // Remove dependent records first in reverse FK order
  await knex('guardian_verification_events').del().catch(() => {});
  await knex('report_activities').del().catch(() => {});
  await knex('report_meals').del().catch(() => {});
  await knex('daily_reports').del().catch(() => {});
  await knex('attendance').del().catch(() => {});
  await knex('health_records').del().catch(() => {});
  await knex('guardian_links').del().catch(() => {});

  // Ensure default active daycare exists
  const dc = await knex('daycares').where('id', 1).first();
  if (!dc) {
    await knex('daycares').insert({
      id: 1,
      name: 'Ankelba Daycare Center',
      slug: 'ankelba-center',
      contact_email: 'center@ankelba.dev',
      contact_phone: '+251911000000',
      address: 'Bole Medhanialem, Addis Ababa',
      license_number: 'LIC-ADDIS-001',
      status: 'active',
      subscription_plan: 'standard',
      trial_ends_at: new Date(Date.now() + 30 * 86400000),
      max_children: 50,
    });
  } else if (dc.status !== 'active') {
    await knex('daycares').where('id', 1).update({ status: 'active' });
  }

  // Remove test users (seed is idempotent)
  await knex('users')
    .whereIn('email', ['admin@ankelba.dev', 'caregiver@ankelba.dev', 'parent@ankelba.dev'])
    .del();

  const SALT_ROUNDS = 10;
  const [adminHash, caregiverHash, parentHash] = await Promise.all([
    bcrypt.hash('Admin@123!', SALT_ROUNDS),
    bcrypt.hash('Care@123!', SALT_ROUNDS),
    bcrypt.hash('Parent@123!', SALT_ROUNDS),
  ]);

  await knex('users').insert([
    {
      name: 'System Administrator',
      email: 'admin@ankelba.dev',
      password_hash: adminHash,
      role_id: 1, // admin
      status: 'active',
      daycare_id: 1,
      profile_complete: true,
    },
    {
      name: 'Test Caregiver',
      email: 'caregiver@ankelba.dev',
      password_hash: caregiverHash,
      role_id: 2, // caregiver
      status: 'active',
      daycare_id: 1,
      profile_complete: true,
    },
    {
      name: 'Test Parent',
      email: 'parent@ankelba.dev',
      password_hash: parentHash,
      role_id: 3, // parent
      status: 'active',
      daycare_id: 1,
      profile_complete: true,
    },
  ]);

  console.log('✅ Test users seeded with daycare_id: 1:');
  console.log('   admin@ankelba.dev     /  Admin@123!');
  console.log('   caregiver@ankelba.dev /  Care@123!');
  console.log('   parent@ankelba.dev    /  Parent@123!');
};
