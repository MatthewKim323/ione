/**
 * Shared bits for seed-demo.mjs and seed-demo-reset.mjs.
 *
 * Both scripts speak to Supabase as the service role (bypasses RLS) and need
 * the same connection bootstrap, the same way of resolving the demo user, and
 * the same cleanup query. Keeping them in one file avoids the two scripts
 * drifting (which is exactly the problem the reset script exists to solve).
 *
 * Identity rule: every row this seed writes carries the literal string
 * "seed-demo-v1" somewhere — chunks via `tokens.tag`, source_files via
 * `title`, claims via `extracted_by`. That tag is the *only* way reset
 * deletes seed data; nothing user-authored ever has that tag.
 */

import { config as dotenvConfig } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const SEED_TAG = "seed-demo-v1";
const SEED_TITLE = "DEMO · Algebra 2 Midterm";
const SEED_FILENAME = "alg2-midterm-seed.pdf";

// ── ANSI helpers (no chalk) ────────────────────────────────────────────────
export const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  moss: (s) => `\x1b[38;5;65m${s}\x1b[0m`,
  sienna: (s) => `\x1b[38;5;130m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

export const rule = (label = "") => {
  const w = 72;
  if (!label) return c.dim("─".repeat(w));
  const left = c.dim("── ");
  const right = c.dim(" " + "─".repeat(Math.max(0, w - 4 - label.length)));
  return left + c.bold(label) + right;
};

export { SEED_TAG, SEED_TITLE, SEED_FILENAME };

/**
 * Loads `.env.local` then `.env` and returns a service-role Supabase client.
 * Exits with a friendly message if the required env vars are missing — these
 * scripts are run by humans, not CI, so a clear error matters more than a stack.
 */
export function loadEnvAndClient() {
  dotenvConfig({ path: new URL("../.env.local", import.meta.url).pathname });
  dotenvConfig({ path: new URL("../.env", import.meta.url).pathname });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      c.red(
        "\nMissing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.",
      ),
    );
    console.error(
      c.dim(
        "These scripts use the service role to bypass RLS. Add them and re-run.\n",
      ),
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return supabase;
}

/**
 * Resolves the target user id from (in order):
 *   1. CLI flag       --user <uuid|email>
 *   2. env var        DEMO_USER_ID
 *   3. env var        DEMO_USER_EMAIL  (looked up via auth.admin)
 *
 * If only an email is given, this function asks Supabase Auth for the
 * matching user. Bails with a clear message if none of these resolve.
 */
export async function resolveDemoUser(supabase, argv) {
  const flag = argFlag(argv, "--user");
  let candidate = flag ?? process.env.DEMO_USER_ID ?? null;
  let email = process.env.DEMO_USER_EMAIL ?? null;

  if (candidate && isUuid(candidate)) {
    return { id: candidate, email: email ?? "(unknown)" };
  }
  if (candidate && candidate.includes("@")) {
    email = candidate;
    candidate = null;
  }
  if (!candidate && !email) {
    console.error(
      c.red(
        "\nNo demo user specified. Pass `--user <uuid-or-email>` or set DEMO_USER_ID / DEMO_USER_EMAIL.",
      ),
    );
    console.error(
      c.dim(
        "Tip: sign up for the demo account through /onboarding first, then re-run.\n",
      ),
    );
    process.exit(1);
  }

  const found = await findUserByEmail(supabase, email);
  if (!found) {
    console.error(c.red(`\nNo auth user found for email ${email}.`));
    console.error(
      c.dim(
        "Sign that account up first (or set DEMO_USER_ID directly).\n",
      ),
    );
    process.exit(1);
  }
  return found;
}

function argFlag(argv, name) {
  const i = argv.indexOf(name);
  if (i === -1 || i === argv.length - 1) return null;
  return argv[i + 1];
}

function isUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s,
  );
}

async function findUserByEmail(supabase, email) {
  if (!email) return null;
  // listUsers paginates 50 at a time; bail at 5 pages (250 users) which is
  // plenty for a demo project. Don't want to spider an entire prod tenant.
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 50,
    });
    if (error) {
      console.error(c.red("auth.admin.listUsers failed:"), error.message);
      return null;
    }
    const hit = data.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (hit) return { id: hit.id, email: hit.email };
    if (data.users.length < 50) break;
  }
  return null;
}

/**
 * Deletes every row this seed has ever written for `userId`. Tagged by
 * `extracted_by = 'seed-demo'` (claims) and `tokens->>tag = SEED_TAG`
 * (chunks); source_files via `title = SEED_TITLE`. Cascade fkeys on
 * artifacts/chunks/relationships clean themselves up via source_files,
 * but claims have ON DELETE SET NULL on source_file_id, so we wipe
 * those explicitly first.
 *
 * Returns counts so the caller can report what was removed.
 */
export async function deleteSeedRows(supabase, userId) {
  const counts = { claims: 0, events: 0, source_files: 0 };

  const { data: claimDel, error: claimErr } = await supabase
    .from("claims")
    .delete()
    .eq("owner", userId)
    .eq("extracted_by", "seed-demo")
    .select("id");
  if (claimErr) throw new Error(`delete claims: ${claimErr.message}`);
  counts.claims = claimDel?.length ?? 0;

  const { data: eventDel, error: eventErr } = await supabase
    .from("events")
    .delete()
    .eq("owner", userId)
    .eq("kind", "seed_demo_planted")
    .select("id");
  if (eventErr) throw new Error(`delete events: ${eventErr.message}`);
  counts.events = eventDel?.length ?? 0;

  // Source files cascade to artifacts + chunks. Delete by title which is
  // unique-per-seed for this user.
  const { data: srcDel, error: srcErr } = await supabase
    .from("source_files")
    .delete()
    .eq("owner", userId)
    .eq("title", SEED_TITLE)
    .select("id");
  if (srcErr) throw new Error(`delete source_files: ${srcErr.message}`);
  counts.source_files = srcDel?.length ?? 0;

  return counts;
}
