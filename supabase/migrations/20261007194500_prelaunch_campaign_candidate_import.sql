create or replace function public.create_marketing_candidate_from_generation(p_job_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  j public.marketing_generation_jobs;
  existing public.instagram_post_drafts;
  created public.instagram_post_drafts;
  s jsonb;
  today date := (now() at time zone 'Asia/Seoul')::date;
  dow_value integer := extract(dow from (now() at time zone 'Asia/Seoul'))::integer;
  rec_time time := time '21:00';
  win_start time := time '20:30';
  win_end time := time '21:30';
  rec public.instagram_posting_time_recommendations;
begin
  perform pg_advisory_xact_lock(70361005);

  select * into j
  from public.marketing_generation_jobs
  where id=p_job_id
  for update;

  if not found or j.status<>'completed' then
    raise exception 'COMPLETED_GENERATION_REQUIRED';
  end if;

  s:=j.result_snapshot;
  if s is null then raise exception 'RESULT_SNAPSHOT_UNAVAILABLE'; end if;
  if coalesce(s->'quality_report'->>'status','')<>'passed' then
    raise exception 'QUALITY_CHECK_REQUIRED';
  end if;

  select * into existing
  from public.instagram_post_drafts
  where source_generation_job_id=p_job_id
  limit 1;

  if found then return to_jsonb(existing); end if;

  select * into rec
  from public.instagram_posting_time_recommendations
  where dow=dow_value
  limit 1;

  if found then
    rec_time:=rec.recommended_time_kst;
    win_start:=rec.window_start_kst;
    win_end:=rec.window_end_kst;
  end if;

  insert into public.instagram_post_drafts(
    draft_date,event_id,content_pillar,caption,cta,destination_url,images,status,generation_reason,
    recommended_time_kst,window_start_kst,window_end_kst,scheduled_for,eligible_for_optimization,
    revision,generated_at,updated_at,content_mode,last_regeneration_mode,last_regeneration_instruction,
    regenerated_at,draft_kind,growth_topic_type,carousel_slides,research_sources,research_status,
    content_language,content_document,quality_report,quality_revision,draft_role,source_generation_job_id,imported_at,
    render_style,campaign_pattern,campaign_tone,campaign_version,launch_date
  ) values (
    today,
    case when nullif(s->>'event_id','') is not null then (s->>'event_id')::uuid else null end,
    coalesce(nullif(s->>'content_pillar',''),'concept'),
    coalesce(s->>'caption',''),
    coalesce(s->>'cta','Follow @roundy.meet'),
    coalesce(nullif(s->>'destination_url',''),'https://roundy.team'),
    case when jsonb_typeof(s->'images')='array' then array(select jsonb_array_elements_text(s->'images')) else '{}'::text[] end,
    'needs_approval',
    coalesce(nullif(s->>'generation_reason',''),'Imported generation result'),
    rec_time,win_start,win_end,
    ((today+rec_time) at time zone 'Asia/Seoul'),
    true,
    1,
    coalesce((s->>'saved_at')::timestamptz,now()),
    now(),
    coalesce(nullif(s->>'content_mode',''),'prelaunch'),
    'both',
    '',
    coalesce((s->>'saved_at')::timestamptz,now()),
    coalesce(nullif(s->>'draft_kind',''),'brand'),
    nullif(s->>'growth_topic_type',''),
    case when jsonb_typeof(s->'carousel_slides')='array' then s->'carousel_slides' else '[]'::jsonb end,
    case when jsonb_typeof(s->'research_sources')='array' then s->'research_sources' else '[]'::jsonb end,
    coalesce(nullif(s->>'research_status',''),'not_required'),
    nullif(s->>'content_language',''),
    s->'content_document',
    s->'quality_report',
    1,
    'candidate',
    p_job_id,
    now(),
    case when s->>'render_style' in ('campaign','editorial') then s->>'render_style' else null end,
    case when s->>'campaign_pattern' in ('poster','problem_solution','how_it_works','benefit_stack','countdown') then s->>'campaign_pattern' else null end,
    case when s->>'campaign_tone' in ('modern_premium','soft_romantic','bold_teaser') then s->>'campaign_tone' else null end,
    nullif(s->>'campaign_version',''),
    case when nullif(s->>'launch_date','') is not null then (s->>'launch_date')::date else null end
  )
  returning * into created;

  return to_jsonb(created);
end
$$;

revoke all on function public.create_marketing_candidate_from_generation(uuid)
from public,anon,authenticated;

grant execute on function public.create_marketing_candidate_from_generation(uuid)
to service_role;
