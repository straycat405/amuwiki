create or replace function public.record_document_view(p_document_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  insert into public.recent_views (user_id, document_id, last_viewed_at, view_count)
  values ((select auth.uid()), p_document_id, now(), 1)
  on conflict (user_id, document_id) do update
    set last_viewed_at = now(),
        view_count = public.recent_views.view_count + 1,
        hidden_at = null;
end;
$$;

create or replace function public.record_search(p_display_query text, p_normalized_query text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_normalized_query = '' then
    return;
  end if;

  insert into public.recent_searches (user_id, normalized_query, display_query, last_searched_at, search_count)
  values ((select auth.uid()), p_normalized_query, p_display_query, now(), 1)
  on conflict (user_id, normalized_query) do update
    set display_query = excluded.display_query,
        last_searched_at = now(),
        search_count = public.recent_searches.search_count + 1;
end;
$$;

-- Ranks matches by: title exact > alias exact > title prefix > alias prefix / trigram similarity,
-- then by recent-view recency as a final tiebreaker. `search_path` is pinned to `public` (not
-- emptied) because `similarity()`/`%` live in the `public` schema alongside pg_trgm here.
create or replace function public.search_documents(p_normalized_query text, p_limit int default 20)
returns table (
  document_id uuid,
  slug text,
  title text,
  summary text,
  matched_alias text,
  rank_tier smallint
)
language sql
stable
security invoker
set search_path = public
as $$
  with candidates as (
    select
      d.id as document_id,
      d.slug,
      d.title,
      d.summary,
      null::text as matched_alias,
      case
        when d.normalized_title = p_normalized_query then 1
        when d.normalized_title like p_normalized_query || '%' then 3
        else 4
      end::smallint as rank_tier,
      similarity(d.normalized_title, p_normalized_query) as match_similarity
    from documents d
    where d.owner_id = (select auth.uid())
      and d.deleted_at is null
      and (
        d.normalized_title % p_normalized_query
        or d.normalized_title like '%' || p_normalized_query || '%'
      )
    union all
    select
      d.id,
      d.slug,
      d.title,
      d.summary,
      a.alias,
      case
        when a.normalized_alias = p_normalized_query then 2
        when a.normalized_alias like p_normalized_query || '%' then 3
        else 4
      end::smallint,
      similarity(a.normalized_alias, p_normalized_query)
    from document_aliases a
    join documents d on d.id = a.document_id
    where a.owner_id = (select auth.uid())
      and d.deleted_at is null
      and (
        a.normalized_alias % p_normalized_query
        or a.normalized_alias like '%' || p_normalized_query || '%'
      )
  ),
  best_per_document as (
    select distinct on (document_id)
      document_id, slug, title, summary, matched_alias, rank_tier, match_similarity
    from candidates
    order by document_id, rank_tier asc, match_similarity desc
  ),
  weighted as (
    select
      best_per_document.*,
      rv.last_viewed_at
    from best_per_document
    left join recent_views rv
      on rv.document_id = best_per_document.document_id
      and rv.user_id = (select auth.uid())
      and rv.hidden_at is null
  )
  select document_id, slug, title, summary, matched_alias, rank_tier
  from weighted
  order by rank_tier asc, match_similarity desc, last_viewed_at desc nulls last, title asc
  limit p_limit;
$$;
