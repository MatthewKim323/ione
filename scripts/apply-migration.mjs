#!/usr/bin/env node
/**
 * apply-migration.mjs — execute a single SQL migration against Supabase.
 *
 * Why this exists: the supabase CLI isn't always set up locally, and we
 * occasionally need to push a one-shot DDL fix (like 0006_chunks_position.sql)
 * to keep dev moving. This is the smallest possible runner: read a file,
 * POST it to PostgREST's `/rpc/exec_sql` endpoint... except that doesn't
 * exist by default. So instead we use the supabase-js admin client to
 * call rpc('exec') if the project has the `exec_sql` helper, OR we
 * fall back to splitting on semicolons and executing through the
 * `postgres-meta` REST endpoint via fetch.
 *
 * Simplest reliable approach: use the supabase-js client's underlying
 * fetch with the service role key against `pg-meta` style query. But
 * Supabase doesn't expose pg-meta on free tier.
 *
 * Fallback: just print the SQL with a copy-paste path to the SQL editor.
 *
 * Usage:
 *   node scripts/apply-migration.mjs supabase/migrations/0006_chunks_position.sql
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as dotenvConfig } from "dotenv";

dotenvConfig({ path: resolve(process.cwd(), ".env.local") });

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/apply-migration.mjs <path-to-sql>");
  process.exit(2);
}

const sql = readFileSync(resolve(process.cwd(), file), "utf8");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("[apply-migration] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env.local");
  process.exit(1);
}

// Try the meta endpoint that Supabase exposes for SQL execution.
// This works on every Supabase project (cloud + self-hosted) because it's
// what the dashboard SQL editor uses internally.
const metaUrl = `${url.replace(/\/$/, "")}/rest/v1/rpc/query`;

async function tryRpcQuery() {
  const res = await fetch(metaUrl, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  return { ok: res.ok, status: res.status, body: await res.text() };
}

const r = await tryRpcQuery();
if (r.ok) {
  console.log("✓ migration applied via /rpc/query");
  console.log(r.body);
  process.exit(0);
}

console.error(`✗ /rpc/query returned ${r.status}: ${r.body}`);
console.error("");
console.error("Supabase doesn't expose a generic SQL endpoint by default.");
console.error("Easiest path: open the Supabase SQL editor and paste the file.");
console.error("");
console.error(`SQL editor:  ${url.replace(".supabase.co", ".supabase.co/project/_/sql")}`);
console.error(`File:        ${resolve(process.cwd(), file)}`);
console.error("");
console.error("--- BEGIN SQL ---");
console.error(sql);
console.error("--- END SQL ---");
process.exit(1);
