-- ============================================================================
-- ione · 0003_tutor_sessions.sql
-- Live tutoring session telemetry: sessions, cycles, hints.
--
-- This is what the API persists every time the orchestrator runs a cycle.
-- One session per active screen-share. One row in tutor_cycles per ~8s tick.
-- One row in tutor_hints per surfaced hint (predicted or reactive).
--
-- The session-replay UI (Phase 4 / G5) reads from this schema:
--   tutor_sessions  → list & metadata
--   tutor_cycles    → scrubbable timeline
--   tutor_hints     → speech bubbles + 'why I didn't speak' annotations
--
-- How to run:
--   1. Open Supabase → SQL Editor
--   2. Paste this whole file → Run
-- ============================================================================

-- ── enums ────────────────────────────────────────────────────────────────
do $$ begin
  create type page_state as enum (
    'fresh_problem',
    'in_progress',
    'near_complete',
    'stalled_or_stuck'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type step_status as enum (
    'correct',
    'minor_error',
    'major_error',
    'stalled',
    'off_track',
    'complete',
    'unknown'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type hint_type as enum (
    'error_callout',
    'scaffolding_question',
    'encouragement',
    'redirect'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type session_end_reason as enum (
    'user_stopped',
    'browser_closed',
    'cost_exceeded',
    'error',
    'idle_timeout'
  );
exception when duplicate_object then null; end $$;

-- ── tutor_sessions ────────────────────────────────────────────────────────
-- One row per active screen-share session. The unique partial index at the
-- bottom enforces "one active session per user" — a second concurrent
-- session would violate it (Phase 5 / R2 toast hooks into that).
create table if not exists public.tutor_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  problem_text    text,
  problem_topic   text,             -- e.g., 'algebra_1.distribution', filled by orchestrator
  problem_id      text,             -- optional canonical problem id (demo seed = 'demo_neg3_distrib')
  -- Cached canonical solution from the Reasoning Agent's first call. Reused
  -- on every subsequent cycle so we only pay for it once per problem. Plan §1.
  canonical_solution_json jsonb,
  demo_mode       boolean not null default false,    -- ?mode=demo lowered the predictive threshold
  client_user_agent text,           -- captured at session start for browser-compat debugging
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  end_reason      session_end_reason,
  total_cost_usd  numeric(10,6) not null default 0,
  total_cycles    integer not null default 0,
  total_hints     integer not null default 0,
  predicted_correct integer not null default 0,    -- predictive prediction matched the actual error
  predicted_total integer not null default 0
);
create index if not exists idx_tutor_sessions_user_started
  on public.tutor_sessions (user_id, started_at desc);
-- "one active session per user" (Phase 5 / R2)
create unique index if not exists uq_tutor_sessions_one_active_per_user
  on public.tutor_sessions (user_id)
  where ended_at is null;

comment on table public.tutor_sessions is
  'One row per live tutor session (screen-share + agent loop). Cost meter + replay timeline.';

-- ── tutor_cycles ─────────────────────────────────────────────────────────
-- One row per orchestrator tick (~every 8s when local diff says page changed).
-- Stores enough that a session replay can reconstruct what each agent saw
-- and decided. Frame bytes are NOT stored here — see 0005_session_frames_storage.sql
-- (Phase 5 / R7) for the optional STORE_FRAMES=1 path that moves WebPs into
-- a private storage bucket and references them by `frame_storage_path`.
create table if not exists public.tutor_cycles (
  id                       uuid primary key default gen_random_uuid(),
  session_id               uuid not null references public.tutor_sessions (id) on delete cascade,
  user_id                  uuid not null references auth.users (id) on delete cascade,
  cycle_index              integer not null,
  client_ts                timestamptz not null,
  server_started_at        timestamptz not null default now(),
  server_finished_at       timestamptz,

  -- capture-side telemetry (from the browser hook)
  diff_pct                 real,
  is_stalled               boolean not null default false,
  seconds_since_last_change integer,

  -- OCR agent
  ocr_problem_text         text,
  ocr_current_step_latex   text,
  ocr_completed_steps_latex jsonb not null default '[]'::jsonb,
  ocr_page_state           page_state,
  ocr_confidence           real,
  ocr_is_blank             boolean not null default false,
  mathpix_latex            text,
  mathpix_confidence       real,

  -- Reasoning agent (canonical eval)
  step_status              step_status,
  error_type               text,
  error_location           text,
  severity                 smallint,           -- 1..5
  what_they_should_do_next text,
  scaffolding_question     text,
  matches_known_error_pattern boolean,

  -- Predictive agent
  predicted_error_type     text,
  predicted_error_basis    text,
  predicted_confidence     real,
  predicted_recommend_intervene boolean,

  -- Policy / Intervention decision
  spoke                    boolean not null default false,
  suppression_reason       text,               -- 'cooldown' | 'duplicate' | 'low_severity' | …

  -- Cost & latency rollup
  cost_usd                 numeric(10,6) not null default 0,
  latency_ms               integer,
  tokens_input             integer,
  tokens_output            integer,

  -- Optional frame storage path (Phase 5 / R7)
  frame_storage_path       text,

  -- Per-agent JSON snapshots — what each agent saw and decided this cycle.
  -- Replay (Phase 4 / G5) reconstructs the timeline from these blobs.
  ocr_json                 jsonb not null default '{}'::jsonb,
  reasoning_json           jsonb not null default '{}'::jsonb,
  predictive_json          jsonb not null default '{}'::jsonb,
  intervention_json        jsonb not null default '{}'::jsonb
);
create index if not exists idx_tutor_cycles_session_index
  on public.tutor_cycles (session_id, cycle_index);
create index if not exists idx_tutor_cycles_user_started
  on public.tutor_cycles (user_id, server_started_at desc);
create unique index if not exists uq_tutor_cycles_session_index
  on public.tutor_cycles (session_id, cycle_index);

comment on table public.tutor_cycles is
  'One orchestrator tick. Replay scrubs through these.';

-- ── tutor_hints ──────────────────────────────────────────────────────────
-- One row per hint actually surfaced to the student (spoke=true on the
-- corresponding cycle row). Predictive hints are also recorded here with
-- predicted=true so we can compute predicted_correct / predicted_total
-- aggregates in tutor_sessions.
create table if not exists public.tutor_hints (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.tutor_sessions (id) on delete cascade,
  cycle_id        uuid references public.tutor_cycles (id) on delete set null,
  user_id         uuid not null references auth.users (id) on delete cascade,
  hint_type       hint_type not null,
  text            text not null,
  predicted       boolean not null default false,
  severity        smallint check (severity is null or (severity >= 1 and severity <= 5)),
  audio_storage_path text,
  audio_duration_ms integer,
  -- did the next cycle's reasoning agent confirm this hint was useful?
  -- nullable until the next cycle resolves
  was_helpful     boolean,
  reasoning_for_decision text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_tutor_hints_session_created
  on public.tutor_hints (session_id, created_at);
create index if not exists idx_tutor_hints_user_created
  on public.tutor_hints (user_id, created_at desc);

comment on table public.tutor_hints is
  'Each hint surfaced during a session, including predicted hints and audio refs.';

-- ── row level security ───────────────────────────────────────────────────
alter table public.tutor_sessions  enable row level security;
alter table public.tutor_cycles    enable row level security;
alter table public.tutor_hints     enable row level security;

-- Sessions: a user can read/write only their own.
drop policy if exists "tutor_sessions_self" on public.tutor_sessions;
create policy "tutor_sessions_self"
  on public.tutor_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Cycles: scoped through the owning session.
drop policy if exists "tutor_cycles_self" on public.tutor_cycles;
create policy "tutor_cycles_self"
  on public.tutor_cycles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Hints: same.
drop policy if exists "tutor_hints_self" on public.tutor_hints;
create policy "tutor_hints_self"
  on public.tutor_hints for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Note: server-side writes go through the service role key which bypasses
-- RLS. The policies above protect direct browser access only.

-- ============================================================================
-- end 0003_tutor_sessions.sql
-- ============================================================================
