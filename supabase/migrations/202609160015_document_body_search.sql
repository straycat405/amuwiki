create index documents_body_trgm_idx
on public.documents using gin (body_markdown gin_trgm_ops)
where deleted_at is null and status <> 'draft';

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
      and d.status <> 'draft'
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
      and d.status <> 'draft'
      and (
        a.normalized_alias % p_normalized_query
        or a.normalized_alias like '%' || p_normalized_query || '%'
      )

    union all

    select
      d.id,
      d.slug,
      d.title,
      d.summary,
      null::text,
      5::smallint,
      0::real
    from documents d
    where d.owner_id = (select auth.uid())
      and d.deleted_at is null
      and d.status <> 'draft'
      and d.body_markdown ilike '%' || p_normalized_query || '%'
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
