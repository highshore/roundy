begin;

create or replace function wis_private.application_lockdown()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.wis_events where id=new.event_id and status='live' and now()<starts_at-make_interval(mins=>lockdown_minutes)) then
    raise exception 'Event registration is locked';
  end if;
  return new;
end;
$$;

create or replace function wis_private.redeem(p_event uuid)
returns uuid language plpgsql security definer set search_path='' as $$
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
  insert into public.wis_bookings(event_id,user_id,credit_lot_id) values(p_event,u,credit) returning id into booking;
  return booking;
end;
$$;

create or replace function wis_private.generate_seating(p_event uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
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
end;
$$;

commit;
