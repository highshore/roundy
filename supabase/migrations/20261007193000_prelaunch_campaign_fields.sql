alter table public.instagram_post_drafts
  add column if not exists render_style text,
  add column if not exists campaign_pattern text,
  add column if not exists campaign_tone text,
  add column if not exists campaign_version text,
  add column if not exists launch_date date;

alter table public.instagram_post_drafts
  drop constraint if exists instagram_post_drafts_render_style_check,
  drop constraint if exists instagram_post_drafts_campaign_pattern_check,
  drop constraint if exists instagram_post_drafts_campaign_tone_check;

alter table public.instagram_post_drafts
  add constraint instagram_post_drafts_render_style_check
    check (render_style is null or render_style in ('campaign','editorial')),
  add constraint instagram_post_drafts_campaign_pattern_check
    check (campaign_pattern is null or campaign_pattern in ('poster','problem_solution','how_it_works','benefit_stack','countdown')),
  add constraint instagram_post_drafts_campaign_tone_check
    check (campaign_tone is null or campaign_tone in ('modern_premium','soft_romantic','bold_teaser'));

create index if not exists instagram_post_drafts_campaign_pattern_created
  on public.instagram_post_drafts(campaign_pattern,generated_at desc)
  where campaign_pattern is not null;

comment on column public.instagram_post_drafts.render_style is 'Server-selected renderer family. Prelaunch campaign v1 uses campaign; growth content remains editorial.';
comment on column public.instagram_post_drafts.campaign_pattern is 'Resolved prelaunch campaign pattern. Auto is never persisted; only the selected concrete pattern is stored.';
comment on column public.instagram_post_drafts.campaign_tone is 'Resolved prelaunch campaign tone.';
comment on column public.instagram_post_drafts.campaign_version is 'Versioned prelaunch campaign contract, e.g. prelaunch_campaign_v1.';
comment on column public.instagram_post_drafts.launch_date is 'Optional verified launch date. Countdown campaigns are allowed only when present.';
