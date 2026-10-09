-- =============================================================================
-- 0006_views_and_analytics.sql
-- Ignite Interior Decor: read models for the UI.
--
-- The directory views are owned by the migration role (postgres), so they read
-- base tables without RLS; each one is declared security_barrier and filters
-- its rows with the SECURITY DEFINER access helpers in its WHERE clause, so a
-- caller only ever receives rows they are entitled to. activity_feed instead
-- uses security_invoker so the audit_logs RLS policy applies directly.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- project_directory: projects + client name + site manager + deadline maths.
-- Contains NO money columns.
-- -----------------------------------------------------------------------------
create view public.project_directory
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
  coalesce(p.handover_date, p.expected_completion_date) as handover_or_deadline
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

-- -----------------------------------------------------------------------------
-- project_financial_summary: owner / explicitly granted members only.
-- material_variance compares like with like: actual minus estimate over the
-- request items that carry both costs (material_variance_estimated_cost /
-- material_variance_actual_cost are those two totals). Items still awaiting
-- an actual cost do not offset real overruns.
-- -----------------------------------------------------------------------------
create view public.project_financial_summary
with (security_barrier = true)
as
select
  p.id as project_id,
  p.project_code,
  p.name as project_name,
  p.client_id,
  c.name as client_name,
  p.status,
  p.archived_at,
  coalesce(f.project_cost, 0) as project_cost,
  coalesce(f.advance_received, 0) as advance_received,
  coalesce(mc.estimated, 0) as material_estimated_cost,
  coalesce(mc.approved, 0) as material_approved_cost,
  coalesce(mc.actual, 0) as material_actual_cost,
  (coalesce(mc.variance_actual, 0) - coalesce(mc.variance_estimated, 0)) as material_variance,
  coalesce(mc.variance_estimated, 0) as material_variance_estimated_cost,
  coalesce(mc.variance_actual, 0) as material_variance_actual_cost
from public.projects p
join public.clients c on c.id = p.client_id
left join public.project_financials f on f.project_id = p.id
left join lateral (
  select sum(r.estimated_cost) as estimated,
         sum(r.approved_cost) as approved,
         sum(r.actual_cost) as actual,
         sum(r.variance_estimated_cost) as variance_estimated,
         sum(r.variance_actual_cost) as variance_actual
  from public.material_requests r
  where r.project_id = p.id
    and r.archived_at is null
    and r.status not in ('rejected', 'cancelled')
) as mc on true
where public.can_view_project_financials(p.id);

-- -----------------------------------------------------------------------------
-- client_directory: owner, or site managers of one of the client's projects.
-- Project aggregates only include projects the caller can access.
-- -----------------------------------------------------------------------------
create view public.client_directory
with (security_barrier = true)
as
select
  c.id,
  c.client_code,
  c.name,
  c.email,
  c.phone,
  c.alternate_phone,
  c.address,
  c.city,
  c.state,
  c.country,
  c.notes,
  c.archived_at,
  c.created_at,
  c.updated_at,
  c.created_by,
  coalesce(agg.project_count, 0)::int as project_count,
  coalesce(agg.active_project_count, 0)::int as active_project_count,
  latest.id as latest_project_id,
  latest.name as latest_project_name,
  latest.status as latest_project_status,
  latest.progress_percentage as latest_progress,
  latest.start_date as latest_start_date,
  latest.handover_date as latest_handover_date,
  (latest.expected_completion_date - public.app_today())::int as latest_days_remaining,
  latest_sm.full_name as site_manager_name
