\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values ('50000000-0000-0000-0000-000000000005', 'annotation@example.com', '{}'::jsonb, now(), now());

set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000005';

select public.create_document(
  '주석 문서', '주석 문서', '주석-문서', '', '원래 선택한 문장입니다.', '{}'::jsonb, '[]'::jsonb
) as document_id \gset

insert into public.annotations (
  owner_id, document_id, document_revision, body_markdown, anchor_start, anchor_end,
  quote_exact, quote_prefix, quote_suffix
) values (
  (select auth.uid()), :'document_id', 1, '개인 메모', 3, 6,
  '선택한', '원래 ', ' 문장입니다.'
) returning id as annotation_id \gset

select public.update_document_with_annotation_anchors(
  :'document_id', 1, '주석 문서', '주석 문서', '', '앞에 추가한 원래 선택한 문장입니다.',
  '{}'::jsonb, '[]'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'id', :'annotation_id', 'anchor_start', 8, 'anchor_end', 11,
    'quote_prefix', '가한 원래 ', 'quote_suffix', ' 문장입니다.', 'status', 'active'
  ))
);

select anchor_start as v_anchor_start, status as v_status
from public.annotations where id = :'annotation_id' \gset
select case when :v_anchor_start = 8 then 1 else 1 / 0 end;
select case when :'v_status' = 'active' then 1 else 1 / 0 end;

update public.annotations set deleted_at = now() where id = :'annotation_id';
select count(*) as v_deleted_count
from public.annotations where id = :'annotation_id' and deleted_at is not null \gset
select case when :v_deleted_count = 1 then 1 else 1 / 0 end;

rollback;

\echo 'Annotation checks passed.'
