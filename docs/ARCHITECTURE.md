# Ignite Interior Decor — Architecture Contract

This document is the **single source of truth** for every module. Database names, RPC
signatures, file locations and UI conventions below are binding. If you need something that is
not here, add it in your own module's files — never rename or redefine anything listed here.

Business timezone: **Asia/Kolkata**. Currency: **INR (₹)**, Indian digit grouping (`₹4,20,000`).
Display dates as `08 Oct 2026` (`dd MMM yyyy`). Deadlines are **date-only** values (`YYYY-MM-DD`
strings) — never pass them through `new Date(str)` in local time; use the helpers in
`src/lib/dates.ts`.

---

## 1. Stack (pinned)

| Concern | Choice |
|---|---|
| Framework | Next.js **15.5.x** App Router, React 19, TypeScript strict (`middleware.ts`, not `proxy.ts`) |
| Styling | Tailwind CSS **v4** (CSS-first `@theme` in `src/app/globals.css`) |
| UI | Hand-built primitives in `src/components/ui` (shadcn-style, Radix where needed) + `lucide-react` icons |
| Charts | `recharts` 3.x |
| Forms/validation | `zod` 4.x schemas in `src/lib/validation/*` (shared by client forms and server actions) |
| Dates | `date-fns` 4.x + helpers in `src/lib/dates.ts` |
| Toasts | `sonner` |
| Backend | Supabase (Postgres + Auth + RLS + Storage + Realtime) via `@supabase/ssr` and `@supabase/supabase-js` |
| Tests | `vitest` (unit), PGlite-based DB/RLS tests (`npm run test:db`), Playwright e2e (`npm run test:e2e`) |

Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key),
`SUPABASE_SERVICE_ROLE_KEY` (server only — imported **only** from `src/lib/supabase/admin.ts`,
which starts with `import "server-only"`), `NEXT_PUBLIC_SITE_URL`.
Scripts only: `OWNER_EMAIL`, `OWNER_PASSWORD`, `OWNER_NAME`, `DEMO_USER_PASSWORD`, `SEED_DEMO`.

---

## 2. Folder layout

```
supabase/
  migrations/0001_extensions_and_types.sql
  migrations/0002_core_tables.sql
  migrations/0003_helpers_and_rls.sql
  migrations/0004_triggers_and_audit.sql
  migrations/0005_rpc_functions.sql
  migrations/0006_views_and_analytics.sql
  migrations/0007_storage_realtime_cron.sql
  setup.sql                 # generated concatenation of all migrations (npm run db:bundle)
  tests/                    # PGlite harness + RLS/workflow tests
scripts/
  bootstrap-owner.ts        # creates/promotes owner from OWNER_EMAIL/OWNER_PASSWORD env
  seed-demo.ts              # dev-only demo data (refuses unless SEED_DEMO=true)
  bundle-sql.mjs            # concatenates migrations -> supabase/setup.sql
src/
  middleware.ts
  app/
    layout.tsx, globals.css, not-found.tsx, error.tsx
    (auth)/login, (auth)/forgot-password, (auth)/reset-password
    auth/callback/route.ts, auth/confirm/route.ts, auth/signout/route.ts
    (app)/layout.tsx        # AppShell; requires active profile
    (app)/dashboard
    (app)/clients, (app)/clients/new, (app)/clients/[id], (app)/clients/[id]/edit
    (app)/projects, (app)/projects/new, (app)/projects/[id], (app)/projects/[id]/edit, (app)/projects/[id]/update
    (app)/site-managers, (app)/site-managers/[id]
    (app)/admins, (app)/admins/[id]
    (app)/material-requests, (app)/material-requests/new, (app)/material-requests/[id]
    (app)/materials
    (app)/reports, api/reports/[type]/route.ts (CSV)
    (app)/activity
    (app)/users
    (app)/settings
    (app)/profile
    api/search/route.ts
  components/ui/            # primitives (see §7)
  components/shell/         # AppShell, Sidebar, Topbar, MobileNav, NotificationPanel, GlobalSearch, UserMenu
  components/shared/        # domain-shared: StatusBadge, DeadlineBadge, ProgressBar, StatCard, ActivityTimeline, ...
  features/<feature>/       # feature-owned components + actions.ts + queries.ts
  lib/
    supabase/{client,server,admin,middleware}.ts
    auth.ts                 # getCurrentUser(), requireUser(), requireRole()
    navigation.ts           # role-based nav config
    constants.ts            # enums, labels, tone mapping
    dates.ts, format.ts, errors.ts, action-result.ts, search-params.ts, csv.ts
    validation/*.ts
  types/database.ts         # hand-written DB types matching this contract
```

