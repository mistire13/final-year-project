'use strict';

// These fields existed in the working database without a versioned migration.
// Preserve existing values; make a clean install match the supported services.
exports.up = async knex => {
  for (const [table, column, type] of [
    ['products', 'image_url', 'text'],
    ['users', 'phone', 'varchar(30)'],
    ['users', 'title', 'varchar(150)'],
    ['users', 'qualifications', 'text'],
    ['users', 'emergency_contact', 'text'],
    ['users', 'shift', 'varchar(150)'],
  ]) await knex.raw(`ALTER TABLE ?? ADD COLUMN IF NOT EXISTS ?? ${type}`, [table, column]);
};

// Pre-existing columns may contain live data. A rollback must not erase them.
exports.down = async () => {};
