-- =============================================================================
-- 0007_storage_realtime_cron.sql
-- Ignite Interior Decor: private document storage, realtime publication,
-- scheduled deadline notifications and a final privilege lockdown.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Storage bucket "project-documents" (private, 25 MB per file)
-- Object path: {project_id}/{category}/{uuid}-{safe_file_name}
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-documents',
  'project-documents',
  false,
  26214400,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv',
    'image/vnd.dwg', 'image/vnd.dxf', 'application/acad', 'application/dxf',
    'application/octet-stream'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Parses "{project_id}/{category}/..." safely (no cast errors on odd paths)
-- and checks the caller's access. p_write = true additionally requires the
-- owner or an assigned site manager and a valid document category folder.
create or replace function public.can_access_project_document_object(p_name text, p_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts      text[];
  v_project_id uuid;
begin
  if p_name is null or public.current_app_role() is null then
    return false;
  end if;

  v_parts := storage.foldername(p_name);
  if v_parts is null or array_length(v_parts, 1) is null or array_length(v_parts, 1) < 2 then
    return false;
  end if;
  if v_parts[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_project_id := v_parts[1]::uuid;

  if p_write then
    if v_parts[2] not in ('photos', 'drawings', 'material_documents', 'site_reports', 'other') then
      return false;
    end if;
    if public.is_owner() then
      return exists (select 1 from public.projects p where p.id = v_project_id);
    end if;
    return public.is_project_member(v_project_id, 'site_manager')
       and exists (select 1 from public.projects p
                   where p.id = v_project_id
                     and p.archived_at is null
                     and p.status not in ('completed', 'cancelled'));
  end if;

  return public.is_owner() or public.is_project_member(v_project_id);
end
$$;

revoke all on function public.can_access_project_document_object(text, boolean) from public, anon;
grant execute on function public.can_access_project_document_object(text, boolean) to authenticated, service_role;

drop policy if exists project_documents_objects_select on storage.objects;
drop policy if exists project_documents_objects_insert on storage.objects;
drop policy if exists project_documents_objects_update on storage.objects;
drop policy if exists project_documents_objects_delete on storage.objects;

create policy project_documents_objects_select on storage.objects
  for select to authenticated
  using (bucket_id = 'project-documents' and public.can_access_project_document_object(name, false));

create policy project_documents_objects_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'project-documents' and public.can_access_project_document_object(name, true));

-- Files are immutable for everyone except the owner (documents are archived,
-- not deleted, in project_documents).
create policy project_documents_objects_update on storage.objects
  for update to authenticated
  using (bucket_id = 'project-documents' and (select public.is_owner()))
  with check (bucket_id = 'project-documents' and (select public.is_owner()));

create policy project_documents_objects_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'project-documents' and (select public.is_owner()));

-- -----------------------------------------------------------------------------
-- Realtime: postgres_changes honour RLS and column privileges, so subscribers
-- only receive rows they may select, and never the approved/actual cost
-- columns of material_requests (not granted to API roles, see 0003).
-- material_request_comments and material_deliveries let open request pages
-- refresh when someone else comments or records a delivery.
-- -----------------------------------------------------------------------------
do $$
declare
  v_table text;
begin
  if not exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Publication supabase_realtime not found; realtime tables not added.';
    return;
  end if;

  foreach v_table in array array[
    'notifications', 'material_requests', 'projects', 'project_updates',
    'material_request_comments', 'material_deliveries'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- Daily deadline notifications at 02:30 UTC (08:00 IST) via pg_cron.
-- Skipped gracefully when pg_cron is not available (enable it under
-- Database -> Extensions and re-run this block).
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available; schedule generate_deadline_notifications() externally.';
    return;
  end if;

  create extension if not exists pg_cron with schema pg_catalog;

  execute $cron$
    select cron.schedule(
      'ignite-deadline-notifications',
      '30 2 * * *',
      'select public.generate_deadline_notifications();'
    )
  $cron$;
exception
  when others then
    raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end
$$;

-- -----------------------------------------------------------------------------
-- Final lockdown: anon has no access to anything in public; functions are not
-- executable by PUBLIC unless explicitly granted above.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from public;

-- Future objects created by the migration role start locked down as well.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;
