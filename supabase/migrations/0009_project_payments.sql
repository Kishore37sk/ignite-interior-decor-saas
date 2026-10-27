-- =============================================================================
-- 0009: client payments ledger and shareable payment statements
--
--   * project_payments: every amount the client paid, with date and mode
--     (cash, card, UPI, bank transfer, cheque, other). Owner writes; the owner
--     and members granted financial access read.
--   * project_payment_links: one secret token per project. Anyone holding the
--     link can open a read-only payment statement (/statement/<token>) without
--     signing in. The owner creates, regenerates (new token) and disables it.
--   * get_payment_statement(token): the ONLY function anon may execute. It
--     returns the statement for a valid token and NULL otherwise, and exposes
--     no internal notes, staff names or material costs.
--   * project_financial_summary.advance_received now means "amount received"
--     and is the sum of the ledger. Advances recorded before this migration are
--     copied into the ledger as opening payments (mode "other"), so totals do
--     not change. project_financials.advance_received is no longer read.
-- =============================================================================

create type public.payment_mode as enum ('cash', 'card', 'upi', 'bank_transfer', 'cheque', 'other');

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.project_payments (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  amount      numeric(14, 2) not null check (amount > 0),
  paid_on     date not null default public.app_today(),
  mode        public.payment_mode not null,
  -- Shown to the client on the statement (UPI/transaction ID, cheque number).
  reference   text check (reference is null or length(reference) <= 120),
  -- Internal only; never returned by get_payment_statement.
  notes       text check (notes is null or length(notes) <= 1000),
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) default auth.uid(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id)
);
create index project_payments_project_id_idx on public.project_payments (project_id, paid_on desc);
create index project_payments_created_by_idx on public.project_payments (created_by);
create index project_payments_updated_by_idx on public.project_payments (updated_by);

create table public.project_payment_links (
  project_id  uuid primary key references public.projects (id) on delete cascade,
  -- 256 bits of randomness; the app normally supplies its own random token.
  token       text not null unique
              default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
              check (token ~ '^[A-Za-z0-9_-]{32,128}$'),
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) default auth.uid()
);
create index project_payment_links_created_by_idx on public.project_payment_links (created_by);

create trigger set_updated_at before update on public.project_payments
  for each row execute function public.set_updated_at();
create trigger set_updated_by before insert or update on public.project_payments
  for each row execute function public.set_updated_by();

-- -----------------------------------------------------------------------------
-- Backfill: advances recorded before the ledger existed become opening payments.
-- -----------------------------------------------------------------------------
insert into public.project_payments (project_id, amount, paid_on, mode, notes, created_at, created_by)
select f.project_id,
       f.advance_received,
       coalesce(p.start_date, (p.created_at at time zone 'Asia/Kolkata')::date),
       'other',
       'Advance recorded before payment tracking. Edit to set the real mode and date.',
       f.updated_at,
       f.updated_by
from public.project_financials f
join public.projects p on p.id = f.project_id
where f.advance_received > 0;

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
alter table public.project_payments      enable row level security;
alter table public.project_payment_links enable row level security;

create policy project_payments_select on public.project_payments
  for select to authenticated
  using (public.can_view_project_financials(project_id));

create policy project_payments_insert on public.project_payments
  for insert to authenticated
  with check ((select public.is_owner()));

create policy project_payments_update on public.project_payments
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

create policy project_payments_delete on public.project_payments
  for delete to authenticated
  using ((select public.is_owner()));

-- Tokens are bearer secrets: only the owner can read or manage them.
create policy project_payment_links_select on public.project_payment_links
  for select to authenticated
  using ((select public.is_owner()));

create policy project_payment_links_insert on public.project_payment_links
  for insert to authenticated
  with check ((select public.is_owner()));

create policy project_payment_links_update on public.project_payment_links
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

create policy project_payment_links_delete on public.project_payment_links
  for delete to authenticated
  using ((select public.is_owner()));

revoke all on public.project_payments, public.project_payment_links from public, anon, authenticated;
grant select, insert, update, delete on public.project_payments to authenticated;
grant select, insert, update, delete on public.project_payment_links to authenticated;

