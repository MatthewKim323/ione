-- ============================================================================
-- ione · 0002_knowledge_graph.sql
-- The student-scope knowledge graph.
--
-- Built on the same primitive Nami uses: every claim cites a chunk_id.
-- No chunk → no claim. The graph is grounded by construction.
--
-- Pipeline (only the schema/storage side of which lives here):
--
--   1. user uploads a file (failed exam pdf, transcript, essay, scratch work)
--      → row in `source_files`, blob in storage bucket `source-files`
--   2. an extractor parses the file into one or more `artifacts` (json blobs)
--      e.g. a transcript becomes one artifact per course-row
--   3. text content is sliced into `chunks` (the receipt primitive)
--      every chunk has a stable uuid the UI can link back to
--   4. an LLM proposes `claims` (subject-predicate-object triples) each
--      pointing at a source_chunk_id from step 3
--   5. confirmed claims emit `entities` (canonical things — courses,
--      topics, error-types) and `relationships` (typed edges = the graph)
--   6. inserts on `events` are broadcast via Supabase Realtime so any
--      agent (or the UI) can react to the graph evolving
--
-- Steps 2-5 are NOT in this migration — the schema and storage are. The
-- extraction agents land in a later phase.
--
-- How to run:
--   1. Open Supabase → SQL Editor
--   2. Paste this whole file → Run
--   3. Then go to Storage and confirm the `source-files` bucket appeared
-- ============================================================================

