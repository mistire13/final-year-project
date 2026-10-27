"use strict";
exports.up = async (knex) => {
  await knex.raw(
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1",
  );
  await knex.raw("DROP TRIGGER IF EXISTS edit_version ON orders");
  await knex.raw(
    "CREATE TRIGGER edit_version BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION bump_edit_version()",
  );
};
exports.down = async (knex) => {
  await knex.raw("DROP TRIGGER IF EXISTS edit_version ON orders");
  // Preserve edit history/version data on rollback.
};
