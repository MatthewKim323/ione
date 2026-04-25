-- ============================================================================
-- ione · 0001_profiles.sql
-- Initial schema: per-user profile + onboarding answers + RLS.
--
-- How to run:
--   1. Open your Supabase project → SQL Editor
--   2. Paste this whole file → Run
--
-- The schema is deliberately small. Sessions, observations, and the
-- longitudinal struggle profile go in later migrations once we wire the
-- capture loop and Backboard.
-- ============================================================================

-- ── enums ────────────────────────────────────────────────────────────────
do $$ begin
  create type grade_level as enum (
    '6','7','8','9','10','11','12','college','adult'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type math_class as enum (
    'pre_algebra',
    'algebra_1',
    'geometry',
    'algebra_2',
    'trigonometry',
    'pre_calculus',
    'calculus_1',
    'ap_calc_ab',
    'ap_calc_bc',
    'calculus_2',
    'linear_algebra',
    'statistics',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type tricky_topic as enum (
    'sign_errors',
    'fractions',
    'word_problems',
    'algebra_manipulation',
    'factoring',
    'exponents_logs',
    'trig_identities',
    'limits',
    'derivatives',
    'integrals',
    'showing_work',
    'memorizing_rules',
    'reading_problem',
    'time_pressure'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type hint_frequency as enum ('rare', 'balanced', 'active');
exception when duplicate_object then null; end $$;

-- ── profiles table ───────────────────────────────────────────────────────
-- One row per user. id matches auth.users.id so we can join trivially and
-- cascade on user deletion. onboarded_at is NULL until /onboarding finishes.
create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  first_name      text          not null default '',
  grade           grade_level,
  current_class   math_class,
  tricky_topics   tricky_topic[] not null default '{}',
  hint_voice      boolean       not null default true,
  hint_frequency  hint_frequency not null default 'balanced',
  onboarded_at    timestamptz,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

comment on table public.profiles is
  'Per-user onboarding answers + tutor preferences. Joined to auth.users by id.';

-- ── updated_at trigger ───────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ── auto-create profile on signup ────────────────────────────────────────
-- A blank profile row is inserted the moment a user signs up, so the app
-- never has to decide whether to INSERT or UPDATE on first onboarding save.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── row level security ───────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- A user can read only their own profile.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- A user can insert only a profile row keyed to their own auth id. The
-- handle_new_user trigger already creates the row, but this allows upsert
-- from the onboarding flow without surprise denials.
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- A user can update only their own profile.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- We intentionally don't expose DELETE — the row goes away when the
-- auth.users row is deleted via the cascade fk above.
