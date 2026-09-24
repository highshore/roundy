begin;
alter table public.wis_events
 add column duration_minutes integer not null default 120 check(duration_minutes between 15 and 1440),
 add column lockdown_minutes integer not null default 60 check(lockdown_minutes between 0 and 43200),
 add column reminder_minutes integer check(reminder_minutes between 0 and 43200),
 add column images text[] not null default '{}',
 add column previous_slugs text[] not null default '{}';
-- Preserve existing event timing and artwork.
update public.wis_events set duration_minutes=greatest(15,least(1440,extract(epoch from (ends_at-starts_at))/60))::int,images=case when image<>'' then array[image] else '{}'::text[] end;
alter table public.wis_events drop constraint wis_events_capacity_check;
alter table public.wis_events add constraint wis_events_capacity_check check(capacity between 2 and 100 and capacity%2=0);
alter table public.wis_events alter column neighborhood set default 'Seoul';
alter table public.wis_events alter column seats_remaining set default 0;

-- Date slugs are allocated in the database, including concurrent same-date creates.
create function wis_private.event_derived_fields() returns trigger language plpgsql security definer set search_path='' as $$
declare base text; candidate text; suffix int:=1; booked int;
begin
 if tg_op='INSERT' or new.starts_at is distinct from old.starts_at then
  base=to_char(new.starts_at at time zone 'Asia/Seoul','MM-DD-YYYY');
  perform pg_advisory_xact_lock(hashtextextended('roundy-event-date:'||base,0));
  candidate=base;
  while exists(select 1 from public.wis_events e where e.id<>new.id and (e.slug=candidate or candidate=any(e.previous_slugs))) loop suffix=suffix+1;candidate=base||'-'||suffix;end loop;
  if tg_op='UPDATE' and old.slug<>candidate then new.previous_slugs=array_append(old.previous_slugs,old.slug);end if;
  new.slug=candidate;
 end if;
 if tg_op='INSERT' or new.starts_at is distinct from old.starts_at or new.duration_minutes is distinct from old.duration_minutes then new.ends_at=new.starts_at+make_interval(mins=>new.duration_minutes);end if;
 select count(*) into booked from public.wis_bookings where event_id=new.id;
 if booked>new.capacity then raise exception 'Capacity cannot be smaller than confirmed bookings';end if;
 new.seats_remaining=new.capacity-booked;
 if cardinality(new.images)>10 then raise exception 'At most 10 event images';end if;
 new.image=coalesce(new.images[1],'');
 return new;
end;$$;
create trigger wis_events_derived before insert or update on public.wis_events for each row execute function wis_private.event_derived_fields();
-- Existing published URLs stay valid; next date edit creates an alias.
update public.wis_events set seats_remaining=seats_remaining;
create function wis_private.booking_capacity() returns trigger language plpgsql security definer set search_path='' as $$
declare eid uuid; e public.wis_events;
begin
 eid=case when tg_op='DELETE' then old.event_id else new.event_id end;
 select * into e from public.wis_events where id=eid for update;
 if tg_op='INSERT' and (select count(*) from public.wis_bookings where event_id=eid)>=e.capacity then raise exception 'No place available';end if;
 if tg_op='UPDATE' and new.event_id<>old.event_id then raise exception 'Bookings cannot be moved between events';end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
create trigger wis_booking_capacity before insert or update or delete on public.wis_bookings for each row execute function wis_private.booking_capacity();
create function wis_private.refresh_seats() returns trigger language plpgsql security definer set search_path='' as $$begin update public.wis_events set seats_remaining=seats_remaining where id=case when tg_op='DELETE' then old.event_id else new.event_id end;return null;end;$$;
create trigger wis_booking_seat_count after insert or delete on public.wis_bookings for each row execute function wis_private.refresh_seats();

-- Lockdown protects direct RPC clients too, not just the web form.
create function wis_private.application_lockdown() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.wis_events where id=new.event_id and status='published' and now()<starts_at-make_interval(mins=>lockdown_minutes)) then raise exception 'Event registration is locked';end if;
 return new;
