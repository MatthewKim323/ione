/**
 * reextract.ts — re-run KG extractors against existing source_files.
 *
 * Why this exists:
 *   The browser's `triggerExtraction` call to POST /api/sources/extract is
 *   fire-and-forget — if the API server happens to be down at upload time,
 *   the upload still succeeds (chunks are written client-side) but no claims
 *   ever get extracted, and the file stays at status='parsed' forever.
 *
 *   This script finds every source_file in {pending, parsed, failed} for a
 *   given user and reruns runSourceExtraction() on it directly, bypassing
 *   the HTTP layer (and therefore the auth requirement). It uses the same
 *   service-role Supabase client the API uses internally.
 *
 * Usage:
 *   tsx api/scripts/reextract.ts --user you@example.com
 *   tsx api/scripts/reextract.ts --user <uuid>
 *   DEMO_USER_EMAIL=you@example.com tsx api/scripts/reextract.ts
 *   # extract a single file:
 *   tsx api/scripts/reextract.ts --user <uuid> --file <source_file_id>
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + ANTHROPIC_API_KEY from
 * .env.local (same loader as the API server).
 */

import { createClient } from "@supabase/supabase-js";
import { env } from "../src/env.js";
import { runSourceExtraction } from "../src/kg/runner.js";

type Args = { user?: string; file?: string };

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--user") out.user = argv[++i];
    else if (a === "--file") out.file = argv[++i];
  }
  if (!out.user && process.env.DEMO_USER_EMAIL) out.user = process.env.DEMO_USER_EMAIL;
  return out;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveUserId(
  supabase: ReturnType<typeof createClient>,
  identifier: string,
): Promise<string | null> {
  if (UUID_RE.test(identifier)) return identifier;
  // listUsers returns up to 1000 by default — fine for a demo
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error("[reextract] could not list users:", error.message);
    return null;
  }
  const target = identifier.toLowerCase().trim();
  const hit = data.users.find((u) => u.email?.toLowerCase() === target);
  return hit?.id ?? null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.user) {
    console.error("usage: tsx api/scripts/reextract.ts --user <email|uuid> [--file <id>]");
    process.exit(2);
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ownerId = await resolveUserId(supabase, args.user);
  if (!ownerId) {
    console.error(`[reextract] could not resolve user "${args.user}"`);
    process.exit(1);
  }

  // pick targets: either one specific file, or every file that hasn't
  // successfully extracted yet (so re-runs are idempotent).
  let q = supabase
    .from("source_files")
    .select("id, filename, kind, status")
    .eq("owner", ownerId);
  if (args.file) {
    q = q.eq("id", args.file);
  } else {
    q = q.in("status", ["pending", "parsed", "failed"]);
  }
  const { data: files, error } = await q;
  if (error) {
    console.error("[reextract] source_files query failed:", error.message);
    process.exit(1);
  }
  if (!files || files.length === 0) {
    console.log(`no eligible source_files for user ${ownerId}.`);
    console.log("(only files in status pending/parsed/failed are retried;")
    console.log(" pass --file <id> to force one explicitly.)");
    return;
  }

  console.log(`\n── ione · re-extract ──────────────────────────────────`);
  console.log(`user: ${ownerId}`);
  console.log(`targets: ${files.length} file(s)\n`);

  let totalClaims = 0;
  let totalUsd = 0;
  const perFile: Array<{
    filename: string;
    kind: string;
    claims: number;
    extractors: string;
    errors: string;
  }> = [];

  for (const f of files) {
    const filename = f.filename as string;
    const kind = f.kind as string;
    process.stdout.write(`extracting  ${kind.padEnd(14)} ${filename} ... `);
    const result = await runSourceExtraction({
      ownerId,
      sourceFileId: f.id as string,
      supabase,
    });
    const claims = result.insertedClaimIds.length;
    totalClaims += claims;
    totalUsd += result.totalUsd;
    const extractorSummary = result.perExtractor
      .map((p) => `${p.extractor}=${p.claims}`)
      .join(" ");
    const errSummary =
      result.errors.length === 0
        ? ""
        : result.errors.map((e) => `[${e.code}] ${e.message}`).join("; ");
    console.log(
      `${claims} claim${claims === 1 ? "" : "s"}` +
        (errSummary ? ` · ${errSummary}` : ""),
    );
    perFile.push({
      filename,
      kind,
      claims,
      extractors: extractorSummary,
      errors: errSummary,
    });
  }

  console.log(`\n── summary ────────────────────────────────────────────`);
  console.log(`total claims inserted : ${totalClaims}`);
  console.log(`approximate cost      : $${totalUsd.toFixed(4)}`);
  if (totalClaims === 0) {
    console.log(
      `\n✗ zero claims. likely causes:\n` +
        `   • ANTHROPIC_API_KEY invalid → check api logs (tail terminal 987770)\n` +
        `   • model returned empty extractions (e.g. essay too short)\n` +
        `   • LLM hit rate-limit; retry in a minute`,
    );
  } else {
    console.log(`\n✓ ok. now re-run:`);
    console.log(`   node scripts/verify-kg.mjs --user ${args.user}`);
    console.log(
      `   open http://localhost:5234/dashboard/graph  →  MemoryInspector`,
    );
  }
}

main().catch((e) => {
  console.error("[reextract] fatal:", e);
  process.exit(1);
});
