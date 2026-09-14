alter table public.user_preferences
drop constraint user_preferences_theme_key_check;

alter table public.user_preferences
add constraint user_preferences_theme_key_check
check (theme_key in ('paper-green', 'toss-blue', 'ink-indigo', 'midnight'));
