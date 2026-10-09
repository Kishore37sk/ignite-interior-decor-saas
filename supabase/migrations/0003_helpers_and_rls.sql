-- =============================================================================
-- 0003_helpers_and_rls.sql
-- Ignite Interior Decor: security helper functions, row level security
-- policies and table privileges.
--
-- Principles
--   * Every helper is SECURITY DEFINER with an empty search_path and fully
--     qualified names, so it can read membership tables without recursing
--     into RLS and cannot be hijacked through search_path.
--   * A user whose profile is inactive (or has no role) gets NULL from
--     current_app_role(); every helper then returns false, so a deactivated
--     account sees nothing even while its JWT is still valid.
--   * Policies apply to "authenticated" only. "anon" has no privileges at all.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Date helper (business timezone Asia/Kolkata)
-- -----------------------------------------------------------------------------
create or replace function public.app_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (pg_catalog.now() at time zone 'Asia/Kolkata')::date
$$;

-- -----------------------------------------------------------------------------
-- Role helpers
-- -----------------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.status = 'active'
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'owner'::public.app_role, false)
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'admin'::public.app_role, false)
$$;

create or replace function public.is_site_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'site_manager'::public.app_role, false)
$$;

-- Active membership of the current user on project p (optionally with member role r).
-- A membership only counts while the member's current app role matches the
-- membership role (e.g. a site manager re-roled to admin loses SM membership rights).
create or replace function public.is_project_member(p uuid, r public.member_role default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_members m
    where m.project_id = p
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (r is null or m.member_role = r)
      and m.member_role::text = (public.current_app_role())::text
  )
$$;

