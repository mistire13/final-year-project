'use strict';

exports.up = async knex => {
  await knex.schema.alterTable('subscription_payment_intents', t => {
    t.integer('created_by').nullable().references('id').inTable('users').onDelete('RESTRICT');
    t.uuid('restart_authorization_id').nullable();
  });
  await knex.schema.alterTable('daycares', t => {
    t.jsonb('renewal_restart_authorization').nullable();
  });
  await knex.schema.createTable('subscription_payment_references', t => {
    t.bigIncrements('id');
    t.string('provider',32).notNullable();
    t.string('reference',255).notNullable();
    t.uuid('intent_id').nullable().references('id').inTable('subscription_payment_intents').onDelete('RESTRICT');
    t.bigInteger('subscription_event_id').nullable().references('id').inTable('subscription_events').onDelete('RESTRICT');
    t.string('source',32).notNullable();
    t.timestamp('claimed_at',{useTz:true}).notNullable().defaultTo(knex.fn.now());
    // The platform must never reuse the same confirmed identifier for any
    // customer or provider, including during registration and renewal.
    t.unique(['reference']);
    t.index(['intent_id']);
  });
  await knex.schema.createTable('subscription_payment_attempts', t => {
    t.bigIncrements('id');
    t.uuid('intent_id').notNullable().references('id').inTable('subscription_payment_intents').onDelete('RESTRICT');
    t.string('provider',32).notNullable();
    t.string('reference',255).notNullable();
    t.string('outcome',32).notNullable();
    t.timestamp('created_at',{useTz:true}).notNullable().defaultTo(knex.fn.now());
    t.index(['intent_id','created_at']);
  });
  // Old uniqueness guaranteed no exact duplicates. Preserve verified/consumed
  // history before removing the index that let unverified attempts reserve IDs.
  await knex.raw(`
    DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM subscription_payment_intents WHERE status IN ('verified','consumed','resolved')
        AND NULLIF(btrim(payment_reference),'') IS NULL) THEN
        RAISE EXCEPTION 'Confirmed payment is missing its reference; reconcile before migration';
      END IF;
      IF EXISTS(SELECT 1 FROM subscription_events e WHERE e.action='renew' AND
        (NULLIF(btrim(e.details->>'payment_reference'),'') IS NULL OR
         (NULLIF(e.details->>'payment_intent_id','') IS NOT NULL AND NOT EXISTS(
           SELECT 1 FROM subscription_payment_intents i WHERE i.id::text=e.details->>'payment_intent_id'
             AND i.status IN ('verified','consumed','resolved')
             AND btrim(i.payment_reference)=btrim(e.details->>'payment_reference'))))) THEN
        RAISE EXCEPTION 'Renewal payment evidence is missing or inconsistent; reconcile before migration';
      END IF;
      IF EXISTS(WITH evidence AS (
        SELECT payment_reference AS ref FROM subscription_payment_intents WHERE status IN ('verified','consumed','resolved') AND payment_reference IS NOT NULL
        UNION ALL
        SELECT btrim(details->>'payment_reference') FROM subscription_events
          WHERE action='renew' AND NULLIF(btrim(details->>'payment_reference'),'') IS NOT NULL
            AND NULLIF(details->>'payment_intent_id','') IS NULL
      ) SELECT 1 FROM evidence GROUP BY ref HAVING COUNT(*)>1) THEN
        RAISE EXCEPTION 'Confirmed payment references conflict across providers; reconcile before migration';
      END IF;
    END $$;
    INSERT INTO subscription_payment_references(provider,reference,intent_id,source)
      SELECT COALESCE(NULLIF(btrim(provider),''),'legacy'),btrim(payment_reference),id,'historical' FROM subscription_payment_intents
      WHERE status IN ('verified','consumed','resolved');
    -- For historically unknown/non-CBE providers, conservatively preserve the
    -- case/space-normalized spelling too. CBE legacy FT references are
    -- case-insensitive, while modern CBE tokens and URLs retain their case.
    INSERT INTO subscription_payment_references(provider,reference,intent_id,source)
      SELECT COALESCE(NULLIF(btrim(provider),''),'legacy'),upper(regexp_replace(btrim(payment_reference),'\\s','','g')),id,'historical_alias'
      FROM subscription_payment_intents WHERE status IN ('verified','consumed','resolved')
        AND (COALESCE(NULLIF(btrim(provider),''),'legacy') <> 'cbe' OR btrim(payment_reference) ~* '^FT[A-Z0-9]+$')
        AND payment_reference !~* '^https?://'
        AND upper(regexp_replace(btrim(payment_reference),'\\s','','g')) <> btrim(payment_reference);
    INSERT INTO subscription_payment_references(provider,reference,subscription_event_id,source)
      SELECT 'legacy',btrim(details->>'payment_reference'),id,'historical_manual' FROM subscription_events
      WHERE action='renew' AND NULLIF(btrim(details->>'payment_reference'),'') IS NOT NULL
        AND NULLIF(details->>'payment_intent_id','') IS NULL;
    -- Old manual confirmations did not store provider or normalize case. Keep
    -- the original and a conservative normalized alias so case/spacing changes
    -- cannot let the same historical payment be submitted again.
    INSERT INTO subscription_payment_references(provider,reference,subscription_event_id,source)
      SELECT 'legacy',upper(regexp_replace(btrim(details->>'payment_reference'),'\\s','','g')),id,'historical_manual_alias'
      FROM subscription_events WHERE action='renew' AND NULLIF(btrim(details->>'payment_reference'),'') IS NOT NULL
        AND NULLIF(details->>'payment_intent_id','') IS NULL AND details->>'payment_reference' !~* '^https?://'
        AND upper(regexp_replace(btrim(details->>'payment_reference'),'\\s','','g')) <> btrim(details->>'payment_reference');
    DROP INDEX IF EXISTS subscription_payment_reference_unique;
    ALTER TABLE subscription_payment_references ADD CONSTRAINT payment_reference_owner_valid
      CHECK ((intent_id IS NOT NULL)::int + (subscription_event_id IS NOT NULL)::int = 1);
    ALTER TABLE subscription_payment_references ENABLE ROW LEVEL SECURITY;
    ALTER TABLE subscription_payment_references FORCE ROW LEVEL SECURITY;
    CREATE POLICY payment_references_control ON subscription_payment_references TO ankelba_control USING(true) WITH CHECK(true);
    GRANT SELECT,INSERT ON subscription_payment_references TO ankelba_control;
    GRANT USAGE,SELECT ON SEQUENCE subscription_payment_references_id_seq TO ankelba_control;
    ALTER TABLE subscription_payment_attempts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE subscription_payment_attempts FORCE ROW LEVEL SECURITY;
    CREATE POLICY payment_attempts_control ON subscription_payment_attempts TO ankelba_control USING(true) WITH CHECK(true);
    GRANT SELECT,INSERT ON subscription_payment_attempts TO ankelba_control;
    GRANT USAGE,SELECT ON SEQUENCE subscription_payment_attempts_id_seq TO ankelba_control;
  `);
};
exports.down = async () => {};
