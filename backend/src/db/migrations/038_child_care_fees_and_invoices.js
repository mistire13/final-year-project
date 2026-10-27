'use strict';

/**
 * Migration 038: Child Care Fees & Daycare Invoices Management
 * Realizes realistic daycare finance operations:
 * - Child monthly care/stay fees (ወርሃዊ የአገልግሎት / የመቆያ ክፍያ)
 * - Invoice generation, payment reconciliation (Cash at front desk or Telebirr/CBE transfer code)
 * - Digital receipt issuance and parent balance tracking.
 */

const scoped = "daycare_id = COALESCE(NULLIF(current_setting('app.current_daycare_id',true),''),NULLIF(current_setting('app.daycare_id',true),''))::integer";

exports.up = async function(knex) {
  // 1. Add monthly_care_fee to children
  const hasFee = await knex.schema.hasColumn('children', 'monthly_care_fee');
  if (!hasFee) {
    await knex.schema.alterTable('children', (table) => {
      table.decimal('monthly_care_fee', 10, 2).defaultTo(3500.00);
    });
  }

  // 2. Create child_invoices table
  await knex.schema.createTable('child_invoices', (table) => {
    table.increments('id').primary();
    table.integer('daycare_id').notNullable().references('id').inTable('daycares').onDelete('CASCADE');
    table.integer('child_id').notNullable().references('id').inTable('children').onDelete('CASCADE');
    table.integer('parent_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.string('invoice_type', 50).notNullable().defaultTo('care_fee'); // 'care_fee', 'registration_fee', 'store_supplies', 'late_pickup', 'custom'
    table.string('billing_period', 20).notNullable(); // e.g. '2026-10'
    table.string('title', 200).notNullable(); // e.g. 'October 2026 Monthly Care Fee'
    table.decimal('amount', 10, 2).notNullable();
    table.decimal('amount_paid', 10, 2).notNullable().defaultTo(0.00);
    table.date('due_date').notNullable();
    table.string('status', 30).notNullable().defaultTo('pending'); // 'pending', 'partially_paid', 'paid', 'overdue', 'cancelled'
    table.text('notes').nullable();
    table.timestamps(true, true);

    table.index(['daycare_id', 'status']);
    table.index(['daycare_id', 'child_id']);
    table.index(['daycare_id', 'billing_period']);
    table.unique(['daycare_id', 'child_id', 'billing_period', 'invoice_type']);
  });

  // 3. Create child_payments table
  await knex.schema.createTable('child_payments', (table) => {
    table.increments('id').primary();
    table.integer('daycare_id').notNullable().references('id').inTable('daycares').onDelete('CASCADE');
    table.integer('invoice_id').notNullable().references('id').inTable('child_invoices').onDelete('CASCADE');
    table.decimal('amount_paid', 10, 2).notNullable();
    table.string('payment_method', 50).notNullable(); // 'cash_at_daycare', 'telebirr_transfer', 'cbe_transfer', 'digital_gateway'
    table.string('reference_code', 100).nullable(); // e.g. Telebirr/CBE txn code or Cash receipt
    table.string('receipt_number', 50).notNullable(); // e.g. 'REC-202610-0012'
    table.integer('recorded_by').notNullable().references('id').inTable('users');
    table.timestamp('verified_at').notNullable().defaultTo(knex.fn.now());
    table.text('notes').nullable();
    table.timestamps(true, true);

    table.index(['daycare_id', 'invoice_id']);
    table.index(['daycare_id', 'receipt_number']);
  });

  // 4. Configure Row-Level Security & Role Permissions
  await knex.raw(`
    ALTER TABLE child_invoices ENABLE ROW LEVEL SECURITY;
    ALTER TABLE child_invoices FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_scope ON child_invoices;
    CREATE POLICY tenant_scope ON child_invoices TO ankelba_tenant USING (${scoped}) WITH CHECK (${scoped});
    DROP POLICY IF EXISTS control_scope ON child_invoices;
    CREATE POLICY control_scope ON child_invoices TO ankelba_control USING (true) WITH CHECK (true);
    GRANT SELECT, INSERT, UPDATE, DELETE ON child_invoices TO ankelba_tenant, ankelba_control;
    GRANT USAGE, SELECT ON SEQUENCE child_invoices_id_seq TO ankelba_tenant, ankelba_control;

    ALTER TABLE child_payments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE child_payments FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_scope ON child_payments;
    CREATE POLICY tenant_scope ON child_payments TO ankelba_tenant USING (${scoped}) WITH CHECK (${scoped});
    DROP POLICY IF EXISTS control_scope ON child_payments;
    CREATE POLICY control_scope ON child_payments TO ankelba_control USING (true) WITH CHECK (true);
    GRANT SELECT, INSERT, UPDATE, DELETE ON child_payments TO ankelba_tenant, ankelba_control;
    GRANT USAGE, SELECT ON SEQUENCE child_payments_id_seq TO ankelba_tenant, ankelba_control;
  `);
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('child_payments');
  await knex.schema.dropTableIfExists('child_invoices');
  const hasFee = await knex.schema.hasColumn('children', 'monthly_care_fee');
  if (hasFee) {
    await knex.schema.alterTable('children', (table) => {
      table.dropColumn('monthly_care_fee');
    });
  }
};
