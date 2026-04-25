# scripts/

One-off utilities. Run with `npx tsx scripts/<name>.ts` (or via npm scripts in `package.json`).

## Planned scripts

- `seed-demo.ts` — pre-seeds the demo account with 12 fake struggle observations so the patterns dashboard has data to render. **Run no later than 12 hours before demo** so Backboard memory consolidation has time to settle.
- `fga-migrate.ts` — sets up OpenFGA authorization model + initial parent/teacher/student tuples.
- `voice-pick.ts` — synthesizes the same hint with 3-4 candidate ElevenLabs voices, saves MP3s for A/B comparison.
