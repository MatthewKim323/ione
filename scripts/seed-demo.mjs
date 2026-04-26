#!/usr/bin/env node
/**
 * scripts/seed-demo.mjs
 *
 * Plants the demo memory graph for an account so the rehearsed math problem
 * has something for the Intervention Agent and dashboard to chew on.
 *
 * What gets created:
 *   1 fake source_file  (kind='failed_exam', title='DEMO · Algebra 2 Midterm')
 *   3 chunks            (test header + two problems with student work)
 *  12 confirmed claims  (errors, weak topics, strong topics, prefs, scores)
 *   1 events row        (kind='seed_demo_planted', for traceability)
 *
 * The 12 claims are hand-authored to make the Algebra 2 / quadratic factoring
 * demo feel personal: dominant error type = sign errors (3 examples), weak
 * at factoring + radicals, strong at linear systems, low score on the most
 * recent test, prefers concise verbal hints. With this profile the
 * Intervention Agent has plenty to riff on without inventing facts.
 *
 * Idempotent: running twice for the same user does not create duplicates.
 * The unique index on claims (source_file_id, predicate, subject_entity) +
 * the deterministic seed source_file title means we upsert cleanly.
 *
 * Usage:
 *   pnpm seed-demo --user <uuid-or-email>
 *   pnpm seed-demo --user matthew@ione.dev
 *   DEMO_USER_EMAIL=matthew@ione.dev pnpm seed-demo
 *
 * Env required (in .env.local):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import {
  c,
  rule,
  loadEnvAndClient,
  resolveDemoUser,
  deleteSeedRows,
  SEED_TAG,
  SEED_TITLE,
  SEED_FILENAME,
} from "./seed-demo-shared.mjs";

const supabase = loadEnvAndClient();
const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");

// ── 1. resolve user ─────────────────────────────────────────────────────────
const { id: userId, email } = await resolveDemoUser(supabase, argv);

console.log("");
console.log(rule("seed-demo"));
console.log(`  ${c.dim("user:")}  ${c.bold(userId)}`);
console.log(`  ${c.dim("email:")} ${email}`);
console.log(`  ${c.dim("tag:")}   ${c.moss(SEED_TAG)}`);
if (dryRun) console.log(`  ${c.yellow("dry-run — no writes")}`);
console.log(rule());

// ── 2. wipe any prior seed rows so re-runs land cleanly ────────────────────
//   We could rely on the unique index for upsert, but wiping first means the
//   chunk text / artifact content always reflects whatever this script
//   currently says — no stale half-states.
if (!dryRun) {
  const removed = await deleteSeedRows(supabase, userId);
  if (removed.claims + removed.events + removed.source_files > 0) {
    console.log(
      c.dim(
        `  cleared prior seed: ${removed.claims} claims · ${removed.events} events · ${removed.source_files} source_files`,
      ),
    );
  }
}

// ── 3. plant the source_file ───────────────────────────────────────────────
//   We don't upload an actual blob — `storage_path` points at a stub path
//   that will 404 on download. That's intentional: the seed should never
//   serve "fake-looking" file bytes through the real storage UI. The
//   dashboard can show the title + claims; the file viewer politely fails.
const sourceFile = {
  owner: userId,
  kind: "failed_exam",
  filename: SEED_FILENAME,
  storage_path: `seed/${userId}/${SEED_FILENAME}`,
  mime_type: "application/pdf",
  size_bytes: 184320,
  title: SEED_TITLE,
  status: "extracted",
};

let sourceFileId;
let chunkIds = { header: null, problemA: null, problemB: null };

if (!dryRun) {
  const { data: srcRow, error: srcErr } = await supabase
    .from("source_files")
    .insert(sourceFile)
    .select("id")
    .single();
  if (srcErr) {
    console.error(c.red("source_files insert failed:"), srcErr.message);
    process.exit(1);
  }
  sourceFileId = srcRow.id;
  console.log(`  ${c.moss("✓")} source_file ${c.dim(sourceFileId)}`);

  // ── 4. plant chunks (the receipt primitive every claim cites) ────────────
  const chunkRows = [
    {
      key: "header",
      text:
        "Algebra 2 — Unit 4 Midterm · Mr. Reyes · Score: 64 / 100. Five problems, " +
        "graded 11-12-2025. Student wrote work in the margins; legible but rushed.",
    },
    {
      key: "problemA",
      text:
        "Problem 3: Solve x² − 5x − 6 = 0 by factoring. Student wrote (x−2)(x+3) = 0, " +
        "concluded x = 2, x = −3. Correct factor pair was (x−6)(x+1). Student lost both " +
        "marks. Sign error in factor expansion is consistent with two earlier problems.",
    },
    {
      key: "problemB",
      text:
        "Problem 5: Simplify √(50). Student wrote 2√25 = 10. Correct simplification is " +
        "5√2. Student wrote in margin: \"I always forget which factor stays inside the radical.\"",
    },
  ];

  for (const row of chunkRows) {
    const { data: chunk, error: chunkErr } = await supabase
      .from("chunks")
      .insert({
        source_file_id: sourceFileId,
        source_kind: "failed_exam",
        text: row.text,
        tokens: { tag: SEED_TAG, slot: row.key },
      })
      .select("id")
      .single();
    if (chunkErr) {
      console.error(c.red(`chunk ${row.key} insert failed:`), chunkErr.message);
      process.exit(1);
    }
    chunkIds[row.key] = chunk.id;
  }
  console.log(`  ${c.moss("✓")} 3 chunks planted`);
} else {
  sourceFileId = "00000000-0000-0000-0000-000000000000";
  chunkIds = { header: sourceFileId, problemA: sourceFileId, problemB: sourceFileId };
}

// ── 5. plant the 12 claims ─────────────────────────────────────────────────
//   Each claim cites a chunk and is `confirmed` (so memory.ts picks it up
//   without the pending-confidence threshold). Ordering: errors first
//   because the dominant-error logic in compileStruggleProfile keys off
//   their volume, then topics, then performance, then prefs.
const now = new Date().toISOString();
const C = (partial) => ({
  owner: userId,
  subject_entity: "Student",
  status: "confirmed",
  sensitivity: "low",
  confidence: 0.92,
  source_file_id: sourceFileId,
  extracted_by: "seed-demo",
  confirmed_at: now,
  ...partial,
});

const claims = [
  // ── errors: sign errors dominate (3) so the Intervention Agent's first
  //    coaching beat is "watch your signs". ─────────────────────────────────
  C({
    predicate: "made_sign_error",
    object: { problem: "x² − 5x − 6 factor pair", expected: "(x−6)(x+1)", got: "(x−2)(x+3)" },
    source_chunk_id: chunkIds.problemA,
    reasoning: "Student picked factors that sum to −5 but ignored the −6 product sign.",
  }),
  C({
    predicate: "made_sign_error",
    object: { problem: "earlier problem 1", note: "carried negative through subtraction" },
    source_chunk_id: chunkIds.header,
    reasoning: "Pattern across problems 1–3.",
  }),
  C({
    predicate: "made_arithmetic_error",
    object: { problem: "Simplify √50", got: "10", expected: "5√2" },
    source_chunk_id: chunkIds.problemB,
    reasoning: "Confused 2√25 with √(2·25); pulled a 25 out instead of factoring 50.",
  }),
  C({
    predicate: "skipped_step",
    object: { step: "FOIL verification", note: "Did not expand candidate factors back out before answering." },
    source_chunk_id: chunkIds.problemA,
    reasoning: "Most sign errors caught during expansion-check, which student skipped.",
  }),

  // ── topics: weak / strong / needs_review ─────────────────────────────────
  C({
    predicate: "weak_at_topic",
    object: { topic: "factoring quadratics", evidence: "lost both marks on problem 3" },
    source_chunk_id: chunkIds.problemA,
    reasoning: "Two of three quadratic problems on this exam show factoring mistakes.",
  }),
  C({
    predicate: "weak_at_topic",
    object: { topic: "simplifying radicals", evidence: "problem 5" },
    source_chunk_id: chunkIds.problemB,
    reasoning: "Student admitted in margin they forget radical-factor rule.",
  }),
  C({
    predicate: "needs_review_on",
    object: { topic: "factoring quadratics", priority: "high" },
    source_chunk_id: chunkIds.problemA,
  }),
  C({
    predicate: "strong_at_topic",
    object: { topic: "linear systems", evidence: "Problems 1 and 2 graded 10/10" },
    source_chunk_id: chunkIds.header,
    reasoning: "Linear systems on the same exam fully correct.",
  }),

  // ── performance / academic ───────────────────────────────────────────────
  C({
    predicate: "scored_on_exam",
    object: {
      exam: "Algebra 2 Unit 4 Midterm",
      score: 64,
      out_of: 100,
      taken_on: "2025-11-12",
    },
    source_chunk_id: chunkIds.header,
  }),
  C({
    predicate: "enrolled_in_class",
    object: { class: "algebra_2", teacher: "Mr. Reyes" },
    source_chunk_id: chunkIds.header,
  }),
  C({
    predicate: "current_unit",
    object: { unit: "Unit 4 — Quadratics & Radicals" },
    source_chunk_id: chunkIds.header,
  }),

  // ── preferences ─────────────────────────────────────────────────────────
  C({
    predicate: "prefers_explanation_style",
    object: { style: "concise", channel: "voice", note: "User asked for short verbal hints during onboarding." },
    // No chunk citation: this came from onboarding, not the file. Preferences
    // are allowed to skip source_chunk_id; only the file-derived claims need
    // a chunk receipt.
    source_chunk_id: null,
    confidence: 0.85,
  }),
];

if (claims.length !== 12) {
  console.error(c.red(`Expected exactly 12 claims, built ${claims.length}.`));
  process.exit(1);
}

if (!dryRun) {
  const { error: claimErr } = await supabase.from("claims").insert(claims);
  if (claimErr) {
    console.error(c.red("claims insert failed:"), claimErr.message);
    process.exit(1);
  }
  console.log(`  ${c.moss("✓")} 12 claims planted`);

  await supabase.from("events").insert({
    owner: userId,
    kind: "seed_demo_planted",
    payload: {
      tag: SEED_TAG,
      source_file_id: sourceFileId,
      claim_count: 12,
      chunk_count: 3,
    },
  });
  console.log(`  ${c.moss("✓")} event logged`);
} else {
  // Dry-run mode prints what would happen so the user can sanity-check the
  // claim distribution before committing writes.
  const byPredicate = new Map();
  for (const cl of claims) {
    byPredicate.set(cl.predicate, (byPredicate.get(cl.predicate) ?? 0) + 1);
  }
  console.log(c.dim("  would insert (dry-run):"));
  console.log(c.dim(`    1 source_file · 3 chunks · 12 claims · 1 event`));
  console.log(c.dim("    claim breakdown by predicate:"));
  for (const [pred, count] of byPredicate) {
    console.log(c.dim(`      ${count} × ${pred}`));
  }
}

// ── summary ────────────────────────────────────────────────────────────────
console.log(rule());
console.log(c.bold("  Planted demo memory."));
console.log(c.dim("  Try it:"));
console.log(c.dim("    open the dashboard memory tab — 12 confirmed claims should show."));
console.log(c.dim("    start a tutor session, ask about factoring, watch the hints."));
console.log("");
console.log(c.dim("  To wipe just this seed (won't touch user-authored claims):"));
console.log(c.dim("    pnpm seed-demo:reset --user " + (email ?? userId)));
console.log("");
