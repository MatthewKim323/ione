#!/usr/bin/env node
/**
 * inspect-schema.mjs — print the actual columns + unique indexes on a table.
 *
 * Why: we keep hitting schema drift between the migration files and what
 * Supabase actually has applied. PostgREST exposes `pg_indexes` and
 * `information_schema.columns` if you query them via the REST surface,
 * but only when a row-level-security policy permits it for the
 * service-role key (which it does — service role bypasses RLS).
 *
 * Usage:
 *   node scripts/inspect-schema.mjs claims
 *   node scripts/inspect-schema.mjs chunks
 */

import { createClient } from "@supabase/supabase-js";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "node:path";

dotenvConfig({ path: resolve(process.cwd(), ".env.local") });

const table = process.argv[2];
if (!table) {
  console.error("usage: node scripts/inspect-schema.mjs <table>");
  process.exit(2);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// Trick: PostgREST won't let us query pg_indexes directly, but we CAN
// run SQL via a stored function if it exists. Since we can't add one
// here either, we infer the schema by trying inserts/upserts that
// would fail in informative ways.
//
// Easier: just probe by attempting an upsert with the documented
// onConflict spec and see what postgres actually says.

async function probeUpsert(onConflict) {
  // intentionally wrong row so we hit the conflict-spec validation
  // BEFORE the row is evaluated against constraints (PG validates the
  // spec at parse time)
  const probe = {
    owner: "00000000-0000-0000-0000-000000000000",
    subject_entity: "__probe__",
    predicate: "__probe__",
    object: { __probe: true },
    confidence: 0,
    status: "pending",
    sensitivity: "low",
    source_file_id: null,
    source_chunk_id: null,
    extracted_by: "__probe__",
    reasoning: null,
    confirmed_at: null,
  };
  const { error } = await supabase
    .from(table)
    .upsert(probe, { onConflict })
    .select("id")
    .maybeSingle();
  return error;
}

console.log(`\n── ione · schema probe for ${table} ──`);
const candidates = [
  "source_file_id,predicate,subject_entity",
  "owner,predicate,subject_entity",
  "predicate,subject_entity",
  "id",
];
for (const oc of candidates) {
  const err = await probeUpsert(oc);
  if (!err) {
    console.log(`  ✓ ON CONFLICT (${oc})  — accepted by PG`);
  } else if (/no unique or exclusion/i.test(err.message)) {
    console.log(`  ✗ ON CONFLICT (${oc})  — no matching unique constraint`);
  } else {
    // some OTHER error (FK violation, etc) — that's fine, the spec was valid
    console.log(`  ✓ ON CONFLICT (${oc})  — spec valid (other error: ${err.message.slice(0, 80)})`);
  }
}

console.log("\n(use this to choose the right onConflict spec or to detect missing indexes.)\n");
