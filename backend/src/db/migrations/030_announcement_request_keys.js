'use strict';
exports.up=async knex=>{
  if(await knex.schema.hasColumn('announcements','request_key'))return;
  await knex.schema.alterTable('announcements',t=>{t.string('request_key',128);t.string('request_hash',64);t.unique(['daycare_id','author_id','request_key']);});
};
exports.down=async()=>{};
