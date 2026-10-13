begin;

-- The growth planner emits 'korea_life' for the culture pillar.
-- Keep the DB write contract aligned with the generation validator, while
-- preserving the existing supported topics and rejecting unknown values.
alter table public.instagram_post_drafts
  drop constraint if exists instagram_post_drafts_growth_topic_type_check;

alter table public.instagram_post_drafts
  add constraint instagram_post_drafts_growth_topic_type_check
  check (
    growth_topic_type is null or growth_topic_type in (
      'mbti', 'dating_archetype', 'book_insight', 'trend_research',
      'meme_remix', 'dating_myth', 'conversation_prompt', 'seoul_dating',
      'seoul_trend', 'korea_life', 'mini_quiz'
    )
  );

commit;
