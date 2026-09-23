-- ROUNDY foundation. Apply only to the selected Roundy project.
begin;
create schema if not exists wis_private;
revoke all on schema wis_private from public, anon;
grant usage on schema wis_private to authenticated;
create table public.wis_events (
 id uuid primary key default gen_random_uuid(), slug text unique not null, title text not null,
 neighborhood text not null, starts_at timestamptz not null, ends_at timestamptz not null,
 venue text not null, address text not null, age_min int not null default 24, age_max int not null default 35,
 capacity int not null check(capacity between 12 and 24 and capacity%2=0),
 seats_remaining int not null check(seats_remaining>=0), theme text not null default '', description text not null default '', image text not null default '',
 status text not null default 'draft' check(status in ('draft','published','live','closed','cancelled')),
 check(ends_at>starts_at), check(age_min>=18 and age_max>=age_min), check(seats_remaining<=capacity)
);
create table public.wis_profiles(user_id uuid primary key references auth.users on delete cascade, profile jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
create table public.wis_verifications(user_id uuid primary key references auth.users on delete cascade, instagram text not null default '', linkedin text not null default '', status text not null default 'Reviewing' check(status in ('Reviewing','Verified','Rejected')), updated_at timestamptz not null default now());
create table public.wis_applications(id uuid primary key default gen_random_uuid(),event_id uuid not null references public.wis_events,user_id uuid not null references auth.users,status text not null default 'Reviewing' check(status in ('Reviewing','Waitlisted','Approved','Cancelled')),created_at timestamptz not null default now(),unique(event_id,user_id));
create table public.wis_credit_lots(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users,quantity int not null check(quantity in(1,3)),remaining int not null check(remaining>=0 and remaining<=quantity),purchased_at timestamptz not null default now(),expires_at timestamptz not null default(now()+interval '90 days'),payment_reference text unique not null);
create table public.wis_bookings(id uuid primary key default gen_random_uuid(),event_id uuid not null references public.wis_events,user_id uuid not null references auth.users,credit_lot_id uuid references public.wis_credit_lots,checked_in_at timestamptz,created_at timestamptz not null default now(),unique(event_id,user_id));
create table public.wis_encounters(id uuid primary key default gen_random_uuid(),event_id uuid not null references public.wis_events,user_a uuid not null references auth.users,user_b uuid not null references auth.users,round_number int not null check(round_number>0),table_number int not null check(table_number>0),check(user_a<>user_b),unique(event_id,user_a,user_b));
create table public.wis_choices(event_id uuid not null references public.wis_events,encounter_id uuid not null references public.wis_encounters,user_id uuid not null references auth.users,recipient_id uuid not null references auth.users,choice text not null check(choice in('no','maybe','yes')),updated_at timestamptz not null default now(),primary key(encounter_id,user_id));
create index on public.wis_choices(event_id,user_id,choice);
create table public.wis_matches(id uuid primary key default gen_random_uuid(),event_id uuid not null references public.wis_events,user_a uuid not null references auth.users,user_b uuid not null references auth.users,created_at timestamptz not null default now(),check(user_a<user_b),unique(event_id,user_a,user_b));
create table public.wis_reports(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users,context text not null,reason text not null check(length(reason) between 10 and 5000),created_at timestamptz not null default now());
create table public.wis_pair_exclusions(user_a uuid references auth.users,user_b uuid references auth.users,primary key(user_a,user_b),check(user_a<user_b));
create table public.wis_staff(user_id uuid not null references auth.users,event_id uuid not null references public.wis_events,primary key(user_id,event_id));
-- Explicit grants + RLS. No attendee/profile directory and no self-issued approval/payment/check-in.
alter table public.wis_events enable row level security;
create policy published_events on public.wis_events for select to anon,authenticated using(status in('published','live','closed'));
grant select on public.wis_events to anon,authenticated;
alter table public.wis_profiles enable row level security;
create policy own_profile on public.wis_profiles for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
grant select,insert,update on public.wis_profiles to authenticated;
alter table public.wis_verifications enable row level security;
create policy own_verification on public.wis_verifications for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
grant select on public.wis_verifications to authenticated;
grant insert(user_id,instagram,linkedin),update(instagram,linkedin) on public.wis_verifications to authenticated;
create function wis_private.reset_verification() returns trigger language plpgsql set search_path='' as $$begin if new.instagram is distinct from old.instagram or new.linkedin is distinct from old.linkedin then new.status='Reviewing';new.updated_at=now();end if;return new;end;$$;
create trigger reset_verification before update on public.wis_verifications for each row execute function wis_private.reset_verification();
alter table public.wis_applications enable row level security;
create policy own_application on public.wis_applications for select to authenticated using(user_id=(select auth.uid()));
alter table public.wis_credit_lots enable row level security;
create policy own_credits on public.wis_credit_lots for select to authenticated using(user_id=(select auth.uid()));
alter table public.wis_bookings enable row level security;
create policy own_booking on public.wis_bookings for select to authenticated using(user_id=(select auth.uid()));
alter table public.wis_encounters enable row level security;
alter table public.wis_choices enable row level security;
create policy own_choices on public.wis_choices for select to authenticated using(user_id=(select auth.uid()));
alter table public.wis_matches enable row level security;
create policy own_matches on public.wis_matches for select to authenticated using(user_a=(select auth.uid()) or user_b=(select auth.uid()));
alter table public.wis_reports enable row level security;
create policy own_reports on public.wis_reports for insert to authenticated with check(user_id=(select auth.uid()));
create policy read_own_reports on public.wis_reports for select to authenticated using(user_id=(select auth.uid()));
alter table public.wis_pair_exclusions enable row level security;
alter table public.wis_staff enable row level security;
grant select on public.wis_applications,public.wis_credit_lots,public.wis_bookings,public.wis_choices,public.wis_matches to authenticated;
grant select,insert(user_id,context,reason) on public.wis_reports to authenticated;

create function wis_private.apply(p_event uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); p jsonb; e public.wis_events; a uuid; years int;
begin
 if u is null then raise exception 'Sign in required';end if;
 select * into e from public.wis_events where id=p_event for share;
 if e.id is null or e.status<>'published' or e.starts_at<=now() then raise exception 'Event is not accepting applications';end if;
 select profile into p from public.wis_profiles where user_id=u;
 if p is null or coalesce(p->>'full_name','')='' or coalesce(p->>'birth_date','')='' or coalesce(p->>'gender','') not in ('male','female') or coalesce(p->>'nationality','')='' or coalesce(p->>'job_title','')='' or coalesce(p->>'workplace','')='' or coalesce((p->>'height_cm')::int,0) not between 100 and 250 or coalesce(p->>'phone','')!~'^\+?[0-9 -]{8,20}$' or coalesce((p->>'contact_consent')::boolean,false)=false or coalesce(jsonb_array_length(p->'photos'),0) not between 1 and 3 or coalesce(jsonb_array_length(p->'interests'),0) not between 3 and 10 then raise exception 'Complete all required profile fields before applying';end if;
 years=extract(year from age(current_date,(p->>'birth_date')::date));
 if years not between e.age_min and e.age_max then raise exception 'Your age is outside this event range';end if;
 insert into public.wis_applications(event_id,user_id) values(p_event,u) on conflict(event_id,user_id) do nothing;
 select id into a from public.wis_applications where event_id=p_event and user_id=u;return a;
end;$$;
create function public.wis_apply(p_event uuid) returns uuid language sql security invoker set search_path='' as $$select wis_private.apply(p_event);$$;

create function wis_private.redeem(p_event uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); e public.wis_events; credit uuid; booking uuid;
begin
 if u is null then raise exception 'Sign in required';end if;
 select * into e from public.wis_events where id=p_event for update;
 select id into booking from public.wis_bookings where event_id=p_event and user_id=u;
 if booking is not null then return booking;end if;
 if e.id is null or e.status<>'published' or e.starts_at<=now() or e.seats_remaining<1 then raise exception 'No place available';end if;
 if not exists(select 1 from public.wis_applications where event_id=p_event and user_id=u and status='Approved') then raise exception 'Approval required';end if;
 select id into credit from public.wis_credit_lots where user_id=u and remaining>0 and expires_at>now() order by expires_at for update limit 1;
 if credit is null then raise exception 'No valid ticket available';end if;
 update public.wis_credit_lots set remaining=remaining-1 where id=credit;
 update public.wis_events set seats_remaining=seats_remaining-1 where id=p_event;
 insert into public.wis_bookings(event_id,user_id,credit_lot_id) values(p_event,u,credit) returning id into booking;return booking;
end;$$;
create function public.wis_redeem(p_event uuid) returns uuid language sql security invoker set search_path='' as $$select wis_private.redeem(p_event);$$;

create function wis_private.choose(p_encounter uuid,p_choice text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); r public.wis_encounters; e public.wis_events; b public.wis_bookings; target uuid; count_yes int;
begin
 if u is null then raise exception 'Sign in required';end if;
 if p_choice not in ('no','maybe','yes') then raise exception 'Invalid choice';end if;
 select * into r from public.wis_encounters where id=p_encounter and (user_a=u or user_b=u);
 if r.id is null then raise exception 'Encounter unavailable';end if;
 select * into e from public.wis_events where id=r.event_id for share;
 if e.status<>'live' or now()>=e.ends_at then raise exception 'Choices are closed';end if;
 select * into b from public.wis_bookings where event_id=r.event_id and user_id=u for update;
 if b.id is null or b.checked_in_at is null then raise exception 'Host check-in required';end if;
 target=case when r.user_a=u then r.user_b else r.user_a end;
 select count(*) into count_yes from public.wis_choices where event_id=r.event_id and user_id=u and choice='yes' and encounter_id<>p_encounter;
 if p_choice='yes' and count_yes>=3 then raise exception 'At most 3 Yes choices';end if;
 insert into public.wis_choices(event_id,encounter_id,user_id,recipient_id,choice) values(r.event_id,p_encounter,u,target,p_choice) on conflict(encounter_id,user_id) do update set choice=excluded.choice,updated_at=now();
end;$$;
create function public.wis_choose(p_encounter uuid,p_choice text) returns void language sql security invoker set search_path='' as $$select wis_private.choose(p_encounter,p_choice);$$;

create function wis_private.finalize(p_event uuid) returns int language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); e public.wis_events; n int;
begin
 if u is null or not exists(select 1 from public.wis_staff where event_id=p_event and user_id=u) then raise exception 'Host authorization required';end if;
 select * into e from public.wis_events where id=p_event for update;
 if e.ends_at>now() then raise exception 'Event has not ended';end if;
 if e.status not in('live','closed') then raise exception 'Event is not ready';end if;
 update public.wis_events set status='closed' where id=p_event;
 insert into public.wis_matches(event_id,user_a,user_b)
 select p_event,least(a.user_id,a.recipient_id),greatest(a.user_id,a.recipient_id)
 from public.wis_choices a join public.wis_choices b on a.event_id=b.event_id and a.user_id=b.recipient_id and a.recipient_id=b.user_id
 where a.event_id=p_event and a.choice='yes' and b.choice='yes' on conflict do nothing;
 select count(*) into n from public.wis_matches where event_id=p_event;return n;
