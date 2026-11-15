'use strict';

// Some installations applied 058 before health-message classification was
// introduced. Reconcile them without changing existing messages or devices.
exports.up = async knex => {
  await knex.raw(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS push_event_type text;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.messages'::regclass AND conname='messages_push_event_type_check') THEN
        ALTER TABLE messages ADD CONSTRAINT messages_push_event_type_check CHECK(push_event_type IS NULL OR push_event_type='health');
      END IF;
    END $$;`);
};

// Keep classification if a rollback is attempted: the preceding migration may
// also have created it, and dropping it would change existing deliveries.
exports.down = async () => { throw new Error('Health push classification cannot be rolled back; use a forward migration.'); };
