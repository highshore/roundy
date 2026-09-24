begin;

-- Event lifecycle is intentionally binary: draft (private) or live (public).
-- Historical "closed" behavior is derived from time/capacity instead of persisted state.
update public.wis_events
set status=case
  when status in ('published','live','closed') then 'live'
  else 'draft'
end
where status not in ('draft','live');

alter table public.wis_events drop constraint if exists wis_events_status_check;
alter table public.wis_events
  add constraint wis_events_status_check check(status in ('draft','live'));

-- Odd capacities are valid; the UI can now increment Max Participants one person at a time.
alter table public.wis_events drop constraint if exists wis_events_capacity_check;
alter table public.wis_events
  add constraint wis_events_capacity_check check(capacity between 2 and 100);

-- Public discovery only exposes live events. Admins retain their separate read policy.
drop policy if exists published_events on public.wis_events;
drop policy if exists live_events on public.wis_events;
create policy live_events on public.wis_events for select to anon,authenticated
using(status='live');

create or replace function wis_private.apply(p_event uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); p jsonb; e public.wis_events; a uuid; years int;
begin
 if u is null then raise exception 'Sign in required';end if;
 select * into e from public.wis_events where id=p_event for share;
 if e.id is null or e.status<>'live' or e.starts_at<=now() or e.seats_remaining<1 then raise exception 'Event is not accepting applications';end if;
 select profile into p from public.wis_profiles where user_id=u;
 if p is null or coalesce(p->>'full_name','')='' or coalesce(p->>'birth_date','')='' or coalesce(p->>'gender','') not in ('male','female') or coalesce(p->>'nationality','')='' or coalesce(p->>'job_title','')='' or coalesce(p->>'workplace','')='' or coalesce((p->>'height_cm')::int,0) not between 100 and 250 or coalesce(p->>'phone','')!~'^\+?[0-9 -]{8,20}$' or coalesce((p->>'contact_consent')::boolean,false)=false or coalesce(jsonb_array_length(p->'photos'),0) not between 1 and 3 or coalesce(jsonb_array_length(p->'interests'),0) not between 3 and 10 then raise exception 'Complete all required profile fields before applying';end if;
 years=extract(year from age(current_date,(p->>'birth_date')::date));
 if years not between e.age_min and e.age_max then raise exception 'Your age is outside this event range';end if;
 insert into public.wis_applications(event_id,user_id) values(p_event,u) on conflict(event_id,user_id) do nothing;
 select id into a from public.wis_applications where event_id=p_event and user_id=u;return a;
end;$$;

create or replace function wis_private.redeem(p_event uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); e public.wis_events; credit uuid; booking uuid;
begin
 if u is null then raise exception 'Sign in required';end if;
 select * into e from public.wis_events where id=p_event for update;
 select id into booking from public.wis_bookings where event_id=p_event and user_id=u;
 if booking is not null then return booking;end if;
 if e.id is null or e.status<>'live' or e.starts_at<=now() or e.seats_remaining<1 then raise exception 'No place available';end if;
 if not exists(select 1 from public.wis_applications where event_id=p_event and user_id=u and status='Approved') then raise exception 'Approval required';end if;
 select id into credit from public.wis_credit_lots where user_id=u and remaining>0 and expires_at>now() order by expires_at for update limit 1;
 if credit is null then raise exception 'No valid ticket available';end if;
 update public.wis_credit_lots set remaining=remaining-1 where id=credit;
 insert into public.wis_bookings(event_id,user_id,credit_lot_id) values(p_event,u,credit) returning id into booking;return booking;
end;$$;

create or replace function wis_private.application_lockdown() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(
  select 1 from public.wis_events
  where id=new.event_id
    and status='live'
    and seats_remaining>0
    and now()<starts_at-make_interval(mins=>lockdown_minutes)
 ) then raise exception 'Event registration is locked';end if;
 return new;
end;$$;