-- Payment and link rows are financial: members never see them in the activity
-- feed (same rule as project_financials).
drop policy audit_logs_select on public.audit_logs;
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
          and entity_type not in ('project_financials', 'project_payments', 'project_payment_links',
                                  'profiles', 'clients')
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
-- Audit trail (readable summaries; tokens are never written to the log)
-- -----------------------------------------------------------------------------
create or replace function public.audit_project_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor        uuid := auth.uid();
  v_actor_name   text;
  v_actor_role   public.app_role;
  v_label        text;
  v_row          jsonb;
  v_project_id   uuid;
  v_project_code text;
  v_project_name text;
  v_action       text := lower(tg_op);
  v_summary      text;
  v_old          jsonb;
  v_new          jsonb;
  v_mode         text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new);
  end if;
  v_row := coalesce(v_new, v_old);
  v_project_id := (v_row ->> 'project_id')::uuid;

  select p.full_name, p.role into v_actor_name, v_actor_role
  from public.profiles p where p.id = v_actor;
  if v_actor is not null and v_actor_name is null then
    v_actor := null;
  end if;
  v_label := coalesce(coalesce(public.humanize(v_actor_role::text) || ' ', '') || v_actor_name, 'System');

  -- The project row is already gone when a cascade removes its payments.
  select p.project_code, p.name into v_project_code, v_project_name
  from public.projects p where p.id = v_project_id;
  if v_project_code is null and tg_op = 'DELETE' then
    return null;
  end if;

  if tg_table_name = 'project_payments' then
    v_old := v_old - 'updated_at' - 'updated_by';
    v_new := v_new - 'updated_at' - 'updated_by';
    if tg_op = 'UPDATE' and v_old = v_new then
      return null;
    end if;
    if tg_op = 'INSERT' then
      v_mode := public.humanize(new.mode::text);
      v_summary := format('%s recorded a payment of %s (%s) for %s', v_label, public.format_inr(new.amount),
                          case when new.mode = 'upi' then 'UPI' else v_mode end, v_project_code);
    elsif tg_op = 'DELETE' then
      v_summary := format('%s deleted a payment of %s dated %s for %s', v_label, public.format_inr(old.amount),
                          to_char(old.paid_on, 'DD Mon YYYY'), v_project_code);
    else
      v_summary := format('%s edited a payment of %s for %s', v_label, public.format_inr(new.amount), v_project_code);
    end if;
  else
    v_old := v_old - 'token';
    v_new := v_new - 'token';
    v_summary := case tg_op
      when 'INSERT' then format('%s created the client payment link of %s', v_label, v_project_code)
      when 'UPDATE' then format('%s regenerated the client payment link of %s', v_label, v_project_code)
      else format('%s disabled the client payment link of %s', v_label, v_project_code)
    end;
  end if;

  insert into public.audit_logs (
    user_id, actor_name, role, action, entity_type, entity_id, project_id,
    summary, old_data, new_data, metadata
  ) values (
    v_actor, coalesce(v_actor_name, 'System'), v_actor_role, v_action, tg_table_name,
    case when tg_table_name = 'project_payments' then (v_row ->> 'id')::uuid else v_project_id end,
    v_project_id, v_summary, v_old, v_new,
    jsonb_build_object('project_code', v_project_code, 'project_name', v_project_name)
  );
  return null;
end
$$;

create trigger audit_row_change after insert or update or delete on public.project_payments
  for each row execute function public.audit_project_payment();
create trigger audit_row_change after insert or update or delete on public.project_payment_links
  for each row execute function public.audit_project_payment();

-- -----------------------------------------------------------------------------
-- project_financial_summary: advance_received is now the ledger total.
-- Columns are appended so existing callers keep working.
-- -----------------------------------------------------------------------------
create or replace view public.project_financial_summary
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
  coalesce(pay.received, 0)::numeric as advance_received,
  coalesce(mc.estimated, 0) as material_estimated_cost,
  coalesce(mc.approved, 0) as material_approved_cost,
  coalesce(mc.actual, 0) as material_actual_cost,
  (coalesce(mc.variance_actual, 0) - coalesce(mc.variance_estimated, 0)) as material_variance,
  coalesce(mc.variance_estimated, 0) as material_variance_estimated_cost,
  coalesce(mc.variance_actual, 0) as material_variance_actual_cost,
  coalesce(pay.payment_count, 0)::int as payment_count,
  pay.last_paid_on as last_payment_on
from public.projects p
join public.clients c on c.id = p.client_id
left join public.project_financials f on f.project_id = p.id
left join lateral (
  select sum(pp.amount) as received, count(*) as payment_count, max(pp.paid_on) as last_paid_on
  from public.project_payments pp
  where pp.project_id = p.id
) as pay on true
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

revoke all on public.project_financial_summary from public, anon, authenticated;
grant select on public.project_financial_summary to authenticated;

-- -----------------------------------------------------------------------------
-- Public statement for a share token (anon + authenticated).
-- -----------------------------------------------------------------------------
create or replace function public.get_payment_statement(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_cost       numeric;
  v_received   numeric;
  v_result     jsonb;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,128}$' then
    return null;
  end if;

  select l.project_id into v_project_id
  from public.project_payment_links l
  where l.token = p_token;
  if v_project_id is null then
    return null;
  end if;

  select coalesce(f.project_cost, 0) into v_cost
  from public.project_financials f where f.project_id = v_project_id;
  select coalesce(sum(pp.amount), 0) into v_received
  from public.project_payments pp where pp.project_id = v_project_id;
  v_cost := coalesce(v_cost, 0);

  select jsonb_build_object(
    'company', (
      select jsonb_build_object('name', s.company_name, 'phone', s.phone, 'email', s.email,
                                'address', s.address, 'logo_url', s.logo_url)
      from public.company_settings s where s.id = 1
    ),
    'project', jsonb_build_object(
      'code', p.project_code,
      'name', p.name,
      'city', p.city,
      'status', p.status,
      'client_name', c.name
    ),
    'totals', jsonb_build_object(
      'project_cost', v_cost,
      'received', v_received,
      'balance', v_cost - v_received
    ),
    'by_mode', coalesce((
      select jsonb_agg(jsonb_build_object('mode', m.mode, 'amount', m.amount, 'count', m.n) order by m.amount desc)
      from (
        select pp.mode, sum(pp.amount) as amount, count(*) as n
        from public.project_payments pp
        where pp.project_id = v_project_id
        group by pp.mode
      ) m
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('paid_on', pp.paid_on, 'mode', pp.mode, 'amount', pp.amount,
                                          'reference', pp.reference)
                       order by pp.paid_on desc, pp.created_at desc)
      from public.project_payments pp
      where pp.project_id = v_project_id
    ), '[]'::jsonb),
    'generated_at', pg_catalog.now()
  )
  into v_result
  from public.projects p
  join public.clients c on c.id = p.client_id
  where p.id = v_project_id;

  return v_result;
end
$$;

revoke all on function public.audit_project_payment() from public, anon, authenticated;
revoke all on function public.get_payment_statement(text) from public;
grant execute on function public.get_payment_statement(text) to anon, authenticated, service_role;
