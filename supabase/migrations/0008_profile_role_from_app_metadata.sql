-- =============================================================================
-- 0008: profile role from app_metadata set after the auth.users INSERT
--
-- Supabase Auth's admin createUser() inserts the auth.users row first and
-- writes app_metadata (role, employee_id) in a follow-up UPDATE. The
-- on_auth_user_created trigger therefore saw no role, and users created from
-- the app ended up as role-less profiles ("No access").
--
-- This migration:
--   1. copies role/employee_id from app_metadata into a still role-less
--      profile whenever app_metadata changes (only the service role can write
--      app_metadata, so the value is trusted; existing roles are never changed
--      here — role changes stay owner-controlled);
--   2. backfills profiles already affected;
--   3. stops set_user_status from activating a profile that has no role.
-- =============================================================================

create or replace function public.handle_user_app_metadata_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_text text := nullif(btrim(coalesce(new.raw_app_meta_data ->> 'role', '')), '');
  v_employee  text := nullif(btrim(coalesce(new.raw_app_meta_data ->> 'employee_id', '')), '');
begin
  if v_role_text is null or v_role_text not in ('owner', 'admin', 'site_manager') then
    return new;
  end if;

  -- Never let a duplicate employee ID break the auth write itself.
  if v_employee is not null and exists (
    select 1 from public.profiles p where lower(p.employee_id) = lower(v_employee) and p.id <> new.id
  ) then
    v_employee := null;
  end if;

  update public.profiles p
     set role        = v_role_text::public.app_role,
         employee_id = coalesce(p.employee_id, v_employee),
         -- A role-less profile was never working staff (deactivated staff keep
         -- their role, so they never reach this branch): its first role activates it.
         status      = 'active'::public.user_status
   where p.id = new.id
     and p.role is null;

  return new;
end
$$;

revoke all on function public.handle_user_app_metadata_change() from public, anon, authenticated;

drop trigger if exists on_auth_user_app_metadata_changed on auth.users;
create trigger on_auth_user_app_metadata_changed
  after update of raw_app_meta_data on auth.users
  for each row
  when (old.raw_app_meta_data is distinct from new.raw_app_meta_data)
  execute function public.handle_user_app_metadata_change();

-- Backfill accounts created before this fix.
update public.profiles p
   set role        = (u.raw_app_meta_data ->> 'role')::public.app_role,
       employee_id = coalesce(
                       p.employee_id,
                       case
                         when not exists (
                           select 1 from public.profiles q
                            where lower(q.employee_id) = lower(u.raw_app_meta_data ->> 'employee_id')
                              and q.id <> p.id
                         ) then nullif(btrim(u.raw_app_meta_data ->> 'employee_id'), '')
                       end
                     ),
       status      = 'active'::public.user_status
  from auth.users u
 where u.id = p.id
   and p.role is null
   and u.raw_app_meta_data ->> 'role' in ('owner', 'admin', 'site_manager');

-- A profile without a role cannot be activated (it would look active but have no access).
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
  if p_status = 'active' and v_target_role is null then
    perform public.raise_app_error('VALIDATION', 'This user has no role yet. Set their role before activating them.');
  end if;

  update public.profiles p
     set status = p_status
   where p.id = p_user_id
     and p.status is distinct from p_status;
end
$$;

revoke all on function public.set_user_status(uuid, public.user_status) from public, anon;
grant execute on function public.set_user_status(uuid, public.user_status) to authenticated;
