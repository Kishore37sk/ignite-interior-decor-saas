-- =============================================================================
-- 0002_core_tables.sql
-- Ignite Interior Decor: core tables, constraints, indexes and reference data.
-- Row level security and grants are configured in 0003.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles: one row per auth user (created by trigger handle_new_user in 0004)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  full_name       text not null check (length(btrim(full_name)) between 1 and 120),
  email           text not null unique check (email = lower(email) and position('@' in email) > 1),
  phone           text check (phone is null or length(phone) <= 32),
  role            public.app_role,
  employee_id     text unique check (employee_id is null or length(btrim(employee_id)) between 1 and 32),
  status          public.user_status not null default 'active',
  joining_date    date,
  -- Owner-managed (see protect_profile_fields); https only, no quotes/markup.
  avatar_url      text check (avatar_url is null
                              or (length(avatar_url) <= 1024 and avatar_url ~ '^https://[^[:space:]"''<>\\]+$')),
  deactivated_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index profiles_role_status_idx on public.profiles (role, status);

-- -----------------------------------------------------------------------------
-- company_settings: singleton row (id = 1)
-- -----------------------------------------------------------------------------
create table public.company_settings (
  id            int primary key default 1 check (id = 1),
  company_name  text not null default 'Ignite Interior Decor' check (length(btrim(company_name)) between 1 and 160),
  logo_url      text,
  contact_name  text,
  email         text,
  phone         text,
  address       text,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles (id)
);

-- -----------------------------------------------------------------------------
-- material_categories
-- -----------------------------------------------------------------------------
create table public.material_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(btrim(name)) between 1 and 80),
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Human-readable code generators used as column defaults. They skip codes that
-- already exist (e.g. a manually entered 'P-1005'), so a blank code never
-- collides with a hand-typed one. Only the owner (or a trusted context without
-- a JWT) gets a code.
-- -----------------------------------------------------------------------------
create or replace function public.next_client_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  -- Non-owners get NULL: their insert is then rejected by RLS, and calling
  -- this function directly cannot burn sequence values.
  if (select auth.uid()) is not null and not public.is_owner() then
    return null;
  end if;
  loop
    v_code := 'CL-' || lpad(nextval('public.client_code_seq')::text, 4, '0');
    exit when not exists (select 1 from public.clients c where c.client_code = v_code);
  end loop;
  return v_code;
end
$$;

create or replace function public.next_project_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  -- Non-owners get NULL: their insert is then rejected by RLS, and calling
  -- this function directly cannot burn sequence values.
  if (select auth.uid()) is not null and not public.is_owner() then
    return null;
  end if;
  loop
    v_code := 'P-' || (1000 + nextval('public.project_code_seq'))::text;
    exit when not exists (select 1 from public.projects p where p.project_code = v_code);
  end loop;
  return v_code;
end
$$;

-- -----------------------------------------------------------------------------
-- clients
-- -----------------------------------------------------------------------------
create table public.clients (
  id               uuid primary key default gen_random_uuid(),
  client_code      text not null unique default public.next_client_code(),
  name             text not null check (length(btrim(name)) between 1 and 160),
  email            text check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone            text check (phone is null or length(phone) <= 32),
  alternate_phone  text check (alternate_phone is null or length(alternate_phone) <= 32),
  address          text,
  city             text,
  state            text,
  country          text default 'India',
  notes            text,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references public.profiles (id) default auth.uid()
);
-- Duplicate client email (case-insensitive) among non-archived clients is rejected.
create unique index clients_email_unique_idx on public.clients (lower(email))
  where email is not null and archived_at is null;
create index clients_archived_at_idx on public.clients (archived_at);
create index clients_created_at_idx on public.clients (created_at desc);

