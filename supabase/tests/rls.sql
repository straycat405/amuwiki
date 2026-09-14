\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', 'owner@example.com', '{}'::jsonb, now(), now()),
  ('20000000-0000-0000-0000-000000000002', 'other@example.com', '{}'::jsonb, now(), now());

do $$
begin
  if (select count(*) from public.profiles where id in (
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002'
  )) <> 2 then
    raise exception 'new users must receive profiles';
  end if;

  if (select count(*) from public.user_preferences where user_id in (
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002'
  )) <> 2 then
    raise exception 'new users must receive preferences';
  end if;
end;
$$;

insert into public.documents (id, owner_id, slug, title, normalized_title, status)
values
  ('10000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'owner-doc', 'Owner doc', 'owner doc', 'active'),
  ('20000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000002', 'other-doc', 'Other doc', 'other doc', 'active');

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';

do $$
begin
  if (select count(*) from public.documents) <> 1 then
    raise exception 'owner must only see their own documents';
  end if;

  insert into public.documents (owner_id, slug, title, normalized_title)
  values ('10000000-0000-0000-0000-000000000001', 'allowed', 'Allowed', 'allowed');

  begin
    insert into public.documents (owner_id, slug, title, normalized_title)
    values ('20000000-0000-0000-0000-000000000002', 'forbidden', 'Forbidden', 'forbidden');
    raise exception 'cross-owner document insert unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.document_aliases (owner_id, document_id, alias, normalized_alias)
    values (
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000022',
      'Forbidden alias',
      'forbidden alias'
    );
    raise exception 'cross-owner alias insert unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
begin
  if has_table_privilege('anon', 'public.documents', 'select') then
    raise exception 'anonymous role must not have document select privilege';
  end if;
end;
$$;

rollback;

\echo 'RLS behavior checks passed.'
