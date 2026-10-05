alter table public.instagram_post_drafts
  drop constraint if exists instagram_post_drafts_research_status_check;

alter table public.instagram_post_drafts
  add constraint instagram_post_drafts_research_status_check
  check (
    research_status = any (
      array[
        'not_required'::text,
        'pending'::text,
        'generated'::text,
        'generated_without_sources'::text,
        'failed'::text
      ]
    )
  );
