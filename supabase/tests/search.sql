\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values ('60000000-0000-0000-0000-000000000006', 'search@example.com', '{}'::jsonb, now(), now());

set local role authenticated;
set local request.jwt.claim.sub = '60000000-0000-0000-0000-000000000006';

select public.create_document(
  '찾는 표현 제목', '찾는 표현 제목', '찾는-표현-제목', '', '', '{}'::jsonb, '[]'::jsonb
) as title_document_id \gset

select public.create_document(
  '관찰 기록', '관찰 기록', '관찰-기록', '', '이 문서 본문에는 찾는 표현이 있습니다.', '{}'::jsonb, '[]'::jsonb
) as body_document_id \gset

select public.create_document(
  '첨부 이미지 기록',
  '첨부 이미지 기록',
  '첨부-이미지-기록',
  '',
  '관찰 사진입니다. ![gradient.png](/api/attachments/6da3607d-e663-4136-80ac-821768517abc) [설명 문서](/api/attachments/hidden-route) [[내부 대상|표시 개념]]',
  '{}'::jsonb,
  '[]'::jsonb
) as attachment_document_id \gset

insert into public.documents (
  owner_id, title, normalized_title, slug, body_markdown, status
) values (
  (select auth.uid()), '임시 문서', '임시 문서', '임시-문서', '찾는 표현이 있지만 숨겨집니다.', 'draft'
);

do $$
declare
  found_titles text[];
  body_rank smallint;
  body_context text;
begin
  select array_agg(title order by rank_tier, title)
  into found_titles
  from public.search_documents('찾는 표현', 20);

  if found_titles <> array['찾는 표현 제목', '관찰 기록'] then
    raise exception 'search must rank title matches before body matches and exclude drafts: %', found_titles;
  end if;

  select rank_tier into body_rank
  from public.search_documents('찾는 표현', 20)
  where slug = '관찰-기록';

  if body_rank <> 5 then
    raise exception 'body-only match must use rank tier 5';
  end if;

  select matched_context into body_context
  from public.search_documents('찾는 표현', 20)
  where slug = '관찰-기록';

  if body_context not like '%찾는 표현%' then
    raise exception 'body-only match must include a contextual preview: %', body_context;
  end if;

  if exists (select 1 from public.search_documents('attachments', 20)) then
    raise exception 'internal attachment paths must not be searchable';
  end if;

  if exists (select 1 from public.search_documents('6da3607d', 20)) then
    raise exception 'internal attachment identifiers must not be searchable';
  end if;

  select matched_context into body_context
  from public.search_documents('gradient.png', 20)
  where slug = '첨부-이미지-기록';

  if body_context not like '%gradient.png%' then
    raise exception 'visible image alt text must remain searchable: %', body_context;
  end if;

  if not exists (
    select 1 from public.search_documents('설명 문서', 20)
    where slug = '첨부-이미지-기록'
  ) then
    raise exception 'visible Markdown link labels must remain searchable';
  end if;

  if not exists (
    select 1 from public.search_documents('표시 개념', 20)
    where slug = '첨부-이미지-기록'
  ) then
    raise exception 'visible Wiki link labels must remain searchable';
  end if;
end;
$$;

rollback;

\echo 'Document body search checks passed.'
