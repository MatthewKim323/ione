# app/

Next.js 16 App Router. **Routes live here and only here** — pages and API handlers. Helper logic (capture loop, agents, integrations) lives in `frontend/`, `backend/`, and `agents/`.

## Routes

```
/                       Landing page
/tutor                  Live tutoring surface (server gates auth, client runs capture loop)
/dashboard              Student landing — patterns + recent sessions
/dashboard/patterns     The killer view — recurring struggle patterns
/dashboard/sessions/[id]  Session replay timeline
/dashboard/parent       Parent view (FGA-gated)
/dashboard/teacher      Teacher view (FGA-gated)
```

## API routes (server-side, all gated by `auth0.getSession()`)

```
POST /api/process-frame    Main loop endpoint — frame in, hint+audio out
POST /api/start-session    Creates a new Backboard thread for this session
POST /api/seed-demo        One-off: pre-seeds demo account with 12 fake observations
```

## Auth0 routes (auto-mounted by middleware)

```
/auth/login
/auth/logout
/auth/callback
/auth/profile
```

## Conventions

- **Server components by default.** Client components opt-in with `"use client"`.
- Each page that needs auth: `const session = await auth0.getSession(); if (!session) redirect("/auth/login");`
- API handlers return `NextResponse.json(...)` — never raw strings.
- Never import from `frontend/lib/*` in server components or API routes (those are browser-only).
- Never import from `backend/*` in client components (those leak server secrets).
