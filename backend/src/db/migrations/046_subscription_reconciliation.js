'use strict';
exports.up = async knex => {
  await knex.schema.createTable('subscription_payment_settings', t => {
    t.integer('id').primary();
    t.string('institution', 100).notNullable().defaultTo('');
    t.string('account_holder', 150).notNullable().defaultTo('');
    t.string('account_number', 150).notNullable().defaultTo('');
    t.integer('version').notNullable().defaultTo(1);
    t.timestamp('updated_at', {useTz:true}).notNullable().defaultTo(knex.fn.now());
  });
  await knex('subscription_payment_settings').insert({
    id: 1,
    institution: 'Telebirr',
    account_holder: 'Ankelba Daycare Platform',
    account_number: '0911234567',
  });
  await knex.schema.createTable('subscription_payment_resolutions', t => {
    t.bigIncrements('id');
    t.uuid('intent_id').notNullable().unique().references('id').inTable('subscription_payment_intents').onDelete('RESTRICT');
    t.string('outcome', 30).notNullable();
    t.text('reason').notNullable();
    t.string('evidence_reference',200).notNullable();
    t.integer('actor_id').notNullable().references('id').inTable('users');
    t.timestamp('recorded_at',{useTz:true}).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`
    CREATE OR REPLACE FUNCTION public.ti_audit_actor()
    RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'public' AS $$
    DECLARE actor_daycare integer; actor_role smallint;
    BEGIN
      IF NEW.actor_id IS NULL THEN RETURN NEW; END IF;
      SELECT daycare_id,role_id INTO actor_daycare,actor_role FROM public.users WHERE id=NEW.actor_id FOR KEY SHARE;
      IF NOT FOUND OR ((actor_daycare IS NOT NULL AND actor_daycare=NEW.daycare_id)
        OR (actor_daycare IS NULL AND actor_role=0 AND NEW.target_table IN
          ('daycares','subscription_packages','daycare_applications','subscription_payment_intents','subscription_payment_settings'))) IS NOT TRUE THEN
        RAISE EXCEPTION 'Audit actor does not belong to this scope' USING ERRCODE='23503';
      END IF;
      RETURN NEW;
    END $$;
    DROP POLICY IF EXISTS control_audit_read ON audit_logs;
    DROP POLICY IF EXISTS control_audit_insert ON audit_logs;
    CREATE POLICY control_audit_read ON audit_logs FOR SELECT TO ankelba_control USING(target_table IN
      ('daycares','subscription_packages','daycare_applications','subscription_payment_intents','subscription_payment_settings'));
    CREATE POLICY control_audit_insert ON audit_logs FOR INSERT TO ankelba_control WITH CHECK(target_table IN
      ('daycares','subscription_packages','daycare_applications','subscription_payment_intents','subscription_payment_settings'));
    ALTER TABLE subscription_payment_intents DROP CONSTRAINT payment_intent_status_valid;
    ALTER TABLE subscription_payment_intents ADD CONSTRAINT payment_intent_status_valid
      CHECK(status IN ('pending','verification_pending','verified','rejected','consumed','resolved'));
    ALTER TABLE subscription_payment_settings ADD CONSTRAINT payment_settings_singleton CHECK(id=1);
    ALTER TABLE subscription_payment_resolutions ADD CONSTRAINT payment_resolution_outcome_valid
      CHECK(outcome IN ('refund_recorded','credit_recorded','other_resolved'));
    ALTER TABLE subscription_payment_settings ENABLE ROW LEVEL SECURITY;
    ALTER TABLE subscription_payment_settings FORCE ROW LEVEL SECURITY;
    CREATE POLICY payment_settings_control ON subscription_payment_settings TO ankelba_control USING(true) WITH CHECK(true);
    GRANT SELECT,UPDATE ON subscription_payment_settings TO ankelba_control;
    ALTER TABLE subscription_payment_resolutions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE subscription_payment_resolutions FORCE ROW LEVEL SECURITY;
    CREATE POLICY payment_resolution_control ON subscription_payment_resolutions TO ankelba_control USING(true) WITH CHECK(true);
    GRANT SELECT,INSERT ON subscription_payment_resolutions TO ankelba_control;
    GRANT USAGE,SELECT ON SEQUENCE subscription_payment_resolutions_id_seq TO ankelba_control;
  `);
};
exports.down = async () => {};
