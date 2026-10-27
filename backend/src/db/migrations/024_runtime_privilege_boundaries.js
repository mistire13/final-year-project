'use strict';

exports.up = async knex => {
  // Remove broad grants left by older provisioning scripts, especially
  // TRUNCATE (which is not filtered by RLS) and platform authentication tables.
  await knex.raw('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ankelba_tenant');
  await knex.raw('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM ankelba_tenant');
  const operational = [...require('../tenant-integrity').tables, 'users', 'guardian_links', 'order_items',
    'care_instructions', 'emergency_contacts', 'report_meals', 'report_activities', 'payments',
    'biometric_references', 'guardian_verification_events', 'product_categories'];
  for (const table of operational) await knex.raw('GRANT SELECT,INSERT,UPDATE,DELETE ON ?? TO ankelba_tenant', [table]);
  await knex.raw(`GRANT SELECT ON roles,daycares TO ankelba_tenant;
    GRANT UPDATE(name,contact_email,contact_phone,address,license_number,updated_at) ON daycares TO ankelba_tenant;
    GRANT SELECT,INSERT ON audit_logs TO ankelba_tenant;`);
  // No broad/default grants: control gets only identity, governance and auth.
  await knex.raw(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ankelba_control;
    GRANT SELECT ON roles TO ankelba_control;
    GRANT SELECT,INSERT,UPDATE ON users,daycares TO ankelba_control;
    GRANT SELECT,INSERT ON audit_logs TO ankelba_control;
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ankelba_control;
    GRANT USAGE,SELECT ON SEQUENCE users_id_seq,daycares_id_seq,audit_logs_id_seq TO ankelba_control;`);
  const tables = await knex('information_schema.tables').where({ table_schema: 'public' }).select('table_name');
  for (const { table_name: table } of tables) {
    if (/^(auth_|platform_|mfa_|daycare_password_reset_tokens$|password_reset_tokens$|account_invitations$)/.test(table)) {
      await knex.raw('GRANT SELECT,INSERT,UPDATE,DELETE ON ?? TO ankelba_control', [table]);
      if (await knex.schema.hasColumn(table, 'id')) {
        const { rows: [sequence] } = await knex.raw("SELECT pg_get_serial_sequence(?, 'id') AS name", [`public.${table}`]);
        if (sequence.name) await knex.raw('GRANT USAGE,SELECT ON SEQUENCE ?? TO ankelba_control', [sequence.name.split('.').pop()]);
      }
    }
  }
  for (const table of ['auth_sessions', 'auth_challenges', 'daycare_password_reset_tokens', 'password_reset_tokens']) {
    const predicate = table === 'password_reset_tokens'
      ? "EXISTS(SELECT 1 FROM users u WHERE u.id=user_id AND u.daycare_id=NULLIF(current_setting('app.daycare_id',true),'')::integer)"
      : "daycare_id=NULLIF(current_setting('app.daycare_id',true),'')::integer";
    await knex.raw(`ALTER TABLE ?? ENABLE ROW LEVEL SECURITY`, [table]);
    await knex.raw(`ALTER TABLE ?? FORCE ROW LEVEL SECURITY`, [table]);
    await knex.raw('DROP POLICY IF EXISTS auth_control ON ??', [table]);
    await knex.raw('DROP POLICY IF EXISTS auth_tenant ON ??', [table]);
    await knex.raw('CREATE POLICY auth_control ON ?? TO ankelba_control USING(true) WITH CHECK(true)', [table]);
    await knex.raw(`CREATE POLICY auth_tenant ON ?? TO ankelba_tenant USING(${predicate}) WITH CHECK(${predicate})`, [table]);
    // Daycare user management only revokes credentials; issuance belongs to control.
    await knex.raw('GRANT SELECT,UPDATE ON ?? TO ankelba_tenant', [table]);
  }
};

// Rolling back must not restore excessive access.
exports.down = async () => {};
