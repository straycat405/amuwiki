-- Keep document writes and anchor recovery in the same transaction.
create or replace function public.update_document_with_annotation_anchors(
  p_document_id uuid,
  p_expected_version integer,
  p_title text,
  p_normalized_title text,
  p_summary text,
  p_body_markdown text,
  p_frontmatter jsonb,
  p_link_targets jsonb,
  p_annotation_anchors jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_version integer;
begin
  updated_version := public.update_document(
    p_document_id, p_expected_version, p_title, p_normalized_title,
    p_summary, p_body_markdown, p_frontmatter, p_link_targets
  );

  update public.annotations annotation
  set anchor_start = anchor.anchor_start,
      anchor_end = anchor.anchor_end,
      quote_prefix = anchor.quote_prefix,
      quote_suffix = anchor.quote_suffix,
      status = anchor.status::public.annotation_status
  from jsonb_to_recordset(coalesce(p_annotation_anchors, '[]'::jsonb)) as anchor(
    id uuid, anchor_start integer, anchor_end integer, quote_prefix text,
    quote_suffix text, status text
  )
  where annotation.id = anchor.id
    and annotation.document_id = p_document_id
    and annotation.owner_id = (select auth.uid())
    and annotation.deleted_at is null
    and anchor.anchor_start >= 0
    and anchor.anchor_end > anchor.anchor_start
    and char_length(anchor.quote_prefix) <= 64
    and char_length(anchor.quote_suffix) <= 64
    and anchor.status in ('active', 'resolved', 'orphaned');

  return updated_version;
end;
$$;

revoke all on function public.update_document_with_annotation_anchors(uuid, integer, text, text, text, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.update_document_with_annotation_anchors(uuid, integer, text, text, text, text, jsonb, jsonb, jsonb) to authenticated;
