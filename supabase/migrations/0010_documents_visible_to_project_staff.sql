-- =============================================================================
-- 0010: project documents ("Design & Floor Map") readable by all project staff
--
-- Documents (designs, floor maps, drawings, photos) are now readable, view and
-- download only, by everyone who can open the project: the owner, assigned site
-- managers and admins, and admins who reach the project through its material
-- requests (can_access_project). Previously only the owner and project members
-- could read them.
--
-- Write rules are unchanged: the owner uploads anything; assigned site
-- managers upload to open projects; only the owner archives. Admins never
-- upload.
-- =============================================================================

drop policy project_documents_select on public.project_documents;
create policy project_documents_select on public.project_documents
  for select to authenticated
  using (public.can_access_project(project_id));

-- Same as 0007 except the read branch, which now follows can_access_project().
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

  return public.can_access_project(v_project_id);
end
$$;

revoke all on function public.can_access_project_document_object(text, boolean) from public, anon;
grant execute on function public.can_access_project_document_object(text, boolean) to authenticated, service_role;
