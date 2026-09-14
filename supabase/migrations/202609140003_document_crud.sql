create or replace function public.create_document(
  p_title text,
  p_normalized_title text,
  p_slug text,
  p_summary text,
  p_body_markdown text,
  p_frontmatter jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_document public.documents;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  insert into public.documents (
    owner_id,
    title,
    normalized_title,
    slug,
    summary,
    body_markdown,
    frontmatter,
    status
  )
  values (
    (select auth.uid()),
    p_title,
    p_normalized_title,
    p_slug,
    p_summary,
    p_body_markdown,
    p_frontmatter,
    'active'
  )
  returning * into created_document;

  insert into public.document_revisions (
    document_id,
    revision_number,
    title,
    summary,
    body_markdown,
    frontmatter
  )
  values (
    created_document.id,
    created_document.version,
    created_document.title,
    created_document.summary,
    created_document.body_markdown,
    created_document.frontmatter
  );

  return created_document.id;
end;
$$;

create or replace function public.update_document(
  p_document_id uuid,
  p_expected_version integer,
  p_title text,
  p_normalized_title text,
  p_summary text,
  p_body_markdown text,
  p_frontmatter jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_document public.documents;
begin
  update public.documents
  set
    title = p_title,
    normalized_title = p_normalized_title,
    summary = p_summary,
    body_markdown = p_body_markdown,
    frontmatter = p_frontmatter,
    status = 'active',
    version = version + 1
  where id = p_document_id
    and owner_id = (select auth.uid())
    and version = p_expected_version
    and deleted_at is null
  returning * into updated_document;

  if updated_document.id is null then
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
  end if;

  insert into public.document_revisions (
    document_id,
    revision_number,
    title,
    summary,
    body_markdown,
    frontmatter
  )
  values (
    updated_document.id,
    updated_document.version,
    updated_document.title,
    updated_document.summary,
    updated_document.body_markdown,
    updated_document.frontmatter
  );

  return updated_document.version;
end;
$$;

revoke all on function public.create_document(text, text, text, text, text, jsonb) from public, anon;
revoke all on function public.update_document(uuid, integer, text, text, text, text, jsonb) from public, anon;

grant execute on function public.create_document(text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.update_document(uuid, integer, text, text, text, text, jsonb) to authenticated;