create or replace function wis_private.generate_seating(p_event uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare men uuid[];women uuid[];e public.wis_events;n int;i int;r int;j int;skipped int:=0;rows jsonb:='[]';roster jsonb:='[]';total int;
begin
 if auth.uid() is null or not wis_private.is_admin() then raise exception 'Administrator access required';end if;
 select * into e from public.wis_events where id=p_event for update;
 if e.id is null or e.starts_at<=now() then raise exception 'Seating can only change before the event starts';end if;
 if exists(select 1 from public.wis_choices where event_id=p_event) then raise exception 'Seating is locked after choices begin';end if;
 select count(*) into total from public.wis_bookings where event_id=p_event;
 if exists(select 1 from public.wis_bookings b left join public.wis_verifications v on v.user_id=b.user_id where b.event_id=p_event and coalesce(v.status,'')<>'Verified') then raise exception 'All confirmed attendees must be verified before seating';end if;
 select array_agg(b.user_id order by b.created_at,b.user_id) into men from public.wis_bookings b join public.wis_profiles p on p.user_id=b.user_id where b.event_id=p_event and p.profile->>'gender'='male';
 select array_agg(b.user_id order by b.created_at,b.user_id) into women from public.wis_bookings b join public.wis_profiles p on p.user_id=b.user_id where b.event_id=p_event and p.profile->>'gender'='female';
 n=coalesce(cardinality(men),0);
 if n=0 or n<>coalesce(cardinality(women),0) or total<>2*n then raise exception 'Confirm an equal number of men and women before generating seating';end if;
 for i in 1..n loop
  roster=roster||jsonb_build_array(jsonb_build_object('code','M'||i,'name',(select profile->>'full_name' from public.wis_profiles where user_id=men[i])),jsonb_build_object('code','W'||i,'name',(select profile->>'full_name' from public.wis_profiles where user_id=women[i])));
 end loop;
 delete from public.wis_encounters where event_id=p_event;
 for r in 1..n loop for i in 1..n loop
  j=((i+r-2)%n)+1;
  if exists(select 1 from public.wis_pair_exclusions where user_a=least(men[i],women[j]) and user_b=greatest(men[i],women[j])) then skipped=skipped+1;
  else
   insert into public.wis_encounters(event_id,user_a,user_b,round_number,table_number) values(p_event,men[i],women[j],r,i);
   rows=rows||jsonb_build_array(jsonb_build_object('round',r,'table',i,'left','M'||i,'right','W'||j));
  end if;
 end loop;end loop;
 if jsonb_array_length(rows)=0 then raise exception 'No safe pairings are available';end if;
 insert into public.wis_seating_plans(event_id,plan,generated_by) values(p_event,jsonb_build_object('rows',rows,'skipped',skipped,'roster',roster),auth.uid()) on conflict(event_id) do update set plan=excluded.plan,generated_at=now(),generated_by=auth.uid();
 return jsonb_build_object('rows',rows,'skipped',skipped,'roster',roster);
end;$$;

create or replace function wis_private.finalize(p_event uuid) returns int language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); e public.wis_events; n int;
begin
 if u is null or not exists(select 1 from public.wis_staff where event_id=p_event and user_id=u) then raise exception 'Host authorization required';end if;
 select * into e from public.wis_events where id=p_event for update;
 if e.ends_at>now() then raise exception 'Event has not ended';end if;
 insert into public.wis_matches(event_id,user_a,user_b)
 select p_event,least(a.user_id,a.recipient_id),greatest(a.user_id,a.recipient_id)
 from public.wis_choices a join public.wis_choices b on a.event_id=b.event_id and a.user_id=b.recipient_id and a.recipient_id=b.user_id
 where a.event_id=p_event and a.choice='yes' and b.choice='yes' on conflict do nothing;
 select count(*) into n from public.wis_matches where event_id=p_event;return n;
end;$$;

create or replace function wis_private.match_profile(p_match uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); target uuid; p jsonb;
begin
 if u is null then raise exception 'Sign in required';end if;
 select case when m.user_a=u then m.user_b else m.user_a end into target
 from public.wis_matches m join public.wis_events e on e.id=m.event_id
 where m.id=p_match and (m.user_a=u or m.user_b=u) and e.ends_at<=now();
 if target is null then raise exception 'Match unavailable';end if;
 select profile into p from public.wis_profiles where user_id=target;
 return jsonb_build_object('full_name',p->>'full_name','age',extract(year from age(current_date,(p->>'birth_date')::date)),'nationality',p->>'nationality','height_cm',p->'height_cm','public_job',p->>'public_job','public_workplace',p->>'public_workplace','phone',p->>'phone','interests',p->'interests');
end;$$;

create or replace function wis_private.claim_reminders() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 insert into public.wis_reminder_deliveries(event_id,user_id,starts_at)
 select e.id,b.user_id,e.starts_at from public.wis_events e join public.wis_bookings b on b.event_id=e.id
 where e.status='live' and e.reminder_minutes is not null and e.starts_at>now()-interval '10 minutes' and e.starts_at-make_interval(mins=>e.reminder_minutes)<=now()
 on conflict(event_id,user_id,starts_at) do nothing;
 update public.wis_reminder_deliveries d set status='cancelled',updated_at=now()
 where d.status='queued' and not exists(
  select 1 from public.wis_events e join public.wis_bookings b on b.event_id=e.id and b.user_id=d.user_id
  where e.id=d.event_id and e.starts_at=d.starts_at and e.starts_at>now()-interval '10 minutes' and e.status='live' and e.reminder_minutes is not null and e.starts_at-make_interval(mins=>e.reminder_minutes)<=now()
 );
 with claimed as (
  update public.wis_reminder_deliveries set status='processing',updated_at=now()
  where id in(select id from public.wis_reminder_deliveries where status='queued' order by starts_at limit 10 for update skip locked)
  returning *
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'phone',p.profile->>'phone','title',e.title,'starts_at',e.starts_at,'venue',e.venue,'address',e.address,'slug',e.slug)),'[]'::jsonb)
 into result from claimed d join public.wis_events e on e.id=d.event_id join public.wis_profiles p on p.user_id=d.user_id;
 return result;
end;$$;

create or replace function wis_private.dispatch_due_reminders() returns void language plpgsql security definer set search_path='' as $$
declare config wis_private.reminder_scheduler_config;
begin
 select * into config from wis_private.reminder_scheduler_config where singleton;
 if config.project_url is null then return;end if;
 if exists(
  select 1 from public.wis_events e join public.wis_bookings b on b.event_id=e.id
  left join public.wis_reminder_deliveries d on d.event_id=e.id and d.user_id=b.user_id and d.starts_at=e.starts_at
  where e.status='live' and e.reminder_minutes is not null
  and e.starts_at>now()-interval '10 minutes' and e.starts_at-make_interval(mins=>e.reminder_minutes)<=now()
  and (d.id is null or d.status='queued')
 ) then
  perform net.http_post(url:=config.project_url||'/functions/v1/roundy-reminders',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||config.anon_jwt),body:='{}'::jsonb,timeout_milliseconds:=140000);
 end if;
end;$$;

commit;
