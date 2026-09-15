-- Unresolved wiki links were previously discarded at save time; keep them so
-- lint can report broken links and detect forward references that later resolve.
create table public.document_unresolved_links (
  source_document_id uuid not null references public.documents (id) on delete cascade,
  normalized_title text not null check (char_length(normalized_title) between 1 and 200),
  title text not null check (char_length(title) between 1 and 200),
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  first_position integer not null check (first_position >= 0),
  updated_at timestamptz not null default now(),
  primary key (source_document_id, normalized_title)
);

create index document_unresolved_links_title_idx
  on public.document_unresolved_links (normalized_title);

alter table public.document_unresolved_links enable row level security;

create policy unresolved_links_owner_all on public.document_unresolved_links for all to authenticated
using (exists (
  select 1 from public.documents d
  where d.id = source_document_id and d.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.documents d
  where d.id = source_document_id and d.owner_id = (select auth.uid())
));

grant select, insert, update, delete on public.document_unresolved_links to authenticated;

create type public.suggestion_kind as enum ('orphan', 'broken_link', 'forward_link', 'fill_summary');
create type public.suggestion_status as enum ('pending', 'applied', 'dismissed');

create table public.document_suggestions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind public.suggestion_kind not null,
  document_id uuid references public.documents (id) on delete cascade,
  target_key text not null default '',
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status public.suggestion_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique nulls not distinct (owner_id, kind, document_id, target_key)
);

create index document_suggestions_owner_status_idx
  on public.document_suggestions (owner_id, status, kind);

alter table public.document_suggestions enable row level security;

create policy suggestions_owner_all on public.document_suggestions for all to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.document_suggestions to authenticated;

