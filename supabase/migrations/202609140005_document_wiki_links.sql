drop function public.create_document(text, text, text, text, text, jsonb);
drop function public.update_document(uuid, integer, text, text, text, text, jsonb);

create or replace function public.create_document(
  p_title text,
  p_normalized_title text,
  p_slug text,
  p_summary text,
  p_body_markdown text,
  p_frontmatter jsonb,
  p_link_targets jsonb
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

  if exists (
    select 1 from public.document_aliases
    where owner_id = (select auth.uid())
      and normalized_alias = p_normalized_title
  ) then
    raise exception 'document_title_conflict' using errcode = '23505';
  end if;

  insert into public.documents (
    owner_id, title, normalized_title, slug, summary, body_markdown, frontmatter, status
  ) values (
    (select auth.uid()), p_title, p_normalized_title, p_slug, p_summary,
    p_body_markdown, p_frontmatter, 'active'
  ) returning * into created_document;

  insert into public.document_revisions (
    document_id, revision_number, title, summary, body_markdown, frontmatter
  ) values (
    created_document.id, created_document.version, created_document.title,
    created_document.summary, created_document.body_markdown, created_document.frontmatter
  );

  insert into public.document_links (
    source_document_id, target_document_id, link_kind, occurrence_count, first_position
  )
  with parsed_links as (
    select normalized_title, first_position
    from jsonb_to_recordset(coalesce(p_link_targets, '[]'::jsonb))
      as item(normalized_title text, first_position integer)
  ), resolved_links as (
    select parsed_links.first_position, target.id as target_document_id
    from parsed_links
    join lateral (
      select d.id from public.documents d
      where d.owner_id = (select auth.uid())
        and d.normalized_title = parsed_links.normalized_title
        and d.deleted_at is null
      union
      select d.id from public.document_aliases a
      join public.documents d on d.id = a.document_id
      where a.owner_id = (select auth.uid())
        and a.normalized_alias = parsed_links.normalized_title
        and d.deleted_at is null
    ) target on true
    where target.id <> created_document.id
  )
  select created_document.id, target_document_id, 'explicit'::public.link_kind,
    count(*)::integer, min(first_position)
  from resolved_links
  group by target_document_id;

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
  p_frontmatter jsonb,
  p_link_targets jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_document public.documents;
  updated_document public.documents;
begin
  select * into current_document from public.documents
  where id = p_document_id
    and owner_id = (select auth.uid())
    and deleted_at is null
  for update;

  if current_document.id is null then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;
  if current_document.version <> p_expected_version then
    raise exception 'document_version_conflict' using errcode = '40001';
  end if;

  if p_normalized_title <> current_document.normalized_title and exists (
    select 1 from public.document_aliases
    where owner_id = (select auth.uid())
      and normalized_alias = p_normalized_title
      and document_id <> p_document_id
  ) then
    raise exception 'document_title_conflict' using errcode = '23505';
  end if;

  delete from public.document_aliases
  where owner_id = (select auth.uid())
    and document_id = p_document_id
    and normalized_alias = p_normalized_title;

  if p_normalized_title <> current_document.normalized_title then
    if exists (
      select 1 from public.document_aliases
      where owner_id = (select auth.uid())
        and normalized_alias = current_document.normalized_title
        and document_id <> p_document_id
    ) then
      raise exception 'document_alias_conflict' using errcode = '23505';
    end if;

    insert into public.document_aliases (owner_id, document_id, alias, normalized_alias)
    values ((select auth.uid()), p_document_id, current_document.title, current_document.normalized_title)
    on conflict (owner_id, normalized_alias) do update
    set alias = excluded.alias
    where public.document_aliases.document_id = p_document_id;
  end if;

  update public.documents set
    title = p_title,
    normalized_title = p_normalized_title,
    summary = p_summary,
    body_markdown = p_body_markdown,
    frontmatter = p_frontmatter,
    status = 'active',
    version = version + 1
  where id = p_document_id
  returning * into updated_document;

  insert into public.document_revisions (
    document_id, revision_number, title, summary, body_markdown, frontmatter
  ) values (
    updated_document.id, updated_document.version, updated_document.title,
    updated_document.summary, updated_document.body_markdown, updated_document.frontmatter
  );

  delete from public.document_links where source_document_id = p_document_id;
  insert into public.document_links (
    source_document_id, target_document_id, link_kind, occurrence_count, first_position
  )
  with parsed_links as (
    select normalized_title, first_position
    from jsonb_to_recordset(coalesce(p_link_targets, '[]'::jsonb))
      as item(normalized_title text, first_position integer)
  ), resolved_links as (
    select parsed_links.first_position, target.id as target_document_id
    from parsed_links
    join lateral (
      select d.id from public.documents d
      where d.owner_id = (select auth.uid())
        and d.normalized_title = parsed_links.normalized_title
        and d.deleted_at is null
      union
      select d.id from public.document_aliases a
      join public.documents d on d.id = a.document_id
      where a.owner_id = (select auth.uid())
        and a.normalized_alias = parsed_links.normalized_title
        and d.deleted_at is null
    ) target on true
    where target.id <> p_document_id
  )
  select p_document_id, target_document_id, 'explicit'::public.link_kind,
    count(*)::integer, min(first_position)
  from resolved_links
  group by target_document_id;

  return updated_document.version;
end;
$$;

revoke all on function public.create_document(text, text, text, text, text, jsonb, jsonb) from public, anon;
revoke all on function public.update_document(uuid, integer, text, text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_document(text, text, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.update_document(uuid, integer, text, text, text, text, jsonb, jsonb) to authenticated;
