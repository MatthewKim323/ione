# ione

AI math tutor in the margin: screen-aware sessions, agent pipeline (OCR → reasoning → intervention), optional voice (ElevenLabs), and a **Supabase-backed knowledge graph** grounded in files the learner uploads.

---

## Repository layout

| Path | Role |
|------|------|
| **`landing/`** | Vite + React + Tailwind v4 — deploy this to **Vercel** (`Root Directory: landing`). |
| **`api/`** | Hono API (`/api/cycle`, sessions, sources/extract, audio, transcribe). Deploy separately (Fly, Render, etc.). |
| **`supabase/migrations/`** | Postgres + RLS + storage policies. |
| **`scripts/`** | Utilities (e.g. `verify-kg.mjs`). |

Design tokens and UI rules: **`DESIGN.md`**.

---

## Quick start (local)

1. **Supabase**: create a project, run migrations `0001` → `0007` in order in the SQL editor. See **`SETUP.md`**.
2. **Env**: copy `landing/.env.local.example` → `landing/.env.local` and repo-root `.env.local.example` → `.env.local` (API secrets).
3. **Run**:
   ```bash
   cd api && npm install && npm run dev    # http://localhost:8787
   cd landing && npm install && npm run dev # http://localhost:5234
   ```

---

## Production: Vercel + API

Step-by-step for hosting the **landing** app on Vercel and wiring a **remote API**: **`VERCEL.md`**.

---

## License

Private. Not yet open source.
