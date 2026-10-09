-- =============================================================================
-- 0004_triggers_and_audit.sql
-- Ignite Interior Decor: maintenance triggers, auth -> profile sync, profile
-- field protection, derived material costs, notifications and the generic
-- audit trail.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Internal utilities (never executable by API roles)
-- -----------------------------------------------------------------------------

-- Raise an application error "<CODE>: <message>" (errcode P0001).
create or replace function public.raise_app_error(p_code text, p_message text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = p_code || ': ' || p_message;
end
$$;

-- 'handover_pending' -> 'Handover Pending'
create or replace function public.humanize(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.initcap(pg_catalog.replace(p_value, '_', ' '))
$$;

-- Indian rupee formatting with lakh/crore grouping: 420000 -> '₹4,20,000'
create or replace function public.format_inr(p_amount numeric)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_abs   numeric;
  v_int   text;
  v_frac  integer;
  v_last3 text;
  v_rest  text;
  v_out   text;
begin
  if p_amount is null then
    return null;
  end if;

  v_abs  := abs(round(p_amount, 2));
  v_int  := trunc(v_abs)::bigint::text;
  v_frac := ((v_abs - trunc(v_abs)) * 100)::integer;

  if length(v_int) > 3 then
    v_last3 := right(v_int, 3);
    v_rest  := left(v_int, length(v_int) - 3);
    v_rest  := regexp_replace(v_rest, '(\d)(?=(\d{2})+$)', '\1,', 'g');
    v_out   := v_rest || ',' || v_last3;
  else
    v_out := v_int;
  end if;

  if v_frac > 0 then
    v_out := v_out || '.' || lpad(v_frac::text, 2, '0');
  end if;

  return case when p_amount < 0 then '-₹' else '₹' end || v_out;
end
$$;

-- 72.50 -> '72.5'
create or replace function public.format_qty(p_value numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.trim_scale(p_value)::text
$$;

-- Insert an in-app notification for an active user. Silently skips inactive /
-- unknown users, users who can no longer access the material request the
-- notification is about (e.g. a site manager moved off the project), and
-- duplicate dedupe keys.
create or replace function public.notify_user(
  p_user_id     uuid,
  p_title       text,
  p_message     text,
  p_type        text,
  p_entity_type text,
  p_entity_id   uuid,
  p_link        text,
  p_dedupe_key  text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if p_user_id is null then
    return false;
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.status = 'active' and p.role is not null
  ) then
    return false;
  end if;

  if p_entity_type = 'material_request' and p_entity_id is not null
     and not public.user_can_access_material_request(p_user_id, p_entity_id) then
    return false;
  end if;

  insert into public.notifications (user_id, title, message, type, entity_type, entity_id, link, dedupe_key)
  values (p_user_id, p_title, p_message, p_type, p_entity_type, p_entity_id, p_link, p_dedupe_key)
  on conflict (dedupe_key) do nothing;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end
$$;

-- -----------------------------------------------------------------------------
-- updated_at / updated_by maintenance
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end
$$;

create or replace function public.set_updated_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  return new;
end
$$;

create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.company_settings
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.project_financials
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.project_milestones
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.materials
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.material_requests
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.material_request_items
  for each row execute function public.set_updated_at();

create trigger set_updated_by before insert or update on public.company_settings
  for each row execute function public.set_updated_by();
create trigger set_updated_by before insert or update on public.project_financials
  for each row execute function public.set_updated_by();

-- -----------------------------------------------------------------------------
-- auth.users -> profiles
-- Role comes ONLY from raw_app_meta_data (settable by the service role only).
-- An account without a role (a public sign-up if sign-ups were left enabled,
-- or a user created in the dashboard before promote_to_owner) gets an
-- INACTIVE profile with no role: it can read nothing, call no RPC and never
-- counts as active staff. The profile row is still created so the documented
-- "create in dashboard, then promote_to_owner" bootstrap keeps working.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_text text := nullif(btrim(coalesce(new.raw_app_meta_data ->> 'role', '')), '');
  v_role      public.app_role;
  v_name      text;
  v_employee  text := nullif(btrim(coalesce(new.raw_app_meta_data ->> 'employee_id', '')), '');
  v_phone     text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '');
begin
  if v_role_text in ('owner', 'admin', 'site_manager') then
    v_role := v_role_text::public.app_role;
  end if;

  v_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  if v_name is null then
    v_name := split_part(coalesce(new.email, 'user'), '@', 1);
  end if;

  insert into public.profiles (id, full_name, email, phone, role, employee_id, status)
  values (
    new.id,
    left(v_name, 120),
    lower(btrim(coalesce(new.email, new.id::text || '@users.invalid'))),
    v_phone,
    v_role,
    v_employee,
    case when v_role is null then 'inactive'::public.user_status else 'active'::public.user_status end
  )
  on conflict (id) do nothing;

  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null and new.email is distinct from old.email then
    update public.profiles
       set email = lower(btrim(new.email))
     where id = new.id;
  end if;
  return new;
end
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- Staff cannot start an email change themselves (supabase.auth.updateUser({ email })
-- writes auth.users.email_change). Only an active owner may change their own
-- login email this way; staff emails are changed by the owner through the
-- admin API, which sets auth.users.email directly. Also keep "Secure email
-- change" enabled in Supabase Auth settings (see supabase/README.md).
create or replace function public.guard_auth_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.email_change, '') <> ''
     and new.email_change is distinct from old.email_change
     and not exists (
       select 1 from public.profiles p
       where p.id = new.id and p.role = 'owner' and p.status = 'active'
     ) then
    raise exception using errcode = 'P0001',
      message = 'NOT_AUTHORIZED: Only the owner can change account emails.';
  end if;
  return new;
end
$$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'email_change'
  ) then
    execute 'drop trigger if exists guard_auth_email_change on auth.users';
    execute 'create trigger guard_auth_email_change
               before update of email_change on auth.users
               for each row execute function public.guard_auth_email_change()';
  else
    raise notice 'auth.users.email_change not found; self-service email change guard not installed.';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- profiles: normalisation + protected fields
