alter table public.instagram_post_drafts
  add column if not exists content_language text;

alter table public.instagram_post_drafts
  drop constraint if exists instagram_post_drafts_content_language_check;

alter table public.instagram_post_drafts
  add constraint instagram_post_drafts_content_language_check
  check (content_language is null or content_language in ('ko','en'));

update public.instagram_post_drafts
set content_language = case
  when caption ~ '[가-힣]' then 'ko'
  when trim(caption) <> '' then 'en'
  else null
end
where content_language is null;

create or replace function public.approve_marketing_draft(p_id uuid,p_revision integer,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare d public.instagram_post_drafts; r public.marketing_runs; scheduled timestamptz; missed boolean;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into d from public.instagram_post_drafts where id=p_id for update;
 if not found or d.status<>'needs_approval' or d.revision<>p_revision then raise exception 'DRAFT_CHANGED_REFRESH_FIRST'; end if;
 if exists(select 1 from public.marketing_generation_jobs where draft_id=p_id and status='running' and created_at>now()-interval '5 minutes') then raise exception 'GENERATION_ALREADY_RUNNING'; end if;
 if trim(d.caption)='' or cardinality(d.images)=0 then raise exception 'COMPLETE_COPY_AND_IMAGES_FIRST'; end if;
 missed:=now()>((d.draft_date+d.window_end_kst) at time zone 'Asia/Seoul');
 scheduled:=case when d.scheduled_for>now()+interval '1 minute' then d.scheduled_for else now()+case when missed then interval '10 minutes' else interval '5 minutes' end end;
 insert into public.marketing_runs(channel,snapshot,request_key,scheduled_for)
 values('instagram',jsonb_build_object('channel','instagram','name','Daily Instagram - '||d.draft_date,'title','','caption',d.caption,'cta',d.cta,'destination_url',d.destination_url,'images',to_jsonb(d.images),'draft_id',d.id,'event_id',d.event_id,'content_mode',d.content_mode,'draft_kind',d.draft_kind,'growth_topic_type',d.growth_topic_type,'content_pillar',d.content_pillar,'content_language',d.content_language,'eligible_for_optimization',not missed,'auto_generated',true),'draft:'||d.id||':'||d.revision,scheduled) returning * into r;
 update public.instagram_post_drafts set status='scheduled',approved_at=now(),approved_by=p_actor,marketing_run_id=r.id,scheduled_for=scheduled,eligible_for_optimization=not missed,updated_at=now() where id=p_id returning * into d;
 return jsonb_build_object('draft',to_jsonb(d),'run',to_jsonb(r),'missed_window',missed);
end $$;

revoke all on function public.approve_marketing_draft(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.approve_marketing_draft(uuid,integer,uuid) to service_role;

create or replace function public.publish_marketing_draft_now(p_id uuid,p_revision integer,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare d public.instagram_post_drafts; r public.marketing_runs;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into d from public.instagram_post_drafts where id=p_id for update;
 if not found or d.status<>'needs_approval' or d.revision<>p_revision then raise exception 'DRAFT_CHANGED_REFRESH_FIRST'; end if;
 if exists(select 1 from public.marketing_generation_jobs where draft_id=p_id and status='running' and created_at>now()-interval '5 minutes') then raise exception 'GENERATION_ALREADY_RUNNING'; end if;
 if trim(d.caption)='' or cardinality(d.images)=0 then raise exception 'COMPLETE_COPY_AND_IMAGES_FIRST'; end if;
 insert into public.marketing_runs(channel,snapshot,request_key,scheduled_for)
 values('instagram',jsonb_build_object('channel','instagram','name','Immediate Instagram - '||d.draft_date,'title','','caption',d.caption,'cta',d.cta,'destination_url',d.destination_url,'images',to_jsonb(d.images),'draft_id',d.id,'event_id',d.event_id,'content_mode',d.content_mode,'draft_kind',d.draft_kind,'growth_topic_type',d.growth_topic_type,'content_pillar',d.content_pillar,'content_language',d.content_language,'eligible_for_optimization',false,'auto_generated',false,'publish_mode','immediate'),'draft-now:'||d.id||':'||d.revision,now()) returning * into r;
 update public.instagram_post_drafts set status='scheduled',approved_at=now(),approved_by=p_actor,marketing_run_id=r.id,scheduled_for=now(),eligible_for_optimization=false,updated_at=now() where id=p_id returning * into d;
 return jsonb_build_object('draft',to_jsonb(d),'run',to_jsonb(r),'publish_mode','immediate');
end $$;

revoke all on function public.publish_marketing_draft_now(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.publish_marketing_draft_now(uuid,integer,uuid) to service_role;