-- -----------------------------------------------------------------------------
-- projects (no cost columns: money lives in project_financials)
-- -----------------------------------------------------------------------------
create table public.projects (
  id                        uuid primary key default gen_random_uuid(),
  project_code              text not null unique default public.next_project_code(),
  client_id                 uuid not null references public.clients (id),
  name                      text not null check (length(btrim(name)) between 1 and 160),
  project_type              text,
  site_address              text,
  city                      text,
  start_date                date,
  expected_completion_date  date,
  -- Owner-committed deadline: follows expected_completion_date except when a
  -- site manager moves it (trigger maintain_project_dates, 0004). Used as the
  -- reference for on-time metrics so a deadline extension cannot make a late
  -- project count as on time.
  committed_completion_date date,
  handover_date             date,
  actual_handover_date      date,
  status                    public.project_status not null default 'planning',
  progress_percentage       numeric(5, 2) not null default 0
                            check (progress_percentage >= 0 and progress_percentage <= 100),
  priority                  public.priority_level not null default 'medium',
  current_milestone         text,
  notes                     text,
  last_update_at            timestamptz,
  last_updated_by           uuid references public.profiles (id),
  archived_at               timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                uuid references public.profiles (id) default auth.uid(),
  constraint projects_expected_after_start_chk
    check (expected_completion_date is null or start_date is null or expected_completion_date >= start_date),
  constraint projects_handover_after_start_chk
    check (handover_date is null or start_date is null or handover_date >= start_date),
  constraint projects_actual_handover_after_start_chk
    check (actual_handover_date is null or start_date is null or actual_handover_date >= start_date)
);
create index projects_client_id_idx on public.projects (client_id);
create index projects_status_idx on public.projects (status);
create index projects_handover_date_idx on public.projects (handover_date);
create index projects_expected_completion_date_idx on public.projects (expected_completion_date);
create index projects_archived_at_idx on public.projects (archived_at);
create index projects_created_at_idx on public.projects (created_at desc);

-- -----------------------------------------------------------------------------
-- project_financials (owner / explicitly granted members only)
-- -----------------------------------------------------------------------------
create table public.project_financials (
  project_id        uuid primary key references public.projects (id) on delete cascade,
  project_cost      numeric(14, 2) not null default 0 check (project_cost >= 0),
  advance_received  numeric(14, 2) not null default 0 check (advance_received >= 0),
  notes             text,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.profiles (id)
);

-- -----------------------------------------------------------------------------
-- project_members
-- -----------------------------------------------------------------------------
create table public.project_members (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects (id) on delete cascade,
  user_id              uuid not null references public.profiles (id),
  member_role          public.member_role not null,
  can_view_financials  boolean not null default false,
  status               text not null default 'active' check (status in ('active', 'removed')),
  assigned_at          timestamptz not null default now(),
  assigned_by          uuid references public.profiles (id) default auth.uid(),
  removed_at           timestamptz,
  removed_by           uuid references public.profiles (id),
  constraint project_members_removed_consistency_chk
    check ((status = 'removed') = (removed_at is not null))
);
create unique index project_members_active_unique_idx on public.project_members (project_id, user_id)
  where status = 'active';
create index project_members_user_id_idx on public.project_members (user_id);
create index project_members_project_id_idx on public.project_members (project_id);

-- -----------------------------------------------------------------------------
-- project_milestones
-- -----------------------------------------------------------------------------
create table public.project_milestones (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 120),
  start_date      date,
  target_date     date,
  completed_date  date,
  status          public.milestone_status not null default 'not_started',
  notes           text,
  sort_order      int not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint project_milestones_target_after_start_chk
    check (target_date is null or start_date is null or target_date >= start_date)
);
create index project_milestones_project_id_idx on public.project_milestones (project_id, sort_order);

-- -----------------------------------------------------------------------------
-- project_updates (append-only history; written only by submit_project_update)
-- -----------------------------------------------------------------------------
create table public.project_updates (
  id                        uuid primary key default gen_random_uuid(),
  project_id                uuid not null references public.projects (id) on delete cascade,
  updated_by                uuid not null references public.profiles (id),
  status                    public.project_status not null,
  previous_status           public.project_status,
  progress_percentage       numeric(5, 2) not null check (progress_percentage >= 0 and progress_percentage <= 100),
  previous_progress         numeric(5, 2),
  update_date               date not null,
  milestone                 text,
  expected_completion_date  date,
  issues                    text,
  notes                     text,
  next_action               text,
  created_at                timestamptz not null default now()
);
create index project_updates_project_id_idx on public.project_updates (project_id, created_at desc);
create index project_updates_updated_by_idx on public.project_updates (updated_by);

-- -----------------------------------------------------------------------------
-- project_documents (files live in storage bucket "project-documents")
-- -----------------------------------------------------------------------------
create table public.project_documents (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  category      public.document_category not null default 'other',
  file_name     text not null check (length(btrim(file_name)) between 1 and 255),
  storage_path  text not null unique check (length(storage_path) <= 1024),
  mime_type     text,
  size_bytes    bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by   uuid references public.profiles (id) default auth.uid(),
  created_at    timestamptz not null default now(),
  archived_at   timestamptz,
  constraint project_documents_path_matches_project_chk
    check (split_part(storage_path, '/', 1) = project_id::text)
);
create index project_documents_project_id_idx on public.project_documents (project_id, created_at desc);

