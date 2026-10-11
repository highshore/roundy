-- Additive version lineage for administrator-initiated Instagram rework.
-- Existing drafts, published media and scheduled run snapshots remain unchanged.
begin;
alter table public.instagram_post_drafts
  add column if not exists regeneration_root_id uuid references public.instagram_post_drafts(id) on delete restrict,
  add column if not exists regeneration_parent_id uuid references public.instagram_post_drafts(id) on delete restrict,
  add column if not exists regeneration_version integer,
  add column if not exists regeneration_source_revision integer,
  add column if not exists regeneration_request_key text,
  add column if not exists regeneration_mode text,
  add column if not exists regeneration_scope text,
  add column if not exists regeneration_slide_indices integer[] not null default '{}',
  add column if not exists regeneration_instruction text not null default '',
  add column if not exists regeneration_before jsonb,
  add column if not exists regeneration_saved_snapshot jsonb;
alter table public.instagram_post_drafts
  add constraint instagram_regeneration_version_positive check (regeneration_version is null or regeneration_version >= 2),
  add constraint instagram_regeneration_mode_valid check (regeneration_mode is null or regeneration_mode in ('text','image','both','render','restore')),
  add constraint instagram_regeneration_scope_valid check (regeneration_scope is null or regeneration_scope in ('all','slides','cover_title','body','caption')),
  add constraint instagram_regeneration_instruction_length check (length(regeneration_instruction)<=500),
  add constraint instagram_regeneration_lineage_distinct check (regeneration_parent_id is null or regeneration_parent_id <> id);
create unique index if not exists instagram_draft_regeneration_root_version_uidx
  on public.instagram_post_drafts(regeneration_root_id,regeneration_version)
  where regeneration_root_id is not null;
create unique index if not exists instagram_draft_regeneration_request_uidx
  on public.instagram_post_drafts(regeneration_request_key)
  where regeneration_request_key is not null;
create index if not exists instagram_draft_regeneration_parent_idx
  on public.instagram_post_drafts(regeneration_parent_id,generated_at desc);
comment on column public.instagram_post_drafts.regeneration_before is 'Immutable source content/photo-assignment snapshot captured when a new manual version is created.';
comment on column public.instagram_post_drafts.regeneration_saved_snapshot is 'Immutable result snapshot for comparison/restore; never a publishing authorization.';
commit;
