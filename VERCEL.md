# Deploying ione to Vercel

This repo’s **production web app** is the Vite + React client in **`landing/`**. The **API** (`api/`) is a separate Node (Hono) server with streaming SSE and long-running agent work — run it on **Fly.io, Render, Railway, a VPS**, etc., then point the browser at it with `VITE_API_URL`.

---

## 1. Vercel project

1. [Import the repository](https://vercel.com/new) into Vercel.
2. **Root Directory**: `landing`  
   (Critical: do not use the monorepo root; `package.json` and `vercel.json` live under `landing/`.)
3. Framework: **Vite** (auto-detected from `landing/vercel.json`).
4. **Build Command**: `npm run build` (default).  
5. **Output Directory**: `dist` (default).  
6. **Install Command**: `npm ci` (default in `vercel.json`; requires `landing/package-lock.json`).

`landing/vercel.json` already configures SPA fallbacks for React Router (excluding paths that start with `api/`, in case you add a proxy later) and long-cache headers for hashed assets.

---

## 2. Environment variables (Vercel → Production)

Add under **Project → Settings → Environment Variables** (Production). Vite inlines `VITE_*` at **build** time — redeploy after changing them.

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase **anon** key (RLS-protected; safe for the browser). |
| `VITE_API_URL` | **Yes in production** | Public **HTTPS** origin of your Hono API, **no trailing slash**, e.g. `https://ione-api.fly.dev`. If unset, the app falls back to localhost-style behavior and will not work from the internet. |

Optional for previews: duplicate the same vars on **Preview** if you use preview deployments with a staging API.

---

## 3. API server (not on Vercel)

Deploy `api/` wherever you run Node 20+:

```bash
cd api
npm ci
npm run build   # if you add a build step; today `tsx`/TypeScript may run via start script — check api/package.json
```

Set **at least** (see repo-root `.env.local.example`):

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`, `MATHPIX_APP_ID`, `MATHPIX_APP_KEY`
- `ELEVENLABS_API_KEY` (and optional `ELEVENLABS_VOICE_ID`)
- **`ALLOWED_ORIGINS`** — comma-separated list of **exact** browser origins allowed to call the API (CORS). Include:
  - `https://<your-project>.vercel.app`
  - Your production custom domain, e.g. `https://app.example.com`
  - Preview URLs if you use preview APIs: `https://<branch>-<team>.vercel.app`
- `NODE_ENV=production`

In **development**, the API allows any origin when `NODE_ENV` is `development`. In **production**, only listed origins receive CORS credentials.

---

## 4. Supabase

- Run SQL migrations in order (`supabase/migrations/`).
- Enable Realtime on `source_files` if you want the dashboard sources list to live-update (see `SETUP.md`).
- Create the **`source-files`** storage bucket if the migration could not insert into `storage.buckets` on hosted Supabase.

---

## 5. Checklist before go-live

- [ ] Vercel **Root Directory** = `landing`
- [ ] `VITE_API_URL` matches your deployed API (HTTPS, no trailing `/`)
- [ ] API `ALLOWED_ORIGINS` includes your Vercel URL(s)
- [ ] Supabase **Site URL** / redirect URLs include your Vercel domain (Auth → URL configuration)
- [ ] `cd landing && npm run build` passes locally with production-like `VITE_*`

---

## 6. Local parity

```bash
# Terminal A — API
cd api && npm run dev

# Terminal B — landing (points at API via landing/.env.local)
cd landing && npm run dev
```

See **`SETUP.md`** for first-time Supabase + env setup.
