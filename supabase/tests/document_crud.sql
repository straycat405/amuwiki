\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values ('30000000-0000-0000-0000-000000000003', 'writer@example.com', '{}'::jsonb, now(), now());

set local role authenticated;
set local request.jwt.claim.sub = '30000000-0000-0000-0000-000000000003';

select public.create_document(
  '첫 문서',
  '첫 문서',
  '첫-문서',
  '요약',
  '# 첫 문서',
  '{}'::jsonb,
  '[]'::jsonb
) as document_id \gset

do $$
begin
  if (
    select count(*)
    from public.document_revisions r
    join public.documents d on d.id = r.document_id
    where d.slug = '첫-문서'
  ) <> 1 then
    raise exception 'create must write the first revision';
  end if;
end;
$$;

select public.update_document(
  :'document_id',
  1,
  '첫 문서 수정',
  '첫 문서 수정',
  '새 요약',
  '# 수정됨',
  '{}'::jsonb,
  '[]'::jsonb
);

do $$
declare
  tested_document_id uuid;
begin
  select id into tested_document_id from public.documents where slug = '첫-문서';

  if (select version from public.documents where id = tested_document_id) <> 2 then
    raise exception 'update must increment the version';
  end if;

  if (select count(*) from public.document_revisions where document_id = tested_document_id) <> 2 then
    raise exception 'update must write a revision';
  end if;
end;
$$;

do $$
declare
  tested_document_id uuid;
begin
  select id into tested_document_id from public.documents where slug = '첫-문서';

  begin
    perform public.update_document(
      tested_document_id, 1, '충돌', '충돌', '', '', '{}'::jsonb, '[]'::jsonb
    );
    raise exception 'stale update unexpectedly succeeded';
  exception
    when serialization_failure then null;
  end;
end;
$$;

rollback;

\echo 'Document CRUD checks passed.'
