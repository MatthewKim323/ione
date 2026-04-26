# ione · demo seed bundle

Forged demo data for showing two distinct student scenarios mid-demo. Schema is winged from the public README — adjust field names if your real migrations diverged.

## Two scenarios baked in

| Student | Course | Failure mode | Headline pattern |
|---|---|---|---|
| **Maya Chen** (10th, alg 2) | Algebra II | Drops a negative when distributing across subtraction | `error:sign_drop_distribute` (11 occurrences, plateauing) |
| **Jordan Park** (12th, calc 1) | Calc I | Forgets the inner derivative on chain rule, especially with trig outers | `error:chain_with_trig_only` (9 occurrences, persistent) |

Maya's vibe: makes a mistake, gets a gentle nudge, self-corrects fast. Good for showing the bias-toward-silence + light-touch-when-needed flow.

Jordan's vibe: nudges aren't working anymore, ione escalates to a `full_explain` intervention. Good for showing the longitudinal memory paying off — "we've tried nudging 9 times, time to actually teach it."

## Files

```
backend/db/backboard_kg.json        ← THE knowledge graph. 28 nodes, 41 edges.
                                       Nodes: students, concepts, error_patterns, sessions, intervention_kinds.
                                       Edges: prerequisite_of, struggles_with, manifests_in, co_occurs_with, etc.

agents/ocr/maya_frame_0034.json     ← OCR snapshot mid-mistake. Maya has -10 instead of +10 on line 2.
agents/ocr/jordan_frame_0051.json   ← OCR snapshot. Jordan wrote cos(3x^2 + 1) without the *6x.

agents/reasoning/maya_eval_0034.json    ← Canonical solution + line-by-line eval + KG lookup + recommendation.
agents/reasoning/jordan_eval_0051.json  ← Same shape. Recommends full_explain because nudges have failed.

agents/intervention/decisions_log.json  ← 16 silent decisions, 8 speak decisions across both sessions.
                                          Demonstrates "biased hard toward silence."

scripts/seed_demo.sql               ← Postgres seed: users, student_assistants, fga_tuples, sessions,
                                       struggle_patterns, interventions. Drop into Supabase SQL editor.

shared/demo-types.ts                ← TypeScript types matching the JSON shapes. Optional but nice
                                       for `import { BackboardKG } from "@/shared/demo-types"`.
```

## Drop-in mapping (from the public README's structure)

| Demo file | Goes where |
|---|---|
| `backend/db/backboard_kg.json` | `backend/db/` (or hand to whatever loads from Backboard) |
| `agents/ocr/*.json` | `agents/ocr/` — sample fixtures |
| `agents/reasoning/*.json` | `agents/reasoning/` — sample fixtures |
| `agents/intervention/decisions_log.json` | `agents/intervention/` |
| `scripts/seed_demo.sql` | `scripts/` — run before demo |
| `shared/demo-types.ts` | `shared/` |

## Demo script (suggested)

1. Open dashboard. Show two students with different patterns. Point at the KG — "this is what ione remembers across all sessions."
2. **Scenario A — Maya.** Open her latest session. Show frame_0034: the OCR caught the sign drop. Show the reasoning eval flagging line 2 as the divergence. Show ione decided `point_to_line` because `nudge` has worked before. Play the audio. Show she self-corrected.
3. **Scenario B — Jordan.** Open his session. Show frame_0051. Same pipeline, but this time ione escalates to `full_explain` because the KG remembers nudges have stopped working. *This is the longitudinal memory payoff.*
4. End on the parent/teacher view (FGA tuples) — Ms. Alvarez and the parents see this same pattern data, scoped by FGA.

## What's intentionally not here

- Real Mathpix / Anthropic / ElevenLabs / Auth0 keys — `.env.local` stays empty.
- Actual screenshots / page images — the OCR JSON references `frame_id` only.
- Embeddings — the KG is symbolic, no vector store needed for the demo.

If a judge asks "is this real data," the honest answer is: it's seeded sample data demonstrating the pipeline shapes — same as any hackathon demo. The real Backboard pipeline accumulates equivalent records as students use the system.
