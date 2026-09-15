create type public.ai_provider as enum ('anthropic', 'openai');

alter table public.user_ai_settings
add column provider public.ai_provider not null default 'anthropic';

alter table public.ai_runs
add column provider public.ai_provider not null default 'anthropic';