-- -----------------------------------------------------------------------------
create or replace function public.normalize_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := lower(btrim(new.email));
  new.full_name := btrim(new.full_name);
  new.employee_id := nullif(btrim(coalesce(new.employee_id, '')), '');

  if tg_op = 'UPDATE' then
    if new.status = 'inactive' and old.status = 'active' then
      new.deactivated_at := pg_catalog.now();
    elsif new.status = 'active' and old.status = 'inactive' then
      new.deactivated_at := null;
    end if;
  elsif new.status = 'inactive' and new.deactivated_at is null then
    new.deactivated_at := pg_catalog.now();
  end if;

  return new;
end
$$;

create trigger normalize_profile before insert or update on public.profiles
  for each row execute function public.normalize_profile();

-- SECURITY INVOKER on purpose: current_user identifies the real caller
-- (authenticated vs service_role / postgres). SECURITY DEFINER RPCs that run
-- as postgres perform their own authorization checks.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') then
    return new;
  end if;

  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHORIZED: Profile identity cannot be changed.';
  end if;

  if (new.role is distinct from old.role)
     or (new.status is distinct from old.status)
     or (new.employee_id is distinct from old.employee_id)
     or (new.email is distinct from old.email)
     or (new.deactivated_at is distinct from old.deactivated_at)
     or (new.joining_date is distinct from old.joining_date)
     or (new.avatar_url is distinct from old.avatar_url) then

    if not public.is_owner() then
      raise exception using errcode = 'P0001',
        message = 'NOT_AUTHORIZED: Only the owner can change role, status, employee ID, email or photo.';
    end if;

    -- The owner cannot lock themselves out or mint/demote owners from the app.
    if (new.role is distinct from old.role or new.status is distinct from old.status)
       and (old.id = (select auth.uid()) or old.role = 'owner' or new.role = 'owner') then
      raise exception using errcode = 'P0001',
        message = 'NOT_AUTHORIZED: Owner accounts can only be changed by the bootstrap process.';
    end if;
  end if;

  return new;
end
$$;

create trigger protect_profile_fields before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- -----------------------------------------------------------------------------
-- projects: default milestones + financials row on insert
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_milestones (project_id, name, sort_order, status, start_date, completed_date)
  select new.id,
         m.name,
         m.sort_order,
         case when m.sort_order = 1 and new.start_date is not null and new.start_date <= public.app_today()
              then 'completed'::public.milestone_status
              else 'not_started'::public.milestone_status end,
         case when m.sort_order = 1 then new.start_date end,
         case when m.sort_order = 1 and new.start_date is not null and new.start_date <= public.app_today()
              then new.start_date end
  from (values
    (1, 'Project Started'),
    (2, 'Design'),
    (3, 'Approval'),
    (4, 'Procurement'),
    (5, 'Execution'),
    (6, 'Finishing'),
    (7, 'Handover'),
    (8, 'Completed')
  ) as m(sort_order, name);

  insert into public.project_financials (project_id)
  values (new.id)
  on conflict (project_id) do nothing;

  return new;
end
$$;

create trigger handle_new_project after insert on public.projects
  for each row execute function public.handle_new_project();

-- -----------------------------------------------------------------------------
-- projects: committed deadline and actual completion date
--   * committed_completion_date follows expected_completion_date, except when
--     a site manager moves the expected date (their revision is a forecast,
--     not a new commitment). The first deadline ever set becomes the
--     commitment whoever sets it.
--   * Moving into 'completed' (by any path, including the owner's Edit Project
--     form) stamps actual_handover_date with today when it is not given.
--     Leaving 'completed' clears it unless the same update sets it explicitly,
--     so a reopened and re-completed project gets its real completion date.
-- -----------------------------------------------------------------------------
create or replace function public.maintain_project_dates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.app_today();
begin
  if tg_op = 'INSERT' then
    new.committed_completion_date := coalesce(new.committed_completion_date, new.expected_completion_date);
    return new;
  end if;

  if new.expected_completion_date is distinct from old.expected_completion_date
     and new.committed_completion_date is not distinct from old.committed_completion_date
     and (old.committed_completion_date is null
          or public.current_app_role() is distinct from 'site_manager'::public.app_role) then
    new.committed_completion_date := new.expected_completion_date;
  end if;

  if new.status = 'completed' and old.status is distinct from 'completed' then
    if new.actual_handover_date is null
       and (new.start_date is null or new.start_date <= v_today) then
      new.actual_handover_date := v_today;
    end if;
  elsif old.status = 'completed' and new.status <> 'completed'
        and new.actual_handover_date is not distinct from old.actual_handover_date then
    new.actual_handover_date := null;
  end if;

  return new;
end
$$;

create trigger maintain_project_dates before insert or update on public.projects
  for each row execute function public.maintain_project_dates();

-- -----------------------------------------------------------------------------
-- material_requests: client_id always follows the project
-- -----------------------------------------------------------------------------
create or replace function public.set_material_request_client()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.project_id is distinct from old.project_id or new.client_id is distinct from old.client_id then
    select p.client_id into new.client_id
    from public.projects p
    where p.id = new.project_id;
  end if;
  return new;
end
$$;

create trigger set_material_request_client before insert or update on public.material_requests
  for each row execute function public.set_material_request_client();

