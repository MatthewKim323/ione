#!/usr/bin/env node
/**
 * verify-kg.mjs — proves the knowledge graph is real, not vibes.
 *
 * Reads directly from Supabase (service role, bypasses RLS) and prints a
 * forensic dump of *exactly* what's stored under your user id:
 *
 *   1. Source files: status, kind, chunk count, claim count
 *      → if any are stuck in 'pending' the extractor never ran
 *      → if 'parsed' but no claims, the LLM step failed silently
 *      → 'extracted' is the happy path
 *
 *   2. Sample chunks: the literal text the extractors saw
 *      → "no chunk → no claim" is the invariant; this is how you verify it
 *
 *   3. Claims grouped by predicate, with citations:
 *      predicate · object  ← (source filename · chunk excerpt · reasoning)
 *      → THIS is what KGReceipts surfaces in the tutor right rail
 *      → multiple sources citing the same predicate = convergence (the demo)
 *
 *   4. Verdict line: PASS / WARN / FAIL with the "why" attached.
 *
 * Run after dropping the persona markdown files into /dashboard/graph.
 *
 * Usage:
 *   DEMO_USER_EMAIL=you@example.com node scripts/verify-kg.mjs
 *   node scripts/verify-kg.mjs --user you@example.com
 *   node scripts/verify-kg.mjs --user <uuid>
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */

import { c, rule, loadEnvAndClient, resolveDemoUser } from "./seed-demo-shared.mjs";

const supabase = loadEnvAndClient();
const user = await resolveDemoUser(supabase, process.argv);

console.log();
console.log(rule("ione · KG verification"));
console.log(c.dim(`user: ${user.email} · ${user.id}`));
console.log();

// ── 1. source_files ─────────────────────────────────────────────────────
const { data: sources, error: srcErr } = await supabase
  .from("source_files")
  .select("id, kind, filename, title, status, uploaded_at")
  .eq("owner", user.id)
  .order("uploaded_at", { ascending: false });

if (srcErr) {
  console.error(c.red("failed to read source_files:"), srcErr.message);
  process.exit(1);
}

if (!sources?.length) {
  console.log(c.yellow("⚠  no source_files for this user."));
  console.log(
    c.dim(
      "   upload some files via /dashboard/graph (memory & graph tab) and re-run.\n",
    ),
  );
  process.exit(2);
}

console.log(c.bold(`source files (${sources.length})`));
console.log();

// gather counts in parallel
const ids = sources.map((s) => s.id);
const [chunkCountsRes, claimCountsRes] = await Promise.all([
  supabase
    .from("chunks")
    .select("source_file_id", { count: "exact" })
    .in("source_file_id", ids),
  supabase
    .from("claims")
    .select("source_file_id", { count: "exact" })
    .in("source_file_id", ids),
]);

const chunkBySource = bucketCount(chunkCountsRes.data, "source_file_id");
const claimBySource = bucketCount(claimCountsRes.data, "source_file_id");

const statusColor = (s) =>
  s === "extracted"
    ? c.moss(s.padEnd(10))
    : s === "parsed"
      ? c.cyan(s.padEnd(10))
      : s === "failed"
        ? c.red(s.padEnd(10))
        : c.yellow(s.padEnd(10));

console.log(
  c.dim(
    "  status     kind            filename                                     chunks  claims",
  ),
);
console.log(c.dim("  ───────────────────────────────────────────────────────────────────────────────"));
for (const s of sources) {
  const filename = (s.filename || "(unnamed)").padEnd(45).slice(0, 45);
  const kind = (s.kind || "?").padEnd(15).slice(0, 15);
  const chunks = String(chunkBySource[s.id] ?? 0).padStart(6);
  const claims = String(claimBySource[s.id] ?? 0).padStart(7);
  console.log(
    `  ${statusColor(s.status)} ${kind} ${filename} ${chunks} ${claims}`,
  );
}
console.log();

// ── 2. one sample chunk per file (proves text actually got stored) ───────
console.log(c.bold("sample chunk per source"));
console.log(c.dim("  (first 180 chars of the first chunk on each file)"));
console.log();

const { data: sampleChunks } = await supabase
  .from("chunks")
  .select("id, source_file_id, text")
  .in("source_file_id", ids)
  .order("created_at", { ascending: true });

