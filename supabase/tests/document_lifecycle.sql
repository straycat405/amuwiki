\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values ('40000000-0000-0000-0000-000000000004', 'lifecycle@example.com', '{}'::jsonb, now(), now());

set local role authenticated;
set local request.jwt.claim.sub = '40000000-0000-0000-0000-000000000004';

select public.create_document(
  '수명 주기 문서',
  '수명 주기 문서',
  '수명-주기-문서',
  '',
  '# 본문',
  '{}'::jsonb,
  '[]'::jsonb
) as document_id \gset

select public.archive_document(:'document_id', 1);

do $$
begin
  if not exists (
    select 1
    from public.documents
    where slug = '수명-주기-문서'
      and status = 'archived'
      and deleted_at is not null
      and version = 2
  ) then
    raise exception 'archive must soft-delete and increment the version';
  end if;
end;
$$;

select public.restore_document(:'document_id', 2);

do $$
begin
  if not exists (
    select 1
    from public.documents
    where slug = '수명-주기-문서'
      and status = 'active'
      and deleted_at is null
      and version = 3
  ) then
    raise exception 'restore must reactivate and increment the version';
  end if;
end;
$$;

do $$
declare
  tested_document_id uuid;
begin
  select id into tested_document_id from public.documents where slug = '수명-주기-문서';

  begin
    perform public.archive_document(tested_document_id, 1);
    raise exception 'stale archive unexpectedly succeeded';
  exception
    when serialization_failure then null;
  end;
end;
$$;

rollback;

\echo 'Document lifecycle checks passed.'
