begin;

alter table public.marketing_automation_settings
  add column if not exists growth_carousel_enabled boolean not null default true,
  add column if not exists growth_posts_per_week smallint not null default 3
    check(growth_posts_per_week between 0 and 7),
  add column if not exists growth_days smallint[] not null default array[0,2,4]::smallint[]
    check(cardinality(growth_days) between 0 and 7 and growth_days <@ array[0,1,2,3,4,5,6]::smallint[]);

alter table public.instagram_post_drafts
  add column if not exists draft_kind text not null default 'brand'
    check(draft_kind in('brand','growth_carousel')),
  add column if not exists growth_topic_type text
    check(growth_topic_type is null or growth_topic_type in(
      'mbti','dating_archetype','book_insight','trend_research','meme_remix',
      'dating_myth','conversation_prompt','seoul_dating','mini_quiz'
    )),
  add column if not exists carousel_slides jsonb not null default '[]'::jsonb,
  add column if not exists research_sources jsonb not null default '[]'::jsonb,
  add column if not exists research_status text not null default 'not_required'
    check(research_status in('not_required','pending','generated','failed'));

create index if not exists instagram_post_drafts_kind_status_idx
  on public.instagram_post_drafts(draft_kind,status,draft_date desc);

update public.marketing_automation_settings
set growth_carousel_enabled=true,
    growth_posts_per_week=3,
    growth_days=array[0,2,4]::smallint[]
where singleton;

commit;
