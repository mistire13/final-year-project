'use strict';
exports.up = async knex => {
  await knex.raw(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
    CREATE TABLE email_challenges (
      id uuid PRIMARY KEY, user_id integer REFERENCES users(id) ON DELETE CASCADE,
      platform_account_id integer REFERENCES platform_accounts(id) ON DELETE CASCADE,
      email text NOT NULL, purpose text NOT NULL CHECK(purpose IN ('reset','verify')),
      code_hash text NOT NULL, auth_state text NOT NULL, attempts integer NOT NULL DEFAULT 0,
      expires_at timestamptz NOT NULL, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT NOW(),
      CHECK(num_nonnulls(user_id,platform_account_id)=1)
    );
    CREATE INDEX email_challenges_account ON email_challenges(email,purpose,created_at);
    CREATE TABLE email_outbox (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), daycare_id integer REFERENCES daycares(id) ON DELETE CASCADE,
      user_id integer REFERENCES users(id) ON DELETE CASCADE, platform_account_id integer REFERENCES platform_accounts(id) ON DELETE CASCADE,
      recipient text, kind text NOT NULL, event_id integer, child_id integer,
      dedupe_key text UNIQUE NOT NULL, protected_payload text, challenge_id uuid REFERENCES email_challenges(id) ON DELETE CASCADE,
      priority integer NOT NULL DEFAULT 10, status text NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','sending','accepted','failed','cancelled')),
      attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT NOW(), lease_until timestamptz,
      provider_message_id text, last_error text, expires_at timestamptz NOT NULL DEFAULT NOW()+INTERVAL '24 hours',
      created_at timestamptz NOT NULL DEFAULT NOW(), accepted_at timestamptz
    );
    CREATE INDEX email_outbox_pending ON email_outbox(status,next_attempt_at,priority);
    ALTER TABLE email_challenges ENABLE ROW LEVEL SECURITY;
    ALTER TABLE email_challenges FORCE ROW LEVEL SECURITY;
    CREATE POLICY control_scope ON email_challenges TO ankelba_control USING(true) WITH CHECK(true);
    GRANT SELECT,INSERT,UPDATE,DELETE ON email_challenges TO ankelba_control;
    ALTER TABLE email_outbox ENABLE ROW LEVEL SECURITY;
    ALTER TABLE email_outbox FORCE ROW LEVEL SECURITY;
    CREATE POLICY control_scope ON email_outbox TO ankelba_control USING(true) WITH CHECK(true);
    CREATE POLICY tenant_scope ON email_outbox TO ankelba_tenant
      USING(daycare_id=NULLIF(current_setting('app.daycare_id',true),'')::integer)
      WITH CHECK(daycare_id=NULLIF(current_setting('app.daycare_id',true),'')::integer);
    GRANT SELECT,INSERT,UPDATE,DELETE ON email_outbox TO ankelba_control;
    GRANT INSERT ON email_outbox TO ankelba_tenant;
    GRANT SELECT(dedupe_key) ON email_outbox TO ankelba_tenant;

    CREATE FUNCTION public.invalidate_email_verification() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.email IS DISTINCT FROM OLD.email THEN NEW.email_verified_at := NULL; END IF; RETURN NEW; END $$;
    CREATE TRIGGER email_address_changed BEFORE UPDATE OF email ON users FOR EACH ROW EXECUTE FUNCTION public.invalidate_email_verification();
    CREATE TRIGGER platform_email_address_changed BEFORE UPDATE OF email ON platform_accounts FOR EACH ROW EXECUTE FUNCTION public.invalidate_email_verification();

    CREATE FUNCTION public.enqueue_email_events() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
    DECLARE kind text; uid integer; tenant integer; child integer; source integer; unique_key text;
    BEGIN
      tenant := NEW.daycare_id; source := NEW.id;
      IF TG_TABLE_NAME='users' THEN
        IF NEW.role_id NOT IN (0,1,2,3) OR NEW.status<>'active' THEN RETURN NEW; END IF;
        IF TG_OP='INSERT' THEN kind:='account_created';
        ELSIF NEW.email IS DISTINCT FROM OLD.email THEN kind:='account_created';
        ELSIF NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN kind:='password_changed';
        ELSE RETURN NEW; END IF;
        uid:=NEW.id; unique_key:=kind||':'||source||':'||md5(NEW.email||NEW.password_hash);
      ELSIF TG_TABLE_NAME='messages' THEN
        -- Health records have their own notification. Billing reminders have their own opt-in mail channel.
        IF NEW.push_event_type='health' OR NEW.subject='Care fee payment reminder' THEN RETURN NEW; END IF;
        uid:=NEW.recipient_id; kind:='message';
      ELSIF TG_TABLE_NAME IN ('daily_reports','attendance','health_records') THEN
        child:=NEW.child_id;
        IF TG_TABLE_NAME='daily_reports' THEN kind:='report';
        ELSIF TG_TABLE_NAME='health_records' THEN kind:='health_record';
        ELSIF NEW.event_type='checkin' THEN kind:='checkin';
        ELSIF NEW.event_type='checkout' THEN kind:='pickup';
        ELSE RETURN NEW; END IF;
        INSERT INTO public.email_outbox(daycare_id,user_id,kind,event_id,child_id,dedupe_key)
          SELECT tenant,u.id,kind,source,child,kind||':'||source||':'||u.id
          FROM public.guardian_links g JOIN public.users u ON u.id=g.user_id AND u.daycare_id=g.daycare_id
          WHERE g.child_id=child AND g.daycare_id=tenant AND u.status='active' AND u.role_id=3
          ON CONFLICT(dedupe_key) DO NOTHING;
        RETURN NEW;
      ELSIF TG_TABLE_NAME IN ('announcements','alerts') THEN
        kind:=CASE WHEN TG_TABLE_NAME='alerts' THEN 'alert' ELSE 'announcement' END;
        INSERT INTO public.email_outbox(daycare_id,user_id,kind,event_id,dedupe_key)
          SELECT tenant,u.id,kind,source,kind||':'||source||':'||u.id FROM public.users u
          WHERE u.daycare_id=tenant AND u.status='active' AND u.id<>NEW.author_id AND u.role_id IN (1,2,3)
          ON CONFLICT(dedupe_key) DO NOTHING;
        RETURN NEW;
      ELSIF TG_TABLE_NAME='child_invoices' THEN uid:=NEW.parent_id; child:=NEW.child_id; kind:='invoice';
      ELSIF TG_TABLE_NAME='child_payments' THEN
        SELECT parent_id,child_id INTO uid,child FROM public.child_invoices WHERE id=NEW.invoice_id AND daycare_id=tenant;
        kind:='care_receipt';
      ELSIF TG_TABLE_NAME='orders' THEN
        uid:=NEW.parent_id; kind:='order';
        IF TG_OP='UPDATE' AND NEW.order_status IS NOT DISTINCT FROM OLD.order_status AND NEW.payment_status IS NOT DISTINCT FROM OLD.payment_status THEN RETURN NEW; END IF;
        unique_key:='order:'||source||':'||NEW.order_status||':'||NEW.payment_status;
      ELSE RETURN NEW; END IF;
      IF uid IS NOT NULL THEN
        INSERT INTO public.email_outbox(daycare_id,user_id,kind,event_id,child_id,dedupe_key,priority,recipient)
        VALUES(tenant,uid,kind,source,child,COALESCE(unique_key,kind||':'||source||':'||uid),CASE WHEN kind='password_changed' THEN 90 ELSE 10 END,
          CASE WHEN TG_TABLE_NAME='users' THEN to_jsonb(NEW)->>'email' ELSE NULL END)
        ON CONFLICT(dedupe_key) DO NOTHING;
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER email_users AFTER INSERT OR UPDATE OF email,password_hash ON users FOR EACH ROW EXECUTE FUNCTION public.enqueue_email_events();
    CREATE TRIGGER email_messages AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION public.enqueue_email_events();
    CREATE TRIGGER email_reports AFTER INSERT ON daily_reports FOR EACH ROW EXECUTE FUNCTION public.enqueue_email_events();
    CREATE TRIGGER email_attendance AFTER INSERT ON attendance FOR EACH ROW EXECUTE FUNCTION public.enqueue_email_events();
    CREATE TRIGGER email_health AFTER INSERT ON health_records FOR EACH ROW EXECUTE FUNCTION public.enqueue_email_events();
    CREATE TRIGGER email_announcements AFTER INSERT ON announcements FOR EACH ROW EXECUTE FUNCTION public.enqueue_email_events();
    CREATE TRIGGER email_alerts AFTER INSERT ON alerts FOR EACH ROW EXECUTE FUNCTION public.enqueue_email_events();
    CREATE TRIGGER email_invoices AFTER INSERT ON child_invoices FOR EACH ROW EXECUTE FUNCTION public.enqueue_email_events();
    CREATE TRIGGER email_care_receipts AFTER INSERT ON child_payments FOR EACH ROW EXECUTE FUNCTION public.enqueue_email_events();
    CREATE TRIGGER email_orders AFTER INSERT OR UPDATE OF order_status,payment_status ON orders FOR EACH ROW EXECUTE FUNCTION public.enqueue_email_events();

    CREATE FUNCTION public.enqueue_application_email() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
    BEGIN
      IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
      INSERT INTO public.email_outbox(recipient,kind,event_id,dedupe_key)
        VALUES(NEW.admin_email,'application',NEW.id,'application:'||NEW.id||':'||NEW.status) ON CONFLICT(dedupe_key) DO NOTHING;
      RETURN NEW;
    END $$;
    CREATE TRIGGER email_application AFTER INSERT OR UPDATE OF status ON daycare_applications FOR EACH ROW EXECUTE FUNCTION public.enqueue_application_email();
  `);
};
exports.down = async () => { throw new Error('Drain the email queue before retiring email delivery with a forward migration.'); };
