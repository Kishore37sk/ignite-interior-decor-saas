# Ignite Interior Decor — Project & Material Management

A private, multi-client workspace for an interior-design company: clients, projects, deadlines,
site progress updates, material requests (request → review → approve → order → deliver), costs,
performance analytics, notifications and a full audit trail. Three roles share one app:

| Role | What they do |
|---|---|
| **Owner** | Everything: clients, projects, financials, staff accounts, settings, reports. |
| **Admin** | Reviews, approves, orders and delivers material requests; sees the projects those requests belong to. |
| **Site Manager** | Works on assigned projects only: progress updates, documents, material requests. Mobile-first. |

There is no public sign-up — the owner creates every staff account.

---

## Tech stack

- **Next.js 15** (App Router, React 19, Server Components, Server Actions) with **TypeScript** (strict)
- **Tailwind CSS v4** (design tokens in `src/app/globals.css`), Radix UI primitives, lucide icons, Recharts
- **Supabase**: Postgres, Auth, Row Level Security, Storage (private documents bucket), Realtime, pg_cron
- **zod** validation shared by forms and server actions
- **Vitest** (unit + database tests on PGlite) and **Playwright** (end-to-end)

## Prerequisites

- Node.js **20 LTS or newer** and npm
- A Supabase project (free tier works) — or the Supabase CLI for local development
- Optional: a custom SMTP provider for auth emails (recommended for production)

---

## Environment variables

Copy `.env.example` to `.env.local` and fill it in. **Never commit `.env.local` or any real secret.**

| Variable | Where it is used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Project URL, e.g. `https://<ref>.supabase.co` (Settings → API). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | Publishable / anon key. Safe to expose — RLS protects the data. |
| `NEXT_PUBLIC_SITE_URL` | server | Public URL of the app (`http://localhost:3000` in development). Used to build password-setup links. |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Secret / service-role key. Used only by server actions that manage staff accounts and by the scripts. **Never prefix it with `NEXT_PUBLIC_`, never send it to the browser, never commit it.** |
| `OWNER_EMAIL`, `OWNER_NAME`, `OWNER_PASSWORD` | `npm run bootstrap:owner` | One-time owner bootstrap. Clear `OWNER_PASSWORD` afterwards. |
| `SEED_DEMO`, `DEMO_USER_PASSWORD` | `npm run seed:demo` | Development demo data. The script refuses to run unless `SEED_DEMO=true`. |
| `E2E_BASE_URL`, `E2E_OWNER_EMAIL`, `E2E_OWNER_PASSWORD`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_SM_EMAIL`, `E2E_SM_PASSWORD` | `npm run test:e2e` | Optional; tests that need a login are skipped when unset. Use non-production test accounts. |

---

## Supabase setup

1. **Create a project** at [supabase.com](https://supabase.com) and copy the URL, anon key and service-role
   key into `.env.local`.
2. **Authentication → Sign In / Providers → Email**: keep Email enabled and **disable “Allow new users to
   sign up”**. Staff accounts are created by the owner from *Users → Add user*.
3. **Authentication → URL Configuration**
   - **Site URL**: your app URL (`http://localhost:3000` locally, your production domain later).
   - **Redirect URLs**: add `<site>/auth/confirm` and `<site>/**` for every environment, e.g.
     `http://localhost:3000/**` and `https://your-app.vercel.app/**`.
4. **Authentication → Emails → Reset Password** — replace the link in the template with the token-hash
   link below. It verifies on the server, so it works on any device or browser (the default template
   only works in the browser that requested it):

   ```html
   <h2>Set your password</h2>
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Set a new password</a></p>
   ```

   The app also understands the stock template as a fallback, but the template above is recommended.
   New-user “welcome” emails sent from *Users → Add user* use this same Reset Password template.
5. **Custom SMTP (recommended)**: Authentication → Emails → SMTP Settings. Supabase's built-in mailer is
   heavily rate-limited and meant for testing. Without email delivery, the owner can always copy a
   one-time setup link from the user's actions (*Send password link*).

## Database migration

The schema, RLS policies, RPC functions, views, storage bucket, realtime publication and scheduled job
live in `supabase/migrations/0001…0007_*.sql`. `supabase/setup.sql` is the same thing bundled into one
file.

- **SQL editor (simplest)**: optionally enable **pg_cron** (Database → Extensions) first, then paste
  `supabase/setup.sql` into the SQL editor and run it once on an empty project.
- **Supabase CLI**: copy `supabase/migrations/*.sql` into your CLI project's `supabase/migrations` folder
  and run `supabase db push`.
- After editing any migration, regenerate the bundle with `npm run db:bundle` (the DB tests fail if
  `setup.sql` is stale).
- **pg_cron**: when available, a daily job (02:30 UTC = 08:00 IST) runs
  `public.generate_deadline_notifications()` for deadline and “material required soon” reminders. Without
  pg_cron, the owner can run the check from *Settings*, or any scheduler can call the function with the
  service role.

See `supabase/README.md` for details and `docs/ARCHITECTURE.md` for the full data contract.

## Authentication setup

- Email + password sign-in (`/login`), “Forgot password” (`/forgot-password`) and password setup/reset
  (`/reset-password`). Email links land on `/auth/confirm`, which verifies the token
  (`verifyOtp({ type, token_hash })`) and sets the session cookie before redirecting.
