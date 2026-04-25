# ione

The AI tutor that lives in the margin of your page. A live web-based math tutor that watches you work in real time, intervenes only when it'll actually help, and remembers what you specifically struggle with across sessions.

> **Hackathon tracks:** Education · Best Use of AI/ML · Best Use of Auth0 AI Agents · Best Use of Backboard

---

## Project Structure

```
ione/
├── app/                 Next.js 16 App Router (routes only — pages + API handlers)
│   ├── tutor/           The live tutoring surface
│   ├── dashboard/       Patterns, sessions, parent/teacher views
│   └── api/             Server route handlers (process-frame, start-session, etc.)
│
├── frontend/            Client-side code imported by app/
│   ├── components/      React components (ui/, tutor/, dashboard/)
│   ├── hooks/           React hooks
│   ├── lib/             capture.ts, diff.ts, loop.ts (browser-only)
│   └── styles/          globals.css, design tokens
│
├── backend/             Server-only services imported by app/api/
│   ├── auth/            Auth0 client + FGA client
│   ├── integrations/    Mathpix, Anthropic, ElevenLabs, Backboard
│   └── db/              Postgres schema + client (user → assistant mapping)
│
├── agents/              The 3-agent system (prompts + call logic)
│   ├── ocr/             Page-understanding agent (vision + Mathpix)
│   ├── reasoning/       Canonical solution + evaluate student work
│   └── intervention/    Decides whether to speak, what to say
│
├── shared/              Types and constants shared across frontend/backend
├── scripts/             One-offs (demo seeding, FGA migrations)
├── public/              Static assets
│
├── middleware.ts        Auth0 routes auto-mounted at /auth/*
├── next.config.ts       (TBD)
├── package.json         (TBD)
└── .env.local.example   Env var template
```

## The 3-agent pipeline

1. **OCR Agent** — screenshot + Mathpix LaTeX → structured page state JSON
2. **Reasoning Agent** — two calls: cache canonical solution, then evaluate student work
3. **Intervention Agent** — decides *whether to speak*, biased hard toward silence

See `agents/*/README.md` for per-agent details.

## Stack

- **Next.js 16** (App Router, single deployable)
- **Auth0 v4** (identity, Token Vault for Drive sync, FGA for parent/teacher views)
- **Anthropic Claude Sonnet 4.5** (vision + reasoning)
- **Mathpix v3/text** (LaTeX OCR)
- **ElevenLabs Flash v2.5** (streaming TTS)
- **Backboard** (longitudinal struggle-pattern memory)
- **Recharts** (dashboard sparklines)

## Development

```bash
# Setup (TBD)
npm install
cp .env.local.example .env.local
# Fill in keys
npm run dev
```

## License

Private. Not yet open source.