Feature ownership (one owner per folder, to allow parallel work):

| Feature | Owns |
|---|---|
| dashboards | `features/dashboard`, `(app)/dashboard`, `(app)/reports`, `api/reports` |
| clients-projects | `features/clients`, `features/projects`, `(app)/clients/**`, `(app)/projects/**` |
| materials | `features/materials`, `(app)/material-requests/**`, `(app)/materials` |
| people-admin | `features/users`, `features/settings`, `features/activity`, `(app)/users`, `(app)/site-managers/**`, `(app)/admins/**`, `(app)/settings`, `(app)/profile`, `(app)/activity` |

---

## 3. Enumerations (Postgres enums, mirrored in `src/lib/constants.ts`)

```
app_role:               owner | admin | site_manager
user_status:            active | inactive
project_status:         planning | design | approval | procurement | execution | finishing |
                        handover_pending | completed | on_hold | delayed | cancelled
priority_level:         low | medium | high | urgent
material_request_status: requested | pending_review | approved | rejected | ordered |
                        partially_delivered | delivered | cancelled
milestone_status:       not_started | in_progress | completed | skipped
member_role:            site_manager | admin
document_category:      photos | drawings | material_documents | site_reports | other
```

Groupings (used by dashboards and filters):
- **Ongoing projects**: planning, design, approval, procurement, execution, finishing, handover_pending, delayed
- **Closed projects**: completed, cancelled. `on_hold` is neither ongoing nor closed.
- **Material — pending**: requested, pending_review. **Processing**: approved, ordered, partially_delivered.
  **Completed**: delivered. **Closed**: delivered, rejected, cancelled.

Status tones (StatusBadge): completed/delivered/approved → `success`; requested/pending_review/
handover_pending/on_hold/partially_delivered → `warning`; delayed/rejected/overdue → `danger`;
planning/design/approval/procurement/execution/finishing/ordered → `primary`; cancelled → `muted`.

---

## 4. Tables (schema `public`; every table has RLS enabled)

All PKs are `uuid default gen_random_uuid()` unless noted. Timestamps are `timestamptz default now()`.
`updated_at` maintained by trigger `set_updated_at`.

**profiles** — `id uuid pk references auth.users(id)`, `full_name text not null`, `email text not null unique`,
`phone text`, `role app_role` (nullable = no access), `employee_id text unique`, `status user_status not null default 'active'`,
`joining_date date`, `avatar_url text`, `deactivated_at timestamptz`, `created_at`, `updated_at`.
Created by trigger on `auth.users` insert, using `raw_app_meta_data->>'role'` (only service role can set
app_metadata) and `raw_user_meta_data->>'full_name'`. Role/status/employee_id/email can only be changed by
the owner (trigger `protect_profile_fields` raises otherwise; service role / postgres bypass).

**company_settings** — `id int pk default 1 check (id = 1)`, `company_name text not null default 'Ignite Interior Decor'`,
`logo_url`, `contact_name`, `email`, `phone`, `address`, `updated_at`, `updated_by uuid`.

**material_categories** — `id`, `name text unique not null`, `sort_order int default 0`, `is_active bool default true`, `created_at`.
Seeded: Civil, Electrical, Plumbing, Carpentry, Tiles, Paint, Lighting, Hardware, Furniture, Other.

**clients** — `id`, `client_code text unique not null default 'CL-' || lpad(nextval('client_code_seq')::text, 4, '0')`,
`name text not null`, `email`, `phone`, `alternate_phone`, `address`, `city`, `state`, `country default 'India'`,
`notes`, `archived_at`, `created_at`, `updated_at`, `created_by uuid references profiles`.
Unique index `lower(email)` where email is not null and archived_at is null.

**projects** — `id`, `project_code text unique not null default 'P-' || (1000 + nextval('project_code_seq'))`,
`client_id uuid not null references clients`, `name text not null`, `project_type text`, `site_address text`, `city text`,
`start_date date`, `expected_completion_date date`, `handover_date date`, `actual_handover_date date`,
`status project_status not null default 'planning'`, `progress_percentage numeric(5,2) not null default 0 check 0..100`,
`priority priority_level not null default 'medium'`, `current_milestone text`, `notes text`,
`last_update_at timestamptz`, `last_updated_by uuid references profiles`, `archived_at`, `created_at`, `updated_at`,
`created_by uuid references profiles`.
Check: `expected_completion_date >= start_date` and `handover_date >= start_date` (when both non-null).
On insert, trigger creates default milestones (sort_order 1..8): Project Started, Design, Approval,
Procurement, Execution, Finishing, Handover, Completed — and an empty `project_financials` row.

