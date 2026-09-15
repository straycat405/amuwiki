\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values
  ('60000000-0000-0000-0000-000000000006', 'lint@example.com', '{}'::jsonb, now(), now()),
  ('60000000-0000-0000-0000-000000000007', 'lint-other@example.com', '{}'::jsonb, now(), now());

set local role authenticated;
set local request.jwt.claim.sub = '60000000-0000-0000-0000-000000000006';

select public.create_document(
  '원본', '원본', '원본', '', '[[개념]] 그리고 [[개념|다른 이름]]', '{}'::jsonb,
  '[
    {"normalized_title": "개념", "title": "개념", "first_position": 0},
    {"normalized_title": "개념", "title": "개념", "first_position": 11}
  ]'::jsonb
) as source_document_id \gset

do $$
declare
  source_id uuid := (select id from public.documents where slug = '원본');
begin
  if not exists (
    select 1 from public.document_unresolved_links
    where source_document_id = source_id
      and normalized_title = '개념'
      and title = '개념'
      and occurrence_count = 2
      and first_position = 0
  ) then
    raise exception 'unresolved wiki links must be stored at save time';
  end if;
end;
$$;

select public.refresh_lint_suggestions();

do $$
declare
  source_id uuid := (select id from public.documents where slug = '원본');
  pending_count integer := (select count(*) from public.document_suggestions where status = 'pending');
begin
  if pending_count <> 3 then
    raise exception 'expected orphan + broken_link + fill_summary, got %', pending_count;
  end if;
  if not exists (
    select 1 from public.document_suggestions
    where document_id = source_id and kind = 'broken_link'
      and target_key = '개념' and status = 'pending'
      and payload->>'title' = '개념'
      and (payload->>'occurrenceCount')::integer = 2
  ) then
    raise exception 'broken_link suggestion missing';
  end if;
  if not exists (
    select 1 from public.document_suggestions
    where document_id = source_id and kind = 'orphan' and status = 'pending'
  ) then
    raise exception 'orphan suggestion missing';
  end if;
  if not exists (
    select 1 from public.document_suggestions
    where document_id = source_id and kind = 'fill_summary' and status = 'pending'
  ) then
    raise exception 'fill_summary suggestion missing';
  end if;
end;
$$;

-- Creating the target turns the broken link into a forward reference.
select public.create_document(
  '개념', '개념', '개념', '개념 요약', '본문', '{}'::jsonb, '[]'::jsonb
);

select public.refresh_lint_suggestions();

do $$
declare
  source_id uuid := (select id from public.documents where slug = '원본');
  target_id uuid := (select id from public.documents where slug = '개념');
begin
  if exists (
    select 1 from public.document_suggestions
    where document_id = source_id and kind = 'broken_link'
  ) then
    raise exception 'broken_link must be removed once the target exists';
  end if;
  if not exists (
    select 1 from public.document_suggestions
    where document_id = source_id and kind = 'forward_link'
      and target_key = '개념' and status = 'pending'
      and (payload->>'targetDocumentId')::uuid = target_id
      and payload->>'targetTitle' = '개념'
  ) then
    raise exception 'forward_link suggestion missing';
  end if;
  if exists (
    select 1 from public.document_suggestions
    where document_id = target_id and kind = 'fill_summary'
  ) then
    raise exception 'documents with a summary must not get fill_summary';
  end if;
end;
$$;

-- Dismissed rows survive a refresh while the finding still holds.
update public.document_suggestions
set status = 'dismissed', resolved_at = now(), payload = '{"stale": true}'::jsonb
where kind = 'forward_link';

select public.refresh_lint_suggestions();

do $$
begin
  if not exists (
    select 1 from public.document_suggestions
    where kind = 'forward_link'
      and status = 'dismissed' and payload = '{"stale": true}'::jsonb
  ) then
    raise exception 'refresh must not reset dismissed suggestions';
  end if;
end;
$$;

-- Reindexing resolves the link without a new revision and clears the finding.
select public.reindex_document_links(
  :'source_document_id',
  '[
    {"normalized_title": "개념", "title": "개념", "first_position": 0},
    {"normalized_title": "개념", "title": "개념", "first_position": 11}
  ]'::jsonb
);

select public.refresh_lint_suggestions();

do $$
declare
  source_id uuid := (select id from public.documents where slug = '원본');
  target_id uuid := (select id from public.documents where slug = '개념');
begin
  if not exists (
    select 1 from public.document_links
    where source_document_id = source_id
      and target_document_id = target_id
      and occurrence_count = 2
  ) then
    raise exception 'reindex must create the resolved link';
  end if;
  if exists (
    select 1 from public.document_unresolved_links where source_document_id = source_id
  ) then
    raise exception 'reindex must clear unresolved links';
  end if;
  if (select version from public.documents where id = source_id) <> 1 then
    raise exception 'reindex must not bump the document version';
  end if;
  if (select count(*) from public.document_revisions where document_id = source_id) <> 1 then
    raise exception 'reindex must not create a revision';
  end if;
  if exists (
    select 1 from public.document_suggestions where kind in ('forward_link', 'orphan')
  ) then
    raise exception 'resolved links must clear forward_link and orphan findings';
  end if;
end;
$$;

-- Filling the summary through the normal save path clears fill_summary.
select public.update_document(
  :'source_document_id', 1, '원본', '원본', '원본 요약', '[[개념]] 그리고 [[개념|다른 이름]]', '{}'::jsonb,
  '[
    {"normalized_title": "개념", "title": "개념", "first_position": 0},
    {"normalized_title": "개념", "title": "개념", "first_position": 11}
  ]'::jsonb
);

select public.refresh_lint_suggestions();

do $$
declare
  pending_count integer := (select count(*) from public.document_suggestions where status = 'pending');
begin
  if pending_count <> 0 then
    raise exception 'expected no pending suggestions, got %', pending_count;
  end if;
end;
$$;

-- Another user sees nothing.
set local request.jwt.claim.sub = '60000000-0000-0000-0000-000000000007';

select public.refresh_lint_suggestions();

do $$
begin
  if exists (select 1 from public.document_suggestions) then
    raise exception 'RLS must hide other users'' suggestions';
  end if;
  if exists (select 1 from public.document_unresolved_links) then
    raise exception 'RLS must hide other users'' unresolved links';
  end if;
end;
$$;

rollback;