-- -----------------------------------------------------------------------------
-- materials (catalog)
-- -----------------------------------------------------------------------------
create table public.materials (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(btrim(name)) between 1 and 160),
  category     text,
  unit         text not null check (length(btrim(unit)) between 1 and 32),
  description  text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index materials_name_unique_idx on public.materials (lower(name));

-- -----------------------------------------------------------------------------
-- material_requests
-- Costs are derived from items by trigger (0004).
-- -----------------------------------------------------------------------------
create table public.material_requests (
  id                      uuid primary key default gen_random_uuid(),
  request_code            text not null unique
                          default ('MR-' || (1000 + nextval('public.request_code_seq'))::text),
  project_id              uuid not null references public.projects (id),
  client_id               uuid references public.clients (id),
  requested_by            uuid not null references public.profiles (id),
  assigned_admin          uuid references public.profiles (id),
  title                   text not null check (length(btrim(title)) between 1 and 200),
  required_date           date not null,
  priority                public.priority_level not null default 'medium',
  status                  public.material_request_status not null default 'requested',
  estimated_cost          numeric(14, 2) check (estimated_cost is null or estimated_cost >= 0),
  approved_cost           numeric(14, 2) check (approved_cost is null or approved_cost >= 0),
  actual_cost             numeric(14, 2) check (actual_cost is null or actual_cost >= 0),
  requested_at            timestamptz not null default now(),
  reviewed_at             timestamptz,
  approved_at             timestamptz,
  rejected_at             timestamptz,
  ordered_at              timestamptz,
  expected_delivery_date  date,
  delivery_date           date,
  completed_at            timestamptz,
  cancelled_at            timestamptz,
  rejection_reason        text check (rejection_reason is null or length(rejection_reason) <= 2000),
  notes                   text check (notes is null or length(notes) <= 2000),
  -- Like-for-like variance basis (derived from items by trigger, 0004): the
  -- estimated and actual totals of the items that carry BOTH unit costs.
  variance_estimated_cost numeric(14, 2),
  variance_actual_cost    numeric(14, 2),
  -- When the current assigned_admin was set (maintained by trigger, 0004).
  assigned_at             timestamptz,
  archived_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint material_requests_rejection_reason_chk
    check (status <> 'rejected' or length(btrim(coalesce(rejection_reason, ''))) > 0)
);
create index material_requests_project_id_idx on public.material_requests (project_id);
create index material_requests_client_id_idx on public.material_requests (client_id);
create index material_requests_status_idx on public.material_requests (status);
create index material_requests_required_date_idx on public.material_requests (required_date);
create index material_requests_assigned_admin_idx on public.material_requests (assigned_admin);
create index material_requests_requested_by_idx on public.material_requests (requested_by);
create index material_requests_created_at_idx on public.material_requests (created_at desc);

-- -----------------------------------------------------------------------------
-- material_request_items
-- -----------------------------------------------------------------------------
create table public.material_request_items (
  id                   uuid primary key default gen_random_uuid(),
  request_id           uuid not null references public.material_requests (id) on delete cascade,
  material_id          uuid references public.materials (id),
  material_name        text not null check (length(btrim(material_name)) between 1 and 160),
  category             text check (category is null or length(category) <= 80),
  quantity             numeric(12, 2) not null check (quantity > 0),
  unit                 text not null check (length(btrim(unit)) between 1 and 32),
  estimated_unit_cost  numeric(12, 2) check (estimated_unit_cost is null or estimated_unit_cost >= 0),
  approved_unit_cost   numeric(12, 2) check (approved_unit_cost is null or approved_unit_cost >= 0),
  actual_unit_cost     numeric(12, 2) check (actual_unit_cost is null or actual_unit_cost >= 0),
  delivered_quantity   numeric(12, 2) not null default 0 check (delivered_quantity >= 0),
  notes                text check (notes is null or length(notes) <= 500),
  -- clock_timestamp() keeps the entry order of items inserted in one transaction.
  created_at           timestamptz not null default clock_timestamp(),
  updated_at           timestamptz not null default now()
);
create index material_request_items_request_id_idx on public.material_request_items (request_id);
create index material_request_items_material_id_idx on public.material_request_items (material_id);

-- -----------------------------------------------------------------------------
-- material_deliveries
-- -----------------------------------------------------------------------------
create table public.material_deliveries (
  id                  uuid primary key default gen_random_uuid(),
  request_id          uuid not null references public.material_requests (id) on delete cascade,
  item_id             uuid not null references public.material_request_items (id) on delete cascade,
  delivered_quantity  numeric(12, 2) not null check (delivered_quantity > 0),
  delivery_date       date not null,
  recorded_by         uuid references public.profiles (id),
  notes               text check (notes is null or length(notes) <= 2000),
  created_at          timestamptz not null default now()
);
create index material_deliveries_request_id_idx on public.material_deliveries (request_id);
create index material_deliveries_item_id_idx on public.material_deliveries (item_id);

