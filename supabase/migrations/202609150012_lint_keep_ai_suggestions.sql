-- AI-generated suggestions are not produced by lint_findings(), so refresh must
-- keep them as long as the underlying finding (empty summary) still holds.
create or replace function public.refresh_lint_suggestions()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  pending_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  with current_findings as (
    select * from public.lint_findings()
  ),
  upserted as (
    insert into public.document_suggestions (owner_id, kind, document_id, target_key, payload)
    select (select auth.uid()), f.kind, f.document_id, f.target_key, f.payload
    from current_findings f
    on conflict (owner_id, kind, document_id, target_key) do update
      set payload = excluded.payload
      where public.document_suggestions.status = 'pending'
    returning 1
  )
  delete from public.document_suggestions s
  where s.owner_id = (select auth.uid())
    and case s.kind
      when 'ai_summary' then not exists (
        select 1 from current_findings f
        where f.kind = 'fill_summary' and f.document_id = s.document_id
      )
      else not exists (
        select 1 from current_findings f
        where f.kind = s.kind
          and f.document_id is not distinct from s.document_id
          and f.target_key = s.target_key
      )
    end;

  select count(*)::integer into pending_count
  from public.document_suggestions
  where owner_id = (select auth.uid()) and status = 'pending';

  return pending_count;
end;
$$;