const firstChunkBySource = {};
for (const chunk of sampleChunks ?? []) {
  if (!firstChunkBySource[chunk.source_file_id]) {
    firstChunkBySource[chunk.source_file_id] = chunk;
  }
}

for (const s of sources) {
  const chunk = firstChunkBySource[s.id];
  const label = c.sienna((s.filename || "?").slice(0, 50));
  if (!chunk) {
    console.log(`  ${label}`);
    console.log(`    ${c.red("✗ no chunks — extractor saw nothing on this file")}`);
    console.log();
    continue;
  }
  const excerpt = chunk.text
    .replace(/\s+/g, " ")
    .slice(0, 180)
    .trim();
  console.log(`  ${label}`);
  console.log(`    ${c.dim("├")} ${excerpt}${chunk.text.length > 180 ? "…" : ""}`);
  console.log(`    ${c.dim("└")} chunk_id: ${c.dim(chunk.id)}`);
  console.log();
}

// ── 3. all claims, grouped by predicate ──────────────────────────────────
const { data: claims, error: claimErr } = await supabase
  .from("claims")
  .select(
    `
    id,
    predicate,
    object,
    confidence,
    status,
    reasoning,
    extracted_by,
    source_file:source_files (filename, kind),
    source_chunk:chunks (text)
  `,
  )
  .eq("owner", user.id)
  .order("created_at", { ascending: false });

if (claimErr) {
  console.error(c.red("failed to read claims:"), claimErr.message);
  process.exit(1);
}

if (!claims?.length) {
  console.log(c.red("✗ NO CLAIMS for this user."));
  console.log(
    c.dim(
      "  files uploaded but extractors produced nothing. likely causes:\n" +
        "    • api server isn't running (cd api && npm run dev)\n" +
        "    • ANTHROPIC_API_KEY missing or invalid in .env.local\n" +
        "    • files all routed to kind=note (only Archivist runs)\n" +
        "  check api logs and Supabase source_files.status='failed' rows.\n",
    ),
  );
  process.exit(3);
}

console.log(rule(`claims · ${claims.length} total`));
console.log();

const byPredicate = {};
for (const cl of claims) {
  const key = cl.predicate;
  if (!byPredicate[key]) byPredicate[key] = [];
  byPredicate[key].push(cl);
}

const predicates = Object.keys(byPredicate).sort();
for (const predicate of predicates) {
  const rows = byPredicate[predicate];
  console.log(`${c.bold(predicate)} ${c.dim(`(${rows.length})`)}`);
  for (const cl of rows) {
    const obj = renderObject(cl.object);
    const conf = `${(cl.confidence * 100).toFixed(0)}%`;
    const status =
      cl.status === "confirmed" ? c.moss("✓") : c.dim(cl.status[0]);
    const src = unwrap(cl.source_file);
    const srcLabel = src?.filename
      ? c.sienna(src.filename) + c.dim(` · ${src.kind}`)
      : c.dim("(no source)");
    const extractor = c.dim(`[${cl.extracted_by}]`);
    console.log(`  ${status} ${obj}  ${c.dim("·")} ${conf}  ${extractor}`);
    console.log(`     ${c.dim("├ from")} ${srcLabel}`);
    if (cl.reasoning) {
      console.log(`     ${c.dim("├ why ")} ${c.dim(cl.reasoning.slice(0, 140))}`);
    }
    const chunk = unwrap(cl.source_chunk);
    if (chunk?.text) {
      const quote = chunk.text.replace(/\s+/g, " ").slice(0, 100).trim();
      console.log(`     ${c.dim("└ cite")} ${c.dim(`"${quote}…"`)}`);
    } else {
      console.log(`     ${c.dim("└ cite")} ${c.red("(no chunk!)")}`);
    }
  }
  console.log();
}

// ── 4. convergence detection ────────────────────────────────────────────
// The whole pitch: same predicate cited from multiple independent sources.
const convergence = [];
for (const predicate of predicates) {
  const rows = byPredicate[predicate];
  const sourceFiles = new Set();
  for (const cl of rows) {
    const src = unwrap(cl.source_file);
    if (src?.filename) sourceFiles.add(src.filename);
  }
  if (sourceFiles.size >= 2) {
    convergence.push({ predicate, sources: [...sourceFiles] });
  }
}

