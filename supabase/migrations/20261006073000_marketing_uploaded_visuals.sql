alter table public.instagram_post_drafts
  add column if not exists generation_source text not null default 'manual',
  add column if not exists visual_source text not null default 'none';

alter table public.instagram_post_drafts
  drop constraint if exists instagram_post_drafts_generation_source_check,
  drop constraint if exists instagram_post_drafts_visual_source_check;

alter table public.instagram_post_drafts
  add constraint instagram_post_drafts_generation_source_check
    check (generation_source in ('automation','manual')),
  add constraint instagram_post_drafts_visual_source_check
    check (visual_source in ('auto_ai','uploaded','none'));

create table if not exists public.marketing_uploaded_images (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.instagram_post_drafts(id) on delete cascade,
  storage_path text not null unique,
  sort_order integer not null check (sort_order between 0 and 5),
  role text not null default 'flexible' check (role in ('cover','body','flexible')),
  asset_type text not null default 'photo' check (asset_type in ('photo','completed_card')),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draft_id, sort_order)
);

create index if not exists marketing_uploaded_images_draft_idx
  on public.marketing_uploaded_images(draft_id, sort_order);

alter table public.marketing_uploaded_images enable row level security;
revoke all on public.marketing_uploaded_images from public,anon,authenticated;
grant all on public.marketing_uploaded_images to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'marketing-images',
  'marketing-images',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists marketing_images_admin_select on storage.objects;
drop policy if exists marketing_images_admin_insert on storage.objects;
drop policy if exists marketing_images_admin_update on storage.objects;
drop policy if exists marketing_images_admin_delete on storage.objects;

create policy marketing_images_admin_select on storage.objects
for select to authenticated
using (bucket_id='marketing-images' and (select public.is_admin()));

create policy marketing_images_admin_insert on storage.objects
for insert to authenticated
with check (bucket_id='marketing-images' and (select public.is_admin()));

create policy marketing_images_admin_update on storage.objects
for update to authenticated
using (bucket_id='marketing-images' and (select public.is_admin()))
with check (bucket_id='marketing-images' and (select public.is_admin()));

create policy marketing_images_admin_delete on storage.objects
for delete to authenticated
using (bucket_id='marketing-images' and (select public.is_admin()));

create or replace function public.reorder_marketing_uploaded_images(
  p_draft uuid,
  p_ids uuid[]
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  expected_count integer;
  i integer;
begin
  if p_draft is null or p_ids is null or cardinality(p_ids) not between 1 and 6 then
    raise exception 'INVALID_MARKETING_IMAGE_ORDER';
  end if;

  select count(*) into expected_count
  from public.marketing_uploaded_images
  where draft_id=p_draft;

  if expected_count<>cardinality(p_ids)
     or exists(
       select 1
       from unnest(p_ids) x(id)
       left join public.marketing_uploaded_images m on m.id=x.id and m.draft_id=p_draft
       where m.id is null
     )
  then
    raise exception 'MARKETING_IMAGE_ORDER_MISMATCH';
  end if;

  for i in 1..cardinality(p_ids) loop
    update public.marketing_uploaded_images
    set sort_order=20+i,updated_at=now()
    where id=p_ids[i] and draft_id=p_draft;
  end loop;

  for i in 1..cardinality(p_ids) loop
    update public.marketing_uploaded_images
    set sort_order=i-1,updated_at=now()
    where id=p_ids[i] and draft_id=p_draft;
  end loop;

  return (
    select coalesce(jsonb_agg(to_jsonb(m) order by m.sort_order),'[]'::jsonb)
    from public.marketing_uploaded_images m
    where m.draft_id=p_draft
  );
end
$$;

revoke all on function public.reorder_marketing_uploaded_images(uuid,uuid[])
from public,anon,authenticated;
grant execute on function public.reorder_marketing_uploaded_images(uuid,uuid[]) to service_role;

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

  select * into j from public.marketing_generation_jobs where id=p_job_id for update;
  if not found or j.status<>'completed' then raise exception 'COMPLETED_GENERATION_REQUIRED'; end if;

  s:=j.result_snapshot;
  if s is null then raise exception 'RESULT_SNAPSHOT_UNAVAILABLE'; end if;
  if coalesce(s->'quality_report'->>'status','')<>'passed' then raise exception 'QUALITY_CHECK_REQUIRED'; end if;

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
    generation_source,visual_source
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
    case when s->>'generation_source'='automation' then 'automation' else 'manual' end,
    case when s->>'visual_source' in ('auto_ai','uploaded','none') then s->>'visual_source' else 'none' end
  )
  returning * into created;

  return to_jsonb(created);
end
$$;

revoke all on function public.create_marketing_candidate_from_generation(uuid)
from public,anon,authenticated;
grant execute on function public.create_marketing_candidate_from_generation(uuid) to service_role;
