# klar — the client portal for Framer studios

*Working title. Manage projects inside Framer. Give clients a portal that feels like yours.*

Monorepo:

```
supabase/   Postgres schema, RLS, portal access functions
portal/     Client portal (Next.js, deploy on Vercel)
plugin/     Framer plugin (Vite + React + @framer/plugin)
```

## Architecture in one paragraph

Supabase (EU region) is the single backend: Auth for studio accounts, Postgres with
Row Level Security for tenant isolation, `pgcrypto` for hashed access codes. The
Framer plugin is a pure API client — it authenticates with supabase-js and talks to
the tables directly under RLS. The portal is server-rendered Next.js that uses the
service-role key **only on the server** and reads exclusively through
`SECURITY DEFINER` functions (`portal_get_project` etc.) that never select internal
fields — internal notes and hidden tasks physically never leave the database.
Portal sessions are short-lived signed JWTs in httpOnly cookies, unlocked by an
access code that is bcrypt-hashed, shown once, revocable, and rate-limited.

## Setup (about 20 minutes)

### 1. Supabase

1. Create a project at supabase.com — choose **EU (Frankfurt)** as region.
2. In the SQL editor, run `supabase/migrations/0001_init.sql`.
3. Auth → Providers → Email: enable email+password. For fastest testing, disable
   "Confirm email" (re-enable before launch).
4. Copy from Settings → API: the project URL, the `anon` key, the `service_role` key.

### 2. Portal

```bash
cd portal
cp .env.example .env.local   # fill in URL, service_role key, a random session secret
npm install
npm run dev                  # http://localhost:3000
```

Deploy: push to GitHub → import in Vercel → set the three env vars →
region `fra1` to keep data paths in the EU. Custom domains per studio
(`projects.studio.com`) are a Vercel domain alias later — the routing already
works on `/p/{slug}`.

### 3. Plugin

```bash
cd plugin
cp .env.example .env         # anon key + portal base URL
npm install
npm run dev
```

In Framer: enable Developer Tools (Preferences → Advanced), then
Plugins → "Open Development Plugin" and point it at the local server
(https, mkcert handles the certificate).

## The MVP loop to test

1. Open the plugin in Framer → create an account → name your studio.
2. "+ New" → client "ACME", project "Website".
3. Add tasks, drag them across the board. Open a task to write the
   client-visible description and the internal note, toggle visibility, set a deadline.
4. "Share" → copy the portal link → "Generate access code" (shown once).
5. Open the link in a private window, enter the code — that's what your client sees.

## Security model (why it holds)

- **Tenant isolation:** every table has RLS; a studio account can only reach rows
  joined to its own `studio_id`. Enforced in Postgres, not in app code.
- **Visibility:** `internal_note` and `client_visible=false` rows are excluded
  inside the SQL of the portal functions. The portal server cannot leak what it
  never receives.
- **Access codes:** 8 chars from an unambiguous 31-char alphabet (~40 bits),
  bcrypt-hashed, one active code per project, revocable, `last_used_at` audit field.
- **URLs:** slugs carry a random suffix and grant nothing by themselves.
- **Sessions:** httpOnly, `SameSite=Lax`, path-scoped per project, 7-day expiry.
- **Rate limiting:** 8 attempts / 10 min per IP+slug, in-memory. Swap for
  Upstash Redis before real traffic (`portal/lib/server.ts`, marked TODO).
- **GDPR posture:** EU hosting, minimal client data (name, optional email),
  cascading deletes, no tracking, portal pages send `noindex`.

## Before Marketplace submission (not needed for MVP testing)

- Replace direct supabase-js login with Framer's OAuth pattern
  (framer/plugin-oauth) and pin CORS to the assigned plugin ID.
- Set the real `id` in `plugin/framer.json` from the submission URL.
- `npm run pack` to bundle.

## Deliberately not built yet

Files upload (links cover the MVP), multi-member studios (schema is ready for it —
add a `studio_members` table and swap `is_studio_owner`), branding editor in the
plugin (set `accent_color` / `logo_url` on the `studios` row directly for now),
email notifications, Framer Server API sync. All additive, no rewrites needed.
