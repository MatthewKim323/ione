# ione — setup

The landing page + auth shell runs in `landing/` (Vite + React + Tailwind v4).
Auth and the user profile table live in Supabase. This doc walks through
getting a fresh clone running locally end-to-end in ~5 min.

---

## 0. prerequisites

- Node ≥ 18
- npm
- a Supabase project (free tier is fine) — https://supabase.com

---

## 1. supabase project

1. **Create a project** at https://supabase.com/dashboard.
2. Once it's provisioned, go to **Project Settings → API** and copy:
   - **Project URL** → goes into `VITE_SUPABASE_URL`
   - **anon / public key** → goes into `VITE_SUPABASE_ANON_KEY`
   - **service_role key** → goes into `SUPABASE_SERVICE_ROLE_KEY` (server only)

3. **Run the schema migration.** Open **SQL Editor → New query**, paste the
   contents of `supabase/migrations/0001_profiles.sql`, and **Run**.

   This creates:
   - `profiles` table (one row per `auth.users` row, joined by `id`)
   - enums: `grade_level`, `math_class`, `tricky_topic`, `hint_frequency`
   - trigger that auto-inserts a blank profile row on signup
   - RLS policies so users can only read/write their own profile

4. **(optional) email confirmations.** For local dev, go to
   **Authentication → Providers → Email** and **disable** "Confirm email"
   so signup → onboarding works without a round trip to your inbox.
   Re-enable in production.

---

## 2. env files

```bash
cp landing/.env.local.example landing/.env.local
cp .env.local.example .env.local                 # for agent / script work
```

Fill in `landing/.env.local`:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJI...
```

Anything else (Anthropic, Mathpix, ElevenLabs, Backboard) only needs to be
filled in when you start wiring the agents — not required for the auth flow.

---

## 3. run the app

```bash
cd landing
npm install
npm run dev
```

Vite serves on `http://localhost:5173`.

### auth flow you should see

1. `/` — landing page. "open the tutor" CTA points to `/signup`.
2. `/signup` — email + password form. On submit, Supabase creates a user,
   the `on_auth_user_created` trigger creates a blank `profiles` row, and
   the app redirects to `/onboarding`.
3. `/onboarding` — three steps (about you → your math → hint preferences).
   Submitting writes onto your `profiles` row and stamps `onboarded_at`.
4. `/dashboard` — placeholder summary of what you told us. Sign out lands
   back on `/`.

Route guards live in `landing/src/components/RouteGuards.tsx`:

- `ProtectedRoute requireOnboarded={false}` — must be signed in
- `ProtectedRoute requireOnboarded` — must be signed in **and** have
  `onboarded_at` set; otherwise → `/onboarding`
- `PublicOnlyRoute` — signed-in users get bounced to dashboard / onboarding

---

## 4. troubleshooting

**"Missing Supabase env vars" thrown at boot.**
Vite only reloads env on dev-server restart. Save `.env.local`, then
`Ctrl-C` and `npm run dev` again.

**Signup succeeds but no `profiles` row exists.**
The auth trigger didn't run. Re-run `0001_profiles.sql` and confirm:
```sql
select tgname from pg_trigger where tgname = 'on_auth_user_created';
```

**"new row violates row-level security policy" on onboarding submit.**
Either the user isn't signed in (check the network tab — request should
carry an `Authorization: Bearer …` header) or you ran the migration
without RLS policies. Re-run `0001_profiles.sql` end-to-end.

**Onboarding redirects me back to onboarding.**
`onboarded_at` is still null. The `Onboarding` page sets it inside the
final upsert; if that upsert errored, the toast shows it. Check console.
