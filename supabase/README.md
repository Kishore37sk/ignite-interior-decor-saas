# Ignite Interior Decor: database

Postgres schema, row level security, RPCs, views, storage and realtime setup for Supabase.
`docs/ARCHITECTURE.md` (sections 3 to 7) is the contract this folder implements.

## Migration order

| File | Contents |
|---|---|
| `migrations/0001_extensions_and_types.sql` | `pg_trgm`, enums, code sequences |
| `migrations/0002_core_tables.sql` | tables, constraints, indexes, reference data (company settings, 10 material categories, starter catalog) |
| `migrations/0003_helpers_and_rls.sql` | `current_app_role()`, `is_owner()`, `can_access_*()` helpers, RLS policies, table grants |
| `migrations/0004_triggers_and_audit.sql` | `updated_at`, auth to profile sync, `protect_profile_fields`, derived request costs, notifications, generic audit trail (append-only) |
| `migrations/0005_rpc_functions.sql` | every `supabase.rpc` function, plus `promote_to_owner` (service role only) |
| `migrations/0006_views_and_analytics.sql` | `project_directory`, `project_financial_summary`, `client_directory`, `material_request_directory`, `material_request_item_directory`, `project_material_summary`, `team_directory`, `activity_feed` |
| `migrations/0007_storage_realtime_cron.sql` | private `project-documents` bucket and policies, realtime publication, pg_cron job, final privilege lockdown |
| `migrations/0008_profile_role_from_app_metadata.sql` | copy role / employee ID from `app_metadata` set after the auth.users insert |
| `migrations/0009_project_payments.sql` | `project_payments` ledger (cash, card, UPI, ...), `project_payment_links` share tokens, `get_payment_statement` (the only anon-callable function), received total in `project_financial_summary`, backfill of earlier advances |

Payment statements: `/statement/<token>` is public. It calls `get_payment_statement(token)`, which returns totals,
the split by mode and the payment list (no internal notes) for a valid token, and NULL otherwise. Only the owner
can read, regenerate or delete a token.

Material cost privacy: API roles cannot select `approved_cost` / `actual_cost` (and the variance basis
columns) of `material_requests`, nor `approved_unit_cost` / `actual_unit_cost` of `material_request_items`,
so these values never reach a browser through the base tables or realtime. Read costs through
`material_request_directory` and `material_request_item_directory`; they return those values to the owner,
admins and members the owner granted financial access, and NULL to other site managers (who see estimates).

`setup.sql` is generated from the migrations (`npm run db:bundle`). Never edit it by hand. Regenerate it
after changing a migration; the DB tests fail if it is stale.

## Applying to a Supabase project

Option A, SQL editor (simplest):

1. (Optional) Enable **pg_cron** under Database, Extensions, so the daily job is scheduled automatically.
2. Open SQL Editor, paste the contents of `supabase/setup.sql`, then click Run. It runs in a single
   transaction, once, on an empty project.
3. Create the owner: fill `OWNER_EMAIL`, `OWNER_PASSWORD` (at least 10 characters), `OWNER_NAME`,
   `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`, then run
   `npm run bootstrap:owner`. Pass `-- --reset-password` to change the password of an existing user.
   Alternatively, create the user in Authentication, Users, then run
   `select public.promote_to_owner('owner@example.com');` in the SQL editor.
4. In Authentication, Providers, disable public sign-ups. Staff accounts are created by the owner.
   The database also defends itself: an account created without an `app_metadata.role` gets an
   inactive, role-less profile that can read nothing and call no RPC (`promote_to_owner` activates it).
5. In Authentication, Providers, Email, keep "Confirm email" and "Secure email change" enabled. Staff
   cannot start an email change themselves: the `guard_auth_email_change` trigger on `auth.users`
   rejects a self-service change (`auth.updateUser({ email })`) for anyone but an active owner.

Option B, Supabase CLI: copy `supabase/migrations/*.sql` into the CLI project's `supabase/migrations`
folder, then run `supabase db push`.

## Scheduled notifications

`public.generate_deadline_notifications()` creates project deadline (30, 14, 7, 1 and 0 days), overdue and
material "required soon" notifications. Notifications are de-duplicated, so the function can run repeatedly.
When pg_cron is available, 0007 schedules it daily at 02:30 UTC (08:00 IST) as
`ignite-deadline-notifications`. Without pg_cron the block is skipped with a notice. In that case, call the
function from any scheduler using the service role, or let the owner trigger it.

## Demo data and live checks (development only)

- `SEED_DEMO=true DEMO_USER_PASSWORD=... npm run seed:demo` creates the SM001, SM002, AD001 and AD002 demo
  logins (`@demo.igniteinteriordecor.com`), plus clients, projects, history and material requests. It is
  idempotent and refuses to run unless `SEED_DEMO=true`.
- `npm run verify:rls` signs in with the public anon key as the demo users and checks isolation against the
  live project. It prints a PASS/FAIL table and exits with code 1 on any failure.

## Tests

```bash
npm run test:db
# same as: npx vitest run --config supabase/tests/vitest.config.ts
```

The tests boot a real Postgres in WASM (PGlite) and install a Supabase stub through `tests/harness.ts`. The
stub provides the API roles, `auth.uid()`, the storage schema, the realtime publication and Supabase's
permissive default grants. The tests then apply every migration. They cover the following:

- RLS isolation for each role
- anonymous and deactivated access
- profile escalation
- append-only audit logs
- the full material request workflow
- notifications
- dashboards and performance numbers
- search
- storage policies
- the `setup.sql` bundle
