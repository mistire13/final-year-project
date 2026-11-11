'use strict';

exports.up=async knex=>{
  await knex.schema.createTable('staff_schedule_templates',t=>{
    t.bigIncrements('id');t.integer('daycare_id').notNullable().references('id').inTable('daycares');
    t.string('name',80).notNullable();t.boolean('enabled').notNullable().defaultTo(true);t.integer('version').notNullable().defaultTo(1);
    t.integer('created_by').notNullable();t.timestamp('created_at',{useTz:true}).notNullable().defaultTo(knex.fn.now());
    t.unique(['daycare_id','id']);
  });
  await knex.schema.createTable('staff_schedule_rules',t=>{
    t.bigIncrements('id');t.integer('daycare_id').notNullable();t.bigInteger('template_id').notNullable();t.integer('staff_id').notNullable();t.integer('group_id');
    t.smallint('weekday').notNullable();t.string('start_time',5).notNullable();t.string('end_time',5).notNullable();
    t.boolean('can_attendance').notNullable();t.boolean('can_pickup').notNullable();
  });
  await knex.schema.createTable('staff_schedule_publications',t=>{
    t.bigIncrements('id');t.integer('daycare_id').notNullable();t.bigInteger('template_id').notNullable();t.integer('template_version').notNullable();
    t.date('week_start').notNullable();t.smallint('weeks').notNullable();t.string('request_key',100).notNullable();t.string('request_hash',64).notNullable();
    t.integer('published_by').notNullable();t.timestamp('created_at',{useTz:true}).notNullable().defaultTo(knex.fn.now());
    t.unique(['daycare_id','id']);t.unique(['daycare_id','request_key']);t.unique(['daycare_id','template_id','template_version','week_start','weeks']);
  });
  await knex.schema.createTable('staff_schedule_availability',t=>{
    t.bigIncrements('id');t.integer('daycare_id').notNullable();t.integer('staff_id').notNullable();t.smallint('weekday').notNullable();
    t.boolean('available').notNullable();t.string('start_time',5).notNullable();t.string('end_time',5).notNullable();
    t.timestamp('updated_at',{useTz:true}).notNullable().defaultTo(knex.fn.now());t.unique(['daycare_id','staff_id','weekday']);
  });
  await knex.schema.createTable('staff_leave_requests',t=>{
    t.bigIncrements('id');t.integer('daycare_id').notNullable();t.integer('staff_id').notNullable();t.integer('requested_by').notNullable();
    t.timestamp('starts_at',{useTz:true}).notNullable();t.timestamp('ends_at',{useTz:true}).notNullable();t.string('reason',1000).notNullable();
    t.string('status',20).notNullable().defaultTo('pending');t.integer('version').notNullable().defaultTo(1);t.integer('reviewed_by');t.string('review_reason',1000);
    t.timestamp('reviewed_at',{useTz:true});t.timestamp('created_at',{useTz:true}).notNullable().defaultTo(knex.fn.now());
    t.index(['daycare_id','staff_id','starts_at','ends_at']);
  });
  await knex.schema.alterTable('front_desk_assignments',t=>{t.bigInteger('staff_schedule_publication_id');});
  await knex.raw(`
    ALTER TABLE staff_schedule_templates ADD CONSTRAINT staff_templates_creator_tenant FOREIGN KEY(daycare_id,created_by) REFERENCES users(daycare_id,id);
    ALTER TABLE staff_schedule_rules ADD CONSTRAINT staff_rules_template_tenant FOREIGN KEY(daycare_id,template_id) REFERENCES staff_schedule_templates(daycare_id,id),
      ADD CONSTRAINT staff_rules_staff_tenant FOREIGN KEY(daycare_id,staff_id) REFERENCES users(daycare_id,id),
      ADD CONSTRAINT staff_rules_group_tenant FOREIGN KEY(daycare_id,group_id) REFERENCES groups(daycare_id,id),
      ADD CONSTRAINT staff_rules_day_valid CHECK(weekday BETWEEN 0 AND 6),
      ADD CONSTRAINT staff_rules_times_valid CHECK(start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
      ADD CONSTRAINT staff_rules_capability CHECK(can_attendance OR can_pickup);
    ALTER TABLE staff_schedule_publications ADD CONSTRAINT staff_publication_template_tenant FOREIGN KEY(daycare_id,template_id) REFERENCES staff_schedule_templates(daycare_id,id),
      ADD CONSTRAINT staff_publication_actor_tenant FOREIGN KEY(daycare_id,published_by) REFERENCES users(daycare_id,id),
      ADD CONSTRAINT staff_publication_weeks_valid CHECK(weeks BETWEEN 1 AND 8);
    ALTER TABLE front_desk_assignments ADD CONSTRAINT staff_assignment_publication_tenant FOREIGN KEY(daycare_id,staff_schedule_publication_id) REFERENCES staff_schedule_publications(daycare_id,id);
    ALTER TABLE staff_schedule_availability ADD CONSTRAINT staff_availability_staff_tenant FOREIGN KEY(daycare_id,staff_id) REFERENCES users(daycare_id,id),
      ADD CONSTRAINT staff_availability_day_valid CHECK(weekday BETWEEN 0 AND 6),
      ADD CONSTRAINT staff_availability_times_valid CHECK(start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND end_time>start_time);
    ALTER TABLE staff_leave_requests ADD CONSTRAINT staff_leave_staff_tenant FOREIGN KEY(daycare_id,staff_id) REFERENCES users(daycare_id,id),
      ADD CONSTRAINT staff_leave_requester_tenant FOREIGN KEY(daycare_id,requested_by) REFERENCES users(daycare_id,id),
      ADD CONSTRAINT staff_leave_reviewer_tenant FOREIGN KEY(daycare_id,reviewed_by) REFERENCES users(daycare_id,id),
      ADD CONSTRAINT staff_leave_interval_valid CHECK(ends_at>starts_at AND ends_at<=starts_at+INTERVAL '31 days'),
      ADD CONSTRAINT staff_leave_status_valid CHECK(status IN ('pending','approved','rejected'));
  `);
  const scoped="daycare_id = COALESCE(NULLIF(current_setting('app.current_daycare_id',true),''),NULLIF(current_setting('app.daycare_id',true),''))::integer";
  for(const table of ['staff_schedule_templates','staff_schedule_rules','staff_schedule_publications','staff_schedule_availability','staff_leave_requests']){
    await knex.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_scope ON ${table} TO ankelba_tenant USING(${scoped}) WITH CHECK(${scoped});
      GRANT SELECT,INSERT,UPDATE ON ${table} TO ankelba_tenant;
      GRANT USAGE,SELECT ON SEQUENCE ${table}_id_seq TO ankelba_tenant;`);
  }
};
// Preserve published duties and leave/audit history on rollback.
exports.down=async()=>{};