-- assigned_at = when the current assigned_admin was set (null when unassigned).
create or replace function public.set_material_request_assigned_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.assigned_admin is null then
    new.assigned_at := null;
  elsif tg_op = 'INSERT' then
    new.assigned_at := coalesce(new.assigned_at, new.requested_at, pg_catalog.now());
  elsif new.assigned_admin is distinct from old.assigned_admin then
    new.assigned_at := pg_catalog.now();
  else
    new.assigned_at := old.assigned_at;
  end if;
  return new;
end
$$;

create trigger set_material_request_assigned_at before insert or update on public.material_requests
  for each row execute function public.set_material_request_assigned_at();

-- -----------------------------------------------------------------------------
-- Derived request totals: sum(quantity x unit cost) over items whose unit cost
-- is set; NULL when no item carries that cost.
-- variance_estimated_cost / variance_actual_cost compare like with like: both
-- sum only the items that carry an estimated AND an actual unit cost, so a
-- custom item without an estimate cannot raise a false overrun and an item
-- still awaiting its actual cost cannot hide a real one.
-- -----------------------------------------------------------------------------
create or replace function public.refresh_material_request_totals(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_est  numeric(14, 2);
  v_app  numeric(14, 2);
  v_act  numeric(14, 2);
  v_vest numeric(14, 2);
  v_vact numeric(14, 2);
begin
  select sum(i.quantity * i.estimated_unit_cost) filter (where i.estimated_unit_cost is not null),
         sum(i.quantity * i.approved_unit_cost)  filter (where i.approved_unit_cost is not null),
         sum(i.quantity * i.actual_unit_cost)    filter (where i.actual_unit_cost is not null),
         sum(i.quantity * i.estimated_unit_cost)
           filter (where i.estimated_unit_cost is not null and i.actual_unit_cost is not null),
         sum(i.quantity * i.actual_unit_cost)
           filter (where i.estimated_unit_cost is not null and i.actual_unit_cost is not null)
    into v_est, v_app, v_act, v_vest, v_vact
  from public.material_request_items i
  where i.request_id = p_request_id;

  update public.material_requests r
     set estimated_cost          = v_est,
         approved_cost           = v_app,
         actual_cost             = v_act,
         variance_estimated_cost = v_vest,
         variance_actual_cost    = v_vact
   where r.id = p_request_id
     and (r.estimated_cost is distinct from v_est
          or r.approved_cost is distinct from v_app
          or r.actual_cost is distinct from v_act
          or r.variance_estimated_cost is distinct from v_vest
          or r.variance_actual_cost is distinct from v_vact);
end
$$;

create or replace function public.sync_material_request_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_material_request_totals(new.request_id);
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.request_id is distinct from old.request_id) then
    perform public.refresh_material_request_totals(old.request_id);
  end if;
  return null;
end
$$;

create trigger sync_material_request_totals
  after insert or update or delete on public.material_request_items
  for each row execute function public.sync_material_request_totals();

-- -----------------------------------------------------------------------------
-- Notifications driven by data changes
-- -----------------------------------------------------------------------------

-- New material request -> owner(s) + active admins (high/urgent flagged).
create or replace function public.notify_material_request_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_name text;
  v_requester    text;
  v_title        text;
  v_message      text;
  v_recipient    uuid;
begin
  select p.name into v_project_name from public.projects p where p.id = new.project_id;
  select pr.full_name into v_requester from public.profiles pr where pr.id = new.requested_by;

  v_title := case
    when new.priority in ('high', 'urgent')
      then public.humanize(new.priority::text) || ' priority material request ' || new.request_code
    else 'New material request ' || new.request_code
  end;
  v_message := format(
    '%s requested "%s" for %s (required by %s).',
    coalesce(v_requester, 'A site manager'),
    new.title,
    coalesce(v_project_name, 'a project'),
    to_char(new.required_date, 'DD Mon YYYY')
  );

  for v_recipient in
    select p.id
    from public.profiles p
    where p.status = 'active'
      and p.role in ('owner', 'admin')
      and p.id is distinct from (select auth.uid())
      and p.id is distinct from new.requested_by
  loop
    perform public.notify_user(
      v_recipient, v_title, v_message, 'material_request_new', 'material_request', new.id,
      '/material-requests/' || new.id::text,
      'mr_new:' || new.id::text || ':' || v_recipient::text
    );
  end loop;

  return null;
end
$$;

create trigger notify_material_request_created
  after insert on public.material_requests
  for each row execute function public.notify_material_request_created();

-- Status change -> requester (+ owner on rejection, + assigned admin when the
-- requester cancels); assignment -> assignee; cost overrun -> owner(s).
create or replace function public.notify_material_request_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor        uuid := (select auth.uid());
  v_project_name text;
  v_status_label text;
  v_message      text;
  v_owner        uuid;
