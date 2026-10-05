drop index if exists public.instagram_post_drafts_workspace_date_key;

create unique index if not exists instagram_post_drafts_active_workspace_date_key
  on public.instagram_post_drafts(draft_date)
  where draft_role='workspace' and status='needs_approval';