create or replace function public.can_access_project(p uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := public.current_app_role();
begin
  if v_role is null or p is null then
    return false;
  end if;

  if v_role = 'owner' then
    return true;
  end if;

  if public.is_project_member(p) then
    return true;
  end if;

  -- Admins reach a project through requests assigned to them, or through the
  -- shared queue of OPEN unassigned requests. A closed or archived unassigned
  -- request (e.g. one the owner rejected or delivered personally) no longer
  -- opens the project to every admin.
  if v_role = 'admin' then
    return exists (
      select 1
      from public.material_requests mr
      where mr.project_id = p
        and (
          mr.assigned_admin = (select auth.uid())
          or (mr.assigned_admin is null
              and mr.archived_at is null
              and mr.status in ('requested', 'pending_review', 'approved', 'ordered', 'partially_delivered'))
        )
    );
  end if;

  return false;
end
$$;

-- True while project p is open for site work (not archived, completed or cancelled).
create or replace function public.is_project_open(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects pr
    where pr.id = p
      and pr.archived_at is null
      and pr.status not in ('completed', 'cancelled')
  )
$$;

create or replace function public.can_view_project_financials(p uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := public.current_app_role();
begin
  if v_role is null or p is null then
    return false;
  end if;

  if v_role = 'owner' then
    return true;
  end if;

  return exists (
    select 1
    from public.project_members m
    where m.project_id = p
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.can_view_financials
      and m.member_role::text = v_role::text
  );
end
$$;

-- Clients: owner, or a site manager actively assigned to any project of the client.
-- Admins never get direct client access (they only see the client name via project_directory).
create or replace function public.can_access_client(c uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := public.current_app_role();
begin
  if v_role is null or c is null then
    return false;
  end if;

  if v_role = 'owner' then
    return true;
  end if;

  if v_role <> 'site_manager' then
    return false;
  end if;

  return exists (
    select 1
    from public.projects pr
    join public.project_members m on m.project_id = pr.id
    where pr.client_id = c
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.member_role = 'site_manager'
  );
end
$$;

-- Can user u (active, with a role) access material request r?
--   owner: always; site manager: active SM member of the request's project;
--   admin: assigned to it, an active admin member of the project, or the
--   request is OPEN, unassigned and not archived (the shared admin queue).
-- Used for the caller (can_access_material_request) and to decide whether a
-- notification about the request may still be sent to a user.
create or replace function public.user_can_access_material_request(u uuid, r uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role     public.app_role;
  v_project  uuid;
  v_assigned uuid;
  v_status   public.material_request_status;
  v_archived timestamptz;
begin
  if u is null or r is null then
    return false;
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = u and p.status = 'active';
  if v_role is null then
    return false;
  end if;

  select mr.project_id, mr.assigned_admin, mr.status, mr.archived_at
    into v_project, v_assigned, v_status, v_archived
  from public.material_requests mr
  where mr.id = r;

  if not found then
    return false;
  end if;

  if v_role = 'owner' then
    return true;
  end if;

  if v_role = 'site_manager' then
    return exists (
      select 1 from public.project_members m
      where m.project_id = v_project and m.user_id = u
        and m.status = 'active' and m.member_role = 'site_manager'
    );
  end if;

  if v_role = 'admin' then
    return v_assigned = u
      or (v_assigned is null
          and v_archived is null
          and v_status in ('requested', 'pending_review', 'approved', 'ordered', 'partially_delivered'))
      or exists (
        select 1 from public.project_members m
        where m.project_id = v_project and m.user_id = u
          and m.status = 'active' and m.member_role = 'admin'
      );
  end if;

  return false;
end
$$;

create or replace function public.can_access_material_request(r uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.user_can_access_material_request((select auth.uid()), r)
$$;

-- Approved / actual material costs: owner and admins (material work), plus any
-- member the owner explicitly granted financial access on project p. Site
-- managers otherwise see estimated costs only (app.md sections 55, 85, 86).
create or replace function public.can_view_material_cost_details(p uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := public.current_app_role();
begin
  if v_role is null then
    return false;
  end if;
  if v_role in ('owner', 'admin') then
    return true;
  end if;
  return public.can_view_project_financials(p);
end
$$;

-- -----------------------------------------------------------------------------
-- Enable row level security on every table
-- -----------------------------------------------------------------------------
alter table public.profiles                  enable row level security;
alter table public.company_settings          enable row level security;
alter table public.material_categories       enable row level security;
alter table public.clients                   enable row level security;
alter table public.projects                  enable row level security;
alter table public.project_financials        enable row level security;
alter table public.project_members           enable row level security;
alter table public.project_milestones        enable row level security;
alter table public.project_updates           enable row level security;
alter table public.project_documents         enable row level security;
alter table public.materials                 enable row level security;
alter table public.material_requests         enable row level security;
alter table public.material_request_items    enable row level security;
alter table public.material_deliveries       enable row level security;
alter table public.material_request_comments enable row level security;
alter table public.notifications             enable row level security;
alter table public.audit_logs                enable row level security;

-- -----------------------------------------------------------------------------
-- profiles
--   select: owner, or self (self may read own row even when inactive so the app
--           can show "account deactivated"; it exposes nothing else)
--   update: owner; self while active (role/status/employee_id/email protected
--           by trigger protect_profile_fields)
-- -----------------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select to authenticated
  using ((select public.is_owner()) or id = (select auth.uid()));

create policy profiles_update_owner on public.profiles
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and (select public.current_app_role()) is not null)
  with check (id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- company_settings
-- -----------------------------------------------------------------------------
create policy company_settings_select on public.company_settings
  for select to authenticated
  using ((select public.current_app_role()) is not null);

create policy company_settings_update on public.company_settings
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- -----------------------------------------------------------------------------
-- material_categories
-- -----------------------------------------------------------------------------
create policy material_categories_select on public.material_categories
  for select to authenticated
  using ((select public.current_app_role()) is not null);

create policy material_categories_insert on public.material_categories
  for insert to authenticated
  with check ((select public.is_owner()));

create policy material_categories_update on public.material_categories
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- -----------------------------------------------------------------------------
-- clients (admins have NO direct access)
-- -----------------------------------------------------------------------------
create policy clients_select on public.clients
  for select to authenticated
  using (public.can_access_client(id));

create policy clients_insert on public.clients
  for insert to authenticated
  with check ((select public.is_owner()));

create policy clients_update on public.clients
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- -----------------------------------------------------------------------------
-- projects (site managers change projects only via submit_project_update)
-- -----------------------------------------------------------------------------
create policy projects_select on public.projects
  for select to authenticated
  using (public.can_access_project(id));

create policy projects_insert on public.projects
  for insert to authenticated
  with check ((select public.is_owner()));

create policy projects_update on public.projects
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- -----------------------------------------------------------------------------
-- project_financials
-- -----------------------------------------------------------------------------
create policy project_financials_select on public.project_financials
  for select to authenticated
  using (public.can_view_project_financials(project_id));

create policy project_financials_insert on public.project_financials
  for insert to authenticated
  with check ((select public.is_owner()));

create policy project_financials_update on public.project_financials
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- -----------------------------------------------------------------------------
-- project_members
-- -----------------------------------------------------------------------------
create policy project_members_select on public.project_members
  for select to authenticated
  using (
    (select public.is_owner())
    or (user_id = (select auth.uid()) and (select public.current_app_role()) is not null)
  );

create policy project_members_insert on public.project_members
  for insert to authenticated
  with check ((select public.is_owner()));

create policy project_members_update on public.project_members
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- -----------------------------------------------------------------------------
-- project_milestones
-- -----------------------------------------------------------------------------
create policy project_milestones_select on public.project_milestones
  for select to authenticated
  using (public.can_access_project(project_id));

create policy project_milestones_insert on public.project_milestones
  for insert to authenticated
  with check ((select public.is_owner()));

create policy project_milestones_update on public.project_milestones
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- -----------------------------------------------------------------------------
-- project_updates (append-only; inserted by submit_project_update only)
-- Admins with request-only access to a project do NOT see site update history.
-- -----------------------------------------------------------------------------
create policy project_updates_select on public.project_updates
  for select to authenticated
  using ((select public.is_owner()) or public.is_project_member(project_id));

-- -----------------------------------------------------------------------------
-- project_documents
-- -----------------------------------------------------------------------------
create policy project_documents_select on public.project_documents
  for select to authenticated
  using ((select public.is_owner()) or public.is_project_member(project_id));

-- Site managers may only register documents on open projects (mirrors the
-- storage upload policy). Remaining columns are normalised by trigger
-- normalize_project_document (0004).
create policy project_documents_insert on public.project_documents
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and (
      (select public.is_owner())
      or (public.is_project_member(project_id, 'site_manager') and public.is_project_open(project_id))
    )
  );

create policy project_documents_update on public.project_documents
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- -----------------------------------------------------------------------------
-- materials (catalog)
-- -----------------------------------------------------------------------------
create policy materials_select on public.materials
  for select to authenticated
  using ((select public.current_app_role()) is not null);

create policy materials_insert on public.materials
  for insert to authenticated
  with check ((select public.is_owner()) or (select public.is_admin()));

create policy materials_update on public.materials
  for update to authenticated
  using ((select public.is_owner()) or (select public.is_admin()))
  with check ((select public.is_owner()) or (select public.is_admin()));

-- -----------------------------------------------------------------------------
-- material requests and children (writes only through RPCs)
-- -----------------------------------------------------------------------------
create policy material_requests_select on public.material_requests
  for select to authenticated
  using (public.can_access_material_request(id));

create policy material_request_items_select on public.material_request_items
  for select to authenticated
  using (public.can_access_material_request(request_id));

create policy material_deliveries_select on public.material_deliveries
  for select to authenticated
  using (public.can_access_material_request(request_id));

create policy material_request_comments_select on public.material_request_comments
  for select to authenticated
  using (public.can_access_material_request(request_id));

-- -----------------------------------------------------------------------------
-- notifications (own rows; only read_at is updatable via column privilege)
-- -----------------------------------------------------------------------------
create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.current_app_role()) is not null);

create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.current_app_role()) is not null)
  with check (user_id = (select auth.uid()));

create policy notifications_delete on public.notifications
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.current_app_role()) is not null);

