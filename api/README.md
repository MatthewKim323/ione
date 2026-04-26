# ione-api

Hono on Node. Orchestrates the Margin tutoring loop:

```
WebP frame  ─┐
session_id  ─┼─POST /api/cycle──►  OCR ─►  Reasoning ┐
trajectory  ─┘                         ─►  Predictive┴─►  Policy ─►  Intervention ─►  SSE  ─►  browser
```

Anthropic-only prize scope. No Auth0 / FGA / Backboard. Memory comes from
the friend's Supabase KG (`supabase/migrations/0002_knowledge_graph.sql`).

## Layout

```
src/
  server.ts                 Hono app entry + boot
  env.ts                    zod-validated env (loads ../.env.local)
  lib/
    logger.ts               pino + pretty-print in dev
    errors.ts               AppError union with status mapping
    sse.ts                  CycleEvent schema + formatter
    cost.ts                 Sonnet / Mathpix / ElevenLabs cost meter
    json-fence.ts           strip ```json fences from Sonnet
  integrations/
    anthropic.ts            sonnetJson + sonnetVisionJson
    mathpix.ts              v3/text wrapper
    elevenlabs.ts           Flash v2.5 streaming
    supabase.ts             service-role admin client + JWT verify
  agents/                   (phase 1 B/C/D)
  routes/                   (phase 1 D, phase 2 E7, phase 3 F4)
  kg/                       (phase 3 F3)
tests/                      (phase 1 B/C unit + phase 6 eval)
```

## Local dev

```sh
cd api
npm install
npm run dev          # tsx watch on PORT=8787
curl -s http://localhost:8787/healthz | jq
```

## Env

Reads from `../.env.local` (the repo-root file) with `api/.env.local`
override. Required keys:

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
MATHPIX_APP_ID
MATHPIX_APP_KEY
```

Optional:

```
ELEVENLABS_API_KEY               # required for /api/audio
ELEVENLABS_VOICE_ID              # default 21m00Tcm4TlvDq8ikWAM (Rachel)
PORT                             # default 8787
LOG_LEVEL                        # default info
ALLOWED_ORIGINS                  # default localhost:5234,4173
COST_CAP_USD_PER_SESSION         # default 1.5
COST_CAP_USD_PER_USER_DAY        # default 5
STORE_FRAMES                     # 0|1, default 0
```

## Tests

```sh
npm test              # vitest unit tests, no live LLM calls
npm run eval          # RUN_EVAL=1 — runs orchestrator + KG fixtures against real Sonnet
```
