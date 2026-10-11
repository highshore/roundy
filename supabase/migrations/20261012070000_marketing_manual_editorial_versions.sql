-- Stage 3: allow copy-on-write human editing alongside existing AI regeneration.
-- Additive constraint change only. No existing draft, source or published row is modified.
begin;
alter table public.instagram_post_drafts
  drop constraint if exists instagram_regeneration_mode_valid;
alter table public.instagram_post_drafts
  add constraint instagram_regeneration_mode_valid
  check (regeneration_mode is null or regeneration_mode in
    ('text','image','both','render','restore','manual'));
comment on column public.instagram_post_drafts.regeneration_mode is
  'Versioned edit mode; manual edits preserve original rows and require fresh quality/rights approval.';
commit;
