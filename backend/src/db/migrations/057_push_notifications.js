'use strict';

const scope = "daycare_id=COALESCE(NULLIF(current_setting('app.current_daycare_id',true),''),NULLIF(current_setting('app.daycare_id',true),''))::integer";

exports.up = async knex => {
  await knex.raw(`
    CREATE TABLE push_devices (
      id bigserial PRIMARY KEY,
      daycare_id integer NOT NULL REFERENCES daycares(id),
      user_id integer NOT NULL,
      token varchar(255) NOT NULL,
      active boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE(daycare_id,user_id,token),
      UNIQUE(daycare_id,id),
      FOREIGN KEY(daycare_id,user_id) REFERENCES users(daycare_id,id)
    );
    CREATE TABLE push_message_deliveries (
      id bigserial PRIMARY KEY,
      daycare_id integer NOT NULL REFERENCES daycares(id),
      user_id integer NOT NULL,
      message_id integer NOT NULL,
      device_id bigint NOT NULL,
      status varchar(16) NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','sending','receipt','checking','sent','failed','cancelled')),
      attempts integer NOT NULL DEFAULT 0,
      next_attempt_at timestamptz NOT NULL DEFAULT NOW(),
      lease_until timestamptz,
      ticket_id text,
      last_error text,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE(daycare_id,message_id,device_id),
      FOREIGN KEY(daycare_id,user_id) REFERENCES users(daycare_id,id),
      FOREIGN KEY(daycare_id,message_id) REFERENCES messages(daycare_id,id) ON DELETE CASCADE,
      FOREIGN KEY(daycare_id,device_id) REFERENCES push_devices(daycare_id,id) ON DELETE CASCADE
    );
    CREATE INDEX push_message_deliveries_ready ON push_message_deliveries(daycare_id,status,next_attempt_at);
  `);
  for (const table of ['push_devices','push_message_deliveries']) {
    await knex.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_scope ON ${table} TO ankelba_tenant USING(${scope}) WITH CHECK(${scope});
      GRANT SELECT,INSERT,UPDATE,DELETE ON ${table} TO ankelba_tenant;`);
  }
  await knex.raw(`
    GRANT USAGE,SELECT ON SEQUENCE push_devices_id_seq,push_message_deliveries_id_seq TO ankelba_tenant;
    CREATE FUNCTION public.enqueue_message_push() RETURNS trigger
      LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
    BEGIN
      INSERT INTO public.push_message_deliveries(daycare_id,user_id,message_id,device_id)
        SELECT NEW.daycare_id,NEW.recipient_id,NEW.id,d.id FROM public.push_devices d
        WHERE d.daycare_id=NEW.daycare_id AND d.user_id=NEW.recipient_id AND d.active
        ON CONFLICT (daycare_id,message_id,device_id) DO NOTHING;
      RETURN NEW;
    END $$;
    CREATE TRIGGER enqueue_message_push_after_insert AFTER INSERT ON messages
      FOR EACH ROW EXECUTE FUNCTION public.enqueue_message_push();
    CREATE FUNCTION public.push_pending_tenants() RETURNS TABLE(daycare_id integer)
      LANGUAGE sql SECURITY DEFINER STABLE SET search_path=pg_catalog,public AS $$
        SELECT DISTINCT p.daycare_id FROM public.push_message_deliveries p
          JOIN public.daycares d ON d.id=p.daycare_id
          WHERE d.deleted_at IS NULL AND d.status='active'
            AND ((p.status IN ('pending','receipt') AND p.next_attempt_at<=NOW())
              OR (p.status IN ('sending','checking') AND p.lease_until<NOW()))
      $$;
    REVOKE ALL ON FUNCTION public.push_pending_tenants() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.push_pending_tenants() TO ankelba_control;
  `);
};

// Delivery state is retained on rollback; dropping the trigger explicitly stops new work.
exports.down = async knex => {
  await knex.raw('DROP TRIGGER IF EXISTS enqueue_message_push_after_insert ON messages');
};
