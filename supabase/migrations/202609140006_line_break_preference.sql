alter table public.user_preferences
add column line_break_mode text not null default 'hard'
check (line_break_mode in ('hard', 'soft'));
