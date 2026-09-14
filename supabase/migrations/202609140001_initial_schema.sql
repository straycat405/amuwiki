create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create type public.document_status as enum ('draft', 'active', 'archived');
create type public.annotation_status as enum ('active', 'resolved', 'orphaned');
create type public.annotation_color as enum ('yellow', 'blue', 'green', 'red');
create type public.link_kind as enum ('explicit', 'automatic');
create type public.import_source_kind as enum ('markdown-files', 'markdown-zip', 'obsidian-vault');
create type public.import_status as enum ('uploaded', 'analyzing', 'ready', 'importing', 'completed', 'partial', 'failed', 'cancelled');
create type public.import_item_kind as enum ('document', 'attachment', 'ignored');
create type public.import_item_status as enum ('pending', 'ready', 'imported', 'skipped', 'failed');
create type public.import_conflict_policy as enum ('skip', 'rename');
create type public.export_status as enum ('queued', 'running', 'completed', 'failed', 'expired');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme_key text not null default 'paper-green' check (theme_key in ('paper-green', 'toss-blue', 'ink-indigo')),
  color_mode text not null default 'system' check (color_mode in ('system', 'light', 'dark')),
  font_preset text not null default 'pretendard' check (font_preset in ('pretendard', 'suit', 'noto-sans-kr')),
  font_scale text not null default 'normal' check (font_scale in ('small', 'normal', 'large')),
  content_width text not null default 'normal' check (content_width in ('narrow', 'normal', 'wide')),
  tooltip_enabled boolean not null default true,
  tooltip_delay_ms smallint not null default 450 check (tooltip_delay_ms between 250 and 800),
  tooltip_lock_mode text not null default 'click' check (tooltip_lock_mode = 'click'),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  slug text not null check (char_length(slug) between 1 and 240),
  title text not null check (char_length(title) between 1 and 200),
  normalized_title text not null check (char_length(normalized_title) between 1 and 200),
  summary text not null default '' check (char_length(summary) <= 300),
  body_markdown text not null default '',
  frontmatter jsonb not null default '{}'::jsonb check (jsonb_typeof(frontmatter) = 'object'),
  status public.document_status not null default 'draft',
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (owner_id, slug),
  unique (owner_id, normalized_title)
);

create index documents_owner_updated_idx on public.documents (owner_id, updated_at desc) where deleted_at is null;
create index documents_title_trgm_idx on public.documents using gin (normalized_title gin_trgm_ops) where deleted_at is null;

create table public.document_aliases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  alias text not null check (char_length(alias) between 1 and 200),
  normalized_alias text not null check (char_length(normalized_alias) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (owner_id, normalized_alias)
);

create index document_aliases_document_idx on public.document_aliases (document_id);
create index document_aliases_trgm_idx on public.document_aliases using gin (normalized_alias gin_trgm_ops);

create table public.document_links (
  source_document_id uuid not null references public.documents (id) on delete cascade,
  target_document_id uuid not null references public.documents (id) on delete cascade,
  link_kind public.link_kind not null,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  first_position integer not null check (first_position >= 0),
  updated_at timestamptz not null default now(),
  primary key (source_document_id, target_document_id, link_kind),
  check (source_document_id <> target_document_id)
);

create index document_links_target_idx on public.document_links (target_document_id);

create table public.document_revisions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  title text not null,
  summary text not null default '',
  body_markdown text not null,
  frontmatter jsonb not null default '{}'::jsonb check (jsonb_typeof(frontmatter) = 'object'),
  created_at timestamptz not null default now(),
  unique (document_id, revision_number)
);

create index document_revisions_document_created_idx on public.document_revisions (document_id, created_at desc);

create table public.annotations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  document_revision integer not null check (document_revision > 0),
  body_markdown text not null check (char_length(body_markdown) between 1 and 4000),
  color_key public.annotation_color not null default 'yellow',
  status public.annotation_status not null default 'active',
  anchor_start integer not null check (anchor_start >= 0),
  anchor_end integer not null check (anchor_end > anchor_start),
  quote_exact text not null,
  quote_prefix text not null default '' check (char_length(quote_prefix) <= 64),
  quote_suffix text not null default '' check (char_length(quote_suffix) <= 64),
  anchor_version smallint not null default 1 check (anchor_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index annotations_document_idx on public.annotations (document_id, created_at) where deleted_at is null;

create table public.recent_views (
  user_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  last_viewed_at timestamptz not null default now(),
  view_count integer not null default 1 check (view_count > 0),
  hidden_at timestamptz,
  primary key (user_id, document_id)
);

create index recent_views_user_time_idx on public.recent_views (user_id, last_viewed_at desc);

create table public.recent_searches (
  user_id uuid not null references auth.users (id) on delete cascade,
  normalized_query text not null,
  display_query text not null,
  last_searched_at timestamptz not null default now(),
  search_count integer not null default 1 check (search_count > 0),
  primary key (user_id, normalized_query)
);

create index recent_searches_user_time_idx on public.recent_searches (user_id, last_searched_at desc);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  storage_path text not null,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 26214400),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (owner_id, storage_path)
);

