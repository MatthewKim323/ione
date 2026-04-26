#!/usr/bin/env node
/**
 * scripts/seed-demo-reset.mjs
 *
 * Removes everything seed-demo.mjs created for one user and leaves their
 * real data alone. The trick is the SEED_TAG: every row the seed plants
 * carries it, so reset can do exact deletes without guessing.
 *
 * What this deletes (all owner-scoped):
 *   - claims          where extracted_by = 'seed-demo'
 *   - events          where kind         = 'seed_demo_planted'
 *   - source_files    where title        = 'DEMO · Algebra 2 Midterm'
 *     └─ chunks + artifacts cascade automatically
 *
 * What this DOES NOT touch:
 *   - any claim, chunk, or source the user (or a real extractor) created.
 *   - the user's profile row, auth account, or onboarding answers.
 *
 * Use this between demo dry-runs so the next rehearsal starts from a known
 * empty state, then re-run `pnpm seed-demo` to plant fresh rows.
 *
 * Usage:
 *   pnpm seed-demo:reset --user <uuid-or-email>
 *   DEMO_USER_EMAIL=matthew@ione.dev pnpm seed-demo:reset
 */

import {
  c,
  rule,
  loadEnvAndClient,
  resolveDemoUser,
  deleteSeedRows,
} from "./seed-demo-shared.mjs";

const supabase = loadEnvAndClient();
const argv = process.argv.slice(2);
const { id: userId, email } = await resolveDemoUser(supabase, argv);

console.log("");
console.log(rule("seed-demo-reset"));
console.log(`  ${c.dim("user:")}  ${c.bold(userId)}`);
console.log(`  ${c.dim("email:")} ${email}`);
console.log(rule());

const counts = await deleteSeedRows(supabase, userId);

const total = counts.claims + counts.events + counts.source_files;
if (total === 0) {
  console.log(c.dim("  Nothing to remove — no seed rows for this user."));
} else {
  console.log(`  ${c.sienna("✓")} removed ${counts.claims}  ${c.dim("claims")}`);
  console.log(`  ${c.sienna("✓")} removed ${counts.events}  ${c.dim("events")}`);
  console.log(
    `  ${c.sienna("✓")} removed ${counts.source_files}  ${c.dim("source_files (chunks + artifacts cascaded)")}`,
  );
}
console.log("");
