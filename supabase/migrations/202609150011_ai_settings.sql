-- BYOK AI settings (design section 13, A1). The API key is encrypted by the
-- application before it reaches the database; rows only ever hold ciphertext.
create table public.user_ai_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  encrypted_key text check (encrypted_key is null or char_length(encrypted_key) between 1 and 2000),
  key_hint text not null default '' check (char_length(key_hint) <= 8),
  monthly_token_cap integer not null default 0 check (monthly_token_cap >= 0),
  updated_at timestamptz not null default now(),
  check (enabled = false or encrypted_key is not null)
);

alter table public.user_ai_settings enable row level security;

create policy ai_settings_owner_all on public.user_ai_settings for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.user_ai_settings to authenticated;

create trigger user_ai_settings_set_updated_at
before update on public.user_ai_settings
for each row execute function public.set_updated_at();

create type public.ai_run_kind as enum ('query', 'ai_summary', 'draft_page', 'contradiction', 'ingest');
create type public.ai_run_status as enum ('succeeded', 'failed', 'refused', 'capped');
create type public.ai_billing_source as enum ('byok', 'platform');

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind public.ai_run_kind not null,
  model text not null check (char_length(model) between 1 and 100),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  status public.ai_run_status not null,
  billing_source public.ai_billing_source not null default 'byok',
  created_at timestamptz not null default now()
);

create index ai_runs_owner_created_idx on public.ai_runs (owner_id, created_at desc);

alter table public.ai_runs enable row level security;

create policy ai_runs_owner_read on public.ai_runs for select to authenticated
using ((select auth.uid()) = owner_id);

create policy ai_runs_owner_insert on public.ai_runs for insert to authenticated
with check ((select auth.uid()) = owner_id);

grant select, insert on public.ai_runs to authenticated;

alter type public.suggestion_kind add value 'ai_summary';

alter table public.document_suggestions
add column run_id uuid references public.ai_runs (id) on delete set null;

-- Token totals for the current UTC month. Only successful runs count toward the cap.
create or replace function public.ai_usage_month()
returns table (
  run_count integer,
  input_tokens bigint,
  cache_read_tokens bigint,
  output_tokens bigint
)
language sql
security invoker
set search_path = ''
stable
as $$
  select
    count(*)::integer,
    coalesce(sum(r.input_tokens), 0)::bigint,
    coalesce(sum(r.cache_read_tokens), 0)::bigint,
    coalesce(sum(r.output_tokens), 0)::bigint
  from public.ai_runs r
  where r.owner_id = (select auth.uid())
    and r.status = 'succeeded'
    and r.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';
$$;

create or replace function public.ai_under_cap()
returns boolean
language sql
security invoker
set search_path = ''
stable
as $$
  select coalesce((
    select s.monthly_token_cap = 0
      or (u.input_tokens + u.cache_read_tokens + u.output_tokens) < s.monthly_token_cap
    from public.user_ai_settings s
    cross join public.ai_usage_month() u
    where s.user_id = (select auth.uid())
  ), false);
$$;

revoke all on function public.ai_usage_month() from public, anon;
revoke all on function public.ai_under_cap() from public, anon;
grant execute on function public.ai_usage_month() to authenticated;
grant execute on function public.ai_under_cap() to authenticated;
