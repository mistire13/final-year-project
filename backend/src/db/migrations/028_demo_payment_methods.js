'use strict';
exports.up = async function(knex) {
  await knex.raw("ALTER TABLE payments DROP CONSTRAINT chk_pay_method");
  await knex.raw("ALTER TABLE payments ADD CONSTRAINT chk_pay_method CHECK (method IN ('pay_at_daycare','digital','demo','no_charge'))");
};
// Preserve existing payment evidence when rolling back application code.
exports.down = async function() {};