begin
  select p.name into v_project_name from public.projects p where p.id = new.project_id;

  if new.status is distinct from old.status then
    v_status_label := public.humanize(new.status::text);
    v_message := format('Material request %s "%s" for %s is now %s.',
                        new.request_code, new.title, coalesce(v_project_name, 'your project'), v_status_label);
    if new.status = 'rejected' and new.rejection_reason is not null then
      v_message := v_message || ' Reason: ' || new.rejection_reason;
    end if;
    if new.status = 'ordered' and new.expected_delivery_date is not null then
      v_message := v_message || ' Expected delivery: ' || to_char(new.expected_delivery_date, 'DD Mon YYYY') || '.';
    end if;

    if new.requested_by is distinct from v_actor then
      perform public.notify_user(
        new.requested_by, new.request_code || ' ' || v_status_label, v_message,
        'material_request_status', 'material_request', new.id,
        '/material-requests/' || new.id::text,
        'mr_status:' || new.id::text || ':' || new.status::text || ':' || new.requested_by::text
      );
    end if;

    if new.status = 'rejected' then
      for v_owner in
        select p.id from public.profiles p
        where p.role = 'owner' and p.status = 'active' and p.id is distinct from v_actor
      loop
        perform public.notify_user(
          v_owner, new.request_code || ' rejected', v_message,
          'material_request_status', 'material_request', new.id,
          '/material-requests/' || new.id::text,
          'mr_status:' || new.id::text || ':rejected:' || v_owner::text
        );
      end loop;
    end if;

    if new.status = 'cancelled' and new.assigned_admin is not null and new.assigned_admin is distinct from v_actor then
      perform public.notify_user(
        new.assigned_admin, new.request_code || ' cancelled', v_message,
        'material_request_status', 'material_request', new.id,
        '/material-requests/' || new.id::text,
        'mr_status:' || new.id::text || ':cancelled:' || new.assigned_admin::text
      );
    end if;
  end if;

  if new.assigned_admin is not null
     and new.assigned_admin is distinct from old.assigned_admin
     and new.assigned_admin is distinct from v_actor then
    perform public.notify_user(
      new.assigned_admin,
      'Request ' || new.request_code || ' assigned to you',
      format('"%s" for %s, required by %s (%s priority).',
             new.title, coalesce(v_project_name, 'a project'),
             to_char(new.required_date, 'DD Mon YYYY'), public.humanize(new.priority::text)),
      'request_assigned', 'material_request', new.id,
      '/material-requests/' || new.id::text,
      'mr_assigned:' || new.id::text || ':' || new.assigned_admin::text
    );
  end if;

  -- Overrun = actual above estimate over the SAME items (variance_* columns).
  if new.variance_actual_cost is not null and new.variance_estimated_cost is not null
     and new.variance_actual_cost > new.variance_estimated_cost
     and not coalesce(old.variance_actual_cost > old.variance_estimated_cost, false) then
    for v_owner in
      select p.id from public.profiles p where p.role = 'owner' and p.status = 'active'
    loop
      perform public.notify_user(
        v_owner,
        'Cost overrun on ' || new.request_code,
        format('Actual cost %s exceeds the estimate %s by %s for %s (%s).',
               public.format_inr(new.variance_actual_cost), public.format_inr(new.variance_estimated_cost),
               public.format_inr(new.variance_actual_cost - new.variance_estimated_cost),
               new.title, coalesce(v_project_name, 'project')),
        'cost_overrun', 'material_request', new.id,
        '/material-requests/' || new.id::text,
        'cost_overrun:' || new.id::text || ':' || v_owner::text
      );
    end loop;
  end if;

  return null;
end
$$;

create trigger notify_material_request_changed
  after update on public.material_requests
  for each row execute function public.notify_material_request_changed();

-- Project assignment -> the assigned member.
create or replace function public.notify_project_member_assigned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project record;
begin
  if new.status <> 'active' then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' then
    return null;
  end if;
  if new.user_id = (select auth.uid()) then
    return null;
  end if;

  select p.name, p.project_code into v_project from public.projects p where p.id = new.project_id;

  perform public.notify_user(
    new.user_id,
    'New project assigned',
    format('You have been assigned to %s (%s) as %s.', v_project.name, v_project.project_code,
           public.humanize(new.member_role::text)),
    'project_assigned', 'project', new.project_id,
    '/projects/' || new.project_id::text,
    'project_assigned:' || new.id::text || ':' || extract(epoch from new.assigned_at)::bigint::text
  );
  return null;
end
$$;

create trigger notify_project_member_assigned
  after insert or update of status on public.project_members
  for each row execute function public.notify_project_member_assigned();

-- -----------------------------------------------------------------------------
-- project_documents: API inserts cannot forge metadata.
--   * storage_path must be "{project_id}/{category}/{file}" for the row's own
--     category (the project part is a CHECK constraint in 0002);
--   * created_at = now() and archived_at = null for API callers;
--   * when the storage object is visible, size and MIME type come from it, and
--     API callers can only register files that were actually uploaded.
-- -----------------------------------------------------------------------------
create or replace function public.normalize_project_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_api     boolean := (select auth.uid()) is not null;
  v_meta    jsonb;
  v_found   boolean := false;
  v_checked boolean := true;
begin
  new.file_name := btrim(new.file_name);

  if split_part(new.storage_path, '/', 2) is distinct from new.category::text
     or split_part(new.storage_path, '/', 3) = ''
     or split_part(new.storage_path, '/', 4) <> ''
     or position('..' in new.storage_path) > 0 then
    perform public.raise_app_error('VALIDATION', 'The file path does not match the document''s project and category.');
  end if;

  if v_api then
    new.created_at := pg_catalog.now();
    new.archived_at := null;
  end if;

  begin
    select o.metadata, true into v_meta, v_found
    from storage.objects o
    where o.bucket_id = 'project-documents' and o.name = new.storage_path;
  exception
    when undefined_table or insufficient_privilege then
      v_checked := false;
  end;

  if v_checked then
    if not coalesce(v_found, false) then
      if v_api then
        perform public.raise_app_error('VALIDATION', 'Upload the file before registering it.');
      end if;
    else
      if (v_meta ->> 'size') ~ '^[0-9]{1,15}$' then
        new.size_bytes := (v_meta ->> 'size')::bigint;
      end if;
      if nullif(btrim(coalesce(v_meta ->> 'mimetype', '')), '') is not null then
        new.mime_type := left(v_meta ->> 'mimetype', 255);
      end if;
    end if;
  end if;

  return new;
