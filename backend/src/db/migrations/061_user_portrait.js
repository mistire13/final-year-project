'use strict';
exports.up = async knex => {
  await knex.schema.alterTable('users', table => table.text('photo_url'));
};
exports.down = async knex => {
  await knex.schema.alterTable('users', table => table.dropColumn('photo_url'));
};
