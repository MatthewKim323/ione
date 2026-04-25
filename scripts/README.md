# scripts/

One-off utilities. Most run with `node scripts/<name>.mjs`.

## `test-ocr.mjs` — Hour 0 hardware reality check

Validates the full OCR stack (WebP encode → Mathpix → Claude Sonnet vision) on a real iPad screenshot **before** any agent code is written. See `MARGIN_OFFICE_HOURS_DESIGN.md` Phase 0.

### Setup (one time)

1. `cp .env.local.example .env.local`
2. Fill in three keys:
   - `ANTHROPIC_API_KEY` — [console.anthropic.com](https://console.anthropic.com/) → API Keys
   - `MATHPIX_APP_ID` and `MATHPIX_APP_KEY` — [accounts.mathpix.com](https://accounts.mathpix.com/) → API Keys
3. `npm install`

### Run

```bash
# Auto-pick the most recent screenshot on your Desktop:
npm run test:ocr

# Or pass a specific image:
node scripts/test-ocr.mjs scripts/captures/derivative-line-1.png
```

### Workflow

1. Mirror iPad to QuickTime (File → New Movie Recording → camera dropdown → iPad).
2. Write a math line on the iPad.
3. Screenshot the QuickTime window: `Cmd+Shift+4`, Space, click the window. Saves to Desktop.
4. `npm run test:ocr` — script auto-picks the latest screenshot.

Repeat with **at least three different handwritten lines** of varying complexity (linear equation, fraction, exponent). The pipeline is good enough when:

- Mathpix LaTeX is correct on all three.
- Sonnet's `current_step_latex` matches Mathpix.
- Sonnet's `confidence` is ≥ 0.7.
- `cycle total` is under 8000ms (the production target).

If any of those fail, tune capture parameters (resolution, ROI crop, q value) **before** writing agent code.

### What "good" output looks like

```
── stage 1 — encode webp q=0.7
  size     842.3 KB → 73.1 KB (8.7%)
  pixels   1668×2388
  latency  120ms

── mathpix v3/text
  latency  640ms
  latex    3(2x - 4) = 18

── claude sonnet 4.5 — page understanding
  latency  1850ms
  state    in_progress  conf 0.92
  current  3(2x - 4) = 18
```

## Planned scripts

- `seed-demo.mjs` — pre-seed the demo account with 12 fake struggle observations 12 hours before demo.
- `fga-migrate.mjs` — set up OpenFGA authorization model + initial parent/teacher/student tuples.
- `voice-pick.mjs` — synthesize the same hint with 3-4 candidate ElevenLabs voices.
- `eval-harness.mjs` — replay scripted student traces and assert agent outputs match expectations.

## Notes

- Screenshots dropped in `scripts/captures/` are gitignored except for the dir itself (`.gitkeep`). Save reference frames here for repeatable testing.
