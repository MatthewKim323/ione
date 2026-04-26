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
-- How to run
-- -----------
-- 1) Create the bucket in the *Dashboard* (the SQL role in **SQL Editor**
--    is usually not the owner of `storage.buckets`, so `insert into
--    storage.buckets` fails with: must be owner of table buckets (42501)):
--      **Storage → New bucket →** name `tutor_frames`, **public** = off
-- 2) Open **SQL Editor**, paste this file (from `-- per-user RLS` onward if
--    the editor already choked on an older version), and **Run**
--
-- Confirm the bucket exists:
--   select id, public from storage.buckets where id = 'tutor_frames';
-- ============================================================================

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

-- ============================================================================
-- end 0005_session_frames_storage.sql
-- ============================================================================
