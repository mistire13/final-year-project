'use strict';

// Preserve operational/history references when a platform operator removes a center.
exports.up = async knex => {
  await knex.schema.alterTable('daycares', t => {
    t.timestamp('deleted_at', { useTz: true });
    t.text('deletion_reason');
  });
  await knex.raw(`ALTER TABLE daycares ADD CONSTRAINT deleted_daycare_inactive
    CHECK (deleted_at IS NULL OR status = 'suspended')`);
};
// A rollback must not silently restore access to removed centers.
exports.down = async () => {};
