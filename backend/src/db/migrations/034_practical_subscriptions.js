'use strict';

exports.up = async knex => {
  await knex.schema.createTable('subscription_packages', t => {
    t.string('code', 20).primary();
    t.string('name', 80).notNullable();
    t.string('description', 300).notNullable();
    t.integer('max_children').notNullable();
    t.integer('trial_days').notNullable().defaultTo(30);
    t.decimal('monthly_price', 12, 2);
    t.decimal('annual_price', 12, 2);
    t.boolean('available').notNullable().defaultTo(true);
    t.integer('version').notNullable().defaultTo(1);
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`ALTER TABLE subscription_packages ADD CONSTRAINT package_valid CHECK
    (code IN ('standard','premium') AND max_children BETWEEN 1 AND 1000 AND trial_days BETWEEN 1 AND 180
    AND (monthly_price IS NULL OR monthly_price >= 0) AND (annual_price IS NULL OR annual_price >= 0));
    CREATE TRIGGER edit_version BEFORE UPDATE ON subscription_packages FOR EACH ROW EXECUTE FUNCTION bump_edit_version();`);
  await knex('subscription_packages').insert([
    { code: 'standard', name: 'Standard', description: 'Daily care, family communication and safe pickup for a growing center.', max_children: 50 },
    { code: 'premium', name: 'Premium', description: 'The same complete care workflow with capacity for a larger center.', max_children: 150 },
  ]);
  await knex.schema.alterTable('daycares', t => {
    t.string('billing_cycle', 12).notNullable().defaultTo('monthly');
    t.string('subscription_status', 20).notNullable().defaultTo('trialing');
    t.jsonb('subscription_terms');
    t.timestamp('subscription_ends_at', { useTz: true });
  });
  await knex.raw(`ALTER TABLE daycares ADD CONSTRAINT subscription_cycle_valid CHECK(billing_cycle IN ('monthly','annual'));
    ALTER TABLE daycares ADD CONSTRAINT subscription_status_valid CHECK(subscription_status IN ('trialing','active','cancelled'));
    UPDATE daycares SET subscription_plan=COALESCE(NULLIF(requested_plan,'trial'),'standard') WHERE subscription_plan='trial';`);
  await knex.schema.createTable('subscription_events', t => {
    t.bigIncrements('id');
    t.integer('daycare_id').notNullable().references('id').inTable('daycares').onDelete('RESTRICT');
    t.integer('actor_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.string('action', 40).notNullable();
    t.text('reason').notNullable();
    t.jsonb('details').notNullable();
    t.string('request_key', 100).notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['daycare_id', 'request_key']);
    t.index(['daycare_id', 'created_at']);
  });
  await knex.raw(`GRANT SELECT ON subscription_packages TO ankelba_tenant;
    GRANT SELECT,UPDATE ON subscription_packages TO ankelba_control;
    GRANT SELECT,INSERT ON subscription_events TO ankelba_control;
    GRANT USAGE,SELECT ON SEQUENCE subscription_events_id_seq TO ankelba_control;
    GRANT SELECT ON subscription_events TO ankelba_tenant;
    ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;
    ALTER TABLE subscription_events FORCE ROW LEVEL SECURITY;
    CREATE POLICY subscription_control ON subscription_events TO ankelba_control USING(true) WITH CHECK(true);
    CREATE POLICY subscription_tenant ON subscription_events TO ankelba_tenant
    USING(daycare_id=NULLIF(current_setting('app.daycare_id',true),'')::integer);`);
};

// Preserve accepted terms and financial evidence if the application is rolled back.
exports.down = async () => {};
