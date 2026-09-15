\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values
  ('70000000-0000-0000-0000-000000000008', 'ai@example.com', '{}'::jsonb, now(), now()),
  ('70000000-0000-0000-0000-000000000009', 'ai-other@example.com', '{}'::jsonb, now(), now());

set local role authenticated;
set local request.jwt.claim.sub = '70000000-0000-0000-0000-000000000008';

-- No settings row: never under cap.
do $$
begin
  if public.ai_under_cap() then
    raise exception 'ai_under_cap must be false without settings';
  end if;
end;
$$;

-- enabled requires ciphertext.
do $$
begin
  begin
    insert into public.user_ai_settings (user_id, enabled) values (auth.uid(), true);
    raise exception 'enabled without encrypted_key must be rejected';
  exception when check_violation then
    null;
  end;
end;
$$;

insert into public.user_ai_settings (user_id, enabled, encrypted_key, key_hint, monthly_token_cap)
values (auth.uid(), true, 'v1:ciphertext', 'a1b2', 1000);

do $$
begin
  if not public.ai_under_cap() then
    raise exception 'fresh settings must be under cap';
  end if;
end;
$$;

insert into public.ai_runs (owner_id, kind, model, input_tokens, cache_read_tokens, output_tokens, status)
values
  (auth.uid(), 'query', 'claude-opus-5', 400, 100, 200, 'succeeded'),
  (auth.uid(), 'ai_summary', 'claude-opus-5', 5000, 0, 5000, 'failed'),
  (auth.uid(), 'query', 'claude-opus-5', 50, 0, 50, 'succeeded');

do $$
declare
  usage record;
begin
  select * into usage from public.ai_usage_month();
  if usage.run_count <> 2 or usage.input_tokens <> 450 or usage.cache_read_tokens <> 100 or usage.output_tokens <> 250 then
    raise exception 'usage must sum only succeeded runs, got %', usage;
  end if;
  if not public.ai_under_cap() then
    raise exception '800 of 1000 tokens must still be under cap';
  end if;
end;
$$;

insert into public.ai_runs (owner_id, kind, model, input_tokens, output_tokens, status)
values (auth.uid(), 'query', 'claude-opus-5', 150, 50, 'succeeded');

do $$
begin
  if public.ai_under_cap() then
    raise exception '1000 of 1000 tokens must be at cap';
  end if;
end;
$$;

update public.user_ai_settings set monthly_token_cap = 0 where user_id = auth.uid();

do $$
begin
  if not public.ai_under_cap() then
    raise exception 'cap 0 means unlimited';
  end if;
end;
$$;

-- Runs are append-only for the owner.
do $$
begin
  update public.ai_runs set output_tokens = 0 where owner_id = auth.uid();
  if exists (select 1 from public.ai_runs where owner_id = auth.uid() and output_tokens = 0 and kind = 'query' and input_tokens = 400) then
    raise exception 'ai_runs must not be updatable';
  end if;
exception when insufficient_privilege then
  null;
end;
$$;

-- ai_summary suggestions survive refresh while the summary is empty, then go away.
select public.create_document(
  '요약 필요', '요약 필요', '요약-필요', '', '# 제목만', '{}'::jsonb, '[]'::jsonb
) as document_id \gset

select public.refresh_lint_suggestions();

insert into public.document_suggestions (owner_id, kind, document_id, payload)
values (auth.uid(), 'ai_summary', :'document_id', '{"summary": "AI 요약"}'::jsonb);

select public.refresh_lint_suggestions();

do $$
declare
  doc_id uuid := (select id from public.documents where slug = '요약-필요');
begin
  if not exists (
    select 1 from public.document_suggestions
    where document_id = doc_id and kind = 'ai_summary' and status = 'pending'
  ) then
    raise exception 'refresh must keep ai_summary while summary is empty';
  end if;
  if not exists (
    select 1 from public.document_suggestions
    where document_id = doc_id and kind = 'fill_summary'
  ) then
    raise exception 'fill_summary finding expected alongside ai_summary';
  end if;
end;
$$;

select public.update_document(
  :'document_id', 1, '요약 필요', '요약 필요', '이제 요약 있음', '# 제목만', '{}'::jsonb, '[]'::jsonb
);

select public.refresh_lint_suggestions();

do $$
declare
  doc_id uuid := (select id from public.documents where slug = '요약-필요');
begin
  if exists (
    select 1 from public.document_suggestions
    where document_id = doc_id and kind in ('ai_summary', 'fill_summary')
  ) then
    raise exception 'summary suggestions must disappear once the summary is filled';
  end if;
end;
$$;

-- Other user sees nothing.
set local request.jwt.claim.sub = '70000000-0000-0000-0000-000000000009';

do $$
begin
  if exists (select 1 from public.user_ai_settings) then
    raise exception 'RLS must hide other users'' AI settings';
  end if;
  if exists (select 1 from public.ai_runs) then
    raise exception 'RLS must hide other users'' AI runs';
  end if;
  if (select run_count from public.ai_usage_month()) <> 0 then
    raise exception 'usage must be scoped to the caller';
  end if;
  if public.ai_under_cap() then
    raise exception 'other user has no settings and must not be under cap';
  end if;
end;
$$;

rollback;
