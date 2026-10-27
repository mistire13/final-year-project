'use strict';

/**
 * Migration 037: Allow Super Admin audit logging for daycare applications
 */
exports.up = async function(knex) {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION public.ti_audit_actor()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
    DECLARE actor_daycare integer; actor_role smallint;
    BEGIN
      IF NEW.actor_id IS NULL THEN RETURN NEW; END IF;
      SELECT daycare_id, role_id INTO actor_daycare, actor_role FROM public.users WHERE id = NEW.actor_id FOR KEY SHARE;
      IF NOT FOUND OR (
        (actor_daycare IS NOT NULL AND actor_daycare = NEW.daycare_id)
        OR (actor_daycare IS NULL AND actor_role = 0 AND NEW.target_table IN ('daycares', 'subscription_packages', 'daycare_applications'))
      ) IS NOT TRUE THEN
        RAISE EXCEPTION 'Audit actor does not belong to this scope' USING ERRCODE='23503';
      END IF;
      RETURN NEW;
    END $$;
  `);
};

exports.down = async function(knex) {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION public.ti_audit_actor()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
    DECLARE actor_daycare integer; actor_role smallint;
    BEGIN
      IF NEW.actor_id IS NULL THEN RETURN NEW; END IF;
      SELECT daycare_id, role_id INTO actor_daycare, actor_role FROM public.users WHERE id = NEW.actor_id FOR KEY SHARE;
      IF NOT FOUND OR (
        (actor_daycare IS NOT NULL AND actor_daycare = NEW.daycare_id)
        OR (actor_daycare IS NULL AND actor_role = 0 AND NEW.target_table IN ('daycares', 'subscription_packages'))
      ) IS NOT TRUE THEN
        RAISE EXCEPTION 'Audit actor does not belong to this scope' USING ERRCODE='23503';
      END IF;
      RETURN NEW;
    END $$;
  `);
};