**project_financials** (owner / explicitly granted only) — `project_id uuid pk references projects on delete cascade`,
`project_cost numeric(14,2) not null default 0 check >= 0`, `advance_received numeric(14,2) default 0`,
`notes text`, `updated_at`, `updated_by uuid`.

**project_members** — `id`, `project_id references projects`, `user_id references profiles`, `member_role member_role not null`,
`can_view_financials bool not null default false`, `status text not null default 'active' check in ('active','removed')`,
`assigned_at`, `assigned_by uuid`, `removed_at`, `removed_by uuid`.
Unique partial index `(project_id, user_id) where status = 'active'`.

**project_milestones** — `id`, `project_id`, `name text not null`, `start_date date`, `target_date date`, `completed_date date`,
`status milestone_status not null default 'not_started'`, `notes`, `sort_order int not null`, `created_at`, `updated_at`.

**project_updates** (append-only) — `id`, `project_id`, `updated_by references profiles`, `status project_status not null`,
`previous_status project_status`, `progress_percentage numeric(5,2) not null`, `previous_progress numeric(5,2)`,
`update_date date not null`, `milestone text`, `expected_completion_date date`, `issues text`, `notes text`,
`next_action text`, `created_at`.

**project_documents** — `id`, `project_id`, `category document_category not null default 'other'`, `file_name text not null`,
`storage_path text not null unique`, `mime_type`, `size_bytes bigint`, `uploaded_by references profiles`, `created_at`, `archived_at`.
Storage bucket `project-documents` (private). Object path: `{project_id}/{category}/{uuid}-{safe_file_name}`.

**materials** (catalog) — `id`, `name text not null`, `category text`, `unit text not null`, `description`,
`is_active bool default true`, `created_at`, `updated_at`. Unique index `lower(name)`.

**material_requests** — `id`, `request_code text unique not null default 'MR-' || (1000 + nextval('request_code_seq'))`,
`project_id not null references projects`, `client_id uuid references clients` (set by trigger from project),
`requested_by not null references profiles`, `assigned_admin references profiles`, `title text not null`,
`required_date date not null`, `priority priority_level not null default 'medium'`,
`status material_request_status not null default 'requested'`,
`estimated_cost numeric(14,2)`, `approved_cost numeric(14,2)`, `actual_cost numeric(14,2)` (all three **derived from items** by trigger:
sum(quantity × unit cost) over items where that unit cost is not null; null when no item has it),
`requested_at`, `reviewed_at`, `approved_at`, `rejected_at`, `ordered_at`, `expected_delivery_date date`,
`delivery_date date`, `completed_at`, `cancelled_at`, `rejection_reason text`, `notes text`, `archived_at`,
`created_at`, `updated_at`.

**material_request_items** — `id`, `request_id references material_requests on delete cascade`, `material_id references materials`,
`material_name text not null`, `category text`, `quantity numeric(12,2) not null check > 0`, `unit text not null`,
`estimated_unit_cost numeric(12,2) check >= 0`, `approved_unit_cost numeric(12,2) check >= 0`,
`actual_unit_cost numeric(12,2) check >= 0`, `delivered_quantity numeric(12,2) not null default 0 check >= 0`, `notes`, `created_at`, `updated_at`.

**material_deliveries** — `id`, `request_id`, `item_id references material_request_items`, `delivered_quantity numeric(12,2) not null check > 0`,
`delivery_date date not null`, `recorded_by references profiles`, `notes`, `created_at`.

**material_request_comments** — `id`, `request_id`, `author_id references profiles`, `body text not null`, `created_at`.

**notifications** — `id`, `user_id references profiles`, `title`, `message`, `type text` (e.g. `material_request_new`,
`material_request_status`, `project_deadline`, `project_overdue`, `project_assigned`, `request_assigned`,
`cost_overrun`, `request_due`), `entity_type text`, `entity_id uuid`, `link text` (app path, e.g. `/material-requests/<id>`),
`dedupe_key text unique`, `read_at`, `created_at`.

**audit_logs** (append-only, nobody may update/delete) — `id`, `user_id references profiles`, `actor_name text`, `role app_role`,
`action text` (`insert` | `update` | `delete` | custom like `status_change`, `progress_update`, `assign`, `deactivate`),
`entity_type text` (table name), `entity_id uuid`, `project_id uuid` (for project timelines), `summary text` (human sentence),
`old_data jsonb`, `new_data jsonb`, `metadata jsonb`, `created_at`.
Indexes on `user_id`, `(entity_type, entity_id)`, `project_id`, `created_at desc`.

