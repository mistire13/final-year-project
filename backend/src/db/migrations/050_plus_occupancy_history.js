'use strict';

// Aggregate observations begin now; there is deliberately no invented backfill.
exports.up=async knex=>{
  await knex.schema.createTable('daycare_occupancy_observations',t=>{
    t.bigIncrements('id');
    t.integer('daycare_id').notNullable().references('id').inTable('daycares').onDelete('RESTRICT');
    t.timestamp('observed_at',{useTz:true}).notNullable().defaultTo(knex.fn.now());
    t.integer('active_children').notNullable();
    t.integer('capacity');
    t.string('reason',24).notNullable();
    t.index(['daycare_id','observed_at']);
  });
  await knex.raw(`
    ALTER TABLE daycare_occupancy_observations ADD CONSTRAINT occupancy_counts_valid
      CHECK(active_children>=0 AND (capacity IS NULL OR capacity>0));
    ALTER TABLE daycare_occupancy_observations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE daycare_occupancy_observations FORCE ROW LEVEL SECURITY;
    CREATE POLICY occupancy_tenant_read ON daycare_occupancy_observations FOR SELECT TO ankelba_tenant
      USING(daycare_id=NULLIF(current_setting('app.daycare_id',true),'')::integer);
    GRANT SELECT ON daycare_occupancy_observations TO ankelba_tenant;
    INSERT INTO daycare_occupancy_observations(daycare_id,active_children,capacity,reason)
      SELECT d.id,count(c.id)::integer,d.max_children,'baseline'
      FROM daycares d LEFT JOIN children c ON c.daycare_id=d.id AND c.enrollment_status='active'
      WHERE d.deleted_at IS NULL GROUP BY d.id,d.max_children;
    CREATE FUNCTION public.capture_daycare_occupancy() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
      DECLARE target_id integer; targets integer[]; configured_capacity integer; enrolled integer;
      BEGIN
        IF TG_TABLE_NAME='daycares' THEN
          IF TG_OP='UPDATE' THEN
            IF OLD.max_children IS NOT DISTINCT FROM NEW.max_children THEN RETURN NULL; END IF;
          END IF;
        END IF;
        IF TG_TABLE_NAME='children' THEN
          IF TG_OP='INSERT' AND NEW.enrollment_status<>'active' THEN RETURN NULL; END IF;
          IF TG_OP='DELETE' AND OLD.enrollment_status<>'active' THEN RETURN NULL; END IF;
          IF TG_OP='UPDATE' AND OLD.daycare_id IS NOT DISTINCT FROM NEW.daycare_id
            AND (OLD.enrollment_status='active') IS NOT DISTINCT FROM (NEW.enrollment_status='active') THEN RETURN NULL; END IF;
        END IF;
        IF TG_TABLE_NAME='daycares' THEN
          targets:=ARRAY[NEW.id];
        ELSIF TG_OP='DELETE' THEN targets:=ARRAY[OLD.daycare_id];
        ELSIF TG_OP='INSERT' THEN targets:=ARRAY[NEW.daycare_id];
        ELSE targets:=ARRAY[OLD.daycare_id,NEW.daycare_id]; END IF;
        FOR target_id IN SELECT DISTINCT x FROM unnest(targets) AS x WHERE x IS NOT NULL ORDER BY x LOOP
          SELECT max_children INTO configured_capacity FROM public.daycares WHERE id=target_id AND deleted_at IS NULL FOR UPDATE;
          IF NOT FOUND THEN CONTINUE; END IF;
          SELECT count(*)::integer INTO enrolled FROM public.children WHERE daycare_id=target_id AND enrollment_status='active';
          INSERT INTO public.daycare_occupancy_observations(daycare_id,observed_at,active_children,capacity,reason)
            VALUES(target_id,clock_timestamp(),enrolled,configured_capacity,CASE WHEN TG_TABLE_NAME='daycares' THEN 'capacity_change' ELSE 'enrollment_change' END);
        END LOOP;
        RETURN NULL;
      END $$;
    REVOKE ALL ON FUNCTION public.capture_daycare_occupancy() FROM PUBLIC;
    CREATE TRIGGER capture_child_occupancy AFTER INSERT OR DELETE OR UPDATE OF enrollment_status,daycare_id ON children
      FOR EACH ROW EXECUTE FUNCTION public.capture_daycare_occupancy();
    CREATE TRIGGER capture_capacity_occupancy AFTER INSERT OR UPDATE OF max_children ON daycares
      FOR EACH ROW EXECUTE FUNCTION public.capture_daycare_occupancy();
  `);
};
// Historical management evidence is retained on rollback.
exports.down=async()=>{};
