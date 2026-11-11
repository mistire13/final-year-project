'use strict';
exports.up=async knex=>{
  await knex.raw(`
    CREATE TABLE subscription_package_changes (
      id uuid PRIMARY KEY,daycare_id integer NOT NULL REFERENCES daycares(id),
      terms jsonb NOT NULL,effective_at timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'awaiting_payment' CHECK(status IN ('awaiting_payment','paid','blocked','activated','cancelled')),
      payment_intent_id uuid UNIQUE REFERENCES subscription_payment_intents(id),
      created_by integer NOT NULL REFERENCES users(id),reason text NOT NULL,request_key varchar(100) NOT NULL,request_hash varchar(64) NOT NULL,
      blocked_reason text,cancel_reason text,activated_at timestamptz,cancelled_at timestamptz,
      version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT NOW(),updated_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE(daycare_id,id),UNIQUE(daycare_id,request_key)
    );
    CREATE UNIQUE INDEX subscription_one_open_change ON subscription_package_changes(daycare_id)
      WHERE status IN ('awaiting_payment','paid','blocked');
    CREATE INDEX subscription_due_changes ON subscription_package_changes(effective_at) WHERE status IN ('paid','blocked');
    ALTER TABLE subscription_payment_intents ADD COLUMN subscription_change_id uuid,
      ADD COLUMN renewal_period_start timestamptz,
      ADD CONSTRAINT subscription_intent_change_tenant FOREIGN KEY(daycare_id,subscription_change_id) REFERENCES subscription_package_changes(daycare_id,id);
    UPDATE subscription_payment_intents i SET renewal_period_start=d.subscription_ends_at
      FROM daycares d WHERE i.daycare_id=d.id AND i.application_id IS NULL AND i.status IN ('pending','verification_pending','verified');
    CREATE FUNCTION public.protect_scheduled_subscription_terms() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
      BEGIN
        IF ROW(NEW.id,NEW.daycare_id,NEW.terms,NEW.effective_at,NEW.created_by,NEW.reason,NEW.request_key,NEW.request_hash)
          IS DISTINCT FROM ROW(OLD.id,OLD.daycare_id,OLD.terms,OLD.effective_at,OLD.created_by,OLD.reason,OLD.request_key,OLD.request_hash)
          THEN RAISE EXCEPTION 'Accepted future subscription terms are immutable' USING ERRCODE='23514'; END IF;
        IF OLD.status IN ('activated','cancelled') AND NEW IS DISTINCT FROM OLD
          THEN RAISE EXCEPTION 'Completed subscription changes are immutable' USING ERRCODE='23514'; END IF;
        RETURN NEW;
      END $$;
    CREATE TRIGGER protect_scheduled_terms BEFORE UPDATE ON subscription_package_changes FOR EACH ROW EXECUTE FUNCTION public.protect_scheduled_subscription_terms();
    CREATE TRIGGER edit_version BEFORE UPDATE ON subscription_package_changes FOR EACH ROW EXECUTE FUNCTION bump_edit_version();
    ALTER TABLE subscription_package_changes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE subscription_package_changes FORCE ROW LEVEL SECURITY;
    CREATE POLICY subscription_change_control ON subscription_package_changes TO ankelba_control USING(true) WITH CHECK(true);
    CREATE POLICY subscription_change_tenant ON subscription_package_changes FOR SELECT TO ankelba_tenant
      USING(daycare_id=NULLIF(current_setting('app.daycare_id',true),'')::integer);
    GRANT SELECT,INSERT,UPDATE ON subscription_package_changes TO ankelba_control;
    GRANT SELECT ON subscription_package_changes TO ankelba_tenant;
  `);
};
exports.down=async()=>{};
