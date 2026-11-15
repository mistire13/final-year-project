'use strict';

// Queues are written by triggers in the same transaction as the source event.
const scope = "daycare_id=COALESCE(NULLIF(current_setting('app.current_daycare_id',true),''),NULLIF(current_setting('app.daycare_id',true),''))::integer";
exports.up = async knex => {
  await knex.raw(`
    ALTER TABLE messages ADD COLUMN push_event_type text CHECK(push_event_type IS NULL OR push_event_type='health');
    CREATE TABLE push_activity_deliveries (
      id bigserial PRIMARY KEY, daycare_id integer NOT NULL REFERENCES daycares(id),
      user_id integer NOT NULL, device_id bigint NOT NULL,
      event_type text NOT NULL CHECK(event_type IN ('announcement','report','checkin','pickup')),
      event_id integer NOT NULL, child_id integer,
      status varchar(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','receipt','checking','sent','failed','cancelled')),
      attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT NOW(),
      lease_until timestamptz, ticket_id text, last_error text, created_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE(daycare_id,event_type,event_id,device_id),
      FOREIGN KEY(daycare_id,user_id) REFERENCES users(daycare_id,id),
      FOREIGN KEY(daycare_id,device_id) REFERENCES push_devices(daycare_id,id) ON DELETE CASCADE
    );
    CREATE INDEX push_activity_ready ON push_activity_deliveries(daycare_id,status,next_attempt_at);
    ALTER TABLE push_activity_deliveries ENABLE ROW LEVEL SECURITY;
    ALTER TABLE push_activity_deliveries FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_scope ON push_activity_deliveries TO ankelba_tenant USING(${scope}) WITH CHECK(${scope});
    GRANT SELECT,INSERT,UPDATE,DELETE ON push_activity_deliveries TO ankelba_tenant;
    GRANT USAGE,SELECT ON SEQUENCE push_activity_deliveries_id_seq TO ankelba_tenant;

    CREATE FUNCTION public.enqueue_child_activity_push() RETURNS trigger
      LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
    DECLARE kind text;
    BEGIN
      IF TG_TABLE_NAME='daily_reports' THEN kind := 'report';
      ELSIF NEW.event_type='checkin' THEN kind := 'checkin';
      ELSIF NEW.event_type='checkout' THEN kind := 'pickup';
      ELSE RETURN NEW; END IF;
      INSERT INTO public.push_activity_deliveries(daycare_id,user_id,device_id,event_type,event_id,child_id)
        SELECT NEW.daycare_id,u.id,d.id,kind,NEW.id,NEW.child_id
        FROM public.guardian_links gl JOIN public.users u ON u.id=gl.user_id AND u.daycare_id=NEW.daycare_id
        JOIN public.roles r ON r.id=u.role_id AND r.name='parent'
        JOIN public.push_devices d ON d.user_id=u.id AND d.daycare_id=u.daycare_id AND d.active
        WHERE gl.child_id=NEW.child_id AND gl.daycare_id=NEW.daycare_id AND u.status='active'
        ON CONFLICT(daycare_id,event_type,event_id,device_id) DO NOTHING;
      RETURN NEW;
    END $$;
    CREATE TRIGGER push_daily_report AFTER INSERT ON daily_reports FOR EACH ROW EXECUTE FUNCTION public.enqueue_child_activity_push();
    CREATE TRIGGER push_attendance AFTER INSERT ON attendance FOR EACH ROW EXECUTE FUNCTION public.enqueue_child_activity_push();

    CREATE FUNCTION public.enqueue_announcement_push() RETURNS trigger
      LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
    BEGIN
      INSERT INTO public.push_activity_deliveries(daycare_id,user_id,device_id,event_type,event_id)
      SELECT NEW.daycare_id,u.id,d.id,'announcement',NEW.id FROM public.users u
      JOIN public.roles r ON r.id=u.role_id
      JOIN public.push_devices d ON d.user_id=u.id AND d.daycare_id=u.daycare_id AND d.active
      WHERE u.daycare_id=NEW.daycare_id AND u.status='active' AND u.id<>NEW.author_id AND
        (r.name='admin' OR (r.name='parent' AND NEW.audience IN ('all','parents','group') AND
          (NEW.target_group_id IS NULL OR EXISTS(SELECT 1 FROM public.guardian_links gl JOIN public.children c ON c.id=gl.child_id AND c.daycare_id=gl.daycare_id
             WHERE gl.user_id=u.id AND gl.daycare_id=NEW.daycare_id AND c.group_id=NEW.target_group_id))) OR
         (r.name='caregiver' AND NEW.audience IN ('all','caregivers','staff','group') AND
          (NEW.target_group_id IS NULL OR EXISTS(SELECT 1 FROM public.children c WHERE c.daycare_id=NEW.daycare_id AND c.caregiver_id=u.id AND c.group_id=NEW.target_group_id)
           OR EXISTS(SELECT 1 FROM public.groups g WHERE g.id=NEW.target_group_id AND g.daycare_id=NEW.daycare_id AND g.lead_caregiver_id=u.id)
           OR EXISTS(SELECT 1 FROM public.front_desk_assignments f WHERE f.daycare_id=NEW.daycare_id AND f.staff_id=u.id AND f.status='active' AND (f.group_id IS NULL OR f.group_id=NEW.target_group_id)))))
      ON CONFLICT(daycare_id,event_type,event_id,device_id) DO NOTHING;
      RETURN NEW;
    END $$;
    CREATE TRIGGER push_announcement AFTER INSERT ON announcements FOR EACH ROW EXECUTE FUNCTION public.enqueue_announcement_push();

    CREATE OR REPLACE FUNCTION public.push_pending_tenants() RETURNS TABLE(daycare_id integer)
      LANGUAGE sql SECURITY DEFINER STABLE SET search_path=pg_catalog,public AS $$
        SELECT DISTINCT pending.daycare_id FROM (
          SELECT p.daycare_id FROM public.push_message_deliveries p WHERE
            (p.status IN ('pending','receipt') AND p.next_attempt_at<=NOW()) OR (p.status IN ('sending','checking') AND p.lease_until<NOW())
          UNION ALL
          SELECT p.daycare_id FROM public.push_activity_deliveries p WHERE
            (p.status IN ('pending','receipt') AND p.next_attempt_at<=NOW()) OR (p.status IN ('sending','checking') AND p.lease_until<NOW())
        ) pending JOIN public.daycares d ON d.id=pending.daycare_id WHERE d.deleted_at IS NULL AND d.status='active'
      $$;
    REVOKE ALL ON FUNCTION public.push_pending_tenants() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.push_pending_tenants() TO ankelba_control;
    ALTER TABLE push_devices ADD COLUMN session_kind text, ADD COLUMN session_state text, ADD COLUMN session_expires_at timestamptz;
    -- Older registrations have no verifiable session and must sign in again.
    UPDATE push_devices SET active=false;
    UPDATE push_devices p SET active=false FROM (
      SELECT id, row_number() OVER(PARTITION BY token ORDER BY updated_at DESC,id DESC) AS n FROM push_devices WHERE active
    ) duplicate WHERE p.id=duplicate.id AND duplicate.n>1;
    CREATE UNIQUE INDEX push_devices_one_active_token ON push_devices(token) WHERE active;
    CREATE FUNCTION public.register_push_token(p_token text, p_user integer, p_kind text, p_state text, p_expiry timestamptz) RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    DECLARE tenant integer := COALESCE(NULLIF(current_setting('app.current_daycare_id',true),''),NULLIF(current_setting('app.daycare_id',true),''))::integer;
    BEGIN
      IF tenant IS NULL OR p_token !~ '^(ExponentPushToken|ExpoPushToken)\\[[A-Za-z0-9_-]{8,200}\\]$'
         OR p_kind NOT IN ('legacy','modern') OR p_state IS NULL OR p_expiry IS NULL OR p_expiry<=clock_timestamp()
         OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_user AND daycare_id=tenant AND status='active') THEN
        RAISE EXCEPTION 'Invalid device registration';
      END IF;
      PERFORM pg_advisory_xact_lock(hashtextextended(p_token,0));
      UPDATE public.push_devices SET active=false,updated_at=NOW() WHERE token=p_token AND active AND (daycare_id<>tenant OR user_id<>p_user);
      INSERT INTO public.push_devices(daycare_id,user_id,token,session_kind,session_state,session_expires_at) VALUES(tenant,p_user,p_token,p_kind,p_state,p_expiry)
        ON CONFLICT(daycare_id,user_id,token) DO UPDATE SET active=true,updated_at=NOW(),session_kind=p_kind,session_state=p_state,session_expires_at=p_expiry;
    END $$;
    REVOKE ALL ON FUNCTION public.register_push_token(text,integer,text,text,timestamptz) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.register_push_token(text,integer,text,text,timestamptz) TO ankelba_tenant;
  `);
};
// Dropping an outbox silently discards undelivered notifications. Require an
// explicit forward migration to retire it after operators drain the queue.
exports.down = async () => { throw new Error('Push activity outbox cannot be rolled back; drain it and create a forward retirement migration.'); };