-- -----------------------------------------------------------------------------
-- audit_logs (read-only for everyone; written only by SECURITY DEFINER triggers)
--   owner: everything
--   others (active): own actions; project rows of projects they are members of
--   (never financials/profiles/clients); admins additionally see rows of
--   material requests they can access.
--   Rows whose old/new data carry approved or actual material costs are only
--   visible to callers allowed to see those costs (can_view_material_cost_details).
-- -----------------------------------------------------------------------------
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (
    (select public.is_owner())
    or (
      (select public.current_app_role()) is not null
      and (
        user_id = (select auth.uid())
        or (
          project_id is not null
          and entity_type not in ('project_financials', 'profiles', 'clients')
          and public.is_project_member(project_id)
        )
        or (
          (select public.is_admin())
          and entity_type in ('material_requests', 'material_request_items', 'material_deliveries',
                              'material_request_comments')
          and (metadata ->> 'request_id') is not null
          and public.can_access_material_request((metadata ->> 'request_id')::uuid)
        )
      )
      and (
        entity_type not in ('material_requests', 'material_request_items')
        or coalesce(old_data ->> 'approved_unit_cost', old_data ->> 'actual_unit_cost',
                    new_data ->> 'approved_unit_cost', new_data ->> 'actual_unit_cost',
                    old_data ->> 'approved_cost', old_data ->> 'actual_cost',
                    new_data ->> 'approved_cost', new_data ->> 'actual_cost',
                    old_data ->> 'variance_estimated_cost', new_data ->> 'variance_estimated_cost',
                    old_data ->> 'variance_actual_cost', new_data ->> 'variance_actual_cost') is null
        or public.can_view_material_cost_details(project_id)
      )
    )
  );

