-- 0007_claims_unique_index.sql
--
-- Adds the missing unique index that runner.persistClaims() expects.
--
-- Schema drift (round 2):
--   0002_knowledge_graph.sql line 160 declares:
--     create unique index if not exists uq_claims_source_predicate
--       on public.claims (source_file_id, predicate, subject_entity)
--       where source_file_id is not null;
--
--   The actual production DB doesn't have it. Verified via probe:
--     node scripts/inspect-schema.mjs claims
--     ✗ ON CONFLICT (source_file_id,predicate,subject_entity) — no matching constraint
--
--   Without it, every UPSERT in api/src/kg/runner.ts:400 fails with
--     "there is no unique or exclusion constraint matching the ON CONFLICT
--      specification"
--   so even successful LLM extractions never persist.
--
-- Why we drop the partial WHERE clause:
--   PostgREST's `onConflict=cols` spec doesn't let us pass an index
--   predicate, so PG won't match a partial index against the bare
--   ON CONFLICT (a, b, c) call. Removing the WHERE makes it a regular
--   unique index. Behavior is preserved because:
--     • multiple NULL source_file_id rows are still allowed
--       (Postgres default is NULLS DISTINCT — two NULLs aren't equal)
--     • runtime/session claims (source_file_id IS NULL) thus continue
--       to never collide with each other
--     • file-derived claims still de-dup the way the original migration
--       intended

-- Belt-and-suspenders: drop any prior partial index by either name
-- before recreating, in case a partial copy DID get applied somewhere.
drop index if exists public.uq_claims_source_predicate;

create unique index if not exists uq_claims_source_predicate
  on public.claims (source_file_id, predicate, subject_entity);
