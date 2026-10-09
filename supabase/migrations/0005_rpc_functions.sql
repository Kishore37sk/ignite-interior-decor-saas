-- =============================================================================
-- 0005_rpc_functions.sql
-- Ignite Interior Decor: RPC functions (supabase.rpc). Every function is
-- SECURITY DEFINER with an empty search_path, validates auth.uid() and the
-- caller's role itself, and raises "<CODE>: <message>" (errcode P0001) where
-- CODE is one of NOT_AUTHORIZED, NOT_FOUND, INVALID_TRANSITION, VALIDATION,
-- DUPLICATE_REQUEST, PROJECT_CLOSED, INACTIVE_USER.
-- Audit rows are written by the row triggers from 0004.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Internal helpers (not callable through the API)
-- -----------------------------------------------------------------------------
create or replace function public.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return nullif(btrim(coalesce(p_value, '')), '')::uuid;
exception
  when invalid_text_representation then
    return null;
end
$$;

-- Percent-encodes a value for use in a URL query string (RFC 3986 unreserved
-- characters are kept, everything else is %XX-encoded as UTF-8).
create or replace function public.url_encode(p_value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_bytes bytea := convert_to(coalesce(p_value, ''), 'UTF8');
  v_out   text := '';
  v_b     integer;
begin
  for v_i in 0 .. length(v_bytes) - 1 loop
    v_b := get_byte(v_bytes, v_i);
    if v_b between 48 and 57 or v_b between 65 and 90 or v_b between 97 and 122 or v_b in (45, 46, 95, 126) then
      v_out := v_out || chr(v_b);
    else
      v_out := v_out || '%' || upper(lpad(to_hex(v_b), 2, '0'));
    end if;
  end loop;
  return v_out;
end
$$;

-- Returns the caller's role or raises NOT_AUTHORIZED / INACTIVE_USER.
create or replace function public.require_active_role()
returns public.app_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_role   public.app_role;
  v_status public.user_status;
begin
  if v_uid is null then
    perform public.raise_app_error('NOT_AUTHORIZED', 'You must be signed in.');
  end if;

  select p.role, p.status into v_role, v_status
  from public.profiles p
  where p.id = v_uid;

  if not found then
    perform public.raise_app_error('NOT_AUTHORIZED', 'No profile is linked to this account.');
  end if;
  -- Role-less accounts (created inactive by handle_new_user) were never given access.
  if v_role is null then
    perform public.raise_app_error('NOT_AUTHORIZED', 'Your account has not been given access yet.');
  end if;
  if v_status <> 'active' then
    perform public.raise_app_error('INACTIVE_USER', 'Your account has been deactivated.');
  end if;

  return v_role;
end
$$;

-- Validates and writes request items; returns the number of items in p_items.
-- p_replace = false: every entry is inserted (new request).
-- p_replace = true (draft edit): the request's item list becomes p_items.
--   An entry that names an existing item ("id"), or otherwise matches a not
--   yet matched existing item with the same material name and unit, UPDATES
--   that item in place, so approved/actual unit costs and delivered quantity
--   entered by an admin are kept. Other entries are inserted; existing items
--   that are not matched are deleted.
create or replace function public.insert_request_items(p_request_id uuid, p_items jsonb, p_replace boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing     uuid[] := '{}';
  v_kept         uuid[] := '{}';
  v_target       uuid;
  v_item         jsonb;
  v_index        integer := 0;
  v_material_id  uuid;
  v_name         text;
  v_category     text;
  v_unit         text;
  v_qty          numeric;
  v_cost         numeric;
  v_notes        text;
  v_cat_name     text;
  v_cat_unit     text;
  v_cat_category text;
  v_cat_active   boolean;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    perform public.raise_app_error('VALIDATION', 'Add at least one material item.');
  end if;
  if jsonb_array_length(p_items) > 100 then
    perform public.raise_app_error('VALIDATION', 'A request can contain at most 100 items.');
  end if;

  if coalesce(p_replace, false) then
    select coalesce(array_agg(i.id), '{}') into v_existing
    from public.material_request_items i
    where i.request_id = p_request_id;
  end if;

  for v_item in select e.value from jsonb_array_elements(p_items) as e loop
    v_index := v_index + 1;

    if jsonb_typeof(v_item) <> 'object' then
      perform public.raise_app_error('VALIDATION', format('Item %s is invalid.', v_index));
    end if;

    if (v_item ->> 'material_id') is not null and btrim(v_item ->> 'material_id') <> '' then
      v_material_id := public.try_uuid(v_item ->> 'material_id');
      if v_material_id is null then
        perform public.raise_app_error('VALIDATION', format('Item %s has an invalid catalog reference.', v_index));
      end if;
    else
      v_material_id := null;
    end if;

    begin
      v_qty  := nullif(btrim(coalesce(v_item ->> 'quantity', '')), '')::numeric;
      v_cost := nullif(btrim(coalesce(v_item ->> 'estimated_unit_cost', '')), '')::numeric;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        perform public.raise_app_error('VALIDATION', format('Item %s has an invalid quantity or cost.', v_index));
    end;

    v_name     := nullif(btrim(coalesce(v_item ->> 'material_name', '')), '');
    v_unit     := nullif(btrim(coalesce(v_item ->> 'unit', '')), '');
    v_category := nullif(btrim(coalesce(v_item ->> 'category', '')), '');
    v_notes    := nullif(btrim(coalesce(v_item ->> 'notes', '')), '');

    if v_material_id is not null then
      select m.name, m.unit, m.category, m.is_active
        into v_cat_name, v_cat_unit, v_cat_category, v_cat_active
      from public.materials m
      where m.id = v_material_id;

      if not found or not v_cat_active then
        perform public.raise_app_error('VALIDATION', format('Item %s refers to an unknown or inactive catalog material.', v_index));
      end if;
      v_name     := coalesce(v_name, v_cat_name);
      v_unit     := coalesce(v_unit, v_cat_unit);
      v_category := coalesce(v_category, v_cat_category);
    end if;

    if v_name is null or length(v_name) > 160 then
      perform public.raise_app_error('VALIDATION', format('Item %s needs a material name (max 160 characters).', v_index));
    end if;
    if v_unit is null or length(v_unit) > 32 then
      perform public.raise_app_error('VALIDATION', format('Item %s needs a unit (max 32 characters).', v_index));
    end if;
    if v_qty is null or v_qty <= 0 or v_qty >= 10000000000 then
      perform public.raise_app_error('VALIDATION', format('Item %s needs a quantity greater than zero.', v_index));
    end if;
    if v_cost is not null and (v_cost < 0 or v_cost >= 10000000000) then
      perform public.raise_app_error('VALIDATION', format('Item %s has an invalid estimated unit cost.', v_index));
    end if;
    if v_category is not null and length(v_category) > 80 then
      perform public.raise_app_error('VALIDATION', format('Item %s has a category longer than 80 characters.', v_index));
    end if;
    if v_notes is not null and length(v_notes) > 500 then
      perform public.raise_app_error('VALIDATION', format('Item %s notes can be at most 500 characters.', v_index));
    end if;

    v_target := null;
    if coalesce(p_replace, false) then
      if nullif(btrim(coalesce(v_item ->> 'id', '')), '') is not null then
        v_target := public.try_uuid(v_item ->> 'id');
        if v_target is null or not (v_target = any (v_existing)) or v_target = any (v_kept) then
          perform public.raise_app_error('VALIDATION', format('Item %s is not part of this request.', v_index));
        end if;
      else
        select i.id into v_target
        from public.material_request_items i
        where i.id = any (v_existing)
          and not (i.id = any (v_kept))
          and lower(btrim(i.material_name)) = lower(v_name)
          and lower(btrim(i.unit)) = lower(v_unit)
        order by i.created_at, i.id
        limit 1;
      end if;
    end if;

    if v_target is not null then
      update public.material_request_items i
         set material_id         = v_material_id,
             material_name       = v_name,
             category            = v_category,
             quantity            = round(v_qty, 2),
             unit                = v_unit,
             estimated_unit_cost = round(v_cost, 2),
             notes               = v_notes
       where i.id = v_target;
      v_kept := v_kept || v_target;
    else
      insert into public.material_request_items (
        request_id, material_id, material_name, category, quantity, unit, estimated_unit_cost, notes
      ) values (
        p_request_id, v_material_id, v_name, v_category, round(v_qty, 2), v_unit, round(v_cost, 2), v_notes
      );
    end if;
  end loop;

  if coalesce(p_replace, false) then
    delete from public.material_request_items i
     where i.request_id = p_request_id
       and i.id = any (v_existing)
       and not (i.id = any (v_kept));
  end if;

  return v_index;
end
$$;

-- -----------------------------------------------------------------------------
-- create_material_request
-- -----------------------------------------------------------------------------
create or replace function public.create_material_request(
  p_project_id      uuid,
  p_title           text,
  p_required_date   date,
  p_priority        public.priority_level,
  p_notes           text,
  p_items           jsonb,
  p_allow_duplicate boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid             uuid := (select auth.uid());
  v_role            public.app_role := public.require_active_role();
  v_title           text := nullif(btrim(coalesce(p_title, '')), '');
  v_status          public.project_status;
  v_archived        timestamptz;
  v_client_archived timestamptz;
  v_dup_code        text;
  v_dup_name        text;
  v_id              uuid;
begin
  if v_role not in ('owner', 'site_manager') then
    perform public.raise_app_error('NOT_AUTHORIZED', 'Only site managers and the owner can raise material requests.');
  end if;
  if v_role = 'site_manager' and not public.is_project_member(p_project_id, 'site_manager') then
    perform public.raise_app_error('NOT_AUTHORIZED', 'You are not assigned to this project.');
  end if;

  select p.status, p.archived_at, c.archived_at
    into v_status, v_archived, v_client_archived
  from public.projects p
  join public.clients c on c.id = p.client_id
  where p.id = p_project_id
  for share of p;

  if not found then
    perform public.raise_app_error('NOT_FOUND', 'Project not found.');
  end if;
  if v_archived is not null or v_client_archived is not null or v_status in ('completed', 'cancelled') then
    perform public.raise_app_error('PROJECT_CLOSED', 'Material requests cannot be raised for a closed or archived project.');
  end if;

  if v_title is null or length(v_title) > 200 then
    perform public.raise_app_error('VALIDATION', 'A title of up to 200 characters is required.');
  end if;
  if p_required_date is null then
    perform public.raise_app_error('VALIDATION', 'Required date is required.');
  end if;
  if p_required_date < public.app_today() then
    perform public.raise_app_error('VALIDATION', 'Required date cannot be in the past.');
  end if;
  if length(btrim(coalesce(p_notes, ''))) > 2000 then
    perform public.raise_app_error('VALIDATION', 'Notes can be at most 2000 characters.');
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    perform public.raise_app_error('VALIDATION', 'Add at least one material item.');
  end if;

  -- Duplicate = same project + same material (case-insensitive) on a request
  -- that is still open and was created in the last 7 days.
  if not coalesce(p_allow_duplicate, false) then
    select r.request_code, i.material_name
      into v_dup_code, v_dup_name
    from public.material_requests r
    join public.material_request_items i on i.request_id = r.id
    where r.project_id = p_project_id
      and r.archived_at is null
      and r.status not in ('delivered', 'rejected', 'cancelled')
      and r.created_at >= pg_catalog.now() - interval '7 days'
      and lower(btrim(i.material_name)) in (
        select lower(btrim(coalesce(nullif(btrim(e.value ->> 'material_name'), ''), m.name)))
        from jsonb_array_elements(p_items) as e
        left join public.materials m on m.id = public.try_uuid(e.value ->> 'material_id')
      )
    order by r.created_at desc
    limit 1;

    if v_dup_code is not null then
      perform public.raise_app_error(
        'DUPLICATE_REQUEST',
        format('%s already requests %s for this project. Submit again to create a separate request anyway.', v_dup_code, v_dup_name)
      );
    end if;
  end if;

  insert into public.material_requests (project_id, requested_by, title, required_date, priority, notes)
  values (p_project_id, v_uid, v_title, p_required_date, coalesce(p_priority, 'medium'),
          nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_id;

  perform public.insert_request_items(v_id, p_items);

  return v_id;
end
$$;

-- -----------------------------------------------------------------------------
-- update_material_request_draft
-- -----------------------------------------------------------------------------
create or replace function public.update_material_request_draft(
  p_request_id    uuid,
  p_title         text,
  p_required_date date,
  p_priority      public.priority_level,
  p_notes         text,
  p_items         jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid             uuid := (select auth.uid());
  v_role            public.app_role := public.require_active_role();
  v_req             public.material_requests%rowtype;
  v_title           text := nullif(btrim(coalesce(p_title, '')), '');
  v_status          public.project_status;
  v_archived        timestamptz;
  v_client_archived timestamptz;
begin
  select * into v_req from public.material_requests r where r.id = p_request_id for update;
  if not found then
    perform public.raise_app_error('NOT_FOUND', 'Material request not found.');
  end if;
  if not public.can_access_material_request(p_request_id) then
    perform public.raise_app_error('NOT_AUTHORIZED', 'You do not have access to this material request.');
  end if;
  if not (
    v_role = 'owner'
    or (v_role = 'site_manager' and v_req.requested_by = v_uid
        and public.is_project_member(v_req.project_id, 'site_manager'))
  ) then
    perform public.raise_app_error('NOT_AUTHORIZED', 'Only the requester or the owner can edit this request.');
  end if;
  if v_req.status not in ('requested', 'pending_review') then
    perform public.raise_app_error('INVALID_TRANSITION', 'Only requests awaiting review can be edited.');
  end if;

  select p.status, p.archived_at, c.archived_at into v_status, v_archived, v_client_archived
  from public.projects p join public.clients c on c.id = p.client_id
  where p.id = v_req.project_id;
  if v_archived is not null or v_client_archived is not null or v_status in ('completed', 'cancelled') then
    perform public.raise_app_error('PROJECT_CLOSED', 'This project is closed or archived.');
  end if;

  if v_title is null or length(v_title) > 200 then
    perform public.raise_app_error('VALIDATION', 'A title of up to 200 characters is required.');
  end if;
  if p_required_date is null then
    perform public.raise_app_error('VALIDATION', 'Required date is required.');
  end if;
  if p_required_date < public.app_today() and p_required_date is distinct from v_req.required_date then
    perform public.raise_app_error('VALIDATION', 'Required date cannot be in the past.');
  end if;
  if length(btrim(coalesce(p_notes, ''))) > 2000 then
    perform public.raise_app_error('VALIDATION', 'Notes can be at most 2000 characters.');
  end if;

  update public.material_requests r
     set title         = v_title,
         required_date = p_required_date,
         priority      = coalesce(p_priority, r.priority),
         notes         = nullif(btrim(coalesce(p_notes, '')), '')
   where r.id = p_request_id;

  -- Kept items are updated in place (admin-entered costs survive the edit).
  perform public.insert_request_items(p_request_id, p_items, true);
end
$$;

-- -----------------------------------------------------------------------------
-- update_material_request_status
-- -----------------------------------------------------------------------------
create or replace function public.update_material_request_status(
  p_request_id             uuid,
  p_status                 public.material_request_status,
  p_note                   text default null,
  p_expected_delivery_date date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_role    public.app_role := public.require_active_role();
  v_req     public.material_requests%rowtype;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_allowed boolean;
begin
  if p_status is null then
    perform public.raise_app_error('VALIDATION', 'A target status is required.');
  end if;

  select * into v_req from public.material_requests r where r.id = p_request_id for update;
  if not found then
    perform public.raise_app_error('NOT_FOUND', 'Material request not found.');
  end if;
  if not public.can_access_material_request(p_request_id) then
    perform public.raise_app_error('NOT_AUTHORIZED', 'You do not have access to this material request.');
  end if;

  -- Deliveries are recorded item by item (record_material_delivery) so the
  -- delivery history, delivered quantities and delivery dates stay consistent.
  if p_status in ('partially_delivered', 'delivered') then
    perform public.raise_app_error('INVALID_TRANSITION',
      format('Record deliveries for %s with the delivery form instead of changing its status.', v_req.request_code));
  end if;

  v_allowed := case v_req.status
    when 'requested'      then p_status in ('pending_review', 'approved', 'rejected', 'cancelled')
    when 'pending_review' then p_status in ('approved', 'rejected', 'cancelled')
    when 'approved'       then p_status in ('ordered', 'cancelled')
    when 'ordered'        then p_status in ('cancelled')
    else false
  end;
  if not v_allowed then
    perform public.raise_app_error(
      'INVALID_TRANSITION',
      format('%s cannot move from %s to %s.', v_req.request_code,
             public.humanize(v_req.status::text), public.humanize(p_status::text))
    );
  end if;

  if v_role = 'site_manager' then
    if not (p_status = 'cancelled' and v_req.requested_by = v_uid
            and v_req.status in ('requested', 'pending_review')) then
      perform public.raise_app_error('NOT_AUTHORIZED', 'Site managers can only cancel their own requests before they are approved.');
    end if;
  elsif v_role not in ('owner', 'admin') then
    perform public.raise_app_error('NOT_AUTHORIZED', 'You cannot change the status of this request.');
  end if;

  if p_status = 'rejected' and v_note is null then
    perform public.raise_app_error('VALIDATION', 'A reason is required to reject a request.');
  end if;
  if v_note is not null and length(v_note) > 2000 then
    perform public.raise_app_error('VALIDATION', 'Notes can be at most 2000 characters.');
  end if;
  if p_expected_delivery_date is not null
     and p_expected_delivery_date < (v_req.requested_at at time zone 'Asia/Kolkata')::date then
    perform public.raise_app_error('VALIDATION', 'Expected delivery date cannot be before the request date.');
  end if;

  update public.material_requests r
     set status = p_status,
         assigned_admin = case when v_role = 'admin' and r.assigned_admin is null then v_uid else r.assigned_admin end,
         reviewed_at = case when p_status in ('pending_review', 'approved', 'rejected')
                            then coalesce(r.reviewed_at, pg_catalog.now()) else r.reviewed_at end,
         approved_at = case when p_status = 'approved' then pg_catalog.now() else r.approved_at end,
         rejected_at = case when p_status = 'rejected' then pg_catalog.now() else r.rejected_at end,
         rejection_reason = case when p_status = 'rejected' then v_note else r.rejection_reason end,
         ordered_at = case when p_status = 'ordered' then pg_catalog.now() else r.ordered_at end,
         expected_delivery_date = coalesce(p_expected_delivery_date, r.expected_delivery_date),
         cancelled_at = case when p_status = 'cancelled' then pg_catalog.now() else r.cancelled_at end
   where r.id = p_request_id;

  -- Approving without explicit approved costs approves the estimates.
  if p_status = 'approved' then
    update public.material_request_items i
       set approved_unit_cost = i.estimated_unit_cost
     where i.request_id = p_request_id
       and i.approved_unit_cost is null
       and i.estimated_unit_cost is not null;
  end if;

  if v_note is not null and p_status <> 'rejected' then
    insert into public.material_request_comments (request_id, author_id, body)
    values (p_request_id, v_uid, left(public.humanize(p_status::text) || ': ' || v_note, 2000));
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- update_material_request_costs
-- -----------------------------------------------------------------------------
create or replace function public.update_material_request_costs(p_request_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role    public.app_role := public.require_active_role();
  v_req     public.material_requests%rowtype;
  v_item    jsonb;
  v_index   integer := 0;
  v_item_id uuid;
  v_est     numeric;
  v_app     numeric;
  v_act     numeric;
begin
  if v_role not in ('owner', 'admin') then
    perform public.raise_app_error('NOT_AUTHORIZED', 'Only admins and the owner can update material costs.');
  end if;

  select * into v_req from public.material_requests r where r.id = p_request_id for update;
  if not found then
    perform public.raise_app_error('NOT_FOUND', 'Material request not found.');
  end if;
  if not public.can_access_material_request(p_request_id) then
    perform public.raise_app_error('NOT_AUTHORIZED', 'You do not have access to this material request.');
  end if;
  if v_req.status in ('rejected', 'cancelled') then
    perform public.raise_app_error('INVALID_TRANSITION', 'Costs cannot be changed on a rejected or cancelled request.');
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    perform public.raise_app_error('VALIDATION', 'Provide at least one item cost.');
  end if;

  for v_item in select e.value from jsonb_array_elements(p_items) as e loop
    v_index := v_index + 1;
    if jsonb_typeof(v_item) <> 'object' then
      perform public.raise_app_error('VALIDATION', format('Cost entry %s is invalid.', v_index));
    end if;

    v_item_id := public.try_uuid(v_item ->> 'item_id');
    if v_item_id is null or not exists (
      select 1 from public.material_request_items i where i.id = v_item_id and i.request_id = p_request_id
    ) then
      perform public.raise_app_error('VALIDATION', format('Cost entry %s does not belong to this request.', v_index));
    end if;

    begin
      v_est := nullif(btrim(coalesce(v_item ->> 'estimated_unit_cost', '')), '')::numeric;
      v_app := nullif(btrim(coalesce(v_item ->> 'approved_unit_cost', '')), '')::numeric;
      v_act := nullif(btrim(coalesce(v_item ->> 'actual_unit_cost', '')), '')::numeric;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        perform public.raise_app_error('VALIDATION', format('Cost entry %s has an invalid amount.', v_index));
    end;

    if (v_est is not null and (v_est < 0 or v_est >= 10000000000))
       or (v_app is not null and (v_app < 0 or v_app >= 10000000000))
       or (v_act is not null and (v_act < 0 or v_act >= 10000000000)) then
      perform public.raise_app_error('VALIDATION', format('Cost entry %s must be zero or more.', v_index));
    end if;

    update public.material_request_items i
       set estimated_unit_cost = case when v_item ? 'estimated_unit_cost' then round(v_est, 2) else i.estimated_unit_cost end,
           approved_unit_cost  = case when v_item ? 'approved_unit_cost' then round(v_app, 2) else i.approved_unit_cost end,
           actual_unit_cost    = case when v_item ? 'actual_unit_cost' then round(v_act, 2) else i.actual_unit_cost end
     where i.id = v_item_id;
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- record_material_delivery
-- -----------------------------------------------------------------------------
create or replace function public.record_material_delivery(
  p_request_id    uuid,
  p_delivery_date date,
  p_items         jsonb,
  p_notes         text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_role      public.app_role := public.require_active_role();
  v_req       public.material_requests%rowtype;
  v_item      jsonb;
  v_index     integer := 0;
  v_item_id   uuid;
  v_qty       numeric;
  v_remaining numeric;
  v_name      text;
  v_unit      text;
  v_all       boolean;
  v_notes     text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if v_role not in ('owner', 'admin') then
    perform public.raise_app_error('NOT_AUTHORIZED', 'Only admins and the owner can record deliveries.');
  end if;

  select * into v_req from public.material_requests r where r.id = p_request_id for update;
  if not found then
    perform public.raise_app_error('NOT_FOUND', 'Material request not found.');
  end if;
  if not public.can_access_material_request(p_request_id) then
    perform public.raise_app_error('NOT_AUTHORIZED', 'You do not have access to this material request.');
  end if;
  if v_req.status not in ('approved', 'ordered', 'partially_delivered') then
    perform public.raise_app_error('INVALID_TRANSITION',
      format('Deliveries can only be recorded for approved or ordered requests (%s is %s).',
             v_req.request_code, public.humanize(v_req.status::text)));
  end if;
  if p_delivery_date is null then
    perform public.raise_app_error('VALIDATION', 'Delivery date is required.');
  end if;
  if p_delivery_date > public.app_today() then
    perform public.raise_app_error('VALIDATION', 'Delivery date cannot be in the future.');
  end if;
  if p_delivery_date < (v_req.requested_at at time zone 'Asia/Kolkata')::date then
    perform public.raise_app_error('VALIDATION', 'Delivery date cannot be before the request date.');
  end if;
  if v_notes is not null and length(v_notes) > 2000 then
    perform public.raise_app_error('VALIDATION', 'Delivery notes can be at most 2000 characters.');
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    perform public.raise_app_error('VALIDATION', 'Record at least one delivered item.');
  end if;

  for v_item in select e.value from jsonb_array_elements(p_items) as e loop
    v_index := v_index + 1;
    v_item_id := public.try_uuid(v_item ->> 'item_id');

    begin
      v_qty := nullif(btrim(coalesce(v_item ->> 'delivered_quantity', '')), '')::numeric;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        perform public.raise_app_error('VALIDATION', format('Delivery entry %s has an invalid quantity.', v_index));
    end;

    select i.quantity - i.delivered_quantity, i.material_name, i.unit
      into v_remaining, v_name, v_unit
    from public.material_request_items i
    where i.id = v_item_id and i.request_id = p_request_id
    for update;

    if not found then
      perform public.raise_app_error('VALIDATION', format('Delivery entry %s does not belong to this request.', v_index));
    end if;
    if v_qty is null or v_qty <= 0 then
      perform public.raise_app_error('VALIDATION', format('Delivered quantity for %s must be greater than zero.', v_name));
    end if;
    if v_qty > v_remaining then
      perform public.raise_app_error('VALIDATION',
        format('Delivered quantity for %s exceeds the remaining %s %s.', v_name, public.format_qty(v_remaining), v_unit));
    end if;

    insert into public.material_deliveries (request_id, item_id, delivered_quantity, delivery_date, recorded_by, notes)
    values (p_request_id, v_item_id, round(v_qty, 2), p_delivery_date, v_uid, v_notes);

    update public.material_request_items i
       set delivered_quantity = i.delivered_quantity + round(v_qty, 2)
     where i.id = v_item_id;
  end loop;

  select not exists (
    select 1 from public.material_request_items i
    where i.request_id = p_request_id and i.delivered_quantity < i.quantity
  ) into v_all;

  update public.material_requests r
     set status = case when v_all then 'delivered'::public.material_request_status
                       else 'partially_delivered'::public.material_request_status end,
         ordered_at = coalesce(r.ordered_at, pg_catalog.now()),
         reviewed_at = coalesce(r.reviewed_at, pg_catalog.now()),
         -- A backdated entry never moves the latest delivery date backwards.
         delivery_date = greatest(coalesce(r.delivery_date, p_delivery_date), p_delivery_date),
         completed_at = case when v_all then pg_catalog.now() else r.completed_at end,
         assigned_admin = case when v_role = 'admin' and r.assigned_admin is null then v_uid else r.assigned_admin end
   where r.id = p_request_id;
end
$$;

-- -----------------------------------------------------------------------------
-- update_material_request_delivery_date (admin with access, or owner)
-- Revises the expected delivery date while the request is approved, ordered or
-- partially delivered. Audited by the row trigger; the requester is notified;
-- a non-empty note is kept as a request comment.
-- -----------------------------------------------------------------------------
create or replace function public.update_material_request_delivery_date(
  p_request_id             uuid,
  p_expected_delivery_date date,
  p_note                   text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := (select auth.uid());
  v_role         public.app_role := public.require_active_role();
  v_req          public.material_requests%rowtype;
  v_note         text := nullif(btrim(coalesce(p_note, '')), '');
  v_new_label    text;
  v_old_label    text;
  v_project_name text;
begin
  if v_role not in ('owner', 'admin') then
    perform public.raise_app_error('NOT_AUTHORIZED', 'Only admins and the owner can change the expected delivery date.');
  end if;

  select * into v_req from public.material_requests r where r.id = p_request_id for update;
  if not found then
    perform public.raise_app_error('NOT_FOUND', 'Material request not found.');
  end if;
  if not public.can_access_material_request(p_request_id) then
    perform public.raise_app_error('NOT_AUTHORIZED', 'You do not have access to this material request.');
  end if;
  if v_req.status not in ('approved', 'ordered', 'partially_delivered') then
    perform public.raise_app_error('INVALID_TRANSITION',
      format('The expected delivery date of %s can only change while it is approved, ordered or partially delivered (it is %s).',
             v_req.request_code, public.humanize(v_req.status::text)));
  end if;
  if p_expected_delivery_date is null then
    perform public.raise_app_error('VALIDATION', 'Expected delivery date is required.');
  end if;
  if p_expected_delivery_date < (v_req.requested_at at time zone 'Asia/Kolkata')::date then
    perform public.raise_app_error('VALIDATION', 'Expected delivery date cannot be before the request date.');
  end if;
  if v_note is not null and length(v_note) > 2000 then
    perform public.raise_app_error('VALIDATION', 'Notes can be at most 2000 characters.');
  end if;

  v_new_label := to_char(p_expected_delivery_date, 'DD Mon YYYY');
  v_old_label := coalesce(to_char(v_req.expected_delivery_date, 'DD Mon YYYY'), 'not set');

  if p_expected_delivery_date is distinct from v_req.expected_delivery_date then
    update public.material_requests r
       set expected_delivery_date = p_expected_delivery_date
     where r.id = p_request_id;

    if v_req.requested_by is distinct from v_uid then
      select p.name into v_project_name from public.projects p where p.id = v_req.project_id;
      perform public.notify_user(
        v_req.requested_by,
        format('Expected delivery for %s moved to %s', v_req.request_code, v_new_label),
        format('"%s" for %s is now expected on %s (was %s).%s',
               v_req.title, coalesce(v_project_name, 'your project'), v_new_label, v_old_label,
               coalesce(' Note: ' || left(v_note, 200), '')),
        'material_request_delivery_date', 'material_request', p_request_id,
        '/material-requests/' || p_request_id::text,
        null
      );
    end if;
  end if;

  if v_note is not null then
    insert into public.material_request_comments (request_id, author_id, body)
    values (p_request_id, v_uid, left(format('Expected delivery %s: %s', v_new_label, v_note), 2000));
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- assign_material_request
-- -----------------------------------------------------------------------------
create or replace function public.assign_material_request(p_request_id uuid, p_admin_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_role public.app_role := public.require_active_role();
  v_req  public.material_requests%rowtype;
begin
  select * into v_req from public.material_requests r where r.id = p_request_id for update;
  if not found then
    perform public.raise_app_error('NOT_FOUND', 'Material request not found.');
  end if;

  if v_role = 'owner' then
    if p_admin_id is not null and not exists (
      select 1 from public.profiles p where p.id = p_admin_id and p.role = 'admin' and p.status = 'active'
    ) then
      perform public.raise_app_error('VALIDATION', 'Choose an active admin.');
    end if;
  elsif v_role = 'admin' then
    if p_admin_id is distinct from v_uid or v_req.assigned_admin is not null then
      perform public.raise_app_error('NOT_AUTHORIZED', 'Admins can only claim unassigned requests for themselves.');
    end if;
  else
    perform public.raise_app_error('NOT_AUTHORIZED', 'Only the owner can assign material requests.');
  end if;

  if v_req.status in ('delivered', 'rejected', 'cancelled') then
    perform public.raise_app_error('INVALID_TRANSITION', 'Closed requests cannot be reassigned.');
  end if;

  update public.material_requests r
     set assigned_admin = p_admin_id
   where r.id = p_request_id
     and r.assigned_admin is distinct from p_admin_id;
end
$$;

-- -----------------------------------------------------------------------------
-- add_material_request_comment
-- -----------------------------------------------------------------------------
create or replace function public.add_material_request_comment(p_request_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_role      public.app_role := public.require_active_role();
  v_body      text := nullif(btrim(coalesce(p_body, '')), '');
  v_req       public.material_requests%rowtype;
  v_id        uuid;
  v_author    text;
  v_recipient uuid;
begin
  if v_body is null or length(v_body) > 2000 then
    perform public.raise_app_error('VALIDATION', 'A comment of up to 2000 characters is required.');
  end if;

  select * into v_req from public.material_requests r where r.id = p_request_id;
  if not found then
    perform public.raise_app_error('NOT_FOUND', 'Material request not found.');
  end if;
  if not public.can_access_material_request(p_request_id) then
    perform public.raise_app_error('NOT_AUTHORIZED', 'You do not have access to this material request.');
  end if;

  insert into public.material_request_comments (request_id, author_id, body)
  values (p_request_id, v_uid, v_body)
  returning id into v_id;

  select p.full_name into v_author from public.profiles p where p.id = v_uid;

  for v_recipient in
    select distinct x.uid
    from (values (v_req.requested_by), (v_req.assigned_admin)) as x(uid)
    where x.uid is not null and x.uid <> v_uid
  loop
    perform public.notify_user(
      v_recipient,
      'New comment on ' || v_req.request_code,
      format('%s (%s): %s', v_author, public.humanize(v_role::text), left(v_body, 200)),
      'material_request_comment', 'material_request', p_request_id,
      '/material-requests/' || p_request_id::text,
      null
    );
  end loop;

  return v_id;
end
$$;

-- -----------------------------------------------------------------------------
-- submit_project_update
-- -----------------------------------------------------------------------------
create or replace function public.submit_project_update(
  p_project_id               uuid,
  p_status                   public.project_status,
  p_progress                 numeric,
  p_update_date              date,
  p_milestone                text,
  p_expected_completion_date date,
  p_issues                   text,
  p_notes                    text,
  p_next_action              text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_role    public.app_role := public.require_active_role();
  v_project   public.projects%rowtype;
  v_date      date := coalesce(p_update_date, public.app_today());
  v_milestone text := nullif(btrim(coalesce(p_milestone, '')), '');
  v_ms_id     uuid;
  v_ms_order  integer;
  v_id        uuid;
begin
  if v_role not in ('owner', 'site_manager') then
    perform public.raise_app_error('NOT_AUTHORIZED', 'Only site managers and the owner can post project updates.');
  end if;
  if v_role = 'site_manager' and not public.is_project_member(p_project_id, 'site_manager') then
    perform public.raise_app_error('NOT_AUTHORIZED', 'You are not assigned to this project.');
  end if;

  select * into v_project from public.projects p where p.id = p_project_id for update;
  if not found then
    perform public.raise_app_error('NOT_FOUND', 'Project not found.');
  end if;

  if v_role = 'site_manager' then
    if v_project.status in ('completed', 'cancelled') or v_project.archived_at is not null then
      perform public.raise_app_error('PROJECT_CLOSED', 'This project is closed. Ask the owner to reopen it before posting updates.');
    end if;
    if p_status = 'cancelled' then
      perform public.raise_app_error('NOT_AUTHORIZED', 'Only the owner can cancel a project.');
    end if;
  end if;

  if p_status is null then
    perform public.raise_app_error('VALIDATION', 'Status is required.');
  end if;
  if p_progress is null or p_progress < 0 or p_progress > 100 then
    perform public.raise_app_error('VALIDATION', 'Progress must be between 0 and 100.');
  end if;
  if v_date > public.app_today() then
    perform public.raise_app_error('VALIDATION', 'Update date cannot be in the future.');
  end if;
  if p_expected_completion_date is not null and v_project.start_date is not null
     and p_expected_completion_date < v_project.start_date then
    perform public.raise_app_error('VALIDATION', 'Expected completion date cannot be before the project start date.');
  end if;
  if p_status = 'completed'
     and (v_project.status <> 'completed' or v_project.actual_handover_date is null)
     and v_project.start_date is not null and v_date < v_project.start_date then
    perform public.raise_app_error('VALIDATION', 'Completion date cannot be before the project start date.');
  end if;
  if length(coalesce(p_issues, '')) > 4000 or length(coalesce(p_notes, '')) > 4000
     or length(coalesce(p_next_action, '')) > 4000 or length(coalesce(p_milestone, '')) > 200 then
    perform public.raise_app_error('VALIDATION', 'Update text is too long.');
  end if;

  insert into public.project_updates (
    project_id, updated_by, status, previous_status, progress_percentage, previous_progress,
    update_date, milestone, expected_completion_date, issues, notes, next_action
  ) values (
    p_project_id, v_uid, p_status, v_project.status, round(p_progress, 2), v_project.progress_percentage,
    v_date,
    nullif(btrim(coalesce(p_milestone, '')), ''),
    coalesce(p_expected_completion_date, v_project.expected_completion_date),
    nullif(btrim(coalesce(p_issues, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    nullif(btrim(coalesce(p_next_action, '')), '')
  )
  returning id into v_id;

  update public.projects p
     set status = p_status,
         progress_percentage = round(p_progress, 2),
         current_milestone = coalesce(nullif(btrim(coalesce(p_milestone, '')), ''), p.current_milestone),
         expected_completion_date = coalesce(p_expected_completion_date, p.expected_completion_date),
         last_update_at = pg_catalog.now(),
         last_updated_by = v_uid,
         -- Completing (again) records this update's date; reopening is handled by
         -- trigger maintain_project_dates, which clears the old completion date.
         actual_handover_date = case when p_status = 'completed' and p.status <> 'completed' then v_date
                                     when p_status = 'completed' then coalesce(p.actual_handover_date, v_date)
                                     else p.actual_handover_date end
   where p.id = p_project_id;

  -- Reporting a timeline milestone advances the timeline (non-destructively):
  -- earlier milestones still open become completed as of the update date, the
  -- reported one becomes in progress (or completed when the project is), and
  -- completed or skipped milestones are never touched. Audited per milestone.
  if v_milestone is not null then
    select m.id, m.sort_order into v_ms_id, v_ms_order
    from public.project_milestones m
    where m.project_id = p_project_id and lower(btrim(m.name)) = lower(v_milestone)
    order by m.sort_order, m.id
    limit 1;

    if v_ms_id is not null then
      update public.project_milestones m
         set status = 'completed',
             completed_date = v_date
       where m.project_id = p_project_id
         and m.sort_order < v_ms_order
         and m.status in ('not_started', 'in_progress');

      update public.project_milestones m
         set status = case when p_status = 'completed' then 'completed'::public.milestone_status
                           else 'in_progress'::public.milestone_status end,
             start_date = coalesce(m.start_date,
                                   case when m.target_date is null or m.target_date >= v_date then v_date end),
             completed_date = case when p_status = 'completed' then v_date else m.completed_date end
       where m.id = v_ms_id
         and m.status in ('not_started', 'in_progress');
    end if;
  end if;

  return v_id;
end
$$;

-- -----------------------------------------------------------------------------
-- update_project_milestone
-- -----------------------------------------------------------------------------
create or replace function public.update_project_milestone(
  p_milestone_id   uuid,
  p_status         public.milestone_status,
  p_start_date     date,
  p_target_date    date,
  p_completed_date date,
  p_notes          text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role       public.app_role := public.require_active_role();
  v_project_id uuid;
  v_status     public.project_status;
  v_archived   timestamptz;
begin
  if v_role not in ('owner', 'site_manager') then
    perform public.raise_app_error('NOT_AUTHORIZED', 'Only site managers and the owner can update milestones.');
  end if;

  select m.project_id, p.status, p.archived_at
    into v_project_id, v_status, v_archived
  from public.project_milestones m
  join public.projects p on p.id = m.project_id
  where m.id = p_milestone_id
  for update of m;

  if not found then
    perform public.raise_app_error('NOT_FOUND', 'Milestone not found.');
  end if;
  if v_role = 'site_manager' then
    if not public.is_project_member(v_project_id, 'site_manager') then
      perform public.raise_app_error('NOT_AUTHORIZED', 'You are not assigned to this project.');
    end if;
    if v_status in ('completed', 'cancelled') or v_archived is not null then
      perform public.raise_app_error('PROJECT_CLOSED', 'This project is closed.');
    end if;
  end if;

  if p_status is null then
    perform public.raise_app_error('VALIDATION', 'Milestone status is required.');
  end if;
  if p_start_date is not null and p_target_date is not null and p_target_date < p_start_date then
    perform public.raise_app_error('VALIDATION', 'Target date cannot be before the start date.');
  end if;
  if p_completed_date is not null and p_completed_date > public.app_today() then
    perform public.raise_app_error('VALIDATION', 'Completed date cannot be in the future.');
  end if;
  if length(coalesce(p_notes, '')) > 2000 then
    perform public.raise_app_error('VALIDATION', 'Notes can be at most 2000 characters.');
  end if;

  update public.project_milestones m
     set status = p_status,
         start_date = p_start_date,
         target_date = p_target_date,
         completed_date = case when p_status = 'completed' then coalesce(p_completed_date, public.app_today()) else null end,
         notes = nullif(btrim(coalesce(p_notes, '')), '')
   where m.id = p_milestone_id;
end
$$;

-- -----------------------------------------------------------------------------
-- assign_project_member / remove_project_member
-- -----------------------------------------------------------------------------
create or replace function public.assign_project_member(
  p_project_id          uuid,
  p_user_id             uuid,
  p_member_role         public.member_role,
  p_can_view_financials boolean default false,
  p_replace_existing    boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := (select auth.uid());
  v_role        public.app_role := public.require_active_role();
  v_user_role   public.app_role;
  v_user_status public.user_status;
  v_archived    timestamptz;
  v_existing    uuid;
  v_id          uuid;
begin
  if v_role <> 'owner' then
    perform public.raise_app_error('NOT_AUTHORIZED', 'Only the owner can assign team members to projects.');
  end if;
  if p_member_role is null then
    perform public.raise_app_error('VALIDATION', 'Member role is required.');
  end if;

  select p.archived_at into v_archived from public.projects p where p.id = p_project_id for update;
  if not found then
    perform public.raise_app_error('NOT_FOUND', 'Project not found.');
  end if;
  if v_archived is not null then
    perform public.raise_app_error('PROJECT_CLOSED', 'Archived projects cannot receive new assignments.');
  end if;

  select p.role, p.status into v_user_role, v_user_status from public.profiles p where p.id = p_user_id;
  if not found then
    perform public.raise_app_error('NOT_FOUND', 'User not found.');
  end if;
  if v_user_status <> 'active' then
    perform public.raise_app_error('VALIDATION', 'Only active users can be assigned to projects.');
  end if;
  if v_user_role is null or v_user_role::text <> p_member_role::text then
    perform public.raise_app_error('VALIDATION', 'The user''s role does not match the assignment role.');
  end if;

  if coalesce(p_replace_existing, false) then
    update public.project_members m
       set status = 'removed', removed_at = pg_catalog.now(), removed_by = v_uid
     where m.project_id = p_project_id
       and m.member_role = p_member_role
       and m.status = 'active'
       and m.user_id <> p_user_id;
  end if;

  select m.id into v_existing
  from public.project_members m
  where m.project_id = p_project_id and m.user_id = p_user_id and m.status = 'active'
  for update;

  if found then
    update public.project_members m
       set can_view_financials = coalesce(p_can_view_financials, false),
           member_role = p_member_role
     where m.id = v_existing;
    return v_existing;
  end if;

  insert into public.project_members (project_id, user_id, member_role, can_view_financials, assigned_by)
  values (p_project_id, p_user_id, p_member_role, coalesce(p_can_view_financials, false), v_uid)
  returning id into v_id;

  return v_id;
end
$$;

create or replace function public.remove_project_member(p_project_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_role public.app_role := public.require_active_role();
begin
  if v_role <> 'owner' then
    perform public.raise_app_error('NOT_AUTHORIZED', 'Only the owner can remove project assignments.');
  end if;

  update public.project_members m
     set status = 'removed', removed_at = pg_catalog.now(), removed_by = v_uid
   where m.project_id = p_project_id and m.user_id = p_user_id and m.status = 'active';

  if not found then
    perform public.raise_app_error('NOT_FOUND', 'This user is not assigned to the project.');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- set_user_status
-- -----------------------------------------------------------------------------
create or replace function public.set_user_status(p_user_id uuid, p_status public.user_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := (select auth.uid());
  v_role        public.app_role := public.require_active_role();
  v_target_role public.app_role;
begin
  if v_role <> 'owner' then
    perform public.raise_app_error('NOT_AUTHORIZED', 'Only the owner can activate or deactivate users.');
  end if;
  if p_status is null then
    perform public.raise_app_error('VALIDATION', 'Status is required.');
  end if;
  if p_user_id = v_uid then
    perform public.raise_app_error('NOT_AUTHORIZED', 'You cannot change your own status.');
  end if;

  select p.role into v_target_role from public.profiles p where p.id = p_user_id for update;
  if not found then
    perform public.raise_app_error('NOT_FOUND', 'User not found.');
  end if;
  if v_target_role = 'owner' then
    perform public.raise_app_error('NOT_AUTHORIZED', 'Owner accounts cannot be deactivated.');
  end if;

  update public.profiles p
     set status = p_status
   where p.id = p_user_id
     and p.status is distinct from p_status;
end
$$;

-- -----------------------------------------------------------------------------
-- generate_deadline_notifications (owner or scheduler / service role)
-- -----------------------------------------------------------------------------
create or replace function public.generate_deadline_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.app_today();
  v_count integer := 0;
  v_rows  integer;
begin
  -- Interactive callers must be the owner; the scheduler (no JWT) and the
  -- service role are trusted. anon has no EXECUTE privilege at all.
  if (select auth.uid()) is not null or coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    if not public.is_owner() then
      perform public.raise_app_error('NOT_AUTHORIZED', 'Only the owner can run deadline checks.');
    end if;
  end if;

  -- Projects due in 30/14/7/1/0 days, or overdue -> owner(s) + assigned site managers.
  with due as (
    select p.id, p.name, p.project_code, p.expected_completion_date as deadline,
           (p.expected_completion_date - v_today) as days_left
    from public.projects p
    where p.archived_at is null
      and p.status in ('planning', 'design', 'approval', 'procurement', 'execution', 'finishing', 'handover_pending', 'delayed')
      and p.expected_completion_date is not null
      and ((p.expected_completion_date - v_today) in (30, 14, 7, 1, 0) or p.expected_completion_date < v_today)
  ),
  recipients as (
    select due.*, u.user_id
    from due
    cross join lateral (
      select pr.id as user_id
      from public.profiles pr
      where pr.role = 'owner' and pr.status = 'active'
      union
      select m.user_id
      from public.project_members m
      join public.profiles pr on pr.id = m.user_id
      where m.project_id = due.id
        and m.status = 'active'
        and m.member_role = 'site_manager'
        and pr.status = 'active'
        and pr.role = 'site_manager'
    ) as u
  )
  insert into public.notifications (user_id, title, message, type, entity_type, entity_id, link, dedupe_key)
  select r.user_id,
         case when r.days_left < 0 then r.name || ' is overdue'
              when r.days_left = 0 then r.name || ' is due today'
              when r.days_left = 1 then r.name || ' is due tomorrow'
              else format('%s is due in %s days', r.name, r.days_left) end,
         case when r.days_left < 0
              then format('%s (%s) passed its completion date of %s by %s day(s).',
                          r.name, r.project_code, to_char(r.deadline, 'DD Mon YYYY'), -r.days_left)
              else format('%s (%s) is due for completion on %s.',
                          r.name, r.project_code, to_char(r.deadline, 'DD Mon YYYY')) end,
         case when r.days_left < 0 then 'project_overdue' else 'project_deadline' end,
         'project', r.id, '/projects/' || r.id::text,
         case when r.days_left < 0
              then 'project_overdue:' || r.id::text || ':' || r.deadline::text || ':' || r.user_id::text
              else 'project_deadline:' || r.id::text || ':' || r.deadline::text || ':' || r.days_left::text || ':' || r.user_id::text end
  from recipients r
  on conflict (dedupe_key) do nothing;

  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  -- Open material requests required within 2 days (or overdue) -> assigned admin
  -- (or every active admin when unassigned) + requester.
  with due as (
    select r.id, r.request_code, r.title, r.required_date, r.requested_by, r.assigned_admin,
           (r.required_date - v_today) as days_left
    from public.material_requests r
    where r.archived_at is null
      and r.status in ('requested', 'pending_review', 'approved', 'ordered', 'partially_delivered')
      and r.required_date - v_today <= 2
  ),
  recipients as (
    select due.*, u.user_id
    from due
    cross join lateral (
      select due.requested_by as user_id
      union
      select due.assigned_admin where due.assigned_admin is not null
      union
      select pr.id from public.profiles pr
      where due.assigned_admin is null and pr.role = 'admin' and pr.status = 'active'
    ) as u
    join public.profiles pr on pr.id = u.user_id and pr.status = 'active' and pr.role is not null
    -- e.g. a requester moved off the project no longer hears about the request
    where public.user_can_access_material_request(u.user_id, due.id)
  )
  insert into public.notifications (user_id, title, message, type, entity_type, entity_id, link, dedupe_key)
  select r.user_id,
         case when r.days_left < 0 then r.request_code || ' is overdue'
              when r.days_left = 0 then r.request_code || ' is required today'
              when r.days_left = 1 then r.request_code || ' is required tomorrow'
              else format('%s is required in %s days', r.request_code, r.days_left) end,
         format('"%s" is required by %s.', r.title, to_char(r.required_date, 'DD Mon YYYY')),
         'request_due', 'material_request', r.id, '/material-requests/' || r.id::text,
         'request_due:' || r.id::text || ':' || r.required_date::text || ':'
           || case when r.days_left < 0 then 'overdue' else r.days_left::text end || ':' || r.user_id::text
  from recipients r
  on conflict (dedupe_key) do nothing;

  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  return v_count;
end
$$;

-- -----------------------------------------------------------------------------
-- mark_all_notifications_read
-- -----------------------------------------------------------------------------
create or replace function public.mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := public.require_active_role();
begin
  update public.notifications n
     set read_at = pg_catalog.now()
   where n.user_id = (select auth.uid())
     and n.read_at is null;
end
$$;

-- -----------------------------------------------------------------------------
-- global_search
-- -----------------------------------------------------------------------------
create or replace function public.global_search(p_query text, p_limit int default 20)
returns table (entity_type text, entity_id uuid, title text, subtitle text, href text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_role    public.app_role := public.require_active_role();
  v_q       text := left(btrim(coalesce(p_query, '')), 100);
  v_lq      text;
  v_pattern text;
  v_limit   integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if length(v_q) < 2 then
    return;
  end if;
  v_lq := lower(v_q);
  v_pattern := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select s.entity_type, s.entity_id, s.title, s.subtitle, s.href
  from (
    -- clients (owner, or site managers assigned to one of the client's projects)
    select 'client'::text as entity_type, c.id as entity_id, c.name as title,
           concat_ws(' · ', c.client_code, c.city, case when c.archived_at is not null then 'Archived' end) as subtitle,
           '/clients/' || c.id::text as href,
           case when lower(c.client_code) = v_lq then 0
                when left(lower(c.name), length(v_lq)) = v_lq then 1 else 2 end as rank,
           1 as type_order
    from public.clients c
    where v_role in ('owner', 'site_manager')
      and (c.name ilike v_pattern or c.client_code ilike v_pattern
           or (v_role = 'owner' and (c.email ilike v_pattern or c.phone ilike v_pattern)))
      and (v_role = 'owner' or public.can_access_client(c.id))

    union all

    -- projects
    select 'project', p.id, p.name,
           concat_ws(' · ', p.project_code, c.name, public.humanize(p.status::text)),
           '/projects/' || p.id::text,
           case when lower(p.project_code) = v_lq then 0
                when left(lower(p.name), length(v_lq)) = v_lq then 1 else 2 end,
           2
    from public.projects p
    join public.clients c on c.id = p.client_id
    where (p.name ilike v_pattern or p.project_code ilike v_pattern or p.city ilike v_pattern)
      and (v_role = 'owner' or public.can_access_project(p.id))

    union all

    -- team members (owner only)
    select case when pr.role = 'site_manager' then 'site_manager' when pr.role = 'admin' then 'admin' else 'user' end,
           pr.id, pr.full_name,
           concat_ws(' · ', pr.employee_id, public.humanize(pr.role::text),
                     case when pr.status = 'inactive' then 'Inactive' end),
           case when pr.role = 'site_manager' then '/site-managers/' || pr.id::text
                when pr.role = 'admin' then '/admins/' || pr.id::text
                else '/users' end,
           case when lower(coalesce(pr.employee_id, '')) = v_lq then 0
                when left(lower(pr.full_name), length(v_lq)) = v_lq then 1 else 2 end,
           3
    from public.profiles pr
    where v_role = 'owner'
      and (pr.full_name ilike v_pattern or pr.employee_id ilike v_pattern or pr.email ilike v_pattern)

    union all

    -- material requests (code, title or any item name)
    select 'material_request', r.id, r.request_code || ' · ' || r.title,
           concat_ws(' · ', p.name, public.humanize(r.status::text)),
           '/material-requests/' || r.id::text,
           case when lower(r.request_code) = v_lq then 0 else 2 end,
           4
    from public.material_requests r
    join public.projects p on p.id = r.project_id
    where (r.request_code ilike v_pattern or r.title ilike v_pattern
           or exists (select 1 from public.material_request_items i
                      where i.request_id = r.id and i.material_name ilike v_pattern))
      and (v_role = 'owner' or public.can_access_material_request(r.id))

    union all

    -- catalog materials
    select 'material', m.id, m.name,
           concat_ws(' · ', m.category, m.unit),
           '/materials?tab=catalog&q=' || public.url_encode(m.name),
           case when lower(m.name) = v_lq then 0
                when left(lower(m.name), length(v_lq)) = v_lq then 1 else 2 end,
           5
    from public.materials m
    where m.is_active and m.name ilike v_pattern
  ) as s
  order by s.rank, s.type_order, s.title
  limit v_limit;
end
$$;

-- -----------------------------------------------------------------------------
-- Dashboards
-- -----------------------------------------------------------------------------
create or replace function public.get_owner_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role   public.app_role := public.require_active_role();
  v_today  date := public.app_today();
  v_result jsonb;
begin
  if v_role <> 'owner' then
    perform public.raise_app_error('NOT_AUTHORIZED', 'Only the owner can view the company dashboard.');
  end if;

  with proj as (
    select p.* from public.projects p where p.archived_at is null
  ),
  req as (
    select r.* from public.material_requests r where r.archived_at is null
  ),
  months as (
    select gs::timestamp as month_start
    from generate_series(
      date_trunc('month', v_today::timestamp) - interval '5 months',
      date_trunc('month', v_today::timestamp),
      interval '1 month'
    ) as gs
  )
  select jsonb_build_object(
    'total_clients', (select count(*) from public.clients c where c.archived_at is null),
    'total_projects', (select count(*) from proj),
    'ongoing_projects', (select count(*) from proj
                         where proj.status in ('planning', 'design', 'approval', 'procurement', 'execution',
                                               'finishing', 'handover_pending', 'delayed')),
    'completed_projects', (select count(*) from proj where proj.status = 'completed'),
    'on_hold_projects', (select count(*) from proj where proj.status = 'on_hold'),
    'delayed_projects', (select count(*) from proj
                         where proj.status = 'delayed'
                            or (proj.expected_completion_date < v_today and proj.status not in ('completed', 'cancelled'))),
    'upcoming_handovers', (select count(*) from proj
                           where proj.status not in ('completed', 'cancelled')
                             and coalesce(proj.handover_date, proj.expected_completion_date) between v_today and v_today + 30),
    'total_project_value', (select coalesce(sum(f.project_cost), 0)
                            from proj join public.project_financials f on f.project_id = proj.id
                            where proj.status <> 'cancelled'),
    'material_estimated_cost', (select coalesce(sum(req.estimated_cost), 0) from req
                                where req.status not in ('rejected', 'cancelled')),
    'material_approved_cost', (select coalesce(sum(req.approved_cost), 0) from req
                               where req.status not in ('rejected', 'cancelled')),
    'material_actual_cost', (select coalesce(sum(req.actual_cost), 0) from req
                             where req.status not in ('rejected', 'cancelled')),
    -- Like-for-like variance: actual minus estimate over the items that carry both.
    'material_variance', (select coalesce(sum(req.variance_actual_cost - req.variance_estimated_cost), 0) from req
                          where req.status not in ('rejected', 'cancelled')),
    'material_variance_estimated_cost', (select coalesce(sum(req.variance_estimated_cost), 0) from req
                                         where req.status not in ('rejected', 'cancelled')),
    'material_variance_actual_cost', (select coalesce(sum(req.variance_actual_cost), 0) from req
                                      where req.status not in ('rejected', 'cancelled')),
    'pending_material_requests', (select count(*) from req where req.status in ('requested', 'pending_review')),
    'overdue_material_requests', (select count(*) from req
                                  where req.required_date < v_today
                                    and req.status not in ('delivered', 'rejected', 'cancelled')),
    'status_breakdown', (
      select coalesce(jsonb_agg(jsonb_build_object('status', s.status, 'count', s.n) order by s.status), '[]'::jsonb)
      from (select proj.status, count(*) as n from proj group by proj.status) as s
    ),
    'monthly_material_cost', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'month', to_char(m.month_start, 'YYYY-MM'),
               'estimated', coalesce(x.estimated, 0),
               'actual', coalesce(x.actual, 0)
             ) order by m.month_start), '[]'::jsonb)
      from months m
      left join lateral (
        select sum(req.estimated_cost) as estimated, sum(req.actual_cost) as actual
        from req
        where req.status not in ('rejected', 'cancelled')
          and date_trunc('month', req.requested_at at time zone 'Asia/Kolkata') = m.month_start
      ) as x on true
    )
  ) into v_result;

  return v_result;
end
$$;

create or replace function public.get_site_manager_performance()
returns table (
  user_id                     uuid,
  full_name                   text,
  employee_id                 text,
  status                      public.user_status,
  assigned_projects           int,
  ongoing_projects            int,
  completed_projects          int,
  delayed_projects            int,
  on_time_completed           int,
  on_time_rate                numeric,
  avg_progress                numeric,
  material_requests_created   int,
  avg_request_completion_days numeric,
  last_update_at              timestamptz,
  project_updates_count       int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_role  public.app_role := public.require_active_role();
  v_today date := public.app_today();
begin
  if v_role <> 'owner' then
    perform public.raise_app_error('NOT_AUTHORIZED', 'Only the owner can view performance analytics.');
  end if;

  return query
  with sm as (
    select p.id, p.full_name, p.employee_id, p.status
    from public.profiles p
    where p.role = 'site_manager'
  ),
  -- Deadline reference for on-time: the owner-set handover date, else the
  -- committed completion date (not the expected date the site manager can
  -- move). Completion date: actual_handover_date, stamped on every path into
  -- 'completed' by trigger maintain_project_dates.
  pj as (
    select m.user_id, pr.status, pr.progress_percentage, pr.expected_completion_date,
           coalesce(pr.handover_date, pr.committed_completion_date) as reference_date,
           pr.actual_handover_date
    from public.project_members m
    join public.projects pr on pr.id = m.project_id
    where m.status = 'active' and m.member_role = 'site_manager' and pr.archived_at is null
  ),
  agg as (
    select pj.user_id,
           count(*)::int as assigned,
           (count(*) filter (where pj.status in ('planning', 'design', 'approval', 'procurement', 'execution',
                                                 'finishing', 'handover_pending', 'delayed')))::int as ongoing,
           (count(*) filter (where pj.status = 'completed'))::int as completed,
           -- Same population as "ongoing" so delayed / ongoing never exceeds 100 %.
           (count(*) filter (where pj.status in ('planning', 'design', 'approval', 'procurement', 'execution',
                                                 'finishing', 'handover_pending', 'delayed')
                               and (pj.status = 'delayed' or pj.expected_completion_date < v_today)))::int as delayed,
           -- Only completions with a deadline and a completion date are judged.
           (count(*) filter (where pj.status = 'completed'
                               and pj.reference_date is not null
                               and pj.actual_handover_date is not null))::int as judged,
           (count(*) filter (where pj.status = 'completed'
                               and pj.reference_date is not null
                               and pj.actual_handover_date is not null
                               and pj.actual_handover_date <= pj.reference_date))::int as on_time,
           round(avg(pj.progress_percentage) filter (where pj.status <> 'cancelled'), 1) as avg_progress
    from pj
    group by pj.user_id
  ),
  req as (
    -- Completion time runs to the (latest) delivery date, not to when it was recorded.
    select r.requested_by,
           count(*)::int as created,
           round(avg(coalesce((r.delivery_date - (r.requested_at at time zone 'Asia/Kolkata')::date)::numeric,
                              extract(epoch from (r.completed_at - r.requested_at)) / 86400.0))
                 filter (where r.status = 'delivered'
                           and (r.delivery_date is not null or r.completed_at is not null)), 1) as avg_days
    from public.material_requests r
    where r.archived_at is null
    group by r.requested_by
  ),
  upd as (
    select u.updated_by, max(u.created_at) as last_at, count(*)::int as n
    from public.project_updates u
    group by u.updated_by
  )
  select sm.id,
         sm.full_name,
         sm.employee_id,
         sm.status,
         coalesce(agg.assigned, 0),
         coalesce(agg.ongoing, 0),
         coalesce(agg.completed, 0),
         coalesce(agg.delayed, 0),
         coalesce(agg.on_time, 0),
         case when coalesce(agg.judged, 0) = 0 then null
              else round(agg.on_time * 100.0 / agg.judged, 1) end,
         agg.avg_progress,
         coalesce(req.created, 0),
         req.avg_days,
         upd.last_at,
         coalesce(upd.n, 0)
  from sm
  left join agg on agg.user_id = sm.id
  left join req on req.requested_by = sm.id
  left join upd on upd.updated_by = sm.id
  order by sm.full_name;
end
$$;

create or replace function public.get_admin_performance()
returns table (
  user_id             uuid,
  full_name           text,
  employee_id         text,
  status              public.user_status,
  requests_assigned   int,
  pending             int,
  processing          int,
  completed           int,
  rejected            int,
  overdue             int,
  completion_rate     numeric,
  avg_response_hours  numeric,
  avg_completion_days numeric,
  total_value_managed numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_role  public.app_role := public.require_active_role();
  v_today date := public.app_today();
begin
  if v_role <> 'owner' then
    perform public.raise_app_error('NOT_AUTHORIZED', 'Only the owner can view performance analytics.');
  end if;

  return query
  with ad as (
    select p.id, p.full_name, p.employee_id, p.status
    from public.profiles p
    where p.role = 'admin'
  ),
  agg as (
    select r.assigned_admin,
           count(*)::int as assigned,
           (count(*) filter (where r.status in ('requested', 'pending_review')))::int as pending,
           (count(*) filter (where r.status in ('approved', 'ordered', 'partially_delivered')))::int as processing,
           (count(*) filter (where r.status = 'delivered'))::int as completed,
           (count(*) filter (where r.status = 'rejected'))::int as rejected,
           (count(*) filter (where r.status = 'cancelled'))::int as cancelled,
           (count(*) filter (where r.required_date < v_today
                               and r.status not in ('delivered', 'rejected', 'cancelled')))::int as overdue,
           -- Response time starts when the request reached this admin: the
           -- owner's assignment if it came before the first response, else the
           -- request time (shared queue, claim-by-acting).
           round(avg(extract(epoch from (
                   least(r.reviewed_at, r.approved_at, r.rejected_at)
                   - case when r.assigned_at is not null
                               and r.assigned_at < least(r.reviewed_at, r.approved_at, r.rejected_at)
                          then greatest(r.requested_at, r.assigned_at)
                          else r.requested_at end)) / 3600.0)
                 filter (where coalesce(r.reviewed_at, r.approved_at, r.rejected_at) is not null), 1) as avg_response,
           round(avg(coalesce((r.delivery_date - (r.requested_at at time zone 'Asia/Kolkata')::date)::numeric,
                              extract(epoch from (r.completed_at - r.requested_at)) / 86400.0))
                 filter (where r.status = 'delivered'
                           and (r.delivery_date is not null or r.completed_at is not null)), 1) as avg_completion,
           coalesce(sum(coalesce(r.actual_cost, r.approved_cost, r.estimated_cost))
                    filter (where r.status not in ('rejected', 'cancelled')), 0)::numeric as value_managed
    from public.material_requests r
    where r.archived_at is null and r.assigned_admin is not null
    group by r.assigned_admin
  )
  select ad.id,
         ad.full_name,
         ad.employee_id,
         ad.status,
         coalesce(agg.assigned, 0),
         coalesce(agg.pending, 0),
         coalesce(agg.processing, 0),
         coalesce(agg.completed, 0),
         coalesce(agg.rejected, 0),
         coalesce(agg.overdue, 0),
         -- Requests cancelled by the requester or owner are outside the admin's control.
         case when coalesce(agg.assigned, 0) - coalesce(agg.cancelled, 0) <= 0 then null
              else round(agg.completed * 100.0 / (agg.assigned - agg.cancelled), 1) end,
         agg.avg_response,
         agg.avg_completion,
         coalesce(agg.value_managed, 0)::numeric
  from ad
  left join agg on agg.assigned_admin = ad.id
  order by ad.full_name;
end
$$;

create or replace function public.get_site_manager_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_role   public.app_role := public.require_active_role();
  v_today  date := public.app_today();
  v_result jsonb;
begin
  if v_role <> 'site_manager' then
    perform public.raise_app_error('NOT_AUTHORIZED', 'This dashboard is for site managers.');
  end if;

  with mine as (
    select p.*
    from public.projects p
    join public.project_members m on m.project_id = p.id
    where m.user_id = v_uid and m.status = 'active' and m.member_role = 'site_manager'
      and p.archived_at is null
  ),
  req as (
    select r.*
    from public.material_requests r
    where r.archived_at is null and r.project_id in (select mine.id from mine)
  )
  select jsonb_build_object(
    'my_projects', (select count(*) from mine),
    'active_projects', (select count(*) from mine
                        where mine.status in ('planning', 'design', 'approval', 'procurement', 'execution',
                                              'finishing', 'handover_pending', 'delayed')),
    'near_deadline', (select count(*) from mine
                      where mine.status not in ('completed', 'cancelled')
                        and mine.expected_completion_date between v_today and v_today + 14),
    -- Same rule as the /projects?view=delayed drill-down (is_overdue or status 'delayed').
    'overdue_projects', (select count(*) from mine
                         where mine.status not in ('completed', 'cancelled')
                           and (mine.status = 'delayed' or mine.expected_completion_date < v_today)),
    'pending_material_requests', (select count(*) from req where req.status in ('requested', 'pending_review')),
    'delivered_materials', (select count(*) from req where req.status = 'delivered')
  ) into v_result;

  return v_result;
end
$$;

create or replace function public.get_admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_role   public.app_role := public.require_active_role();
  v_today  date := public.app_today();
  v_result jsonb;
begin
  if v_role <> 'admin' then
    perform public.raise_app_error('NOT_AUTHORIZED', 'This dashboard is for admins.');
  end if;

  with visible as (
    select r.*
    from public.material_requests r
    where r.archived_at is null
      and (r.assigned_admin = v_uid
           or (r.assigned_admin is null
               and r.status in ('requested', 'pending_review', 'approved', 'ordered', 'partially_delivered'))
           or public.is_project_member(r.project_id, 'admin'))
  )
  select jsonb_build_object(
    'new_requests', (select count(*) from visible where visible.status = 'requested'),
    'pending_requests', (select count(*) from visible where visible.status in ('requested', 'pending_review')),
    'approved', (select count(*) from visible where visible.status = 'approved'),
    'ordered', (select count(*) from visible where visible.status = 'ordered'),
    'partially_delivered', (select count(*) from visible where visible.status = 'partially_delivered'),
    'completed', (select count(*) from visible where visible.status = 'delivered'),
    'overdue_requests', (select count(*) from visible
                         where visible.required_date < v_today
                           and visible.status not in ('delivered', 'rejected', 'cancelled')),
    'unassigned', (select count(*) from visible
                   where visible.assigned_admin is null
                     and visible.status not in ('delivered', 'rejected', 'cancelled'))
  ) into v_result;

  return v_result;
end
$$;

-- -----------------------------------------------------------------------------
-- Bootstrap: promote an existing auth user to owner. Not callable by API users.
-- -----------------------------------------------------------------------------
create or replace function public.promote_to_owner(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is not null then
    perform public.raise_app_error('NOT_AUTHORIZED', 'promote_to_owner can only be run by the database owner or service role.');
  end if;
  if p_email is null or btrim(p_email) = '' then
    perform public.raise_app_error('VALIDATION', 'Email is required.');
  end if;

  update public.profiles p
     set role = 'owner', status = 'active'
   where p.email = lower(btrim(p_email))
  returning p.id into v_id;

  if v_id is null then
    perform public.raise_app_error('NOT_FOUND', 'No user with that email exists. Create the auth user first.');
  end if;

  begin
    update auth.users u
       set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'owner')
     where u.id = v_id;
  exception
    when insufficient_privilege then
      raise notice 'Profile promoted; app_metadata could not be updated (insufficient privilege).';
  end;

  return v_id;
end
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function public.try_uuid(text) from public, anon, authenticated;
revoke all on function public.require_active_role() from public, anon, authenticated;
revoke all on function public.insert_request_items(uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.url_encode(text) from public, anon, authenticated;

revoke all on function public.create_material_request(uuid, text, date, public.priority_level, text, jsonb, boolean) from public, anon;
revoke all on function public.update_material_request_draft(uuid, text, date, public.priority_level, text, jsonb) from public, anon;
revoke all on function public.update_material_request_status(uuid, public.material_request_status, text, date) from public, anon;
revoke all on function public.update_material_request_costs(uuid, jsonb) from public, anon;
revoke all on function public.record_material_delivery(uuid, date, jsonb, text) from public, anon;
revoke all on function public.update_material_request_delivery_date(uuid, date, text) from public, anon;
revoke all on function public.assign_material_request(uuid, uuid) from public, anon;
revoke all on function public.add_material_request_comment(uuid, text) from public, anon;
revoke all on function public.submit_project_update(uuid, public.project_status, numeric, date, text, date, text, text, text) from public, anon;
revoke all on function public.update_project_milestone(uuid, public.milestone_status, date, date, date, text) from public, anon;
revoke all on function public.assign_project_member(uuid, uuid, public.member_role, boolean, boolean) from public, anon;
revoke all on function public.remove_project_member(uuid, uuid) from public, anon;
revoke all on function public.set_user_status(uuid, public.user_status) from public, anon;
revoke all on function public.generate_deadline_notifications() from public, anon;
revoke all on function public.mark_all_notifications_read() from public, anon;
revoke all on function public.global_search(text, int) from public, anon;
revoke all on function public.get_owner_dashboard() from public, anon;
revoke all on function public.get_site_manager_performance() from public, anon;
revoke all on function public.get_admin_performance() from public, anon;
revoke all on function public.get_site_manager_dashboard() from public, anon;
revoke all on function public.get_admin_dashboard() from public, anon;
revoke all on function public.promote_to_owner(text) from public, anon, authenticated;

grant execute on function public.create_material_request(uuid, text, date, public.priority_level, text, jsonb, boolean) to authenticated;
grant execute on function public.update_material_request_draft(uuid, text, date, public.priority_level, text, jsonb) to authenticated;
grant execute on function public.update_material_request_status(uuid, public.material_request_status, text, date) to authenticated;
grant execute on function public.update_material_request_costs(uuid, jsonb) to authenticated;
grant execute on function public.record_material_delivery(uuid, date, jsonb, text) to authenticated;
grant execute on function public.update_material_request_delivery_date(uuid, date, text) to authenticated;
grant execute on function public.assign_material_request(uuid, uuid) to authenticated;
grant execute on function public.add_material_request_comment(uuid, text) to authenticated;
grant execute on function public.submit_project_update(uuid, public.project_status, numeric, date, text, date, text, text, text) to authenticated;
grant execute on function public.update_project_milestone(uuid, public.milestone_status, date, date, date, text) to authenticated;
grant execute on function public.assign_project_member(uuid, uuid, public.member_role, boolean, boolean) to authenticated;
grant execute on function public.remove_project_member(uuid, uuid) to authenticated;
grant execute on function public.set_user_status(uuid, public.user_status) to authenticated;
grant execute on function public.generate_deadline_notifications() to authenticated, service_role;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.global_search(text, int) to authenticated;
grant execute on function public.get_owner_dashboard() to authenticated;
grant execute on function public.get_site_manager_performance() to authenticated;
grant execute on function public.get_admin_performance() to authenticated;
grant execute on function public.get_site_manager_dashboard() to authenticated;
grant execute on function public.get_admin_dashboard() to authenticated;
grant execute on function public.promote_to_owner(text) to service_role;
