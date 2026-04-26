-- ============================================================================
-- ione · 0004_claim_provenance.sql
-- Provenance metadata on every claim.
--
-- Plan reference: Phase 3 / F5. Every claim must carry enough breadcrumbs
-- back to its origin that the dashboard can answer:
--   - which extractor wrote this?
--   - which model and what version?
--   - was it written during a *live* tutor cycle (predicted) or by a
--     post-upload extractor pass?
--   - which session / cycle was it part of, if live?
--
-- We already had `extracted_by`, `source_chunk_id`, `source_file_id`,
-- `reasoning`. This migration adds:
--
--   model           text                  - "claude-sonnet-4-5-20251001" etc.
--   session_id      uuid (fk to tutor_sessions, nullable)
--   cycle_id        uuid (fk to tutor_cycles,   nullable)
--   predicted       boolean default false - true iff written by a
--                                          runtime/predictive path
--                                          (today: nothing writes this true,
--                                          but we want the column ready
--                                          before the orchestrator starts
--                                          back-writing claims).
--   provenance      jsonb default '{}'    - escape hatch for extractor-
--                                          specific debug data we don't
--                                          want to keep adding columns for.
--
-- All defaults are no-ops for existing rows.
--
-- How to run:
--   1. Open Supabase → SQL Editor
--   2. Paste this whole file → Run
-- ============================================================================

alter table public.claims
  add column if not exists model       text,
  add column if not exists session_id  uuid references public.tutor_sessions (id) on delete set null,
  add column if not exists cycle_id    uuid references public.tutor_cycles   (id) on delete set null,
  add column if not exists predicted   boolean not null default false,
  add column if not exists provenance  jsonb   not null default '{}'::jsonb;

-- queries for "what did I write during this session" / "what's predicted vs
-- extracted" want narrow indexes
create index if not exists idx_claims_session_id
  on public.claims (session_id) where session_id is not null;
create index if not exists idx_claims_predicted
  on public.claims (owner, predicted) where predicted = true;

comment on column public.claims.model       is 'LLM model id when extractor was LLM-backed (Sonnet, etc.)';
comment on column public.claims.session_id  is 'tutor_sessions.id if claim was written during a live cycle';
comment on column public.claims.cycle_id    is 'tutor_cycles.id   if claim was written during a live cycle';
comment on column public.claims.predicted   is 'true iff written by predictive/runtime path; false for post-upload extractors';
comment on column public.claims.provenance  is 'extractor-specific debug envelope; not user-visible';

-- ============================================================================
-- end 0004_claim_provenance.sql
-- ============================================================================