end
$$;

create trigger normalize_project_document before insert on public.project_documents
  for each row execute function public.normalize_project_document();

-- -----------------------------------------------------------------------------
-- Generic audit trail
-- -----------------------------------------------------------------------------
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor       uuid := (select auth.uid());
  v_actor_name  text;
  v_actor_role  public.app_role;
  v_label       text;
  v_old         jsonb;
  v_new         jsonb;
  v_row         jsonb;
  v_changed     text[];
  v_old_data    jsonb;
  v_new_data    jsonb;
  v_action      text := lower(tg_op);
  v_entity_id   uuid;
  v_project_id  uuid;
  v_request_id  uuid;
  v_request_code    text;
  v_request_project uuid;
  v_project_name    text;
  v_project_code    text;
  v_meta        jsonb := '{}'::jsonb;
  v_summary     text;
  v_fields      text;
  v_name        text;
  v_text        text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new);
  end if;
  v_row := coalesce(v_new, v_old);

  -- Only keep keys that actually changed; skip no-op updates.
  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key)
      into v_changed
    from jsonb_each(v_new) n
    where n.key not in ('updated_at', 'updated_by')
      and (v_old -> n.key) is distinct from n.value;

    if v_changed is null then
      return null;
    end if;

    select jsonb_object_agg(k, v_old -> k), jsonb_object_agg(k, v_new -> k)
      into v_old_data, v_new_data
    from unnest(v_changed) as k;

    v_fields := (select string_agg(replace(k, '_', ' '), ', ') from unnest(v_changed) as k);
  elsif tg_op = 'INSERT' then
    v_new_data := v_new;
  else
    v_old_data := v_old;
  end if;

  -- Noise filters ------------------------------------------------------------
  -- Derived cost refresh triggered by item changes (items are audited themselves).
  if tg_table_name = 'material_requests' and tg_op = 'UPDATE' and pg_trigger_depth() > 1
     and v_changed <@ array['actual_cost', 'approved_cost', 'estimated_cost',
                            'variance_estimated_cost', 'variance_actual_cost'] then
    return null;
  end if;
  -- Delivered quantity bookkeeping (deliveries are audited themselves).
  if tg_table_name = 'material_request_items' and tg_op = 'UPDATE'
     and v_changed <@ array['delivered_quantity'] then
    return null;
  end if;
  -- Approving a request copies estimates into approved costs (the status change is audited).
  if tg_table_name = 'material_request_items' and tg_op = 'UPDATE'
     and v_changed <@ array['approved_unit_cost'] then
    if exists (select 1 from public.material_requests r
               where r.id = (v_row ->> 'request_id')::uuid and r.approved_at = pg_catalog.now()) then
      return null;
    end if;
  end if;
  -- Project row refreshed by submit_project_update (the project_updates insert is audited).
  if tg_table_name = 'projects' and tg_op = 'UPDATE'
     and 'last_update_at' = any (v_changed)
     and (v_new ->> 'last_update_at')::timestamptz = pg_catalog.now() then
    return null;
  end if;
  -- Children created together with their parent in the same transaction.
  if tg_op = 'INSERT' and tg_table_name in ('project_milestones', 'project_financials') then
    if exists (select 1 from public.projects p
               where p.id = (v_row ->> 'project_id')::uuid and p.created_at = pg_catalog.now()) then
      return null;
    end if;
  end if;
  if tg_op = 'INSERT' and tg_table_name = 'material_request_items' then
    if exists (select 1 from public.material_requests r
               where r.id = (v_row ->> 'request_id')::uuid and r.created_at = pg_catalog.now()) then
      return null;
    end if;
  end if;

  -- Actor ----------------------------------------------------------------------
  select p.full_name, p.role into v_actor_name, v_actor_role
  from public.profiles p where p.id = v_actor;
  if v_actor is not null and v_actor_name is null then
    v_actor := null; -- unknown actor (e.g. profile being created right now)
  end if;
  v_label := coalesce(coalesce(public.humanize(v_actor_role::text) || ' ', '') || v_actor_name, 'System');

  -- Entity / project / request ---------------------------------------------------
  v_entity_id := case tg_table_name
    when 'project_financials' then (v_row ->> 'project_id')::uuid
    when 'company_settings' then null
    else (v_row ->> 'id')::uuid
  end;

  if tg_table_name = 'projects' then
    v_project_id := (v_row ->> 'id')::uuid;
  elsif v_row ? 'project_id' then
    v_project_id := (v_row ->> 'project_id')::uuid;
  end if;

  if tg_table_name = 'material_requests' then
    v_request_id := (v_row ->> 'id')::uuid;
  elsif tg_table_name in ('material_request_items', 'material_deliveries', 'material_request_comments') then
    v_request_id := (v_row ->> 'request_id')::uuid;
  end if;

  if v_request_id is not null then
    select r.request_code, r.project_id into v_request_code, v_request_project
    from public.material_requests r where r.id = v_request_id;
    v_request_code := coalesce(v_request_code, v_row ->> 'request_code');
    v_project_id := coalesce(v_project_id, v_request_project);
    v_meta := v_meta || jsonb_build_object(
      'request_id', v_request_id,
      'request_code', v_request_code
    );
  end if;

  if v_project_id is not null then
    select p.name, p.project_code into v_project_name, v_project_code
    from public.projects p where p.id = v_project_id;
    if v_project_code is not null then
      v_meta := v_meta || jsonb_build_object('project_code', v_project_code, 'project_name', v_project_name);
    end if;
  end if;

  -- Human summaries ---------------------------------------------------------------
  case tg_table_name
  when 'projects' then
    if tg_op = 'INSERT' then
      v_summary := format('%s created project %s (%s)', v_label, new.name, new.project_code);
    elsif tg_op = 'DELETE' then
      v_summary := format('%s deleted project %s (%s)', v_label, old.name, old.project_code);
    elsif 'archived_at' = any (v_changed) then
      v_action := case when new.archived_at is null then 'restore' else 'archive' end;
      v_summary := format('%s %s project %s (%s)', v_label,
                          case when new.archived_at is null then 'restored' else 'archived' end,
                          new.name, new.project_code);
    elsif 'progress_percentage' = any (v_changed) and 'status' = any (v_changed) then
      v_action := 'progress_update';
      v_summary := format('%s updated progress of %s from %s%% to %s%% and status from %s to %s',
                          v_label, new.name, public.format_qty(old.progress_percentage),
                          public.format_qty(new.progress_percentage),
                          public.humanize(old.status::text), public.humanize(new.status::text));
    elsif 'progress_percentage' = any (v_changed) then
      v_action := 'progress_update';
      v_summary := format('%s updated progress of %s from %s%% to %s%%', v_label, new.name,
                          public.format_qty(old.progress_percentage), public.format_qty(new.progress_percentage));
    elsif 'status' = any (v_changed) then
      v_action := 'status_change';
      v_summary := format('%s changed status of %s (%s) from %s to %s', v_label, new.name, new.project_code,
                          public.humanize(old.status::text), public.humanize(new.status::text));
    else
      v_summary := format('%s updated project %s (%s): %s', v_label, new.name, new.project_code, v_fields);
    end if;

  when 'project_financials' then
    if tg_op = 'INSERT' then
      v_summary := format('%s created the financial record of %s', v_label, coalesce(v_project_code, 'a project'));
    elsif tg_op = 'DELETE' then
      v_summary := format('Financial record of %s removed', coalesce(v_project_code, 'a project'));
    else
      v_text := null;
      if 'project_cost' = any (v_changed) then
        v_text := format('Project cost of %s changed from %s to %s', coalesce(v_project_code, 'project'),
                         public.format_inr(old.project_cost), public.format_inr(new.project_cost));
      end if;
      if 'advance_received' = any (v_changed) then
        v_text := concat_ws('; ', v_text,
                  format('Advance received for %s changed from %s to %s', coalesce(v_project_code, 'project'),
                         public.format_inr(old.advance_received), public.format_inr(new.advance_received)));
      end if;
      v_summary := coalesce(v_text, format('%s updated financial notes of %s', v_label, coalesce(v_project_code, 'a project')));
    end if;

  when 'project_members' then
    select coalesce(p.full_name, 'user') || coalesce(' (' || p.employee_id || ')', '')
      into v_name
    from public.profiles p where p.id = (v_row ->> 'user_id')::uuid;
    if tg_op = 'INSERT' then
      v_action := 'assign';
      v_summary := format('%s assigned %s (%s) to %s', v_label, v_project_name, v_project_code, v_name);
    elsif tg_op = 'DELETE' then
      v_summary := format('%s deleted the assignment of %s on %s', v_label, v_name, v_project_name);
    elsif 'status' = any (v_changed) then
      v_action := case when new.status = 'removed' then 'unassign' else 'assign' end;
      v_summary := case when new.status = 'removed'
        then format('%s removed %s from %s (%s)', v_label, v_name, v_project_name, v_project_code)
        else format('%s assigned %s (%s) to %s', v_label, v_project_name, v_project_code, v_name) end;
    elsif 'can_view_financials' = any (v_changed) then
      v_action := 'permission_change';
      v_summary := format('%s %s financial access on %s for %s', v_label,
                          case when new.can_view_financials then 'granted' else 'revoked' end,
                          v_project_name, v_name);
    else
      v_summary := format('%s updated the assignment of %s on %s', v_label, v_name, v_project_name);
    end if;

  when 'project_milestones' then
    if tg_op = 'INSERT' then
      v_summary := format('%s added milestone %s to %s', v_label, new.name, v_project_name);
    elsif tg_op = 'DELETE' then
      v_summary := format('%s removed milestone %s from %s', v_label, old.name, v_project_name);
    elsif 'status' = any (v_changed) then
      v_action := 'milestone_update';
      v_summary := format('%s marked milestone %s of %s as %s', v_label, new.name, v_project_name,
                          public.humanize(new.status::text));
    else
      v_action := 'milestone_update';
      v_summary := format('%s updated milestone %s of %s: %s', v_label, new.name, v_project_name, v_fields);
    end if;

  when 'project_updates' then
    v_action := 'progress_update';
    if tg_op = 'INSERT' then
      if new.progress_percentage is distinct from coalesce(new.previous_progress, 0)
         and new.status is distinct from new.previous_status and new.previous_status is not null then
        v_summary := format('%s updated progress of %s from %s%% to %s%% and status from %s to %s',
                            v_label, v_project_name, public.format_qty(coalesce(new.previous_progress, 0)),
                            public.format_qty(new.progress_percentage),
                            public.humanize(new.previous_status::text), public.humanize(new.status::text));
      elsif new.progress_percentage is distinct from coalesce(new.previous_progress, 0) then
        v_summary := format('%s updated progress of %s from %s%% to %s%%', v_label, v_project_name,
                            public.format_qty(coalesce(new.previous_progress, 0)), public.format_qty(new.progress_percentage));
      elsif new.status is distinct from new.previous_status and new.previous_status is not null then
        v_summary := format('%s changed status of %s from %s to %s', v_label, v_project_name,
                            public.humanize(new.previous_status::text), public.humanize(new.status::text));
      else
        v_summary := format('%s posted a site update on %s (%s%%)', v_label, v_project_name,
                            public.format_qty(new.progress_percentage));
      end if;
    else
      v_summary := format('%s changed a site update of %s', v_label, v_project_name);
    end if;

  when 'project_documents' then
    if tg_op = 'INSERT' then
      v_summary := format('%s uploaded %s (%s) to %s', v_label, new.file_name,
                          public.humanize(new.category::text), v_project_name);
    elsif tg_op = 'DELETE' then
      v_summary := format('%s deleted document %s from %s', v_label, old.file_name, v_project_name);
    elsif 'archived_at' = any (v_changed) then
      v_action := case when new.archived_at is null then 'restore' else 'archive' end;
      v_summary := format('%s %s document %s of %s', v_label,
                          case when new.archived_at is null then 'restored' else 'archived' end,
                          new.file_name, v_project_name);
    else
      v_summary := format('%s updated document %s of %s', v_label, new.file_name, v_project_name);
    end if;

  when 'clients' then
    if tg_op = 'INSERT' then
      v_summary := format('%s added client %s (%s)', v_label, new.name, new.client_code);
    elsif tg_op = 'DELETE' then
      v_summary := format('%s deleted client %s (%s)', v_label, old.name, old.client_code);
    elsif 'archived_at' = any (v_changed) then
      v_action := case when new.archived_at is null then 'restore' else 'archive' end;
      v_summary := format('%s %s client %s (%s)', v_label,
                          case when new.archived_at is null then 'restored' else 'archived' end,
                          new.name, new.client_code);
    else
      v_summary := format('%s updated client %s (%s): %s', v_label, new.name, new.client_code, v_fields);
    end if;

  when 'material_requests' then
    if tg_op = 'INSERT' then
      v_summary := format('%s created material request %s for %s%s', v_label, new.request_code,
                          coalesce(v_project_name, 'a project'),
                          case when new.priority in ('high', 'urgent')
                               then ' (' || public.humanize(new.priority::text) || ' priority)' else '' end);
    elsif tg_op = 'DELETE' then
      v_summary := format('%s deleted material request %s', v_label, old.request_code);
    elsif 'status' = any (v_changed) then
      v_action := 'status_change';
      v_summary := format('%s status changed from %s to %s by %s', new.request_code,
                          public.humanize(old.status::text), public.humanize(new.status::text), v_label);
      if 'assigned_admin' = any (v_changed) and new.assigned_admin is not null then
        select p.full_name into v_name from public.profiles p where p.id = new.assigned_admin;
        v_summary := v_summary || format(' (assigned to %s)', v_name);
      end if;
    elsif 'assigned_admin' = any (v_changed) then
      v_action := 'assign';
      if new.assigned_admin is null then
        v_summary := format('%s unassigned %s', v_label, new.request_code);
      elsif new.assigned_admin = v_actor then
        v_summary := format('%s claimed %s', v_label, new.request_code);
      else
        select p.full_name || coalesce(' (' || p.employee_id || ')', '') into v_name
        from public.profiles p where p.id = new.assigned_admin;
        v_summary := format('%s assigned %s to %s', v_label, new.request_code, v_name);
      end if;
    elsif 'archived_at' = any (v_changed) then
      v_action := case when new.archived_at is null then 'restore' else 'archive' end;
      v_summary := format('%s %s %s', v_label,
                          case when new.archived_at is null then 'restored' else 'archived' end, new.request_code);
    elsif v_changed <@ array['expected_delivery_date'] then
      v_action := 'delivery_date_change';
      v_summary := format('%s changed the expected delivery of %s from %s to %s', v_label, new.request_code,
                          coalesce(to_char(old.expected_delivery_date, 'DD Mon YYYY'), 'not set'),
                          coalesce(to_char(new.expected_delivery_date, 'DD Mon YYYY'), 'not set'));
    else
      v_summary := format('%s updated %s: %s', v_label, new.request_code, v_fields);
    end if;

  when 'material_request_items' then
    if tg_op = 'INSERT' then
      v_summary := format('%s added %s %s %s to %s', v_label, new.material_name, public.format_qty(new.quantity),
                          new.unit, coalesce(v_request_code, 'a request'));
    elsif tg_op = 'DELETE' then
      v_summary := format('%s removed %s from %s', v_label, old.material_name, coalesce(v_request_code, 'a request'));
    elsif v_changed && array['estimated_unit_cost', 'approved_unit_cost', 'actual_unit_cost'] then
      v_action := 'cost_update';
      v_summary := format('%s updated costs of %s on %s', v_label, new.material_name,
                          coalesce(v_request_code, 'a request'));
    else
      v_summary := format('%s updated %s on %s: %s', v_label, new.material_name,
                          coalesce(v_request_code, 'a request'), v_fields);
    end if;

  when 'material_deliveries' then
    select i.material_name || ' ' || public.format_qty((v_row ->> 'delivered_quantity')::numeric) || ' ' || i.unit
      into v_text
    from public.material_request_items i where i.id = (v_row ->> 'item_id')::uuid;
    v_action := 'delivery';
    v_summary := format('%s recorded delivery of %s for %s', v_label, coalesce(v_text, 'material'),
                        coalesce(v_request_code, 'a request'));

  when 'material_request_comments' then
    v_action := case tg_op when 'INSERT' then 'comment' else v_action end;
    v_summary := format('%s %s a note on %s', v_label,
                        case tg_op when 'INSERT' then 'added' when 'DELETE' then 'deleted' else 'edited' end,
                        coalesce(v_request_code, 'a request'));

  when 'materials' then
    if tg_op = 'INSERT' then
      v_summary := format('%s added %s to the materials catalog', v_label, new.name);
    elsif tg_op = 'DELETE' then
      v_summary := format('%s deleted %s from the materials catalog', v_label, old.name);
    elsif 'is_active' = any (v_changed) then
      v_summary := format('%s %s catalog material %s', v_label,
                          case when new.is_active then 'reactivated' else 'deactivated' end, new.name);
    else
      v_summary := format('%s updated catalog material %s: %s', v_label, new.name, v_fields);
    end if;

  when 'material_categories' then
    if tg_op = 'INSERT' then
      v_summary := format('%s added material category %s', v_label, new.name);
    elsif tg_op = 'DELETE' then
      v_summary := format('%s deleted material category %s', v_label, old.name);
    else
      v_summary := format('%s updated material category %s: %s', v_label, new.name, v_fields);
    end if;

  when 'company_settings' then
    v_summary := format('%s updated company settings: %s', v_label, coalesce(v_fields, 'created'));

  when 'profiles' then
    if tg_op = 'INSERT' then
      v_summary := format('User account created for %s (%s)', new.full_name,
                          coalesce(public.humanize(new.role::text), 'no role'));
    elsif tg_op = 'DELETE' then
      v_summary := format('User account of %s deleted', old.full_name);
    elsif 'status' = any (v_changed) then
      v_action := case when new.status = 'inactive' then 'deactivate' else 'activate' end;
      v_summary := format('%s %s %s %s', v_label,
                          case when new.status = 'inactive' then 'deactivated' else 'reactivated' end,
                          coalesce(public.humanize(new.role::text), 'user'), new.full_name);
    elsif 'role' = any (v_changed) then
      v_action := 'role_change';
      v_summary := format('%s changed role of %s from %s to %s', v_label, new.full_name,
                          coalesce(public.humanize(old.role::text), 'no role'),
                          coalesce(public.humanize(new.role::text), 'no role'));
    elsif new.id = v_actor then
      v_summary := format('%s updated their profile: %s', v_label, v_fields);
    else
      v_summary := format('%s updated profile of %s: %s', v_label, new.full_name, v_fields);
    end if;

  else
    v_summary := format('%s %s %s', v_label, v_action, tg_table_name);
  end case;

  insert into public.audit_logs (
    user_id, actor_name, role, action, entity_type, entity_id, project_id,
    summary, old_data, new_data, metadata
  ) values (
    v_actor, coalesce(v_actor_name, 'System'), v_actor_role, v_action, tg_table_name, v_entity_id,
    case when tg_op = 'DELETE' and tg_table_name = 'projects' then null else v_project_id end,
    v_summary, v_old_data, v_new_data, v_meta
  );

  return null;