if (convergence.length > 0) {
  console.log(rule("convergence — predicates cited by multiple sources"));
  console.log(c.dim("  this is the receipts story: independent files agreeing"));
  console.log();
  for (const conv of convergence) {
    console.log(`  ${c.bold(conv.predicate)}`);
    for (const src of conv.sources) {
      console.log(`    ${c.dim("·")} ${c.sienna(src)}`);
    }
    console.log();
  }
}

// ── 5. verdict ──────────────────────────────────────────────────────────
console.log(rule("verdict"));
console.log();

const failedSources = sources.filter((s) => s.status === "failed");
const stuckSources = sources.filter(
  (s) => s.status === "pending" || s.status === "parsed",
);
const happySources = sources.filter((s) => s.status === "extracted");

const lines = [];
const emit = (icon, msg) => lines.push(`  ${icon} ${msg}`);

if (happySources.length) {
  emit(
    c.moss("✓"),
    `${happySources.length}/${sources.length} files reached status='extracted'`,
  );
}
if (stuckSources.length) {
  emit(
    c.yellow("⚠"),
    `${stuckSources.length} file(s) stuck in '${stuckSources[0].status}' — extractor never finished. is api running? (cd api && npm run dev)`,
  );
}
if (failedSources.length) {
  emit(
    c.red("✗"),
    `${failedSources.length} file(s) status='failed' — check api logs for the error`,
  );
}

const orphaned = claims.filter((cl) => !unwrap(cl.source_chunk));
if (orphaned.length) {
  emit(
    c.yellow("⚠"),
    `${orphaned.length} claim(s) have no chunk citation — graph is not fully grounded`,
  );
} else {
  emit(c.moss("✓"), `every claim has a chunk citation (no fabrication)`);
}

const confirmed = claims.filter((cl) => cl.status === "confirmed").length;
const pending = claims.filter((cl) => cl.status === "pending").length;
emit(
  c.moss("✓"),
  `${claims.length} claims · ${confirmed} confirmed · ${pending} pending`,
);

if (convergence.length) {
  emit(
    c.moss("✓"),
    `${convergence.length} predicate(s) converge across multiple sources — receipts story works`,
  );
} else {
  emit(
    c.dim("·"),
    `no cross-source convergence yet. drop more docs (the persona pack has 6) for the demo punchline.`,
  );
}

const distinctExtractors = new Set(claims.map((cl) => cl.extracted_by));
emit(
  c.moss("✓"),
  `${distinctExtractors.size} distinct extractor(s) ran: ${[...distinctExtractors].join(", ")}`,
);

for (const l of lines) console.log(l);
console.log();

const overallFail = failedSources.length || stuckSources.length || !claims.length;
const overallWarn = orphaned.length;
if (overallFail) {
  console.log(c.red(c.bold("  RESULT: FAIL — kg is not functional yet, see above")));
  process.exit(4);
} else if (overallWarn) {
  console.log(c.yellow(c.bold("  RESULT: WARN — kg works but has gaps")));
} else {
  console.log(c.moss(c.bold("  RESULT: PASS — kg is real and grounded")));
  console.log(
    c.dim(
      "  open /dashboard/graph (MemoryInspector) to see the same data in the UI,",
    ),
  );
  console.log(
    c.dim(
      "  or /tutor — the right margin's KGReceipts panel reads /api/me/struggle.",
    ),
  );
}
console.log();

// ─── helpers ────────────────────────────────────────────────────────────
function bucketCount(rows, key) {
  const out = {};
  for (const r of rows ?? []) {
    out[r[key]] = (out[r[key]] ?? 0) + 1;
  }
  return out;
}

/** Supabase relational select returns object | array — coerce to object|null. */
function unwrap(v) {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function renderObject(obj) {
  if (obj == null) return c.dim("(no object)");
  if (typeof obj === "string") return obj;
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
  if (typeof obj === "object") {
    for (const k of ["value", "label", "topic", "name", "title", "subject"]) {
      if (typeof obj[k] === "string" && obj[k].trim()) return obj[k].trim();
    }
    const s = JSON.stringify(obj);
    return s.length > 80 ? s.slice(0, 77) + "…" : s;
  }
  return String(obj);
}