- Sessions are cookie-based (`@supabase/ssr`); `src/middleware.ts` refreshes them and sends signed-out
  visitors to `/login`. Every page and server action re-checks the user and role on the server.
- Deactivated users are signed out and banned in Supabase Auth; reactivation lifts the ban.
- Changing your password (Profile) requires the current password.

## Owner account setup

Recommended — bootstrap script:

```bash
# .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
#             OWNER_EMAIL, OWNER_NAME, OWNER_PASSWORD (at least 10 characters)
npm run bootstrap:owner
# change the password of an existing owner user:
npm run bootstrap:owner -- --reset-password
```

Alternative — dashboard + SQL:

1. Authentication → Users → *Add user* (email + password, auto-confirm).
2. SQL editor: `select public.promote_to_owner('owner@example.com');`

Remove `OWNER_PASSWORD` from `.env.local` once the owner can sign in. **Never commit passwords** and never
put production passwords in this README, issues or chat.

### Demo data (development only)

```bash
SEED_DEMO=true DEMO_USER_PASSWORD='choose-a-dev-password' npm run seed:demo
```

Creates demo site managers/admins, clients, projects, updates and material requests. It is idempotent
and refuses to run unless `SEED_DEMO=true`. Never run it against production.

---

## Development

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run dev                  # http://localhost:3000
```

Useful checks: `npm run typecheck`, `npm run lint`, `npm test`.

## Production build

```bash
npm run build
npm run start   # serves the production build on port 3000
```

## Deployment (Vercel)

1. Import the repository in Vercel (framework preset: Next.js).
2. Add the environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `NEXT_PUBLIC_SITE_URL` (your production URL, e.g. `https://your-app.vercel.app`) and
   `SUPABASE_SERVICE_ROLE_KEY` (Production/Preview, **not** exposed to the browser). Do not add the
   `OWNER_*`, `SEED_DEMO` or `E2E_*` variables.
3. Deploy, then in Supabase → Authentication → URL Configuration set the **Site URL** to the production
   URL and add `https://your-app.vercel.app/**` (and `/auth/confirm`) to **Redirect URLs**. Add preview
   URLs too if you test auth on preview deployments.
4. The app sends a Content-Security-Policy that allows only this site and your Supabase project
   (https + wss). If you serve images from another host, update `next.config.ts`.

---

## Testing

| Command | What it runs |
|---|---|
| `npm test` | Unit tests (Vitest): formatting, dates, CSV, validation, permissions helpers. |
| `npm run test:db` | Database tests: applies every migration to an in-process Postgres (PGlite) and checks RLS per role, the material workflow, notifications, dashboards, search, storage policies and the `setup.sql` bundle. |
| `npm run verify:rls` | Live RLS check against your Supabase project using the demo users (run `seed:demo` first). Prints PASS/FAIL. |
| `npm run test:e2e` | Playwright end-to-end tests. Starts `npm run dev` unless `E2E_BASE_URL` is set; set the `E2E_*` accounts to run the signed-in flows. Run `npx playwright install` once. |

## RLS / security notes

- **Row Level Security is enabled on every table.** The browser only ever uses the anon key; every
  query runs as the signed-in user, so RLS — not the UI — decides what each role can read.
  - Site managers see only projects they are assigned to (and those projects' clients and requests).
  - Admins see material requests and the related projects, never project financials.
  - Approved/actual material costs and project financials are visible to the owner and to members the
    owner explicitly granted financial access; others read them as `null` through the directory views.
- Writes that change workflow state go through `SECURITY DEFINER` RPC functions that validate the role,
  the allowed status transition and the input, write the audit log and send notifications.
- The audit log is append-only. Documents live in a **private** storage bucket and are served with
  short-lived signed URLs.
- The service-role key is used only on the server (`src/lib/supabase/admin.ts`, `server-only`) for
  staff-account management, and by the CLI scripts.
- Security headers include a Content-Security-Policy, HSTS, `X-Frame-Options: DENY`,
  `nosniff` and a strict referrer policy (`next.config.ts`).
- Public sign-ups must stay disabled in Supabase Auth.

## Project structure

```text
src/
  app/                 routes: (auth) login & password pages, (app) authenticated pages, api/, auth/ callbacks
  components/ui        accessible primitives (button, dialog, table, …)
  components/shared    app-level building blocks (page header, data table, badges, charts, …)
  components/shell     sidebar, top bar, global search, notifications
  features/<area>      queries, server actions, schemas and components per area
                       (activity, clients, dashboard, materials, projects, settings, users)
  lib/                 auth, Supabase clients, dates, formatting, CSV, validation, pagination
  types/database.ts    typed Supabase schema
supabase/              migrations, setup.sql bundle, database tests
scripts/               owner bootstrap, demo seed, live RLS check, SQL bundler
e2e/                   Playwright tests
docs/ARCHITECTURE.md   data and URL contract
```

## Known limitations

- Light theme only; colours are tokens, so a dark theme can be added later.
- Statuses are fixed (not configurable).
- Report CSV exports are capped at the first 5,000 matching rows (a note row at the end says when).
- Email delivery depends on Supabase Auth email settings; configure custom SMTP for production volumes.
- The Content-Security-Policy allows inline scripts (required by Next.js without per-request nonces).