end
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'clients', 'projects', 'project_financials', 'project_members', 'project_milestones',
    'project_updates', 'project_documents', 'material_requests', 'material_request_items',
    'material_deliveries', 'material_request_comments', 'materials', 'material_categories',
    'company_settings', 'profiles'
  ] loop
    execute format(
      'create trigger audit_row_change after insert or update or delete on public.%I
         for each row execute function public.audit_row_change()',
      v_table
    );
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- audit_logs is append-only for everyone (including the service role).
-- -----------------------------------------------------------------------------
create or replace function public.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'NOT_AUTHORIZED: Audit logs are append-only.';
end
$$;

create trigger prevent_audit_update_delete
  before update or delete on public.audit_logs
  for each row execute function public.prevent_audit_mutation();

create trigger prevent_audit_truncate
  before truncate on public.audit_logs
  for each statement execute function public.prevent_audit_mutation();

-- project_updates is history: no updates or deletes from API roles.
create or replace function public.prevent_project_update_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    -- allow cascades when a project itself is deleted by the database owner
    return old;
  end if;
  raise exception using errcode = 'P0001', message = 'NOT_AUTHORIZED: Project update history cannot be changed.';
end
$$;

create trigger prevent_project_update_mutation
  before update or delete on public.project_updates
  for each row execute function public.prevent_project_update_mutation();