-- -----------------------------------------------------------------------------
-- material_request_comments
-- -----------------------------------------------------------------------------
create table public.material_request_comments (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.material_requests (id) on delete cascade,
  author_id   uuid not null references public.profiles (id),
  body        text not null check (length(btrim(body)) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index material_request_comments_request_id_idx on public.material_request_comments (request_id, created_at);

-- -----------------------------------------------------------------------------
-- notifications
-- -----------------------------------------------------------------------------
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  title        text not null,
  message      text,
  type         text not null,
  entity_type  text,
  entity_id    uuid,
  link         text,
  dedupe_key   text unique,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index notifications_user_id_read_at_idx on public.notifications (user_id, read_at);
create index notifications_user_id_created_at_idx on public.notifications (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- audit_logs (append-only; guarded by trigger in 0004)
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles (id),
  actor_name   text,
  role         public.app_role,
  action       text not null,
  entity_type  text not null,
  entity_id    uuid,
  project_id   uuid,
  summary      text,
  old_data     jsonb,
  new_data     jsonb,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index audit_logs_user_id_idx on public.audit_logs (user_id);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_project_id_idx on public.audit_logs (project_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);

-- -----------------------------------------------------------------------------
-- Trigram indexes for search. The opclass is resolved dynamically so this works
-- whether pg_trgm lives in "extensions" (Supabase default) or "public".
-- -----------------------------------------------------------------------------
do $$
declare
  v_schema text;
begin
  select n.nspname into v_schema
  from pg_catalog.pg_opclass o
  join pg_catalog.pg_namespace n on n.oid = o.opcnamespace
  join pg_catalog.pg_am a on a.oid = o.opcmethod
  where o.opcname = 'gin_trgm_ops' and a.amname = 'gin'
  limit 1;

  if v_schema is null then
    raise exception 'pg_trgm gin_trgm_ops operator class not found';
  end if;

  execute format('create index clients_name_trgm_idx on public.clients using gin (name %I.gin_trgm_ops)', v_schema);
  execute format('create index projects_name_trgm_idx on public.projects using gin (name %I.gin_trgm_ops)', v_schema);
  execute format(
    'create index material_request_items_name_trgm_idx on public.material_request_items using gin (material_name %I.gin_trgm_ops)',
    v_schema
  );
end
$$;

-- -----------------------------------------------------------------------------
-- Reference data (no business data)
-- -----------------------------------------------------------------------------
insert into public.company_settings (id, company_name) values (1, 'Ignite Interior Decor')
on conflict (id) do nothing;

insert into public.material_categories (name, sort_order) values
  ('Civil', 1),
  ('Electrical', 2),
  ('Plumbing', 3),
  ('Carpentry', 4),
  ('Tiles', 5),
  ('Paint', 6),
  ('Lighting', 7),
  ('Hardware', 8),
  ('Furniture', 9),
  ('Other', 10)
on conflict (name) do nothing;

insert into public.materials (name, category, unit, description) values
  ('Cement', 'Civil', 'Bags', 'OPC 53 grade, 50 kg bag'),
  ('Sand', 'Civil', 'Cu Ft', 'River / M-sand for masonry and plaster'),
  ('Vitrified Tiles', 'Tiles', 'Sq Ft', 'Double-charged vitrified floor tiles'),
  ('Plywood 18mm', 'Carpentry', 'Sheets', 'BWP grade 8 ft x 4 ft sheet'),
  ('Emulsion Paint', 'Paint', 'Litres', 'Interior acrylic emulsion'),
  ('LED Panel Light', 'Lighting', 'Units', 'Recessed LED panel, 15 W'),
  ('Gypsum Board', 'Civil', 'Sheets', '12.5 mm gypsum board for false ceiling'),
  ('PVC Pipe', 'Plumbing', 'Metres', 'CPVC / PVC water supply pipe'),
  ('Modular Switch', 'Electrical', 'Units', 'Modular switch, 6 A / 16 A'),
  ('Wall Putty', 'Paint', 'Kg', 'White cement based wall putty'),
  ('Laminate Sheet', 'Carpentry', 'Sheets', '1 mm decorative laminate, 8 ft x 4 ft'),
  ('Granite', 'Tiles', 'Sq Ft', 'Polished granite slab for counters')
on conflict do nothing;