end;$$;
create function public.wis_finalize(p_event uuid) returns int language sql security invoker set search_path='' as $$select wis_private.finalize(p_event);$$;

create function wis_private.match_profile(p_match uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); target uuid; p jsonb;
begin
 if u is null then raise exception 'Sign in required';end if;
 select case when m.user_a=u then m.user_b else m.user_a end into target from public.wis_matches m join public.wis_events e on e.id=m.event_id where m.id=p_match and (m.user_a=u or m.user_b=u) and e.status='closed';
 if target is null then raise exception 'Match unavailable';end if;
 select profile into p from public.wis_profiles where user_id=target;
 return jsonb_build_object('full_name',p->>'full_name','age',extract(year from age(current_date,(p->>'birth_date')::date)),'nationality',p->>'nationality','height_cm',p->'height_cm','public_job',p->>'public_job','public_workplace',p->>'public_workplace','phone',p->>'phone','interests',p->'interests');
end;$$;
create function public.wis_match_profile(p_match uuid) returns jsonb language sql security invoker set search_path='' as $$select wis_private.match_profile(p_match);$$;

revoke all on all functions in schema wis_private from public,anon,authenticated;
revoke all on function public.wis_apply(uuid),public.wis_redeem(uuid),public.wis_choose(uuid,text),public.wis_finalize(uuid),public.wis_match_profile(uuid) from public,anon;
grant execute on function wis_private.apply(uuid),wis_private.redeem(uuid),wis_private.choose(uuid,text),wis_private.finalize(uuid),wis_private.match_profile(uuid) to authenticated;
grant execute on function public.wis_apply(uuid),public.wis_redeem(uuid),public.wis_choose(uuid,text),public.wis_finalize(uuid),public.wis_match_profile(uuid) to authenticated;
-- Private photo bucket; no public URL / broad attendee read policy.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('wis-profile-photos','wis-profile-photos',false,2097152,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy wis_photo_read on storage.objects for select to authenticated using(bucket_id='wis-profile-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy wis_photo_upload on storage.objects for insert to authenticated with check(bucket_id='wis-profile-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy wis_photo_delete on storage.objects for delete to authenticated using(bucket_id='wis-profile-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
commit;
