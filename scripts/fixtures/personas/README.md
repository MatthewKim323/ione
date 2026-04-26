# Persona fixtures — forged docs for KG ingestion demo

These are hand-authored markdown files that simulate "everything you'd
ever know about a real student." Drop them into `/dashboard/graph` (the
**memory & graph** tab) one at a time and watch the knowledge graph fill
in with cited claims.

## Why these specific files

Each filename is engineered to route to a specific KG extractor. The
extractor router lives in `landing/src/lib/graph/inferSourceKind.ts`
and reads filenames before MIME types — so a markdown file named
`transcript-fall.md` deliberately routes to `TranscriptReader` instead
of falling back to the generic `Archivist`-only `note` path.

| File                                              | SourceKind       | Extractor          | What it teaches the KG                                          |
|---------------------------------------------------|------------------|--------------------|-----------------------------------------------------------------|
| `transcript-fall-junior-year-2024.md`             | `transcript`     | TranscriptReader   | grades, GPA trend, subject strengths/weaknesses                 |
| `ap-calc-final-exam-fall-2024-graded.md`          | `failed_exam`    | ExamReader         | exact missed problems, error types, score, weak topic           |
| `practice-homework-week-8-derivatives.md`         | `practice_work`  | PracticeWorkReader | self-noticed pattern of chain-rule misses on ungraded work      |
| `personal-statement-draft.md`                     | `essay`          | EssayReader        | identity, learning preferences, intended major, self-narrative  |
| `ap-calc-ab-syllabus-2024-2025.md`                | `syllabus`       | SyllabusReader     | course structure, topics, when chain rule shows up in pacing    |
| `tutor-session-recap-oct-19.md`                   | `note`           | Archivist          | third-party observation of Jordan's attention pattern           |

## The demo arc (≈3 minutes total)

The story you're telling: **the agent doesn't just OCR what's on screen.
It already knows this kid.**

1. **Open `/dashboard/graph`.** Show the empty state.
2. **Drag all six markdown files in at once.** Watch the SourceList show
   them progress: `pending → parsed → extracted`.
3. **Open MemoryInspector** (same page, lower section). Show the claims
   bucketed by predicate — `weak_topic: chain rule` cited from three
   different sources, `prefers_learning_style: hands-on` from the essay,
   `recent_score: 62/100` from the exam, etc. Every claim has a chunk
   citation back to the markdown.
4. **Now go to `/tutor?mode=demo`.** Start the session.
5. When the predictive agent flags a chain-rule problem on the iPad,
   the **AgentTrace** rail (left) shows the reasoning step pulling
   `kg_lookup: weak_topic=chain_rule, last_intervention=did_not_self_correct`
   — and the **KGReceipts** panel (right margin) shows the actual
   cited claims that drove the prediction.

The receipts are the punchline. The same `weak_topic: chain rule` claim
appears in:
  - the transcript ("Chain rule remains a recurring stumbling block")
  - the exam ("missed 33 of 45 chain-rule points")
  - the practice work ("7 chain-rule misses out of 12 problems")
  - the tutor recap ("attention gap on composite functions")

Three independent sources, one converging fact. That's the KG payoff.

## Important: server must be running for extraction

The extraction step (`pending → extracted`) calls
`POST /api/sources/extract` on `localhost:8787`. If you upload the files
with the API down, they will sit in `pending` forever. Start the api
first:

```bash
cd api && npm run dev
```

If a file gets stuck in `pending`, check `api/src/kg/runner.ts` logs and
the Supabase `source_files` table — `status='failed'` rows have the
extractor error attached.

## Reset between demos

To re-run the demo from scratch, you can either:

1. Delete the source files from the dashboard UI (each row has a delete
   button), which cascades to chunks + claims, **or**
2. Run `node scripts/seed-demo-reset.mjs` (only deletes the original
   single-user seed-demo data, not these markdown uploads — for those
   you need the dashboard delete).
