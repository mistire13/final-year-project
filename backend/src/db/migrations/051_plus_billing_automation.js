'use strict';
const scope="daycare_id=COALESCE(NULLIF(current_setting('app.current_daycare_id',true),''),NULLIF(current_setting('app.daycare_id',true),''))::integer";
exports.up=async knex=>{
  await knex.raw(`
    CREATE TABLE billing_automation_settings (
      daycare_id integer PRIMARY KEY REFERENCES daycares(id), enabled boolean NOT NULL DEFAULT false,
      generate_day integer NOT NULL DEFAULT 1 CHECK(generate_day BETWEEN 1 AND 28),
      due_day integer NOT NULL DEFAULT 10 CHECK(due_day BETWEEN generate_day AND 28),
      default_fee numeric(10,2) CHECK(default_fee>0), discount_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK(discount_percent>=0 AND discount_percent<100),
      discount_reason text NOT NULL DEFAULT '', reminder_before_days integer NOT NULL DEFAULT 3 CHECK(reminder_before_days BETWEEN 0 AND 30),
      reminder_after_days integer NOT NULL DEFAULT 3 CHECK(reminder_after_days BETWEEN 0 AND 60),
      in_app_reminders boolean NOT NULL DEFAULT false, email_reminders boolean NOT NULL DEFAULT false,
      version integer NOT NULL DEFAULT 1, updated_by integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT NOW(),
      CHECK(NOT enabled OR default_fee IS NOT NULL), CHECK(discount_percent=0 OR length(btrim(discount_reason))>=12),
      FOREIGN KEY(daycare_id,updated_by) REFERENCES users(daycare_id,id)
    );
    CREATE TABLE billing_automation_previews (
      id uuid PRIMARY KEY,daycare_id integer NOT NULL REFERENCES daycares(id),actor_id integer NOT NULL,
      config_hash varchar(64) NOT NULL,roster_hash varchar(64) NOT NULL,expires_at timestamptz NOT NULL,
      consumed_at timestamptz,created_at timestamptz NOT NULL DEFAULT NOW(),
      FOREIGN KEY(daycare_id,actor_id) REFERENCES users(daycare_id,id)
    );
    CREATE TABLE billing_automation_runs (
      id bigserial PRIMARY KEY,daycare_id integer NOT NULL REFERENCES daycares(id),billing_period varchar(7) NOT NULL,
      status varchar(20) NOT NULL CHECK(status IN ('completed','failed')),attempts integer NOT NULL DEFAULT 1,
      generated_count integer NOT NULL DEFAULT 0,skipped_count integer NOT NULL DEFAULT 0,total_amount numeric(14,2) NOT NULL DEFAULT 0,
      configuration jsonb NOT NULL,last_error text,next_attempt_at timestamptz,created_at timestamptz NOT NULL DEFAULT NOW(),
      completed_at timestamptz,UNIQUE(daycare_id,billing_period)
    );
    CREATE TABLE billing_automation_reminders (
      id bigserial PRIMARY KEY,daycare_id integer NOT NULL REFERENCES daycares(id),invoice_id integer NOT NULL,user_id integer NOT NULL,
      channel varchar(10) NOT NULL CHECK(channel IN ('in_app','email')),kind varchar(10) NOT NULL CHECK(kind IN ('before','after')),
      status varchar(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','cancelled')),
      attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT NOW(),lease_until timestamptz,
      sent_at timestamptz,read_at timestamptz,message_id integer,last_error text,created_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE(daycare_id,invoice_id,user_id,channel,kind),
      FOREIGN KEY(daycare_id,invoice_id) REFERENCES child_invoices(daycare_id,id),
      FOREIGN KEY(daycare_id,user_id) REFERENCES users(daycare_id,id),
      FOREIGN KEY(daycare_id,message_id) REFERENCES messages(daycare_id,id)
    );
    CREATE INDEX billing_reminder_delivery ON billing_automation_reminders(daycare_id,status,next_attempt_at);
    CREATE OR REPLACE FUNCTION public.billing_automation_tenants() RETURNS TABLE(daycare_id integer)
      LANGUAGE sql SECURITY DEFINER STABLE SET search_path=pg_catalog,public AS $$
        SELECT s.daycare_id FROM public.billing_automation_settings s JOIN public.daycares d ON d.id=s.daycare_id
        WHERE s.enabled AND d.deleted_at IS NULL AND d.status='active'
      $$;
    REVOKE ALL ON FUNCTION public.billing_automation_tenants() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.billing_automation_tenants() TO ankelba_control;
  `);
  for(const table of ['billing_automation_settings','billing_automation_previews','billing_automation_runs','billing_automation_reminders']){
    await knex.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_scope ON ${table} TO ankelba_tenant USING(${scope}) WITH CHECK(${scope});
      GRANT SELECT,INSERT,UPDATE ON ${table} TO ankelba_tenant;`);
  }
  await knex.raw(`GRANT USAGE,SELECT ON SEQUENCE billing_automation_runs_id_seq,billing_automation_reminders_id_seq TO ankelba_tenant;`);
};
// Billing evidence is retained on rollback.
exports.down=async()=>{};