from public.clients c
left join lateral (
  select count(*) as project_count,
         count(*) filter (where p.status in ('planning', 'design', 'approval', 'procurement', 'execution',
                                             'finishing', 'handover_pending', 'delayed')) as active_project_count
  from public.projects p
  where p.client_id = c.id and p.archived_at is null and public.can_access_project(p.id)
) as agg on true
left join lateral (
  select p.id, p.name, p.status, p.progress_percentage, p.start_date, p.handover_date, p.expected_completion_date
  from public.projects p
  where p.client_id = c.id and p.archived_at is null and public.can_access_project(p.id)
  order by p.start_date desc nulls last, p.created_at desc
  limit 1
) as latest on true
left join lateral (
  select pr.full_name
  from public.project_members m
  join public.profiles pr on pr.id = m.user_id
  where m.project_id = latest.id and m.status = 'active' and m.member_role = 'site_manager'
  order by m.assigned_at, m.id
  limit 1
) as latest_sm on true
where public.can_access_client(c.id);

-- -----------------------------------------------------------------------------
-- material_request_directory
-- approved_cost, actual_cost and cost_variance are NULL unless the caller may
-- see approved/actual costs (owner, admins, members granted financial access);
-- site managers otherwise see estimated costs only.
-- -----------------------------------------------------------------------------
create view public.material_request_directory
with (security_barrier = true)
as
select
  r.id,
  r.request_code,
  r.project_id,
  r.client_id,
  r.requested_by,
  r.assigned_admin,
  r.title,
  r.required_date,
  r.priority,
  r.status,
  r.estimated_cost,
  case when cv.allowed then r.approved_cost end as approved_cost,
  case when cv.allowed then r.actual_cost end as actual_cost,
  r.requested_at,
  r.reviewed_at,
  r.approved_at,
  r.rejected_at,
  r.ordered_at,
  r.expected_delivery_date,
  r.delivery_date,
  r.completed_at,
  r.cancelled_at,
  r.rejection_reason,
  r.notes,
  r.archived_at,
  r.created_at,
  r.updated_at,
  p.project_code,
  p.name as project_name,
  c.name as client_name,
  rb.full_name as requested_by_name,
  aa.full_name as assigned_admin_name,
  coalesce(items.item_count, 0)::int as item_count,
  coalesce(items.items_summary, '') as items_summary,
  (r.required_date - public.app_today())::int as days_until_required,
  case
    when r.status in ('delivered', 'rejected', 'cancelled') then 'closed'
    when r.required_date < public.app_today() then 'overdue'
    when r.required_date = public.app_today() then 'due_today'
    when r.required_date = public.app_today() + 1 then 'due_tomorrow'
    when r.required_date <= public.app_today() + 7 then 'due_soon'
    else 'upcoming'
  end as required_state,
  -- Like-for-like: actual minus estimate over the items that carry both costs.
  case when cv.allowed then r.variance_actual_cost - r.variance_estimated_cost end as cost_variance,
  r.assigned_at
from public.material_requests r
join public.projects p on p.id = r.project_id
join public.clients c on c.id = p.client_id
cross join lateral (select public.can_view_material_cost_details(r.project_id) as allowed) as cv
left join public.profiles rb on rb.id = r.requested_by
left join public.profiles aa on aa.id = r.assigned_admin
left join lateral (
  select count(*) as item_count,
         string_agg(i.material_name || ' ' || trim_scale(i.quantity)::text || ' ' || i.unit, ', '
                    order by i.created_at, i.id) as items_summary
  from public.material_request_items i
  where i.request_id = r.id
) as items on true
where public.can_access_material_request(r.id);

-- -----------------------------------------------------------------------------
-- material_request_item_directory: request items with the same columns as
-- material_request_items. approved_unit_cost / actual_unit_cost are NULL unless
-- the caller may see approved/actual costs. API users cannot select those two
-- columns from the base table, so "select *" on items goes through this view.
-- -----------------------------------------------------------------------------
create view public.material_request_item_directory
with (security_barrier = true)
as
select
  i.id,
  i.request_id,
  i.material_id,
  i.material_name,
  i.category,
  i.quantity,
  i.unit,
  i.estimated_unit_cost,
  case when cv.allowed then i.approved_unit_cost end as approved_unit_cost,
  case when cv.allowed then i.actual_unit_cost end as actual_unit_cost,
  i.delivered_quantity,
  i.notes,
  i.created_at,
  i.updated_at
