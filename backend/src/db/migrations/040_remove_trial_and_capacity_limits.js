'use strict';

/**
 * Migration 040: Remove SaaS Trial Countdown and 50-Child Capacity Limits
 * - Completely removes the artificial 50-child enrollment quota trigger
 * - Updates all daycare centers to active licensed status with no trial expiration
 */

exports.up = async function(knex) {
  // 1. Drop the active child enrollment quota trigger & function
  await knex.raw(`
    DROP TRIGGER IF EXISTS active_child_quota ON children;
    DROP FUNCTION IF EXISTS enforce_active_child_quota();
  `);

  // 2. Allow max_children to be nullable and remove default 50
  const hasMaxChildren = await knex.schema.hasColumn('daycares', 'max_children');
  if (hasMaxChildren) {
    await knex.raw(`
      ALTER TABLE daycares ALTER COLUMN max_children DROP DEFAULT;
      ALTER TABLE daycares ALTER COLUMN max_children DROP NOT NULL;
    `);
  }

  // 3. Update existing daycares: clear trial_ends_at, set subscription_status = 'active'
  await knex.raw(`
    UPDATE daycares
    SET trial_ends_at = NULL,
        subscription_status = 'active',
        subscription_plan = COALESCE(subscription_plan, 'standard')
    WHERE status <> 'pending';
  `);
};

exports.down = async function(knex) {
  // Restore quota trigger if needed
  await knex.raw(`
    CREATE OR REPLACE FUNCTION enforce_active_child_quota() RETURNS trigger
    LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
    DECLARE capacity integer; enrolled bigint;
    BEGIN
      IF NEW.enrollment_status <> 'active' THEN RETURN NEW; END IF;
      IF TG_OP = 'UPDATE' THEN
        IF OLD.enrollment_status = 'active' AND OLD.daycare_id = NEW.daycare_id THEN RETURN NEW; END IF;
      END IF;
      SELECT max_children INTO capacity FROM public.daycares WHERE id=NEW.daycare_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Daycare unavailable' USING ERRCODE='23503'; END IF;
      IF capacity IS NULL THEN RETURN NEW; END IF;
      SELECT count(*) INTO enrolled FROM public.children WHERE daycare_id=NEW.daycare_id AND enrollment_status='active';
      IF enrolled >= capacity THEN
        RAISE EXCEPTION 'Active child enrollment quota reached' USING ERRCODE='23514', CONSTRAINT='daycare_active_child_quota';
      END IF;
      RETURN NEW;
    END $$;

    DROP TRIGGER IF EXISTS active_child_quota ON children;
    CREATE TRIGGER active_child_quota BEFORE INSERT OR UPDATE OF enrollment_status,daycare_id ON children
      FOR EACH ROW EXECUTE FUNCTION enforce_active_child_quota();
  `);
};
