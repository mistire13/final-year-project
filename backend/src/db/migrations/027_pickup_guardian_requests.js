'use strict';

exports.up = async knex => {
  if (await knex.schema.hasTable('pickup_guardians')) return;
  await knex.schema.createTable('pickup_guardians', t => {
    t.increments('id').primary();
    t.integer('daycare_id').notNullable().references('id').inTable('daycares');
    t.integer('child_id').notNullable();
    t.integer('requested_by').notNullable();
    t.string('name', 150).notNullable();
    t.string('relationship', 80).notNullable();
    t.string('phone', 30).notNullable();
    t.string('email', 254);
    t.string('status', 20).notNullable().defaultTo('pending');
    t.string('request_key', 128).notNullable();
    t.string('request_hash', 64).notNullable();
    t.integer('reviewed_by');
    t.text('review_note');
    t.timestamp('reviewed_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.integer('version').notNullable().defaultTo(1);
    t.unique(['daycare_id', 'id']);
    t.unique(['child_id', 'id']);
    t.unique(['daycare_id', 'requested_by', 'request_key']);
    t.foreign(['daycare_id', 'child_id']).references(['daycare_id', 'id']).inTable('children');
    t.foreign(['daycare_id', 'requested_by']).references(['daycare_id', 'id']).inTable('users');
    t.foreign(['daycare_id', 'reviewed_by']).references(['daycare_id', 'id']).inTable('users');
  });
  await knex.raw(`ALTER TABLE pickup_guardians ADD CONSTRAINT pickup_guardian_status
    CHECK(status IN ('pending','approved','rejected','revoked'));
    CREATE UNIQUE INDEX pickup_guardian_open_contact ON pickup_guardians(child_id,lower(name),phone)
      WHERE status IN ('pending','approved');
    ALTER TABLE pickup_guardians ENABLE ROW LEVEL SECURITY;
    ALTER TABLE pickup_guardians FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_scope ON pickup_guardians TO ankelba_tenant
      USING(daycare_id=COALESCE(NULLIF(current_setting('app.current_daycare_id',true),''),NULLIF(current_setting('app.daycare_id',true),''))::integer)
      WITH CHECK(daycare_id=COALESCE(NULLIF(current_setting('app.current_daycare_id',true),''),NULLIF(current_setting('app.daycare_id',true),''))::integer);
    GRANT SELECT,INSERT,UPDATE ON pickup_guardians TO ankelba_tenant;
    GRANT USAGE,SELECT ON SEQUENCE pickup_guardians_id_seq TO ankelba_tenant;
    CREATE TRIGGER edit_version BEFORE UPDATE ON pickup_guardians FOR EACH ROW EXECUTE FUNCTION bump_edit_version();
    ALTER TABLE guardian_verification_events ALTER COLUMN guardian_user_id DROP NOT NULL;
    ALTER TABLE guardian_verification_events ADD COLUMN pickup_guardian_id integer;
    ALTER TABLE guardian_verification_events ADD CONSTRAINT verified_pickup_contact
      FOREIGN KEY(child_id,pickup_guardian_id) REFERENCES pickup_guardians(child_id,id);
    ALTER TABLE guardian_verification_events ADD CONSTRAINT verified_adult_identity
      CHECK(num_nonnulls(guardian_user_id,pickup_guardian_id)=1);`);
};

// Retain request decisions and pickup evidence on rollback; no destructive down migration.
exports.down = async () => {};
