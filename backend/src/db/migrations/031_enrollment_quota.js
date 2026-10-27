'use strict';

exports.up = async knex => {
  // Lock the tenant row shared with subscription edits. Concurrent enrollments
  // then count committed active profiles after the preceding enrollment finishes.
  // Invoker rights retain the caller's tenant RLS; no cross-tenant grant is added.
  await knex.raw(`CREATE OR REPLACE FUNCTION enforce_active_child_quota() RETURNS trigger
    LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
    DECLARE capacity integer; enrolled bigint;
    BEGIN
      IF NEW.enrollment_status <> 'active' THEN RETURN NEW; END IF;
      IF TG_OP = 'UPDATE' THEN
        IF OLD.enrollment_status = 'active' AND OLD.daycare_id = NEW.daycare_id THEN RETURN NEW; END IF;
      END IF;
      SELECT max_children INTO capacity FROM public.daycares WHERE id=NEW.daycare_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Daycare unavailable' USING ERRCODE='23503'; END IF;
      SELECT count(*) INTO enrolled FROM public.children WHERE daycare_id=NEW.daycare_id AND enrollment_status='active';
      IF enrolled >= capacity THEN
        RAISE EXCEPTION 'Active child enrollment quota reached' USING ERRCODE='23514', CONSTRAINT='daycare_active_child_quota';
      END IF;
      RETURN NEW;
    END $$;
    DROP TRIGGER IF EXISTS active_child_quota ON children;
    CREATE TRIGGER active_child_quota BEFORE INSERT OR UPDATE OF enrollment_status,daycare_id ON children
      FOR EACH ROW EXECUTE FUNCTION enforce_active_child_quota();`);
};

exports.down = async knex => {
  await knex.raw('DROP TRIGGER IF EXISTS active_child_quota ON children; DROP FUNCTION IF EXISTS enforce_active_child_quota()');
};
