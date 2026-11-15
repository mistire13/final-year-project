'use strict';

/**
 * Migration 060: AI Parent Guide Interaction History Storage
 * SRS Refs: FR-AI-01–10, FR-DB-02
 * Stores question, answer, model metadata, and child context linkage.
 */
const scope = "daycare_id=COALESCE(NULLIF(current_setting('app.current_daycare_id',true),''),NULLIF(current_setting('app.daycare_id',true),''))::integer";

exports.up = async (knex) => {
  await knex.raw(`
    CREATE TABLE ai_interactions (
      id bigserial PRIMARY KEY,
      daycare_id integer NOT NULL REFERENCES daycares(id),
      user_id integer NOT NULL,
      child_id integer REFERENCES children(id) ON DELETE SET NULL,
      question text NOT NULL,
      answer text NOT NULL,
      disclaimer text,
      source varchar(64) NOT NULL DEFAULT 'nvidia_nim',
      model varchar(128),
      created_at timestamptz NOT NULL DEFAULT NOW(),
      FOREIGN KEY(daycare_id, user_id) REFERENCES users(daycare_id, id)
    );

    CREATE INDEX idx_ai_interactions_user_created ON ai_interactions(daycare_id, user_id, created_at DESC);

    ALTER TABLE ai_interactions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai_interactions FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_scope ON ai_interactions TO ankelba_tenant USING(${scope}) WITH CHECK(${scope});
    GRANT SELECT, INSERT, UPDATE, DELETE ON ai_interactions TO ankelba_tenant;
    GRANT USAGE, SELECT ON SEQUENCE ai_interactions_id_seq TO ankelba_tenant;
  `);
};

exports.down = async (knex) => {
  await knex.raw(`
    DROP TABLE IF EXISTS ai_interactions CASCADE;
  `);
};

