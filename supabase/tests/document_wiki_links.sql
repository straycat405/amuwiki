\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values ('50000000-0000-0000-0000-000000000005', 'links@example.com', '{}'::jsonb, now(), now());

set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000005';

select public.create_document(
  '개념', '개념', '개념', '', '# 개념', '{}'::jsonb, '[]'::jsonb
) as target_document_id \gset

select public.create_document(
  '원본', '원본', '원본', '', '[[개념]] 그리고 [[개념|다른 이름]]', '{}'::jsonb,
  '[
    {"normalized_title": "개념", "first_position": 0},
    {"normalized_title": "개념", "first_position": 11}
  ]'::jsonb
) as source_document_id \gset

do $$
declare
  source_id uuid;
  target_id uuid;
begin
  select id into source_id from public.documents where slug = '원본';
  select id into target_id from public.documents where slug = '개념';
  if not exists (
    select 1 from public.document_links
    where source_document_id = source_id
      and target_document_id = target_id
      and link_kind = 'explicit'
      and occurrence_count = 2
      and first_position = 0
  ) then
    raise exception 'create must index all resolved wiki links';
  end if;
end;
$$;

select public.update_document(
  :'target_document_id', 1, '새 개념', '새 개념', '', '# 새 개념', '{}'::jsonb, '[]'::jsonb
);

do $$
declare
  target_id uuid;
begin
  select id into target_id from public.documents where slug = '개념';
  if not exists (
    select 1 from public.document_aliases
    where document_id = target_id
      and normalized_alias = '개념'
  ) then
    raise exception 'title changes must preserve the former title as an alias';
  end if;

  begin
    perform public.create_document(
      '개념', '개념', '충돌', '', '', '{}'::jsonb, '[]'::jsonb
    );
    raise exception 'document title conflicting with an alias unexpectedly succeeded';
  exception
    when unique_violation then null;
  end;
end;
$$;

select public.update_document(
  :'source_document_id', 1, '원본', '원본', '', '[[개념]]', '{}'::jsonb,
  '[{"normalized_title": "개념", "first_position": 0}]'::jsonb
);

do $$
declare
  source_id uuid;
  target_id uuid;
begin
  select id into source_id from public.documents where slug = '원본';
  select id into target_id from public.documents where slug = '개념';
  if not exists (
    select 1 from public.document_links
    where source_document_id = source_id
      and target_document_id = target_id
      and occurrence_count = 1
  ) then
    raise exception 'link reindex must resolve a former title alias';
  end if;
end;
$$;

rollback;

\echo 'Document wiki link checks passed.'