Required indexes also: projects(client_id), projects(status), projects(handover_date), projects(expected_completion_date),
project_members(user_id), project_members(project_id), material_requests(project_id), material_requests(status),
material_requests(required_date), material_requests(assigned_admin), material_requests(requested_by), notifications(user_id, read_at).
Trigram (`pg_trgm`) GIN indexes on clients.name, projects.name, material_request_items.material_name for search.

---

## 5. Security helpers & RLS (all helpers `security definer`, `set search_path = ''`, `stable`)

- `public.app_today() returns date` — `(now() at time zone 'Asia/Kolkata')::date`.
- `public.current_app_role() returns app_role` — role of `auth.uid()` **only if status = 'active'**, else null.
- `public.is_owner()`, `public.is_admin()`, `public.is_site_manager()` → boolean.
- `public.is_project_member(p uuid, r member_role default null)` — active membership (optionally of role r).
- `public.can_access_project(p uuid)` — owner; OR active member; OR active admin with any material request in the project
  where `assigned_admin = auth.uid()` or `assigned_admin is null`.
- `public.can_view_project_financials(p uuid)` — owner OR active membership with `can_view_financials`.
- `public.can_access_client(c uuid)` — owner OR active site-manager membership on any project of that client.
- `public.can_access_material_request(r uuid)` — owner; OR site manager who is an active member of the request's project;
  OR admin when `assigned_admin = auth.uid()` or `assigned_admin is null` or admin is an active member of the project.

Policies (all `to authenticated`; `anon` gets nothing):
| Table | select | insert | update | delete |
|---|---|---|---|---|
| profiles | owner, or self | — (trigger) | owner; self (protected fields blocked by trigger) | — |
| company_settings | any active user | — | owner | — |
| material_categories | any active user | owner | owner | — |
| clients | `can_access_client(id)` (admins have NO direct access) | owner | owner | — |
| projects | `can_access_project(id)` | owner | owner (SMs go through RPC) | — |
| project_financials | `can_view_project_financials(project_id)` | owner | owner | — |
| project_members | owner, or own rows | owner | owner | — |
| project_milestones | `can_access_project` | owner | owner (SM via RPC) | — |
| project_updates | `can_access_project` and not admin-only access (owner or member) | — (RPC only) | — | — |
| project_documents | owner or project member | owner or SM member, `uploaded_by = auth.uid()` | owner (archive) | — |
| materials | any active user | owner, admin | owner, admin | — |
| material_requests | `can_access_material_request(id)` | — (RPC only) | — (RPC only) | — |
| material_request_items / deliveries / comments | via parent request access | — (RPC) | — | — |
| notifications | `user_id = auth.uid()` | — | own rows (only `read_at`) | own rows |
| audit_logs | owner all; others: own rows or (`project_id` accessible and entity_type not in ('project_financials','profiles')) | — | — | — |

Storage `project-documents`: select/insert allowed when `(storage.foldername(name))[1]::uuid` passes
`is_owner() or is_project_member(...)`; insert additionally requires owner or site-manager member. No public URLs — download via
`createSignedUrl` (60s).

Admins never see client contact details or project cost; they get client **name** only via `project_directory`.

---

## 6. RPC functions (callable via `supabase.rpc`). All `security definer`, validate `auth.uid()` & role inside,
write audit rows, create notifications. Errors are raised with `raise exception using errcode = 'P0001', message = '<CODE>: <human text>'`
where CODE ∈ `NOT_AUTHORIZED, NOT_FOUND, INVALID_TRANSITION, VALIDATION, DUPLICATE_REQUEST, PROJECT_CLOSED, INACTIVE_USER`.
`src/lib/errors.ts` maps codes → friendly messages; never show raw DB errors.

