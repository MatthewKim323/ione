# backend/

Server-only services and integrations. Imported by `app/api/*/route.ts` and server components. **Never import from here in client components** — these modules use API keys.

## Layout

```
backend/
├── auth/
│   ├── auth0.ts        Auth0Client singleton
│   └── fga.ts          OpenFGA client + canViewStudent helper
├── integrations/
│   ├── mathpix.ts      v3/text OCR — base64 PNG → LaTeX
│   ├── anthropic.ts    Sonnet 4.5 wrapper (vision + text calls)
│   ├── elevenlabs.ts   Flash v2.5 streaming TTS → blob URL
│   └── backboard.ts    ensureAssistant, startThread, writeMemory, getStruggleProfile
└── db/
    ├── schema.ts       Drizzle schema — userAssistants table
    └── client.ts       Postgres client
```

## Rules

- Every module here reads from `process.env.*` — never hardcode keys.
- Wrap external API calls with try/catch; return typed results, not raw responses.
- `mathpix` and `anthropic` should support prompt caching (see Anthropic prompt-caching docs).
- `backboard` is the brain — see `agents/` for how it gets used.
