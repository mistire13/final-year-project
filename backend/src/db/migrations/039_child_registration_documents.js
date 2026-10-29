'use strict';

/**
 * Migration 039: Professional Child Registration Documents & Legal Consents
 * Adds support for:
 * - Digital birth certificate image / document attachment
 * - Agreement form signed indicator
 * - Explicit daycare terms & conditions acceptance
 */

exports.up = async function(knex) {
  const hasBirthCert = await knex.schema.hasColumn('children', 'birth_certificate_url');
  if (!hasBirthCert) {
    await knex.schema.alterTable('children', (table) => {
      table.text('birth_certificate_url').nullable();
    });
  }

  const hasAgreement = await knex.schema.hasColumn('children', 'agreement_signed');
  if (!hasAgreement) {
    await knex.schema.alterTable('children', (table) => {
      table.boolean('agreement_signed').notNullable().defaultTo(false);
    });
  }

  const hasTerms = await knex.schema.hasColumn('children', 'terms_accepted');
  if (!hasTerms) {
    await knex.schema.alterTable('children', (table) => {
      table.boolean('terms_accepted').notNullable().defaultTo(false);
    });
  }
};

exports.down = async function(knex) {
  await knex.schema.alterTable('children', (table) => {
    table.dropColumn('terms_accepted');
    table.dropColumn('agreement_signed');
    table.dropColumn('birth_certificate_url');
  });
};
