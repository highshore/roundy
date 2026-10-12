-- Stage 4 Reel Studio. Additive, no rewrite to existing Reel/Post/approved asset rows.
begin;
alter table public.instagram_reel_drafts
 add column if not exists creative_plan jsonb,
 add column if not exists version_root_id uuid references public.instagram_reel_drafts(id) on delete restrict,
 add column if not exists version_parent_id uuid references public.instagram_reel_drafts(id) on delete restrict,
 add column if not exists version_number integer not null default 1 check (version_number >= 1),
 add column if not exists creative_request_key text unique,
 add column if not exists rendered_plan_hash text check (rendered_plan_hash is null or length(rendered_plan_hash) = 64);
create unique index if not exists instagram_reel_version_once
 on public.instagram_reel_drafts(version_root_id,version_number) where version_root_id is not null;

create table if not exists public.marketing_reel_assets (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('licensed_video','approved_photo','ai_image')),
 storage_path text not null unique check(storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(mp4|jpg|jpeg|png|webp)$'),
 content_type text not null check(content_type in ('video/mp4','image/jpeg','image/png','image/webp')),
 file_size bigint not null check(file_size between 1 and 41943040),
 width integer not null check(width between 360 and 3840),
 height integer not null check(height between 360 and 3840),
 duration_seconds numeric(8,2) check(duration_seconds is null or duration_seconds between 3 and 90),
 creator text not null check(length(trim(creator)) between 2 and 140),
 source_url text not null default '' check(length(source_url)<=1500),
 license_url text not null default '' check(length(license_url)<=1500),
 license_note text not null check(length(trim(license_note)) between 8 and 700),
 original_owned boolean not null default false,
 commercial_use_allowed boolean not null default false,
 modifications_allowed boolean not null default false,
 rights_attested boolean not null default false,
 review_status text not null default 'pending' check(review_status in ('pending','approved','rejected')),
 ai_model text not null default '',
 created_by uuid references auth.users(id) on delete set null,
 reviewed_by uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists marketing_reel_assets_recent on public.marketing_reel_assets(created_at desc);
create index if not exists marketing_reel_assets_approved on public.marketing_reel_assets(review_status,kind,created_at desc);
alter table public.marketing_reel_assets enable row level security;
revoke all on public.marketing_reel_assets from public,anon,authenticated;
grant all on public.marketing_reel_assets to service_role;
create or replace function roundy_private.guard_reel_asset_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
 if old.review_status <> 'pending' then raise exception 'REEL_ASSET_IMMUTABLE'; end if;
 if new.id is distinct from old.id or new.kind is distinct from old.kind
 or new.storage_path is distinct from old.storage_path
 or new.content_type is distinct from old.content_type or new.file_size is distinct from old.file_size
 or new.creator is distinct from old.creator or new.source_url is distinct from old.source_url
 or new.license_url is distinct from old.license_url or new.license_note is distinct from old.license_note
 or new.original_owned is distinct from old.original_owned
 or new.commercial_use_allowed is distinct from old.commercial_use_allowed
 or new.modifications_allowed is distinct from old.modifications_allowed
 or new.rights_attested is distinct from old.rights_attested
 then raise exception 'REEL_ASSET_METADATA_IMMUTABLE'; end if;
 if new.review_status='approved' and (not new.rights_attested or not new.commercial_use_allowed or not new.modifications_allowed
 or new.reviewed_by is null or new.reviewed_at is null) then
  raise exception 'REEL_ASSET_RIGHTS_REVIEW_REQUIRED';
 end if;
 return new;
end $$;
drop trigger if exists guard_reel_asset_immutable on public.marketing_reel_assets;
create trigger guard_reel_asset_immutable before update on public.marketing_reel_assets
 for each row execute function roundy_private.guard_reel_asset_immutable();
revoke all on function roundy_private.guard_reel_asset_immutable() from public,anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('marketing-reel-assets','marketing-reel-assets',false,41943040,
  array['video/mp4','image/jpeg','image/png','image/webp']::text[])
 on conflict(id) do update set public=false,
  file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists marketing_reel_assets_admin_insert on storage.objects;
drop policy if exists marketing_reel_assets_admin_select on storage.objects;
create policy marketing_reel_assets_admin_insert on storage.objects
 for insert to authenticated with check(bucket_id='marketing-reel-assets' and (select public.is_admin()));
create policy marketing_reel_assets_admin_select on storage.objects
 for select to authenticated using(bucket_id='marketing-reel-assets' and (select public.is_admin()));
-- No browser update/delete: once uploaded, source bytes cannot be overwritten or deleted.

create table if not exists public.marketing_reel_ai_runs (
 id uuid primary key default gen_random_uuid(),
 request_key text not null unique check(length(request_key) between 12 and 130),
 kind text not null check(kind in('ideas','script','ai_image')),
 reel_id uuid references public.instagram_reel_drafts(id) on delete restrict,
 actor_id uuid references auth.users(id) on delete set null,
 status text not null default 'running' check(status in('running','completed','failed','uncertain')),
 reserved_usd numeric(7,4) not null,
 input_tokens integer not null default 0,
 output_tokens integer not null default 0,
 result jsonb,
 error_code text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists marketing_reel_ai_runs_recent on public.marketing_reel_ai_runs(created_at desc);
alter table public.marketing_reel_ai_runs enable row level security;
revoke all on public.marketing_reel_ai_runs from public,anon,authenticated;
grant all on public.marketing_reel_ai_runs to service_role;
create or replace function public.reserve_marketing_reel_ai(
 p_key text,p_kind text,p_actor uuid,p_reel uuid default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 j public.marketing_reel_ai_runs;
 ctl public.marketing_ai_control;
 cost numeric;
 from_day timestamptz:=(date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul');
 from_month timestamptz:=(date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul');
 daily numeric;monthly numeric;
 calls_today integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('roundy-reel-ai-budget',0));
 if p_key is null or length(p_key) not between 12 and 130 or p_kind not in('ideas','script','ai_image')
   or p_actor is null then raise exception 'REEL_AI_INVALID_REQUEST';end if;
 select * into j from public.marketing_reel_ai_runs where request_key=p_key;
 if found then return jsonb_build_object('accepted',false,'job',to_jsonb(j));end if;
 select * into ctl from public.marketing_ai_control where singleton=true;
 if not found or not ctl.enabled or ctl.blocked_reason is not null then raise exception 'AI_PAUSED';end if;
 cost:=case when p_kind='ai_image' then 0.15 else 0.02 end;
 select count(*) into calls_today from public.marketing_reel_ai_runs
  where created_at>=from_day and kind=p_kind;
 if calls_today>=case when p_kind='ai_image' then 2 else 8 end
  then raise exception 'REEL_AI_DAILY_LIMIT';end if;
 select coalesce(sum(reserved_usd),0) into daily from public.marketing_generation_jobs where created_at>=from_day;
 select daily+coalesce(sum(reserved_usd),0) into daily from public.marketing_reel_ai_runs where created_at>=from_day;
 select coalesce(sum(reserved_usd),0) into monthly from public.marketing_generation_jobs where created_at>=from_month;
 select monthly+coalesce(sum(reserved_usd),0) into monthly from public.marketing_reel_ai_runs where created_at>=from_month;
 if daily+cost>ctl.daily_budget_usd or monthly+cost>ctl.monthly_budget_usd then raise exception 'REEL_AI_BUDGET_EXCEEDED';end if;
 insert into public.marketing_reel_ai_runs(request_key,kind,actor_id,reel_id,reserved_usd)
  values(p_key,p_kind,p_actor,p_reel,cost) returning * into j;
 return jsonb_build_object('accepted',true,'job',to_jsonb(j));
end $$;
revoke all on function public.reserve_marketing_reel_ai(text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_marketing_reel_ai(text,text,uuid,uuid) to service_role;

-- Additional fail-closed database guard when an enhanced Reel enters the publisher queue.
create or replace function roundy_private.guard_reel_storyboard_queue()
returns trigger language plpgsql set search_path='' as $$
declare s jsonb;aid uuid;
begin
 if new.status='queued' and old.status is distinct from 'queued' and
   coalesce(new.creative_plan->>'version','')='1' then
  if new.rendered_plan_hash is null or length(new.rendered_plan_hash)<>64
    then raise exception 'REEL_STORYBOARD_RENDER_REQUIRED';end if;
  if jsonb_typeof(new.creative_plan->'scenes')<>'array'
    then raise exception 'REEL_STORYBOARD_REQUIRED';end if;
  for s in select value from jsonb_array_elements(new.creative_plan->'scenes') loop
   if nullif(s->>'asset_id','') is not null then
    begin aid:=(s->>'asset_id')::uuid;exception when others then
      raise exception 'REEL_ASSET_REFERENCE_INVALID';end;
    if not exists (select 1 from public.marketing_reel_assets a
      where a.id=aid and a.review_status='approved' and a.rights_attested
       and a.commercial_use_allowed and a.modifications_allowed)
      then raise exception 'REEL_ASSET_NOT_APPROVED';end if;
   end if;
  end loop;
 end if;
 return new;
end $$;
drop trigger if exists guard_reel_storyboard_queue on public.instagram_reel_drafts;
create trigger guard_reel_storyboard_queue before update of status on public.instagram_reel_drafts
 for each row execute function roundy_private.guard_reel_storyboard_queue();
revoke all on function roundy_private.guard_reel_storyboard_queue() from public,anon,authenticated;
commit;