-- Shared link indexer: replaces the inline resolution in create/update_document
-- and is reused by reindex_document_links.
create or replace function public.index_document_links(
  p_document_id uuid,
  p_link_targets jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.document_links where source_document_id = p_document_id;
  delete from public.document_unresolved_links where source_document_id = p_document_id;

  with parsed_links as (
    select normalized_title, title, first_position
    from jsonb_to_recordset(coalesce(p_link_targets, '[]'::jsonb))
      as item(normalized_title text, title text, first_position integer)
    where normalized_title is not null and char_length(normalized_title) between 1 and 200
  ),
  resolved_links as (
    select parsed_links.normalized_title, parsed_links.title, parsed_links.first_position,
      target.id as target_document_id
    from parsed_links
    left join lateral (
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
      limit 1
    ) target on true
  ),
  inserted_links as (
    insert into public.document_links (
      source_document_id, target_document_id, link_kind, occurrence_count, first_position
    )
    select p_document_id, target_document_id, 'explicit'::public.link_kind,
      count(*)::integer, min(first_position)
    from resolved_links
    where target_document_id is not null
      and target_document_id <> p_document_id
    group by target_document_id
    returning 1
  )
  insert into public.document_unresolved_links (
    source_document_id, normalized_title, title, occurrence_count, first_position
  )
  select p_document_id, normalized_title,
    left(coalesce(min(nullif(btrim(title), '')), normalized_title), 200),
    count(*)::integer, min(first_position)
  from resolved_links
  where target_document_id is null
  group by normalized_title;
end;
$$;

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

  perform public.index_document_links(created_document.id, p_link_targets);

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

  perform public.index_document_links(p_document_id, p_link_targets);

  return updated_document.version;
end;
$$;

-- Re-resolves links without creating a revision or bumping the version.
create or replace function public.reindex_document_links(
  p_document_id uuid,
  p_link_targets jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.documents
    where id = p_document_id
      and owner_id = (select auth.uid())
      and deleted_at is null
  ) then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;

  perform public.index_document_links(p_document_id, p_link_targets);
end;
$$;

create or replace function public.lint_findings()
returns table (
  kind public.suggestion_kind,
  document_id uuid,
  target_key text,
  payload jsonb
)
language sql
security invoker
set search_path = ''
stable
as $$
  with active_documents as (
    select d.id, d.title, d.summary, d.body_markdown
    from public.documents d
    where d.owner_id = (select auth.uid())
      and d.status = 'active'
      and d.deleted_at is null
  ),
  resolution as (
    select u.source_document_id, u.normalized_title, target.id as target_document_id, target.title as target_title
    from public.document_unresolved_links u
    join active_documents s on s.id = u.source_document_id
    left join lateral (
      select d.id, d.title from public.documents d
      where d.owner_id = (select auth.uid())
        and d.normalized_title = u.normalized_title
        and d.deleted_at is null
      union
      select d.id, d.title from public.document_aliases a
      join public.documents d on d.id = a.document_id
      where a.owner_id = (select auth.uid())
        and a.normalized_alias = u.normalized_title
        and d.deleted_at is null
      limit 1
    ) target on true
  )
  select 'orphan'::public.suggestion_kind, d.id, '', '{}'::jsonb
  from active_documents d
  where not exists (select 1 from public.document_links l where l.target_document_id = d.id)
    and not exists (select 1 from public.document_links l where l.source_document_id = d.id)

  union all

  select 'broken_link', u.source_document_id, u.normalized_title,
    jsonb_build_object(
      'title', u.title,
      'occurrenceCount', u.occurrence_count,
      'firstPosition', u.first_position
    )
  from public.document_unresolved_links u
  join resolution r on r.source_document_id = u.source_document_id
    and r.normalized_title = u.normalized_title
  where r.target_document_id is null

  union all

  select 'forward_link', u.source_document_id, u.normalized_title,
    jsonb_build_object(
      'title', u.title,
      'targetDocumentId', r.target_document_id,
      'targetTitle', r.target_title
    )
  from public.document_unresolved_links u
  join resolution r on r.source_document_id = u.source_document_id
    and r.normalized_title = u.normalized_title
  where r.target_document_id is not null
    and r.target_document_id <> u.source_document_id

  union all

  select 'fill_summary', d.id, '', '{}'::jsonb
  from active_documents d
  where d.summary = '' and btrim(d.body_markdown) <> '';
$$;

-- Upserts current findings as pending and removes rows whose finding no longer
-- holds, whatever their status. Dismissed rows survive as long as the finding does.
create or replace function public.refresh_lint_suggestions()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  pending_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  with current_findings as (
    select * from public.lint_findings()
  ),
  upserted as (
    insert into public.document_suggestions (owner_id, kind, document_id, target_key, payload)
    select (select auth.uid()), f.kind, f.document_id, f.target_key, f.payload
    from current_findings f
    on conflict (owner_id, kind, document_id, target_key) do update
      set payload = excluded.payload
      where public.document_suggestions.status = 'pending'
    returning 1
  )
  delete from public.document_suggestions s
  where s.owner_id = (select auth.uid())
    and not exists (
      select 1 from current_findings f
      where f.kind = s.kind
        and f.document_id is not distinct from s.document_id
        and f.target_key = s.target_key
    );

  select count(*)::integer into pending_count
  from public.document_suggestions
  where owner_id = (select auth.uid()) and status = 'pending';

  return pending_count;
end;
$$;

revoke all on function public.index_document_links(uuid, jsonb) from public, anon;
revoke all on function public.create_document(text, text, text, text, text, jsonb, jsonb) from public, anon;
revoke all on function public.update_document(uuid, integer, text, text, text, text, jsonb, jsonb) from public, anon;
revoke all on function public.reindex_document_links(uuid, jsonb) from public, anon;
revoke all on function public.lint_findings() from public, anon;
revoke all on function public.refresh_lint_suggestions() from public, anon;

grant execute on function public.index_document_links(uuid, jsonb) to authenticated;
grant execute on function public.create_document(text, text, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.update_document(uuid, integer, text, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.reindex_document_links(uuid, jsonb) to authenticated;
grant execute on function public.lint_findings() to authenticated;
grant execute on function public.refresh_lint_suggestions() to authenticated;
