-- 0006_chunks_position.sql
--
-- Adds the missing `position` column to `chunks`.
--
-- Schema drift fix:
--   The KG runner (`api/src/kg/runner.ts`) selects
--     `id, source_file_id, source_kind, text, position`
--   from `chunks` and orders by position. The TypeScript type
--   `Chunk` (landing/src/lib/database.types.ts) also declares
--   `position: number | null`. But 0002_knowledge_graph.sql only ever
--   created `offset_start` / `offset_end` on `chunks` — no `position`.
--
--   Result: every call to runSourceExtraction() throws with
--   `column chunks.position does not exist`, every source_file gets
--   stuck in status='parsed' or 'failed', and the proposal queue
--   stays empty forever. (Discovered while seeding the Jordan Reeves
--   persona demo.)
--
-- Why a separate `position` (vs. ordering by offset_start):
--   `chunks` will eventually get rows that are NOT byte-offset based
--   — e.g. OCR'd PDF pages indexed by page number, audio transcript
--   segments indexed by segment id. `offset_start` is text-only.
--   `position` is the universal ordinal the LLM cites (`[chunk 3]`
--   in extractor-base.ts).
--
-- Backfill:
--   For existing rows we use offset_start as a stable proxy ordinal
--   per source_file. New text uploads insert NULL by default; the
--   ingest path can fill it in if/when chunkers want to.

alter table public.chunks
  add column if not exists position integer;

-- Backfill: assign 1..N per source_file ordered by created_at then
-- offset_start (so two chunks created in the same instant break the
-- tie deterministically). Using a CTE because UPDATE ... FROM
-- subquery is a Postgres-ism and we want it readable.
with ranked as (
  select
    id,
    row_number() over (
      partition by source_file_id
      order by created_at asc, coalesce(offset_start, 0) asc
    ) - 1 as ord
  from public.chunks
)
update public.chunks c
set position = r.ord
from ranked r
where r.id = c.id and c.position is null;

-- Helpful index for `order by position` lookups on a single source.
create index if not exists idx_chunks_source_file_position
  on public.chunks (source_file_id, position);
