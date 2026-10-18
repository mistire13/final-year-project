'use strict';
const { tables } = require('../tenant-integrity');
const tenantTables = [...tables, 'users', 'guardian_links', 'order_items', 'audit_logs'];
const scoped = "daycare_id = COALESCE(NULLIF(current_setting('app.current_daycare_id',true),''),NULLIF(current_setting('app.daycare_id',true),''))::integer";
const derived = {
  care_instructions: `EXISTS (SELECT 1 FROM public.children c WHERE c.id=child_id AND c.daycare_id = COALESCE(NULLIF(current_setting('app.current_daycare_id',true),''),NULLIF(current_setting('app.daycare_id',true),''))::integer)`,
  emergency_contacts: `EXISTS (SELECT 1 FROM public.children c WHERE c.id=child_id AND c.daycare_id = COALESCE(NULLIF(current_setting('app.current_daycare_id',true),''),NULLIF(current_setting('app.daycare_id',true),''))::integer)`,
  report_meals: `EXISTS (SELECT 1 FROM public.daily_reports r WHERE r.id=report_id AND r.daycare_id = COALESCE(NULLIF(current_setting('app.current_daycare_id',true),''),NULLIF(current_setting('app.daycare_id',true),''))::integer)`,
  report_activities: `EXISTS (SELECT 1 FROM public.daily_reports r WHERE r.id=report_id AND r.daycare_id = COALESCE(NULLIF(current_setting('app.current_daycare_id',true),''),NULLIF(current_setting('app.daycare_id',true),''))::integer)`,
  payments: `EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.daycare_id = COALESCE(NULLIF(current_setting('app.current_daycare_id',true),''),NULLIF(current_setting('app.daycare_id',true),''))::integer)`,
  biometric_references: `EXISTS (SELECT 1 FROM public.guardian_links g WHERE g.id=guardian_link_id AND g.daycare_id = COALESCE(NULLIF(current_setting('app.current_daycare_id',true),''),NULLIF(current_setting('app.daycare_id',true),''))::integer)`,
  guardian_verification_events: `EXISTS (SELECT 1 FROM public.children c WHERE c.id=child_id AND c.daycare_id = COALESCE(NULLIF(current_setting('app.current_daycare_id',true),''),NULLIF(current_setting('app.daycare_id',true),''))::integer)`,
};
exports.up = async knex => {
  // Group roles are cluster-level and deliberately survive rollback. No passwords here.
  await knex.raw(`DO $$ BEGIN
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='ankelba_tenant') THEN CREATE ROLE ankelba_tenant NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='ankelba_control') THEN CREATE ROLE ankelba_control NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO ankelba_tenant,ankelba_control;
  GRANT SELECT ON roles TO ankelba_tenant,ankelba_control;
  GRANT USAGE,SELECT,UPDATE ON ALL SEQUENCES IN SCHEMA public TO ankelba_tenant,ankelba_control;`);
  for (const [table, predicate] of [
    ...tenantTables.map(table => [table, scoped]), ...Object.entries(derived),
    ['daycares', "id = COALESCE(NULLIF(current_setting('app.current_daycare_id',true),''),NULLIF(current_setting('app.daycare_id',true),''))::integer"],
  ]) {
    await knex.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_scope ON ${table};
      CREATE POLICY tenant_scope ON ${table} TO ankelba_tenant USING (${predicate}) WITH CHECK (${predicate});
      GRANT SELECT,INSERT,UPDATE,DELETE ON ${table} TO ankelba_tenant;`);
  }
  await knex.raw(`ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
    ALTER TABLE product_categories FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS category_read ON product_categories;
    DROP POLICY IF EXISTS category_insert ON product_categories;
    DROP POLICY IF EXISTS category_update ON product_categories;
    DROP POLICY IF EXISTS category_delete ON product_categories;
    CREATE POLICY category_read ON product_categories FOR SELECT TO ankelba_tenant USING(daycare_id IS NULL OR ${scoped});
    CREATE POLICY category_insert ON product_categories FOR INSERT TO ankelba_tenant WITH CHECK(${scoped});
    CREATE POLICY category_update ON product_categories FOR UPDATE TO ankelba_tenant USING(${scoped}) WITH CHECK(${scoped});
    CREATE POLICY category_delete ON product_categories FOR DELETE TO ankelba_tenant USING(${scoped});
    GRANT SELECT,INSERT,UPDATE,DELETE ON product_categories TO ankelba_tenant;
    DROP POLICY IF EXISTS control_identity ON users;
    DROP POLICY IF EXISTS control_daycares ON daycares;
    CREATE POLICY control_identity ON users TO ankelba_control USING(true) WITH CHECK(true);
    CREATE POLICY control_daycares ON daycares TO ankelba_control USING(true) WITH CHECK(true);
    GRANT SELECT,INSERT,UPDATE ON users,daycares TO ankelba_control;
    DROP POLICY IF EXISTS control_audit_read ON audit_logs;
    DROP POLICY IF EXISTS control_audit_insert ON audit_logs;
    CREATE POLICY control_audit_read ON audit_logs FOR SELECT TO ankelba_control USING(target_table='daycares');
    CREATE POLICY control_audit_insert ON audit_logs FOR INSERT TO ankelba_control WITH CHECK(target_table='daycares');
    GRANT SELECT,INSERT ON audit_logs TO ankelba_control;
    CREATE OR REPLACE FUNCTION platform_child_counts() RETURNS TABLE(daycare_id integer,child_count bigint)
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
      SELECT c.daycare_id,count(*) FROM public.children c GROUP BY c.daycare_id $$;
    REVOKE ALL ON FUNCTION platform_child_counts() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION platform_child_counts() TO ankelba_control;`);
  const authTables = await knex('information_schema.tables').where({ table_schema: 'public' }).select('table_name');
  for (const { table_name: name } of authTables) {
    if (/^(auth_|platform_|daycare_password_reset_tokens$|password_reset_tokens$|account_invitations$)/.test(name)) {
      await knex.raw(`GRANT SELECT,INSERT,UPDATE,DELETE ON ?? TO ankelba_control, ankelba_tenant`, [name]);
    }
  }
};
exports.down = async knex => {
  for (const table of [...tenantTables, ...Object.keys(derived), 'daycares', 'product_categories']) {
    const policies = await knex('pg_policies').where({ schemaname: 'public', tablename: table }).select('policyname');
    for (const { policyname } of policies) await knex.raw('DROP POLICY IF EXISTS ?? ON ??', [policyname, table]);
    await knex.raw(`ALTER TABLE ${table} NO FORCE ROW LEVEL SECURITY; ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
  }
  await knex.raw('DROP FUNCTION IF EXISTS platform_child_counts()');
};
