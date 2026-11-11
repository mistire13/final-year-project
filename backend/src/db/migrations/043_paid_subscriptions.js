'use strict';

exports.up = async knex => {
  await knex.schema.alterTable('subscription_packages', t => {
    t.decimal('six_month_price', 12, 2).nullable();
  });
  await knex.schema.alterTable('daycares', t => {
    t.timestamp('subscription_started_at', { useTz: true }).nullable();
  });
  await knex.raw(`
    ALTER TABLE subscription_packages ADD CONSTRAINT package_six_month_price_valid
      CHECK (six_month_price IS NULL OR six_month_price >= 0);
    ALTER TABLE daycares DROP CONSTRAINT IF EXISTS subscription_cycle_valid;
    ALTER TABLE daycares ADD CONSTRAINT subscription_cycle_valid
      CHECK (billing_cycle IN ('monthly','six_month','annual'));
  `);
  await knex.schema.createTable('subscription_payment_intents', t => {
    t.uuid('id').primary();
    t.text('secret_hash').notNullable();
    t.text('email').notNullable();
    t.jsonb('terms').notNullable();
    t.string('status', 32).notNullable().defaultTo('pending');
    t.decimal('amount', 12, 2).notNullable();
    t.string('currency', 3).notNullable();
    t.text('recipient').notNullable();
    t.string('provider', 32);
    t.string('payment_reference', 255);
    t.jsonb('verification');
    t.text('review_reason');
    t.integer('reviewed_by').references('id').inTable('users');
    t.integer('daycare_id').references('id').inTable('daycares');
    t.integer('application_id').unique().references('id').inTable('daycare_applications').onDelete('RESTRICT');
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.integer('version').notNullable().defaultTo(1);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`
    ALTER TABLE subscription_payment_intents ADD CONSTRAINT payment_intent_status_valid
      CHECK (status IN ('pending','verification_pending','verified','rejected','consumed'));
    CREATE UNIQUE INDEX subscription_payment_reference_unique
      ON subscription_payment_intents(provider, payment_reference)
      WHERE payment_reference IS NOT NULL;
    GRANT SELECT,INSERT,UPDATE ON subscription_payment_intents TO ankelba_control;
    ALTER TABLE subscription_payment_intents ENABLE ROW LEVEL SECURITY;
    ALTER TABLE subscription_payment_intents FORCE ROW LEVEL SECURITY;
    CREATE POLICY payment_intent_control ON subscription_payment_intents TO ankelba_control
      USING (true) WITH CHECK (true);
    CREATE OR REPLACE FUNCTION enforce_active_child_quota() RETURNS trigger
    LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
    DECLARE capacity integer; enrolled bigint;
    BEGIN
      IF NEW.enrollment_status <> 'active' THEN RETURN NEW; END IF;
      IF TG_OP = 'UPDATE' AND OLD.enrollment_status = 'active' AND OLD.daycare_id = NEW.daycare_id THEN RETURN NEW; END IF;
      SELECT max_children INTO capacity FROM public.daycares WHERE id=NEW.daycare_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Daycare unavailable' USING ERRCODE='23503'; END IF;
      IF capacity IS NULL THEN RETURN NEW; END IF;
      SELECT count(*) INTO enrolled FROM public.children WHERE daycare_id=NEW.daycare_id AND enrollment_status='active';
      IF enrolled >= capacity THEN
        RAISE EXCEPTION 'Active child enrollment quota reached' USING ERRCODE='23514', CONSTRAINT='daycare_active_child_quota';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER active_child_quota BEFORE INSERT OR UPDATE OF enrollment_status,daycare_id ON children
      FOR EACH ROW EXECUTE FUNCTION enforce_active_child_quota();
  `);
};

// Financial records and accepted terms must remain available on rollback.
exports.down = async () => {};