create index attachments_document_idx on public.attachments (document_id) where deleted_at is null;

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  source_kind public.import_source_kind not null,
  status public.import_status not null default 'uploaded',
  storage_path text not null,
  conflict_policy public.import_conflict_policy not null default 'skip',
  stats jsonb not null default '{}'::jsonb,
  error_summary text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days')
);

create index import_jobs_owner_created_idx on public.import_jobs (owner_id, created_at desc);

create table public.import_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.import_jobs (id) on delete cascade,
  relative_path text not null,
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  item_kind public.import_item_kind not null,
  detected_title text,
  planned_slug text,
  status public.import_item_status not null default 'pending',
  target_document_id uuid references public.documents (id) on delete set null,
  warning_codes text[] not null default '{}',
  unique (job_id, relative_path)
);

create index import_items_job_status_idx on public.import_items (job_id, status);

create table public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  status public.export_status not null default 'queued',
  storage_path text,
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index export_jobs_owner_created_idx on public.export_jobs (owner_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger preferences_set_updated_at before update on public.user_preferences
for each row execute function public.set_updated_at();
create trigger documents_set_updated_at before update on public.documents
for each row execute function public.set_updated_at();
create trigger annotations_set_updated_at before update on public.annotations
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));

  insert into public.user_preferences (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, display_name)
select id, coalesce(raw_user_meta_data ->> 'display_name', split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;

insert into public.user_preferences (user_id)
select id from auth.users
on conflict (user_id) do nothing;

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.documents enable row level security;
alter table public.document_aliases enable row level security;
alter table public.document_links enable row level security;
alter table public.document_revisions enable row level security;
alter table public.annotations enable row level security;
alter table public.recent_views enable row level security;
alter table public.recent_searches enable row level security;
alter table public.attachments enable row level security;
alter table public.import_jobs enable row level security;
alter table public.import_items enable row level security;
alter table public.export_jobs enable row level security;

create policy profiles_owner_all on public.profiles for all to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy preferences_owner_all on public.user_preferences for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy documents_owner_all on public.documents for all to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy aliases_owner_all on public.document_aliases for all to authenticated
using (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.documents d where d.id = document_id and d.owner_id = (select auth.uid()))
)
with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.documents d where d.id = document_id and d.owner_id = (select auth.uid()))
);
create policy annotations_owner_all on public.annotations for all to authenticated
using (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.documents d where d.id = document_id and d.owner_id = (select auth.uid()))
)
with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.documents d where d.id = document_id and d.owner_id = (select auth.uid()))
);
create policy recent_views_owner_all on public.recent_views for all to authenticated
using (
  (select auth.uid()) = user_id
  and exists (select 1 from public.documents d where d.id = document_id and d.owner_id = (select auth.uid()))
)
with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.documents d where d.id = document_id and d.owner_id = (select auth.uid()))
);
create policy recent_searches_owner_all on public.recent_searches for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy attachments_owner_all on public.attachments for all to authenticated
using (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.documents d where d.id = document_id and d.owner_id = (select auth.uid()))
)
with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.documents d where d.id = document_id and d.owner_id = (select auth.uid()))
);
create policy import_jobs_owner_all on public.import_jobs for all to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy export_jobs_owner_all on public.export_jobs for all to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create policy links_owner_all on public.document_links for all to authenticated
using (exists (
  select 1 from public.documents d
  where d.id = source_document_id and d.owner_id = (select auth.uid())
))
with check (
  exists (select 1 from public.documents s where s.id = source_document_id and s.owner_id = (select auth.uid()))
  and exists (select 1 from public.documents t where t.id = target_document_id and t.owner_id = (select auth.uid()))
);

create policy revisions_owner_all on public.document_revisions for all to authenticated
using (exists (
  select 1 from public.documents d
  where d.id = document_id and d.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.documents d
  where d.id = document_id and d.owner_id = (select auth.uid())
));

create policy import_items_owner_all on public.import_items for all to authenticated
using (exists (
  select 1 from public.import_jobs j
  where j.id = job_id and j.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.import_jobs j
  where j.id = job_id and j.owner_id = (select auth.uid())
));

revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
