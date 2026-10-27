'use strict';
const { inspectEvidence } = require('../tenant-evidence-integrity');

exports.up = async knex => {
  const findings = await inspectEvidence(sql => knex.raw(sql));
  if (findings.length) throw new Error('Tenant evidence preflight failed; records require review: ' + JSON.stringify(findings));
  await knex.raw(`
    ALTER TABLE guardian_links ADD CONSTRAINT ti_guardian_links_created_by
      FOREIGN KEY(daycare_id,created_by) REFERENCES users(daycare_id,id);
    ALTER TABLE guardian_links ADD CONSTRAINT guardian_links_tenant_identity UNIQUE(daycare_id,id);
    ALTER TABLE guardian_links ADD CONSTRAINT guardian_links_user_identity UNIQUE(id,user_id);
    ALTER TABLE attendance ADD CONSTRAINT attendance_child_identity UNIQUE(child_id,id);
    ALTER TABLE biometric_references ADD CONSTRAINT ti_biometric_link_user
      FOREIGN KEY(guardian_link_id,user_id) REFERENCES guardian_links(id,user_id) ON DELETE CASCADE;
    ALTER TABLE guardian_verification_events ADD CONSTRAINT ti_verification_attendance_child
      FOREIGN KEY(child_id,attendance_id) REFERENCES attendance(child_id,id);
  `);
  for (const [table, column, parent, actors] of [
    ['biometric_references', 'guardian_link_id', 'guardian_links', ['user_id', 'enrolled_by']],
    ['guardian_verification_events', 'child_id', 'children', ['guardian_user_id', 'verified_by']],
  ]) {
    await knex.raw(`ALTER TABLE ${table} ADD COLUMN daycare_id integer;
      UPDATE ${table} x SET daycare_id=p.daycare_id FROM ${parent} p WHERE p.id=x.${column};
      ALTER TABLE ${table} ALTER COLUMN daycare_id SET NOT NULL;
      CREATE FUNCTION ti_${table}_owner() RETURNS trigger LANGUAGE plpgsql
        SET search_path=pg_catalog,public AS $$ BEGIN
        SELECT daycare_id INTO NEW.daycare_id FROM public.${parent} WHERE id=NEW.${column};
        RETURN NEW;
      END $$;
      CREATE TRIGGER ti_${table}_owner BEFORE INSERT OR UPDATE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION ti_${table}_owner();
      ALTER TABLE ${table} ADD CONSTRAINT ti_${table}_parent
        FOREIGN KEY(daycare_id,${column}) REFERENCES ${parent}(daycare_id,id);
    `);
    for (const actor of actors) {
      await knex.raw(`ALTER TABLE ${table} ADD CONSTRAINT ti_${table}_${actor}
        FOREIGN KEY(daycare_id,${actor}) REFERENCES users(daycare_id,id)`);
    }
  }
  await knex.raw(`CREATE FUNCTION ti_audit_actor() RETURNS trigger LANGUAGE plpgsql
    SET search_path=pg_catalog,public AS $$
    DECLARE actor_daycare integer; actor_role smallint;
    BEGIN
      IF NEW.actor_id IS NULL THEN RETURN NEW; END IF;
      SELECT daycare_id,role_id INTO actor_daycare,actor_role FROM public.users WHERE id=NEW.actor_id FOR KEY SHARE;
      IF NOT FOUND OR (
        (actor_daycare IS NOT NULL AND actor_daycare=NEW.daycare_id)
        OR (actor_daycare IS NULL AND actor_role=0 AND NEW.target_table IN ('daycares','subscription_packages'))
      ) IS NOT TRUE THEN
        RAISE EXCEPTION 'Audit actor does not belong to this scope' USING ERRCODE='23503';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER ti_audit_actor BEFORE INSERT OR UPDATE ON audit_logs FOR EACH ROW EXECUTE FUNCTION ti_audit_actor();
    DROP POLICY control_audit_read ON audit_logs;
    DROP POLICY control_audit_insert ON audit_logs;
    CREATE POLICY control_audit_read ON audit_logs FOR SELECT TO ankelba_control
      USING(target_table IN ('daycares','subscription_packages'));
    CREATE POLICY control_audit_insert ON audit_logs FOR INSERT TO ankelba_control
      WITH CHECK(target_table IN ('daycares','subscription_packages'));
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ankelba_tenant;
  `);
  // Identity sequences are writable only for tables this runtime can insert into.
  const { rows } = await knex.raw(`SELECT pg_get_serial_sequence('public.' || quote_ident(c.relname), 'id') AS sequence
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND has_table_privilege('ankelba_tenant', c.oid, 'INSERT')`);
  for (const row of rows.filter(row => row.sequence)) {
    await knex.raw(`GRANT USAGE,SELECT ON SEQUENCE ${row.sequence} TO ankelba_tenant`);
  }
};

exports.down = async knex => {
  await knex.raw('DROP TRIGGER ti_audit_actor ON audit_logs; DROP FUNCTION ti_audit_actor()');
  for (const table of ['guardian_verification_events', 'biometric_references']) {
    await knex.raw(`DROP TRIGGER ti_${table}_owner ON ${table}; DROP FUNCTION ti_${table}_owner();
      ALTER TABLE ${table} DROP COLUMN daycare_id`);
  }
  await knex.raw(`ALTER TABLE guardian_verification_events DROP CONSTRAINT ti_verification_attendance_child;
    ALTER TABLE biometric_references DROP CONSTRAINT ti_biometric_link_user;
    ALTER TABLE guardian_links DROP CONSTRAINT ti_guardian_links_created_by,
      DROP CONSTRAINT guardian_links_tenant_identity, DROP CONSTRAINT guardian_links_user_identity;
    ALTER TABLE attendance DROP CONSTRAINT attendance_child_identity;`);
  // Retain least-privilege grants and the platform package audit fix on rollback.
};
