"use strict";
exports.up = async (knex) => {
  for (const table of ["products", "events", "daycares"]) {
    await knex.raw(
      "ALTER TABLE ?? ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1",
      [table],
    );
  }
  await knex.raw(`CREATE OR REPLACE FUNCTION bump_edit_version() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN NEW.version=OLD.version+1; RETURN NEW; END $$;`);
  for (const table of ["products", "events", "daycares"]) {
    await knex.raw("DROP TRIGGER IF EXISTS edit_version ON ??", [table]);
    await knex.raw(
      "CREATE TRIGGER edit_version BEFORE UPDATE ON ?? FOR EACH ROW EXECUTE FUNCTION bump_edit_version()",
      [table],
    );
  }
  await knex.raw(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS idempotency_key varchar(128), ADD COLUMN IF NOT EXISTS request_hash varchar(64);
    CREATE UNIQUE INDEX IF NOT EXISTS order_retry_identity ON orders(daycare_id,parent_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS ui_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;`);
};
exports.down = async (knex) => {
  for (const table of ["products", "events", "daycares"])
    await knex.raw("DROP TRIGGER IF EXISTS edit_version ON ??", [table]);
  await knex.raw("DROP FUNCTION IF EXISTS bump_edit_version() CASCADE");
  // Preserve stored notes, preferences, retry identities and versions on rollback.
};
