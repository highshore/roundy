-- Editorial preferences only. No generation, scheduling, approval or publishing changes.
-- Existing singleton values and all Instagram drafts/runs remain untouched.
begin;

alter table public.marketing_automation_settings
  add column if not exists feed_daily_max_posts smallint not null default 1,
  add column if not exists carousel_mode text not null default 'fixed',
  add column if not exists carousel_default_slides smallint not null default 5,
  add column if not exists carousel_min_real_photos_5 smallint not null default 3,
  add column if not exists carousel_min_real_photos_3 smallint not null default 2,
  add column if not exists carousel_ai_thumbnail_enabled boolean not null default false,
  add column if not exists carousel_answer_first_enabled boolean not null default false,
  add column if not exists story_preview_auto_enabled boolean not null default false,
  add column if not exists carousel_title_font_size_px smallint not null default 72,
  add column if not exists carousel_body_font_size_px smallint not null default 36;

alter table public.marketing_automation_settings
  add constraint marketing_feed_daily_max_posts_check check (feed_daily_max_posts between 1 and 10),
  add constraint marketing_carousel_mode_check check (carousel_mode in ('fixed', 'alternating')),
  add constraint marketing_carousel_default_slides_check check (carousel_default_slides in (3, 5)),
  add constraint marketing_carousel_min_real_photos_5_check check (carousel_min_real_photos_5 between 0 and 5),
  add constraint marketing_carousel_min_real_photos_3_check check (carousel_min_real_photos_3 between 0 and 3),
  add constraint marketing_carousel_title_font_size_check check (carousel_title_font_size_px between 24 and 160),
  add constraint marketing_carousel_body_font_size_check check (carousel_body_font_size_px between 16 and 80);

comment on column public.marketing_automation_settings.feed_daily_max_posts is
  'Target maximum automatic Feed publications per Seoul calendar day. Manual extra publication remains permitted. Not enforced until a later phase.';
comment on column public.marketing_automation_settings.carousel_mode is
  'Future carousel layout policy (fixed vs alternating). Stored only; no generation changes.';
comment on column public.marketing_automation_settings.carousel_default_slides is
  'Default slide count for the future carousel generator: 3 or 5.';
comment on column public.marketing_automation_settings.carousel_min_real_photos_5 is
  'Minimum real photographs in a future 5-slide carousel.';
comment on column public.marketing_automation_settings.carousel_min_real_photos_3 is
  'Minimum real photographs in a future 3-slide carousel.';
comment on column public.marketing_automation_settings.carousel_ai_thumbnail_enabled is
  'Future AI-created cover toggle; currently configuration-only.';
comment on column public.marketing_automation_settings.carousel_answer_first_enabled is
  'Future Answer-First copywriting toggle; currently configuration-only.';
comment on column public.marketing_automation_settings.story_preview_auto_enabled is
  'Future Story preview generation toggle; currently configuration-only.';
comment on column public.marketing_automation_settings.carousel_title_font_size_px is
  'Future base carousel title font size in rendered image pixels; not yet applied to rendering.';
comment on column public.marketing_automation_settings.carousel_body_font_size_px is
  'Future base carousel body font size in rendered image pixels; not yet applied to rendering.';

commit;
