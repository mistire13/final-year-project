'use strict';
exports.up = async knex => {
  for (const table of ['children', 'groups']) {
    await knex.raw('ALTER TABLE ?? ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1', [table]);
    await knex.raw('DROP TRIGGER IF EXISTS edit_version ON ??', [table]);
    await knex.raw('CREATE TRIGGER edit_version BEFORE UPDATE ON ?? FOR EACH ROW EXECUTE FUNCTION bump_edit_version()', [table]);
  }
};
exports.down = async knex => {
  for (const table of ['children', 'groups']) await knex.raw('DROP TRIGGER IF EXISTS edit_version ON ??', [table]);
  // Retain versions already attached to historical records.
};