| Function | Who | Notes |
|---|---|---|
| `create_material_request(p_project_id uuid, p_title text, p_required_date date, p_priority priority_level, p_notes text, p_items jsonb, p_allow_duplicate boolean default false) returns uuid` | owner, SM member | items: `[{material_id?, material_name, category?, quantity, unit, estimated_unit_cost?, notes?}]` (≥1). Rejects closed/archived projects. Duplicate = same project + same material_name (case-insens.) + still open + created in last 7 days. Notifies owner + admins (high/urgent flagged). |
| `update_material_request_draft(p_request_id uuid, p_title text, p_required_date date, p_priority priority_level, p_notes text, p_items jsonb) returns void` | requester SM or owner | only while `requested`/`pending_review`; replaces items atomically. |
| `update_material_request_status(p_request_id uuid, p_status material_request_status, p_note text default null, p_expected_delivery_date date default null) returns void` | admin/owner for review transitions; requester SM/owner may `cancelled` from requested/pending_review | Allowed transitions: requested→pending_review/approved/rejected/cancelled; pending_review→approved/rejected/cancelled; approved→ordered/cancelled; ordered→partially_delivered/delivered/cancelled; partially_delivered→delivered. Sets timestamp columns; `rejected` requires p_note (stored in rejection_reason). Auto-assigns acting admin if unassigned. Notifies requester (+ owner on rejection). |
| `update_material_request_costs(p_request_id uuid, p_items jsonb) returns void` | admin/owner | `[{item_id, estimated_unit_cost?, approved_unit_cost?, actual_unit_cost?}]`; notifies owner when actual_cost > estimated_cost (`cost_overrun`). |
| `update_material_request_delivery_date(p_request_id uuid, p_expected_delivery_date date, p_note text default null) returns void` | admin (with access) / owner | only while `approved`/`ordered`/`partially_delivered`; date required, not before the request date (the app also rejects past dates). Notifies the requester; a note is stored as a comment. UI: “Update delivery date” on the request page. |
| `record_material_delivery(p_request_id uuid, p_delivery_date date, p_items jsonb, p_notes text default null) returns void` | admin/owner | `[{item_id, delivered_quantity}]`; request must be `ordered`/`partially_delivered` (or `approved`, which implies ordered); sets status partially_delivered or delivered (all items fully delivered) + delivery_date/completed_at. |
| `assign_material_request(p_request_id uuid, p_admin_id uuid) returns void` | owner (any active admin); admin may claim unassigned for self | notifies the admin. |
| `add_material_request_comment(p_request_id uuid, p_body text) returns uuid` | anyone with request access | |
| `submit_project_update(p_project_id uuid, p_status project_status, p_progress numeric, p_update_date date, p_milestone text, p_expected_completion_date date, p_issues text, p_notes text, p_next_action text) returns uuid` | owner, SM member | progress 0–100; SM blocked on completed/cancelled projects (PROJECT_CLOSED). Inserts project_updates row (with previous_*), updates projects.status/progress/current_milestone/expected_completion_date/last_update_at/last_updated_by; when status = completed sets actual_handover_date if null. |
| `update_project_milestone(p_milestone_id uuid, p_status milestone_status, p_start_date date, p_target_date date, p_completed_date date, p_notes text) returns void` | owner, SM member | |
| `assign_project_member(p_project_id uuid, p_user_id uuid, p_member_role member_role, p_can_view_financials boolean default false, p_replace_existing boolean default false) returns uuid` | owner | user must be active with matching role; `p_replace_existing` removes other active members of same member_role. Notifies user. |
| `remove_project_member(p_project_id uuid, p_user_id uuid) returns void` | owner | soft remove (status='removed'). |
| `set_user_status(p_user_id uuid, p_status user_status) returns void` | owner | cannot deactivate self/owner; audit `deactivate`/`activate`. (Server action also bans/unbans auth user.) |
| `generate_deadline_notifications() returns int` | owner or cron (postgres) | project due in 30/14/7/1/0 days or overdue → owner + SM members; material request required in ≤2 days and still open → assigned admin (or all admins) + requester. Uses dedupe_key. |
| `mark_all_notifications_read() returns void` | any | |
| `global_search(p_query text, p_limit int default 20) returns table(entity_type text, entity_id uuid, title text, subtitle text, href text)` | any active | respects access (owner: clients, projects, profiles, requests, materials; SM/admin: what they can access). Matches names, codes (P-1001, MR-1004, CL-0001), employee_id (SM001), material names. |
| `get_owner_dashboard() returns jsonb` | owner | `{total_clients, total_projects, ongoing_projects, completed_projects, on_hold_projects, delayed_projects (derived overdue OR status delayed), upcoming_handovers (handover within 30 days, not closed), total_project_value, material_estimated_cost, material_approved_cost, material_actual_cost, pending_material_requests, overdue_material_requests, status_breakdown:[{status,count}], monthly_material_cost:[{month,estimated,actual}] (last 6 months)}` |
| `get_site_manager_performance() returns table(user_id uuid, full_name text, employee_id text, status user_status, assigned_projects int, ongoing_projects int, completed_projects int, delayed_projects int, on_time_completed int, on_time_rate numeric /* null when no completed projects */, avg_progress numeric, material_requests_created int, avg_request_completion_days numeric, last_update_at timestamptz, project_updates_count int)` | owner | on-time = actual_handover_date (or completed date) ≤ handover_date (or expected_completion_date). |
| `get_admin_performance() returns table(user_id uuid, full_name text, employee_id text, status user_status, requests_assigned int, pending int, processing int, completed int, rejected int, overdue int, completion_rate numeric, avg_response_hours numeric, avg_completion_days numeric, total_value_managed numeric)` | owner | response = reviewed_at/approved_at/rejected_at − requested_at. |
| `get_site_manager_dashboard() returns jsonb` | SM | `{my_projects, active_projects, near_deadline (≤14 days), overdue_projects, pending_material_requests, delivered_materials}` |
| `get_admin_dashboard() returns jsonb` | admin | `{new_requests, pending_requests, approved, ordered, partially_delivered, completed, overdue_requests, unassigned}` for requests visible to the admin. |

