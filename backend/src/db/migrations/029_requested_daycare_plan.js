'use strict';
exports.up=async knex=>{
  if(await knex.schema.hasColumn('daycares','requested_plan'))return;
  await knex.schema.alterTable('daycares',t=>t.string('requested_plan',20));
  await knex.raw("ALTER TABLE daycares ADD CONSTRAINT requested_daycare_plan_valid CHECK (requested_plan IN ('trial','standard','premium'))");
};
exports.down=async()=>{};