-- -----------------------------------------------------------------------------
-- Table privileges. anon gets nothing. authenticated gets only what the
-- policies above can use; everything else goes through SECURITY DEFINER RPCs.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, update on public.company_settings to authenticated;
grant select, insert, update on public.material_categories to authenticated;
grant select, insert, update on public.clients to authenticated;
grant select, insert, update on public.projects to authenticated;
grant select, insert, update on public.project_financials to authenticated;
grant select, insert, update on public.project_members to authenticated;
grant select, insert, update on public.project_milestones to authenticated;
grant select on public.project_updates to authenticated;
grant select, insert, update on public.project_documents to authenticated;
grant select, insert, update on public.materials to authenticated;
-- Approved / actual costs are NOT selectable from the base tables by API
-- users (column privileges also strip them from realtime payloads). Callers
-- read costs through material_request_directory / material_request_item_directory
-- (0006), which mask them unless can_view_material_cost_details() allows.
grant select (
  id, request_code, project_id, client_id, requested_by, assigned_admin, title, required_date, priority,
  status, estimated_cost, requested_at, reviewed_at, approved_at, rejected_at, ordered_at,
  expected_delivery_date, delivery_date, completed_at, cancelled_at, rejection_reason, notes, assigned_at,
  archived_at, created_at, updated_at
) on public.material_requests to authenticated;
grant select (
  id, request_id, material_id, material_name, category, quantity, unit, estimated_unit_cost,
  delivered_quantity, notes, created_at, updated_at
) on public.material_request_items to authenticated;
grant select on public.material_deliveries to authenticated;
grant select on public.material_request_comments to authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select on public.audit_logs to authenticated;

-- Owner inserts of clients/projects get their codes from the SECURITY DEFINER
-- column defaults next_client_code() / next_project_code() (0002), so API roles
-- need no sequence privileges.
revoke all on function public.next_client_code() from public, anon;
revoke all on function public.next_project_code() from public, anon;
grant execute on function public.next_client_code() to authenticated, service_role;
grant execute on function public.next_project_code() to authenticated, service_role;

-- Helper functions are used inside policies/views, so authenticated needs EXECUTE.
revoke all on function public.app_today() from public, anon;
revoke all on function public.current_app_role() from public, anon;
revoke all on function public.is_owner() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_site_manager() from public, anon;
revoke all on function public.is_project_member(uuid, public.member_role) from public, anon;
revoke all on function public.can_access_project(uuid) from public, anon;
revoke all on function public.can_view_project_financials(uuid) from public, anon;
revoke all on function public.can_access_client(uuid) from public, anon;
revoke all on function public.can_access_material_request(uuid) from public, anon;
revoke all on function public.user_can_access_material_request(uuid, uuid) from public, anon, authenticated;
revoke all on function public.can_view_material_cost_details(uuid) from public, anon;
revoke all on function public.is_project_open(uuid) from public, anon;

grant execute on function public.app_today() to authenticated, service_role;
grant execute on function public.current_app_role() to authenticated, service_role;
grant execute on function public.is_owner() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_site_manager() to authenticated, service_role;
grant execute on function public.is_project_member(uuid, public.member_role) to authenticated, service_role;
grant execute on function public.can_access_project(uuid) to authenticated, service_role;
grant execute on function public.can_view_project_financials(uuid) to authenticated, service_role;
grant execute on function public.can_access_client(uuid) to authenticated, service_role;
grant execute on function public.can_access_material_request(uuid) to authenticated, service_role;
grant execute on function public.can_view_material_cost_details(uuid) to authenticated, service_role;
grant execute on function public.is_project_open(uuid) to authenticated, service_role;