-- ── enums ────────────────────────────────────────────────────────────────
do $$ begin
  create type source_kind as enum (
    'transcript',     -- school transcript / report card
    'failed_exam',    -- graded math test the student bombed
    'practice_work',  -- the student's hw / scratch work
    'essay',          -- writing sample (writing-side struggles)
    'syllabus',       -- class syllabus
    'note',           -- student-entered free text
    'voice',          -- voice memo
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type claim_status as enum (
    'pending',     -- proposed by an extractor, not yet confirmed
    'confirmed',   -- user (or high-confidence rule) confirmed it
    'rejected',    -- user disputed it
    'superseded'   -- a newer claim replaced this one
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type sensitivity as enum ('low', 'medium', 'high');
exception when duplicate_object then null; end $$;

-- ── source_files ─────────────────────────────────────────────────────────
-- One row per uploaded artifact. The actual blob lives in Storage at
-- `source-files/{owner}/{source_file.id}.{ext}`. We never inline the bytes
-- in the row.
create table if not exists public.source_files (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null references auth.users (id) on delete cascade,
  kind          source_kind not null,
  filename      text not null,
  storage_path  text not null,
  mime_type     text,
  size_bytes    integer,
  -- free-text label the user typed when uploading ("Algebra 2 midterm")
  title         text,
  -- ingestion lifecycle: 'pending' → 'parsed' → 'extracted' | 'failed'
  status        text not null default 'pending',
  uploaded_at   timestamptz not null default now()
);
create index if not exists idx_source_files_owner_uploaded
  on public.source_files (owner, uploaded_at desc);
create index if not exists idx_source_files_owner_kind
  on public.source_files (owner, kind);

-- ── artifacts ────────────────────────────────────────────────────────────
-- Structured representation of a chunk of source content. Agnostic shape on
-- purpose — a transcript course-row, an essay paragraph, an exam question
-- block all live here. `content` is JSON the extractor decides the shape of.
create table if not exists public.artifacts (
  id              uuid primary key default gen_random_uuid(),
  source_file_id  uuid not null references public.source_files (id) on delete cascade,
  kind            text not null,                 -- 'course_row' | 'essay_paragraph' | 'exam_question' | …
  content         jsonb not null,
  position        integer,                       -- ordinal inside the file
  created_at      timestamptz not null default now()
);
create index if not exists idx_artifacts_source_file
  on public.artifacts (source_file_id);

-- ── chunks ───────────────────────────────────────────────────────────────
-- THE receipt primitive. Every claim must cite a chunk. The UI links back
-- to a chunk to prove a claim isn't fabricated.
create table if not exists public.chunks (
  id              uuid primary key default gen_random_uuid(),
  source_file_id  uuid not null references public.source_files (id) on delete cascade,
  artifact_id     uuid references public.artifacts (id) on delete set null,
  source_kind     source_kind not null,
  text            text not null,
  -- byte offsets into the source text, when the source IS text
  offset_start    integer,
  offset_end      integer,
  -- room for embeddings later; jsonb so we don't take a vector dep yet
  tokens          jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists idx_chunks_source_file
  on public.chunks (source_file_id);
create index if not exists idx_chunks_kind
  on public.chunks (source_kind);

-- ── entities ─────────────────────────────────────────────────────────────
-- Canonical things mentioned in the graph: a course, a topic, an error type,
-- a teacher. (kind, canonical_name) is unique so dedup is trivial.
create table if not exists public.entities (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null,                 -- 'course' | 'topic' | 'error_type' | 'school' | …
  canonical_name  text not null,
  aliases         jsonb not null default '[]'::jsonb,
  meta            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create unique index if not exists uq_entities_kind_name
  on public.entities (kind, canonical_name);

-- ── claims ───────────────────────────────────────────────────────────────
-- The atomic unit of "what we know about the user". (subject, predicate,
-- object) triple, with a hard pointer back to the chunk that justified it.
-- Predicate strings come from the controlled vocabulary in
-- landing/src/lib/graph/predicates.ts — agents do not invent predicates.
create table if not exists public.claims (
  id                  uuid primary key default gen_random_uuid(),
  owner               uuid not null references auth.users (id) on delete cascade,
  subject_entity      text not null default 'Student',
  predicate           text not null,
  object              jsonb not null,
  confidence          real not null check (confidence >= 0 and confidence <= 1),
  status              claim_status not null default 'pending',
  sensitivity         sensitivity not null default 'low',
  source_artifact_id  uuid references public.artifacts (id) on delete set null,
  source_chunk_id     uuid references public.chunks (id) on delete set null,
  source_file_id      uuid references public.source_files (id) on delete set null,
  extracted_by        text not null,             -- 'TranscriptReader' | 'ExamReader' | 'EssayReader' | 'user' | …
  reasoning           text,
  created_at          timestamptz not null default now(),
  confirmed_at        timestamptz
);
create index if not exists idx_claims_owner_status
  on public.claims (owner, status);
create index if not exists idx_claims_predicate
  on public.claims (predicate);
-- Dedup: at most one claim per (file, predicate, subject). Re-extraction
-- of the same file should UPDATE not insert. App-level enforces object-hash.
create unique index if not exists uq_claims_source_predicate
  on public.claims (source_file_id, predicate, subject_entity)
  where source_file_id is not null;

-- ── relationships ────────────────────────────────────────────────────────
-- Typed edges between entities. This is the "graph" view of the same data
-- claims describe — denormalized for fast traversal queries.
create table if not exists public.relationships (
  id              uuid primary key default gen_random_uuid(),
  owner           uuid not null references auth.users (id) on delete cascade,
  from_entity_id  uuid not null references public.entities (id) on delete cascade,
  to_entity_id    uuid not null references public.entities (id) on delete cascade,
  predicate       text not null,
  weight          real not null default 1.0,
  source_claim_id uuid references public.claims (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_rel_owner    on public.relationships (owner);
create index if not exists idx_rel_from     on public.relationships (from_entity_id);
create index if not exists idx_rel_to       on public.relationships (to_entity_id);

-- ── events ───────────────────────────────────────────────────────────────
-- Append-only log. Supabase Realtime broadcasts inserts so any subscribed
-- client (the dashboard, an agent runtime, the future tutor surface) reacts
-- to the graph evolving without polling.
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid references auth.users (id) on delete cascade,
  kind        text not null,                    -- 'source_uploaded' | 'claim_proposed' | 'claim_confirmed' | …
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_events_owner_created
  on public.events (owner, created_at desc);

-- ── row level security ───────────────────────────────────────────────────
-- Everything is owner-scoped via auth.uid(). Indirect tables (artifacts,
-- chunks, relationships) check ownership through the owning row.

alter table public.source_files   enable row level security;
alter table public.artifacts      enable row level security;
alter table public.chunks         enable row level security;
alter table public.entities       enable row level security;
alter table public.claims         enable row level security;
alter table public.relationships  enable row level security;
alter table public.events         enable row level security;

-- source_files: full CRUD on your own
drop policy if exists "source_files_self" on public.source_files;
create policy "source_files_self"
  on public.source_files for all
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

-- artifacts: scoped via the source file you own
drop policy if exists "artifacts_via_source" on public.artifacts;
create policy "artifacts_via_source"
  on public.artifacts for all
  using (
    source_file_id in (
      select id from public.source_files where owner = auth.uid()
    )
  )
  with check (
    source_file_id in (
      select id from public.source_files where owner = auth.uid()
    )
  );

-- chunks: same pattern as artifacts
drop policy if exists "chunks_via_source" on public.chunks;
create policy "chunks_via_source"
  on public.chunks for all
  using (
    source_file_id in (
      select id from public.source_files where owner = auth.uid()
    )
  )
  with check (
    source_file_id in (
      select id from public.source_files where owner = auth.uid()
    )
  );

-- entities: shared canonical table — readable by any signed-in user, but
-- only the service role writes to it. Inserts come from server-side
-- extractors, never from the browser, so we deny client writes outright.
drop policy if exists "entities_read_signed_in" on public.entities;
create policy "entities_read_signed_in"
  on public.entities for select
  using (auth.role() = 'authenticated');

-- claims
drop policy if exists "claims_self" on public.claims;
create policy "claims_self"
  on public.claims for all
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

-- relationships
drop policy if exists "relationships_self" on public.relationships;
create policy "relationships_self"
  on public.relationships for all
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

-- events: clients can read their own and (importantly) insert their own
-- so the upload component can drop a `source_uploaded` event without
-- needing the service role.
drop policy if exists "events_self_read" on public.events;
create policy "events_self_read"
  on public.events for select
  using (auth.uid() = owner);

drop policy if exists "events_self_insert" on public.events;
create policy "events_self_insert"
  on public.events for insert
  with check (auth.uid() = owner);

-- ── storage bucket: source-files ─────────────────────────────────────────
-- Bucket holds the raw uploaded blobs. Path layout: {owner_uid}/{file.id}.{ext}
-- so the RLS policy can decide ownership purely from the path.

insert into storage.buckets (id, name, public)
values ('source-files', 'source-files', false)
on conflict (id) do nothing;

-- a user can only read/write objects under their own uid prefix
drop policy if exists "storage_source_files_self_read"   on storage.objects;
drop policy if exists "storage_source_files_self_write"  on storage.objects;
drop policy if exists "storage_source_files_self_update" on storage.objects;
drop policy if exists "storage_source_files_self_delete" on storage.objects;

create policy "storage_source_files_self_read"
  on storage.objects for select
  using (
    bucket_id = 'source-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "storage_source_files_self_write"
  on storage.objects for insert
  with check (
    bucket_id = 'source-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "storage_source_files_self_update"
  on storage.objects for update
  using (
    bucket_id = 'source-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "storage_source_files_self_delete"
  on storage.objects for delete
  using (
    bucket_id = 'source-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- end 0002_knowledge_graph.sql
-- ============================================================================
