'use strict';

// Keep the legacy receiving details and every existing payment intact.
// New bank accounts start disabled until the operator configures real details.
exports.up = async knex => {
  await knex.schema.alterTable('subscription_payment_settings', table => {
    table.jsonb('bank_accounts').notNullable().defaultTo('{}');
  });
  // CBE receipt links can be longer than the old 255-character reference field.
  await knex.raw(`
    ALTER TABLE subscription_payment_intents ALTER COLUMN payment_reference TYPE varchar(2048);
    ALTER TABLE subscription_payment_references ALTER COLUMN reference TYPE varchar(2048);
    ALTER TABLE subscription_payment_attempts ALTER COLUMN reference TYPE varchar(2048);
  `);
};
exports.down = async () => {};
