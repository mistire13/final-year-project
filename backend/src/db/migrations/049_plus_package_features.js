'use strict';
exports.up=async knex=>{
  await knex.schema.alterTable('daycares',t=>t.timestamp('legacy_shop_access_until',{useTz:true}).nullable());
  // Keep the existing paid promise until its paid-through date, without changing
  // accepted financial terms or granting the shop on future Standard periods.
  await knex.raw(`UPDATE daycares SET legacy_shop_access_until=subscription_ends_at
    WHERE subscription_plan='standard' AND subscription_terms IS NOT NULL AND subscription_ends_at>NOW()
      AND subscription_terms->'features' IS NULL`);
  await knex('subscription_packages').where({code:'premium'}).update({name:'Plus',description:'More capacity, a daycare shop, business reports and administrative automation.'});
};
exports.down=async()=>{};
