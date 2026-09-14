create or replace function public.archive_document(
  p_document_id uuid,
  p_expected_version integer
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  archived_version integer;
begin
  update public.documents
  set
    status = 'archived',
    deleted_at = now(),
    version = version + 1
  where id = p_document_id
    and owner_id = (select auth.uid())
    and version = p_expected_version
    and deleted_at is null
  returning version into archived_version;

  if archived_version is not null then
    return archived_version;
  end if;

  if exists (
    select 1
    from public.documents
    where id = p_document_id
      and owner_id = (select auth.uid())
      and deleted_at is null
  ) then
    raise exception 'document_version_conflict' using errcode = '40001';
  end if;

  raise exception 'document_not_found' using errcode = 'P0002';
end;
$$;

create or replace function public.restore_document(
  p_document_id uuid,
  p_expected_version integer
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  restored_version integer;
begin
  update public.documents
  set
    status = 'active',
    deleted_at = null,
    version = version + 1
  where id = p_document_id
    and owner_id = (select auth.uid())
    and version = p_expected_version
    and deleted_at is not null
  returning version into restored_version;

  if restored_version is not null then
    return restored_version;
  end if;

  if exists (
    select 1
    from public.documents
    where id = p_document_id
      and owner_id = (select auth.uid())
      and deleted_at is not null
  ) then
    raise exception 'document_version_conflict' using errcode = '40001';
  end if;

  raise exception 'document_not_found' using errcode = 'P0002';
end;
$$;

revoke all on function public.archive_document(uuid, integer) from public, anon;
revoke all on function public.restore_document(uuid, integer) from public, anon;

grant execute on function public.archive_document(uuid, integer) to authenticated;
grant execute on function public.restore_document(uuid, integer) to authenticated;