Owner direct-table writes (via RLS) are used for: clients CRUD/archive, projects create/edit/archive,
project_financials, project_milestones (owner), materials catalog, material_categories, company_settings, profiles edits.
Everything is audited by row triggers.

Bootstrap (not callable by `authenticated`/`anon`): `public.promote_to_owner(p_email text)` — run from SQL editor or
`scripts/bootstrap-owner.ts`.

---

## 7. Views (security-barrier views owned by postgres; every view filters rows by the helpers above; `grant select ... to authenticated`)

- **project_directory** — every project column (projects has no cost columns), plus `client_name`, `client_code`,
  `site_manager_id`, `site_manager_name` (first active SM member), `site_manager_ids uuid[]`,
  `deadline_date` (= expected_completion_date), `days_remaining int` (deadline − app_today(), null if no date),
  `is_overdue bool` (deadline < today and status not in completed/cancelled),
  `deadline_state text` ∈ `completed | cancelled | no_date | overdue | due_today | due_tomorrow | due_7 | due_14 | due_30 | on_track`,
  `open_material_requests int`, `total_material_requests int`,
  `handover_or_deadline date` (= coalesce(handover_date, expected_completion_date); the upcoming-handover KPI, widget and list
  all filter/sort on it). Filter: `can_access_project(id)`.
- **project_financial_summary** — `project_id, project_code, project_name, client_id, client_name, project_cost, advance_received,
  status, archived_at, material_estimated_cost, material_approved_cost, material_actual_cost,
  material_variance` (like-for-like: actual − estimate over the items that have an actual cost) plus its basis
  `material_variance_estimated_cost, material_variance_actual_cost`. The same rule is used by `get_owner_dashboard.material_variance`
  and `material_request_directory.cost_variance`.
  Filter: `can_view_project_financials(project_id)`.
- **client_directory** — client columns + `project_count, active_project_count, latest_project_id, latest_project_name,
  latest_project_status, latest_progress, latest_start_date, latest_handover_date, latest_days_remaining, site_manager_name`.
  Filter: `can_access_client(id)`. (Owner only sees `total_project_value` via project_financial_summary.)
- **material_request_directory** — request columns + `project_code, project_name, client_name, requested_by_name,
  assigned_admin_name, item_count, items_summary text` (e.g. "Cement 100 Bags, Tiles 800 Sq Ft"),
  `days_until_required int`, `required_state text` ∈ `closed | overdue | due_today | due_tomorrow | due_soon (≤7) | upcoming`,
  `cost_variance` (like-for-like). `approved_cost`, `actual_cost`, `cost_variance` are null unless `can_view_material_cost_details`.
  Filter: `can_access_material_request(id)`.
- **material_request_item_directory** — `material_request_items` columns with `approved_unit_cost` / `actual_unit_cost` masked the
  same way. API users cannot select those two columns from the base table, so `select *` on items must use this view.
- **project_material_summary** — per project: `project_id, total_requests, pending_requests, approved_requests, ordered_requests,
  delivered_requests, pending_material_cost, approved_material_cost, actual_material_cost`. Filter: `can_access_project(project_id)`.
- **team_directory** — `id, full_name, role, employee_id, status, avatar_url` for any active user (no email/phone).
- **activity_feed** — audit_logs rows visible per audit policy, with `actor_name`, `summary`, `project_id`, `entity_type`, `entity_id`, `created_at`
  (use security_invoker so audit_logs RLS applies).

---

## 8. Frontend conventions

