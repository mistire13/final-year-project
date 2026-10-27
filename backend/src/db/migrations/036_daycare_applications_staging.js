'use strict';

/**
 * Migration 036: Staging Table for Daycare Applications
 * Prevents unapproved daycare registrations from polluting primary daycares & users tables.
 * Holds pending and rejected applications; auto-purgeable without affecting production data.
 */

exports.up = async function(knex) {
  await knex.schema.createTable('daycare_applications', (table) => {
    table.increments('id').primary();
    table.string('daycare_name', 200).notNullable();
    table.string('city_subcity', 200).notNullable();
    table.string('contact_email', 255).notNullable();
    table.string('contact_phone', 50).notNullable();
    table.string('license_number', 100).defaultTo('N/A');
    table.string('admin_name', 200).notNullable();
    table.string('admin_email', 255).notNullable();
    table.string('admin_phone', 50).notNullable();
    table.string('password_hash', 255).notNullable();
    table.string('requested_plan', 50).defaultTo('standard');
    table.string('status', 30).notNullable().defaultTo('pending'); // 'pending', 'approved', 'rejected'
    table.text('rejection_reason').nullable();
    table.integer('created_daycare_id').nullable(); // set on approval
    table.integer('reviewed_by').nullable();
    table.timestamp('reviewed_at').nullable();
    table.timestamps(true, true);

    table.index(['status']);
    table.index(['admin_email']);
    table.index(['created_at']);
  });

  // Grant permissions to control connection role so it can manage applications
  await knex.raw(`
    GRANT SELECT, INSERT, UPDATE, DELETE ON daycare_applications TO ankelba_control;
    GRANT USAGE, SELECT ON SEQUENCE daycare_applications_id_seq TO ankelba_control;
  `);
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('daycare_applications');
};
