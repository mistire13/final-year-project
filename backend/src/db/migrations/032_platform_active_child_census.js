'use strict';

exports.up = async knex => {
  // Governance receives aggregate counts only, without operational child access.
  await knex.raw(`CREATE OR REPLACE FUNCTION platform_child_census()
    RETURNS TABLE(daycare_id integer,child_count bigint,active_child_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
      SELECT c.daycare_id,count(*),count(*) FILTER(WHERE c.enrollment_status='active')
      FROM public.children c GROUP BY c.daycare_id
    $$;
    REVOKE ALL ON FUNCTION platform_child_census() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION platform_child_census() TO ankelba_control;`);
};
exports.down = async knex => { await knex.raw('DROP FUNCTION IF EXISTS platform_child_census()'); };