-- -----------------------------------------------------------------------------
-- Internal functions are not callable through the API.
-- -----------------------------------------------------------------------------
revoke all on function public.raise_app_error(text, text) from public, anon, authenticated;
revoke all on function public.humanize(text) from public, anon, authenticated;
revoke all on function public.format_inr(numeric) from public, anon, authenticated;
revoke all on function public.format_qty(numeric) from public, anon, authenticated;
revoke all on function public.notify_user(uuid, text, text, text, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.refresh_material_request_totals(uuid) from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.set_updated_by() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_user_email_change() from public, anon, authenticated;
revoke all on function public.guard_auth_email_change() from public, anon, authenticated;
revoke all on function public.maintain_project_dates() from public, anon, authenticated;
revoke all on function public.set_material_request_assigned_at() from public, anon, authenticated;
revoke all on function public.normalize_project_document() from public, anon, authenticated;
revoke all on function public.normalize_profile() from public, anon, authenticated;
revoke all on function public.protect_profile_fields() from public, anon, authenticated;
revoke all on function public.handle_new_project() from public, anon, authenticated;
revoke all on function public.set_material_request_client() from public, anon, authenticated;
revoke all on function public.sync_material_request_totals() from public, anon, authenticated;
revoke all on function public.notify_material_request_created() from public, anon, authenticated;
revoke all on function public.notify_material_request_changed() from public, anon, authenticated;
revoke all on function public.notify_project_member_assigned() from public, anon, authenticated;
revoke all on function public.audit_row_change() from public, anon, authenticated;
revoke all on function public.prevent_audit_mutation() from public, anon, authenticated;
revoke all on function public.prevent_project_update_mutation() from public, anon, authenticated;