- `src/lib/supabase/server.ts` → `createClient()` (async, cookies). `client.ts` → `createClient()` (browser).
  `admin.ts` → `createAdminClient()` (service role, server-only). `middleware.ts` → `updateSession(request)`.
- `src/lib/auth.ts`:
  - `type CurrentUser = { id, email, fullName, role: AppRole, status, employeeId, avatarUrl }`
  - `getCurrentUser(): Promise<CurrentUser | null>` (cached per request via React `cache`)
  - `requireUser(): Promise<CurrentUser>` → redirects to `/login` if none/inactive (signs out inactive)
  - `requireRole(...roles: AppRole[]): Promise<CurrentUser>` → `notFound()`-style forbidden page if role not allowed.
- Every page in `(app)` calls `requireUser()` / `requireRole()` at the top. Middleware refreshes session and redirects
  unauthenticated users from protected paths to `/login?next=...`.
- Mutations = server actions in `src/features/<x>/actions.ts`, returning `ActionResult<T>` from `src/lib/action-result.ts`:
  `{ ok: true; data: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string[]> }`.
  Validate with zod, call Supabase (RLS client), map errors with `toFriendlyError(err)`, then `revalidatePath(...)`.
- Lists are server-rendered with URL search params (`q`, `status`, `priority`, `sm`, `admin`, `project`, `range`, `from`, `to`,
  `sort`, `dir`, `page`, `pageSize`) parsed by `src/lib/search-params.ts`; use `.range()` + `{ count: 'exact' }` for pagination.
  Date range presets: `today | this_week | this_month | next_7 | next_30 | custom` (`next_7` / `next_30` = 7 / 30 calendar days
  including today). A stale `page` past the last row falls back to the last page (`src/lib/pagination.ts`); reads that can exceed
  PostgREST's 1000-row cap are paged, and long id lists are split into `.in()` chunks of 100.
- `src/lib/dates.ts`: `todayIST(): string`, `parseDateOnly(s)`, `formatDate(s|Date) → '08 Oct 2026'`, `formatDateTime`,
  `daysBetween(a,b)`, `daysRemaining(deadline)`, `deadlineInfo(deadline, status) → { state, label, tone }`
  (labels: `12 days remaining`, `Due today`, `Due tomorrow`, `Overdue by 5 days`, `Completed`, `No deadline`),
  `requiredDateInfo(date, status)` (labels: `Required in 7 days`, `Due tomorrow`, `Due today`, `Overdue by N days`, `Delivered`),
  `resolveDateRange(preset, from?, to?) → { from, to }`, `relativeTime(ts)`.
- `src/lib/format.ts`: `formatINR(n, {compact?})` (₹4,20,000 / ₹4.2L / ₹1.2Cr), `formatNumber`, `formatPercent`, `initials(name)`.
- `src/lib/csv.ts`: `toCSV(rows, columns)`.

### UI primitives (`src/components/ui`) — all accessible, keyboard navigable, visible focus rings
`Button` (variants: primary, secondary(soft green), outline, ghost, danger, link; sizes sm/md/lg/icon; `loading` prop),
`Card` (+CardHeader/CardTitle/CardDescription/CardContent/CardFooter), `Badge`, `Input`, `Textarea`, `Select` (native, styled),
`Label`, `FormField` (label + control + error + hint), `Checkbox`, `Switch`, `Dialog`/`Modal`, `ConfirmDialog`, `Sheet` (drawer),
`DropdownMenu`, `Tabs` (URL-friendly links variant `LinkTabs`), `Tooltip`, `Skeleton`, `Avatar`, `Separator`,
`Table` primitives (Table, THead, TBody, TR, TH (sortable link), TD), `Pagination`, `EmptyState`, `Spinner`.

### Shared components (`src/components/shared`)
`PageHeader` (title, breadcrumbs, actions), `StatCard` (label, value, sub, footer tint strip like TeamHub, href for drill-down, icon),
`StatusBadge` (project | material | milestone | user status), `PriorityBadge`, `DeadlineBadge`, `RequiredDateBadge`, `ProgressBar`,
`DataTable` (server-driven: columns config, rows, total, page, pageSize, sort; renders stacked cards on mobile),
`FilterBar` (search input debounced → URL, select filters, date-range preset), `SearchInput`, `DateRangePicker`,
`ActivityTimeline` (audit/activity items), `ProjectTimeline` (milestones vertical stepper), `ProjectCard`, `ClientCard`,
`MaterialRequestCard`, `UserAvatar`, `LoadingSkeleton` presets (`TableSkeleton`, `CardGridSkeleton`, `DashboardSkeleton`),
`ChartCard`, `CurrencyText`, `InfoRow`.

