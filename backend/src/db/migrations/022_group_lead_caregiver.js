'use strict';

exports.up = async (knex) => {
  const hasCol = await knex.schema.hasColumn('groups', 'lead_caregiver_id');
  if (!hasCol) {
    await knex.schema.alterTable('groups', (table) => {
      table.integer('lead_caregiver_id').references('id').inTable('users').onDelete('SET NULL');
    });
  }
};

exports.down = async (knex) => {
  const hasCol = await knex.schema.hasColumn('groups', 'lead_caregiver_id');
  if (hasCol) {
    await knex.schema.alterTable('groups', (table) => {
      table.dropColumn('lead_caregiver_id');
    });
  }
};
