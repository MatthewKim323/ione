-- ============================================================================
-- ione · 0005_session_frames_storage.sql
-- Optional WebP frame storage for session replay.
--
-- Plan reference: Phase 5 / R7. Today the orchestrator throws frames away
-- after the OCR agent runs — the cycle row only keeps the transcribed LaTeX
-- and the agents' JSON outputs. That's enough for the agents but session
-- replay (Phase 4 / G5) ends up showing a placeholder rectangle for every
-- step.
--
-- This migration creates a *private* storage bucket so that when the API is
-- run with `STORE_FRAMES=1`, each cycle uploads its WebP and the cycle row's
-- existing `frame_storage_path` column points at it. RLS on the bucket
-- restricts reads to the owning user (matched by the path prefix
-- `<user_id>/<session_id>/<cycle_id>.webp`).
--
-- Cost: with the default `STORE_FRAMES` off, this migration is a no-op at
-- runtime. With `STORE_FRAMES=1`, expect ~50–80KB per cycle × ~7 cycles/min
-- ≈ 30 MB/hour. Cheap enough we can leave it on for our own demos.
--
-- How to run:
--   1. Open Supabase → SQL Editor
--   2. Paste this whole file → Run
-- ============================================================================

-- ── bucket ───────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('tutor_frames', 'tutor_frames', false)
on conflict (id) do nothing;

-- ── per-user RLS on storage.objects ──────────────────────────────────────
-- Path convention enforced by the API:  <user_id>/<session_id>/<cycle_id>.webp
-- The first folder component must equal auth.uid()::text. Service-role
-- writes bypass RLS, so the API can write anywhere; browser reads must
-- match.

drop policy if exists "tutor_frames_read_own" on storage.objects;
create policy "tutor_frames_read_own"
  on storage.objects for select
  using (
    bucket_id = 'tutor_frames'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- We do not grant insert/update/delete to authenticated users — only the
-- service role writes to this bucket. Keeps clients from filling our
-- storage with garbage.
drop policy if exists "tutor_frames_no_client_writes" on storage.objects;

-- ── helpful comment ──────────────────────────────────────────────────────
comment on table storage.buckets is
  'Includes tutor_frames (private). Populated only when API runs with STORE_FRAMES=1.';

-- ============================================================================
-- end 0005_session_frames_storage.sql
-- ============================================================================