end;$$;
create trigger wis_application_lockdown before insert on public.wis_applications for each row execute function wis_private.application_lockdown();
create trigger wis_booking_lockdown before insert on public.wis_bookings for each row execute function wis_private.application_lockdown();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('wis-event-images','wis-event-images',true,5242880,array['image/jpeg','image/png','image/webp']),
 ('wis-verification-documents','wis-verification-documents',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf']) on conflict(id) do nothing;
create policy wis_event_images_insert on storage.objects for insert to authenticated with check(bucket_id='wis-event-images' and (select public.wis_is_admin()) and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy wis_event_images_admin_read on storage.objects for select to authenticated using(bucket_id='wis-event-images' and (select public.wis_is_admin()));
create policy wis_document_insert on storage.objects for insert to authenticated with check(bucket_id='wis-verification-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy wis_document_read on storage.objects for select to authenticated using(bucket_id='wis-verification-documents' and ((storage.foldername(name))[1]=(select auth.uid())::text or (select public.wis_is_admin())));
create policy wis_document_delete on storage.objects for delete to authenticated using(bucket_id='wis-verification-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
alter table public.wis_verifications add column method text not null default 'instagram' check(method in('instagram','linkedin','document')),add column document_path text not null default '';
update public.wis_verifications set method='linkedin' where instagram='' and linkedin<>'';
grant insert(method,document_path),update(method,document_path) on public.wis_verifications to authenticated;
create or replace function wis_private.reset_verification() returns trigger language plpgsql set search_path='' as $$begin if new.instagram is distinct from old.instagram or new.linkedin is distinct from old.linkedin or new.method is distinct from old.method or new.document_path is distinct from old.document_path then new.status='Reviewing';new.updated_at=now();end if;return new;end;$$;
create function wis_private.validate_verification() returns trigger language plpgsql set search_path='' as $$begin
 if new.method='document' and (new.document_path='' or split_part(new.document_path,'/',1)<>new.user_id::text or not exists(select 1 from storage.objects where bucket_id='wis-verification-documents' and name=new.document_path)) then raise exception 'Upload a private verification document first';end if;
 if new.method='document' then new.instagram='';new.linkedin='';elsif new.method='instagram' then new.linkedin='';new.document_path='';else new.instagram='';new.document_path='';end if;
 return new;
end;$$;
create trigger a_validate_verification before insert or update on public.wis_verifications for each row execute function wis_private.validate_verification();

create table public.wis_seating_plans(event_id uuid primary key references public.wis_events on delete cascade,plan jsonb not null,generated_at timestamptz not null default now(),generated_by uuid references auth.users);
alter table public.wis_seating_plans enable row level security;
revoke all on public.wis_seating_plans from anon,authenticated;
create function wis_private.get_seating(p_event uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not wis_private.is_admin() then raise exception 'Administrator access required';end if;
 select plan into result from public.wis_seating_plans where event_id=p_event;
 if result is null then raise exception 'Generate seating before sharing an image';end if;
 return result;
end;$$;
create function wis_private.generate_seating(p_event uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare men uuid[];women uuid[];e public.wis_events;n int;i int;r int;j int;skipped int:=0;rows jsonb:='[]';roster jsonb:='[]';total int;
begin
 if auth.uid() is null or not wis_private.is_admin() then raise exception 'Administrator access required';end if;
 select * into e from public.wis_events where id=p_event for update;
 if e.id is null or e.status not in('draft','published') then raise exception 'Seating can only change before an event goes live';end if;
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
create function public.wis_generate_seating(p_event uuid) returns jsonb language sql security invoker set search_path='' as $$select wis_private.generate_seating(p_event);$$;
create function public.wis_get_seating(p_event uuid) returns jsonb language sql security invoker set search_path='' as $$select wis_private.get_seating(p_event);$$;
revoke all on function public.wis_generate_seating(uuid),public.wis_get_seating(uuid) from public,anon;
revoke all on function wis_private.generate_seating(uuid),wis_private.get_seating(uuid) from public,anon;
grant execute on function public.wis_generate_seating(uuid),public.wis_get_seating(uuid),wis_private.generate_seating(uuid),wis_private.get_seating(uuid) to authenticated;
-- Trigger helpers are not public callable APIs.
revoke all on function wis_private.event_derived_fields(),wis_private.booking_capacity(),wis_private.refresh_seats(),wis_private.application_lockdown(),wis_private.validate_verification() from public,anon,authenticated;
commit;
