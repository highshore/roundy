begin;
create table public.marketing_templates(
 id uuid primary key default gen_random_uuid(),
 channel text not null check(channel in('instagram','koreapas')),
 name text not null check(length(trim(name)) between 1 and 100),
 title text not null default '' check(length(title)<=120),
 caption text not null default '' check(length(caption)<=2000),
 destination_url text not null default '' check(destination_url='' or destination_url ~ '^https://'),
 cta text not null default 'Join us' check(length(cta)<=80),
 images text[] not null default '{}' check(cardinality(images)<=10),
 days integer[] not null default '{}' check(days <@ array[0,1,2,3,4,5,6]),
 time_kst time not null default '10:00',
 enabled boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.marketing_runs(
 id uuid primary key default gen_random_uuid(),template_id uuid references public.marketing_templates on delete set null,
 channel text not null check(channel in('instagram','koreapas')),
 snapshot jsonb not null,scheduled_for timestamptz not null default now(),
 request_key text not null unique,
 status text not null default 'queued' check(status in('queued','publishing','sent','skipped','failed','needs_review')),
 message text not null default '',external_url text,external_id text,
 started_at timestamptz,finished_at timestamptz,created_at timestamptz not null default now()
);
create index marketing_due on public.marketing_runs(status,scheduled_for);
create index marketing_history on public.marketing_runs(channel,created_at desc);
alter table public.marketing_templates enable row level security;
alter table public.marketing_runs enable row level security;
revoke all on public.marketing_templates,public.marketing_runs from public,anon,authenticated;
grant select,insert,update,delete on public.marketing_templates to authenticated;
grant select on public.marketing_runs to authenticated;
grant all on public.marketing_templates,public.marketing_runs to service_role;
create policy marketing_templates_admin on public.marketing_templates for all to authenticated using((select public.is_admin())) with check((select public.is_admin()));
create policy marketing_runs_admin on public.marketing_runs for select to authenticated using((select public.is_admin()));
create function roundy_private.marketing_template_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.updated_at=now();
 if cardinality(new.days)=0 then new.enabled=false;end if;
 if new.enabled and (trim(new.caption)='' or (new.channel='instagram' and cardinality(new.images)=0) or (new.channel='koreapas' and trim(new.title)='')) then raise exception 'Complete the post before enabling its schedule';end if;
 return new;
end;$$;
create trigger marketing_template_guard before insert or update on public.marketing_templates for each row execute function roundy_private.marketing_template_guard();
revoke all on function roundy_private.marketing_template_guard() from public,anon,authenticated;
create function public.enqueue_marketing(p_template uuid,p_request_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.marketing_templates; result uuid;
begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 select * into t from public.marketing_templates where id=p_template for share;
 if t.id is null then raise exception 'Template not found';end if;
 insert into public.marketing_runs(template_id,channel,snapshot,request_key) values(t.id,t.channel,to_jsonb(t),'manual:'||p_request_key::text) on conflict(request_key) do nothing returning id into result;
 if result is null then select id into result from public.marketing_runs where request_key='manual:'||p_request_key::text;end if;
 return result;
end;$$;
revoke all on function public.enqueue_marketing(uuid,uuid) from public,anon;
grant execute on function public.enqueue_marketing(uuid,uuid) to authenticated;
create function public.claim_marketing() returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.marketing_templates; r public.marketing_runs; local_now timestamp:=now() at time zone 'Asia/Seoul'; due timestamptz; result jsonb:='[]';
begin
 perform pg_advisory_xact_lock(hashtextextended('roundy-marketing-claims',0));
 update public.marketing_runs set status='needs_review',message='Publisher timed out. Check the channel before retrying.',finished_at=now() where status='publishing' and started_at<now()-interval '10 minutes';
 for t in select * from public.marketing_templates where enabled and extract(dow from local_now)::int=any(days) loop
  due=(local_now::date+t.time_kst) at time zone 'Asia/Seoul';
  if due<=now() and due>now()-interval '10 minutes' and t.updated_at<=due then
   insert into public.marketing_runs(template_id,channel,snapshot,request_key,scheduled_for) values(t.id,t.channel,to_jsonb(t),'schedule:'||t.id::text||':'||due::text,due) on conflict(request_key) do nothing;
  end if;
 end loop;
 for r in select * from public.marketing_runs where status='queued' and scheduled_for<=now() order by scheduled_for limit 10 for update skip locked loop
  if exists(select 1 from public.marketing_runs where channel=r.channel and status in('publishing','needs_review')) then continue;end if;
  if exists(select 1 from public.marketing_runs where channel=r.channel and status='sent' and finished_at>now()-interval '24 hours' and (r.channel='koreapas' or (snapshot->>'caption'=r.snapshot->>'caption' and snapshot->'images'=r.snapshot->'images'))) then
   update public.marketing_runs set status='skipped',message='Recent duplicate or channel posting interval (24 hours).',finished_at=now() where id=r.id;continue;
  end if;
  update public.marketing_runs set status='publishing',started_at=now() where id=r.id returning * into r;
  result=result||jsonb_build_array(to_jsonb(r));
 end loop;
 return result;
end;$$;
revoke all on function public.claim_marketing() from public,anon,authenticated;
grant execute on function public.claim_marketing() to service_role;
-- Private scheduler authentication; never exposed to the browser or admin API.
create table roundy_private.marketing_scheduler_config(singleton boolean primary key default true check(singleton),secret text not null default (gen_random_uuid()::text||gen_random_uuid()::text));
insert into roundy_private.marketing_scheduler_config default values;
revoke all on roundy_private.marketing_scheduler_config from public,anon,authenticated;
create function public.marketing_scheduler_authorized(p_secret text) returns boolean language sql security definer set search_path='' as $$select p_secret is not null and p_secret=secret from roundy_private.marketing_scheduler_config where singleton$$;
revoke all on function public.marketing_scheduler_authorized(text) from public,anon,authenticated;
grant execute on function public.marketing_scheduler_authorized(text) to service_role;
create function public.resolve_marketing_run(p_run uuid,p_published boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 update public.marketing_runs set status=case when p_published then 'sent' else 'failed' end,message='Manually checked by admin',finished_at=now() where id=p_run and status='needs_review';
end;$$;
revoke all on function public.resolve_marketing_run(uuid,boolean) from public,anon;
grant execute on function public.resolve_marketing_run(uuid,boolean) to authenticated;
commit;