### Visual language (from `UI/design_handoff_teamhub`, adapted to the Ignite green brand)
- App background `#F5F6F4`; surfaces white; cards `rounded-2xl`, 1px border `#ECEEEA`, soft shadow `0 1px 2px rgba(16,24,20,.04), 0 4px 16px rgba(16,24,20,.04)`.
- Primary (teal-green) `#2BB58F` (hover `#239C7A`), deep green `#0F4A3C` (headings accent, dark chart series, sidebar active alt),
  soft green tint `#E6F4DD` (stat-card footer strip, secondary buttons, chips), lime accent `#9BD35A` (from the Ignite logo, sparingly).
- Text `#14211C`, muted `#6B7A73`, border `#E4E7E2`. Status: success `#2BB58F`, warning `#E9A23B` (bg `#FDF3E1`), danger `#E5484D` (bg `#FDECEC`), muted `#9AA5A0`.
- Font: **Plus Jakarta Sans** (next/font/google), tabular numbers for figures. Big KPI numerals (~32px semibold) with small trailing unit text, like TeamHub.
- Sidebar: white, logo at top (`/brand/logo.png`), nav items icon+label, active item filled primary with white text, `rounded-xl`.
  Top bar: greeting/page title left; search pill, notification bell (with dot), user avatar+name+role right.
- Tables: header row on light grey `#F5F6F4` rounded, sortable headers with caret icons, row dividers, status pills (filled, rounded-full).
- Charts: deep green / primary / soft green / grey ramp; tooltips white cards.
- Mobile: sidebar → slide-over drawer + bottom nav for site managers; tables → stacked cards; forms single-column with large tap targets.

---

## 9. Cross-feature URL contracts (drill-downs, filters)

Lists accept these search params (all optional, combinable). Dashboards and other modules link with them.

**/projects** — `q`, `status` (a project_status), `view` ∈ `ongoing | completed | delayed | upcoming_handover | near_deadline | on_hold | closed`
(`delayed` = `is_overdue OR status = 'delayed'` — the owner's `delayed_projects` and the site manager's `overdue_projects` KPI;
`upcoming_handover` = `handover_or_deadline` within the next 30 days and not closed — the same rule as
`get_owner_dashboard.upcoming_handovers`; `near_deadline` = expected_completion_date
within the next 14 days and not closed — the same rule as `get_site_manager_dashboard.near_deadline`),
`sm` (site manager user id), `priority`, `client` (client id), `range` + `from`/`to` (applies to expected_completion_date),
`sort` ∈ `name | client | status | progress | start_date | expected_completion_date | handover_date | updated_at`, `dir`, `page`, `pageSize`.

**/clients** — `q`, `status` ∈ `active | archived`, `project_status` (status of latest project), `sm`, `sort`, `dir`, `page`, `pageSize`.

**/material-requests** — `q` (code, material, project), `status`, `view` ∈ `open | pending | processing | completed | overdue | unassigned | mine`
(`open` = requested … partially_delivered), `priority`, `admin` (user id), `sm` (requested_by user id), `project` (project id),
`client` (client id; filters `material_request_directory.client_id` and shows a removable "Client: …" chip),
`range` + `from`/`to` (applies to required_date),
`sort` ∈ `required_date | priority | created_at | status | estimated_cost`, `dir`, `page`, `pageSize`. Default sort = urgency
(open requests first, then required_date asc).

**/activity** — `q`, `entity` (entity_type), `user` (actor id, owner only), `project`, `range` + `from`/`to`, `page`.

Detail routes: `/clients/[id]`, `/projects/[id]?tab=overview|timeline|updates|requests|materials|documents|activity`,
`/projects/[id]/update` (mobile-first progress form), `/material-requests/new?project=<id>`, `/material-requests/[id]`,
`/site-managers/[id]`, `/admins/[id]`.

Route access (enforced by `requireRole` + RLS):
| Route | Roles |
|---|---|
| /dashboard, /material-requests/**, /materials, /activity, /profile | owner, admin, site_manager |
| /projects, /projects/[id] | owner, admin, site_manager (RLS scopes rows; admin sees no cost/financials) |
| /projects/new, /projects/[id]/edit | owner |
| /projects/[id]/update | owner, site_manager |
| /clients, /clients/[id] | owner, site_manager (assigned only) |
| /clients/new, /clients/[id]/edit | owner |
| /site-managers/**, /admins/**, /users, /settings | owner |
| /reports | owner (full); admin & site_manager get a limited material report scoped by RLS |
