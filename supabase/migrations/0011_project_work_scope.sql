-- =============================================================================
-- 0011: project scope of work
--
-- Project type stays the kind of property (Villa, Apartment, Residential, ...).
-- What is being done there is a separate multi-select, projects.work_scope:
-- living room, modular kitchen, dining room, pooja unit, 1/2/3 BHK, home
-- theatre, false ceiling, TV unit, first floor living room. Keys are mirrored
-- in src/lib/constants.ts (WORK_SCOPES). An empty array means "not specified".
-- =============================================================================

alter table public.projects
  add column work_scope text[] not null default '{}'
  constraint projects_work_scope_chk check (
    work_scope <@ array[
      'living_room', 'modular_kitchen', 'dining_room', 'pooja_unit', '1bhk', '2bhk', '3bhk',
      'home_theatre', 'false_ceiling', 'tv_unit', 'first_floor_living_room'
    ]::text[]
  );

-- project_directory: work_scope appended (existing columns unchanged).
create or replace view public.project_directory
with (security_barrier = true)
as
select
  p.id,
  p.project_code,
  p.client_id,
  p.name,
  p.project_type,
  p.site_address,
  p.city,
  p.start_date,
  p.expected_completion_date,
  p.handover_date,
  p.actual_handover_date,
  p.status,
  p.progress_percentage,
  p.priority,
  p.current_milestone,
  p.notes,
  p.last_update_at,
  p.last_updated_by,
  p.archived_at,
  p.created_at,
  p.updated_at,
  p.created_by,
  c.name as client_name,
  c.client_code,
  sm.site_manager_id,
  sm.site_manager_name,
  coalesce(sm.site_manager_ids, array[]::uuid[]) as site_manager_ids,
  p.expected_completion_date as deadline_date,
  (p.expected_completion_date - public.app_today())::int as days_remaining,
  (p.expected_completion_date is not null
     and p.expected_completion_date < public.app_today()
     and p.status not in ('completed', 'cancelled')) as is_overdue,
  case
    when p.status = 'completed' then 'completed'
    when p.status = 'cancelled' then 'cancelled'
    when p.expected_completion_date is null then 'no_date'
    when p.expected_completion_date < public.app_today() then 'overdue'
    when p.expected_completion_date = public.app_today() then 'due_today'
    when p.expected_completion_date = public.app_today() + 1 then 'due_tomorrow'
    when p.expected_completion_date <= public.app_today() + 7 then 'due_7'
    when p.expected_completion_date <= public.app_today() + 14 then 'due_14'
    when p.expected_completion_date <= public.app_today() + 30 then 'due_30'
    else 'on_track'
  end as deadline_state,
  coalesce(mr.open_count, 0)::int as open_material_requests,
  coalesce(mr.total_count, 0)::int as total_material_requests,
  -- Effective handover date used by the "upcoming handovers" KPI and widget:
  -- sort / filter on this column so the list matches the count.
  coalesce(p.handover_date, p.expected_completion_date) as handover_or_deadline,
  p.work_scope
from public.projects p
join public.clients c on c.id = p.client_id
left join lateral (
  select
    (array_agg(m.user_id order by m.assigned_at, m.id))[1] as site_manager_id,
    (array_agg(pr.full_name order by m.assigned_at, m.id))[1] as site_manager_name,
    array_agg(m.user_id order by m.assigned_at, m.id) as site_manager_ids
  from public.project_members m
  join public.profiles pr on pr.id = m.user_id
  where m.project_id = p.id and m.status = 'active' and m.member_role = 'site_manager'
) as sm on true
left join lateral (
  select
    count(*) filter (where r.status not in ('delivered', 'rejected', 'cancelled')) as open_count,
    count(*) as total_count
  from public.material_requests r
  where r.project_id = p.id and r.archived_at is null
) as mr on true
where public.can_access_project(p.id);
