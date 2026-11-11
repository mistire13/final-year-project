'use strict';

exports.up = async knex => {
  await knex.schema.createTable('subscription_reminders', t => {
    t.bigIncrements('id');
    t.integer('daycare_id').notNullable().references('id').inTable('daycares');
    t.integer('user_id').notNullable().references('id').inTable('users');
    t.timestamp('period_end', {useTz:true}).notNullable();
    t.string('status', 20).notNullable().defaultTo('pending');
    t.integer('attempts').notNullable().defaultTo(0);
    t.timestamp('next_attempt_at', {useTz:true}).notNullable().defaultTo(knex.fn.now());
    t.timestamp('lease_until', {useTz:true});
    t.timestamp('sent_at', {useTz:true});
    t.text('last_error');
    t.unique(['daycare_id', 'user_id', 'period_end']);
    t.index(['status', 'next_attempt_at']);
  });
  await knex.raw(`
    ALTER TABLE subscription_reminders ENABLE ROW LEVEL SECURITY;
    ALTER TABLE subscription_reminders FORCE ROW LEVEL SECURITY;
    CREATE POLICY reminder_control ON subscription_reminders TO ankelba_control USING (true) WITH CHECK (true);
    GRANT SELECT, INSERT, UPDATE ON subscription_reminders TO ankelba_control;
    GRANT USAGE, SELECT ON SEQUENCE subscription_reminders_id_seq TO ankelba_control;
  `);
};

exports.down = async () => {};