from public.material_request_items i
join public.material_requests r on r.id = i.request_id
cross join lateral (select public.can_view_material_cost_details(r.project_id) as allowed) as cv
where public.can_access_material_request(i.request_id);

-- -----------------------------------------------------------------------------
-- project_material_summary: per-project request counts and costs. Only
-- requests the caller can access are aggregated. Approved / actual totals are
-- NULL unless the caller may see approved/actual costs.
-- -----------------------------------------------------------------------------
create view public.project_material_summary
with (security_barrier = true)
as
select
  p.id as project_id,
  coalesce(s.total_requests, 0)::int as total_requests,
  coalesce(s.pending_requests, 0)::int as pending_requests,
  coalesce(s.approved_requests, 0)::int as approved_requests,
  coalesce(s.ordered_requests, 0)::int as ordered_requests,
  coalesce(s.delivered_requests, 0)::int as delivered_requests,
  coalesce(s.pending_material_cost, 0) as pending_material_cost,
  case when public.can_view_material_cost_details(p.id) then coalesce(s.approved_material_cost, 0) end
    as approved_material_cost,
  case when public.can_view_material_cost_details(p.id) then coalesce(s.actual_material_cost, 0) end
    as actual_material_cost
from public.projects p
left join lateral (
  select
    count(*) as total_requests,
    count(*) filter (where r.status in ('requested', 'pending_review')) as pending_requests,
    count(*) filter (where r.status = 'approved') as approved_requests,
    count(*) filter (where r.status in ('ordered', 'partially_delivered')) as ordered_requests,
    count(*) filter (where r.status = 'delivered') as delivered_requests,
    sum(r.estimated_cost) filter (where r.status in ('requested', 'pending_review')) as pending_material_cost,
    sum(r.approved_cost) filter (where r.status in ('approved', 'ordered', 'partially_delivered', 'delivered')) as approved_material_cost,
    sum(r.actual_cost) filter (where r.status not in ('rejected', 'cancelled')) as actual_material_cost
  from public.material_requests r
  where r.project_id = p.id
    and r.archived_at is null
    and public.can_access_material_request(r.id)
) as s on true
where public.can_access_project(p.id);

-- -----------------------------------------------------------------------------
-- team_directory: names/roles of active team members (no email or phone).
-- -----------------------------------------------------------------------------
create view public.team_directory
with (security_barrier = true)
as
select
  pr.id,
  pr.full_name,
  pr.role,
  pr.employee_id,
  pr.status,
  pr.avatar_url
from public.profiles pr
where pr.status = 'active'
  and pr.role is not null
  and public.current_app_role() is not null;

-- -----------------------------------------------------------------------------
-- activity_feed: audit rows filtered by the audit_logs RLS policy.
-- -----------------------------------------------------------------------------
create view public.activity_feed
with (security_invoker = true)
as
select
  a.id,
  a.user_id,
  a.actor_name,
  a.role,
  a.action,
  a.entity_type,
  a.entity_id,
  a.project_id,
  a.summary,
  a.metadata,
  a.metadata ->> 'project_code' as project_code,
  a.metadata ->> 'project_name' as project_name,
  a.created_at
from public.audit_logs a;

-- -----------------------------------------------------------------------------
-- Privileges: anon nothing, authenticated read-only.
-- -----------------------------------------------------------------------------
revoke all on public.project_directory, public.project_financial_summary, public.client_directory,
              public.material_request_directory, public.material_request_item_directory,
              public.project_material_summary, public.team_directory, public.activity_feed
  from public, anon, authenticated;

grant select on public.project_directory, public.project_financial_summary, public.client_directory,
                public.material_request_directory, public.material_request_item_directory,
                public.project_material_summary, public.team_directory, public.activity_feed
  to authenticated;
