begin;

alter table public.wis_verifications
  add column if not exists rejection_reason text not null default '';

create or replace function wis_private.reset_verification()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.instagram is distinct from old.instagram
    or new.linkedin is distinct from old.linkedin
    or new.method is distinct from old.method
    or new.document_path is distinct from old.document_path then
    new.status='Reviewing';
    new.rejection_reason='';
    new.updated_at=now();
  end if;
  return new;
end;
$$;

create or replace function wis_private.member_snapshot(p_member uuid)
returns jsonb language sql security definer set search_path='' as $$
  select jsonb_build_object(
    'user_id', u.id,
    'email', null,
    'profile', coalesce(p.profile, '{}'::jsonb),
    'profile_updated_at', p.updated_at,
    'verification', jsonb_build_object(
      'status', coalesce(v.status, 'Not started'),
      'method', coalesce(v.method, ''),
      'instagram', coalesce(v.instagram, ''),
      'linkedin', coalesce(v.linkedin, ''),
      'document_path', coalesce(v.document_path, ''),
      'rejection_reason', coalesce(v.rejection_reason, ''),
      'updated_at', v.updated_at
    ),
    'payments', jsonb_build_object(
      'credit_lots', (select count(*) from public.wis_credit_lots c where c.user_id=u.id),
      'credits_total', coalesce((select sum(c.quantity) from public.wis_credit_lots c where c.user_id=u.id), 0),
      'credits_remaining', coalesce((select sum(c.remaining) from public.wis_credit_lots c where c.user_id=u.id), 0),
      'last_purchased_at', (select max(c.purchased_at) from public.wis_credit_lots c where c.user_id=u.id)
    ),
    'applications', coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'status',a.status,'event_title',e.title,'event_slug',e.slug,'starts_at',e.starts_at) order by e.starts_at desc) from public.wis_applications a join public.wis_events e on e.id=a.event_id where a.user_id=u.id), '[]'::jsonb),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'status','Confirmed','event_title',e.title,'event_slug',e.slug,'starts_at',e.starts_at) order by e.starts_at desc) from public.wis_bookings b join public.wis_events e on e.id=b.event_id where b.user_id=u.id), '[]'::jsonb)
  )
  from auth.users u
  left join public.wis_profiles p on p.user_id=u.id
  left join public.wis_verifications v on v.user_id=u.id
  where u.id=p_member;
$$;

create or replace function wis_private.admin_members()
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not wis_private.is_admin() then
    raise exception 'Administrator access required';
  end if;
  select coalesce(jsonb_agg(wis_private.member_snapshot(u.id) order by p.updated_at desc nulls last,u.id), '[]'::jsonb)
  into result
  from auth.users u
  left join public.wis_profiles p on p.user_id=u.id;
  return result;
end;
$$;

create or replace function wis_private.admin_review_member(p_member uuid,p_status text,p_rejection_reason text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare next_status text;
begin
  if auth.uid() is null or not wis_private.is_admin() then
    raise exception 'Administrator access required';
  end if;
  if p_status not in ('Approved','Rejected') then
    raise exception 'Invalid member review';
  end if;
  if p_status='Rejected' and btrim(p_rejection_reason)='' then
    raise exception 'Choose a rejection reason';
  end if;
  if not exists(select 1 from public.wis_verifications where user_id=p_member) then
    raise exception 'The member must submit a verification method before review';
  end if;
  next_status=case when p_status='Approved' then 'Verified' else 'Rejected' end;
  update public.wis_verifications
  set status=next_status,
      rejection_reason=case when next_status='Rejected' then btrim(p_rejection_reason) else '' end,
      updated_at=now()
  where user_id=p_member;
  return wis_private.member_snapshot(p_member);
end;
$$;

create or replace function public.wis_admin_members()
returns jsonb language sql security invoker set search_path='' as $$
  select wis_private.admin_members();
$$;

create or replace function public.wis_admin_review_member(p_member uuid,p_status text,p_rejection_reason text default '')
returns jsonb language sql security invoker set search_path='' as $$
  select wis_private.admin_review_member(p_member,p_status,p_rejection_reason);
$$;

create or replace function wis_private.apply(p_event uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); p jsonb; e public.wis_events; a uuid; years int; verification_status text;
begin
  if u is null then raise exception 'Sign in required';end if;
  select * into e from public.wis_events where id=p_event for share;
  if e.id is null or e.status<>'live' or e.starts_at<=now() or e.seats_remaining<1 then raise exception 'Event is not accepting applications';end if;
  select profile into p from public.wis_profiles where user_id=u;
  if p is null or coalesce(p->>'full_name','')='' or coalesce(p->>'birth_date','')='' or coalesce(p->>'gender','') not in ('male','female') or coalesce(p->>'nationality','')='' or coalesce(p->>'job_title','')='' or coalesce(p->>'workplace','')='' or coalesce((p->>'height_cm')::int,0) not between 100 and 250 or coalesce(p->>'phone','')!~'^010-[0-9]{4}-[0-9]{4}$' or coalesce((p->>'contact_consent')::boolean,false)=false or coalesce(jsonb_array_length(p->'photos'),0) not between 1 and 3 or coalesce(jsonb_array_length(p->'interests'),0) not between 3 and 10 then raise exception 'Complete all required profile fields before applying';end if;
  select status into verification_status from public.wis_verifications where user_id=u;
  if coalesce(verification_status,'')<>'Verified' then raise exception 'Your profile must be approved before applying';end if;
  years=extract(year from age(current_date,(p->>'birth_date')::date));
  if years not between e.age_min and e.age_max then raise exception 'Your age is outside this event range';end if;
  insert into public.wis_applications(event_id,user_id) values(p_event,u) on conflict(event_id,user_id) do nothing;
  select id into a from public.wis_applications where event_id=p_event and user_id=u;
  return a;
end;
$$;

revoke all on function wis_private.member_snapshot(uuid),wis_private.admin_members(),wis_private.admin_review_member(uuid,text,text) from public,anon,authenticated;
revoke all on function public.wis_admin_members(),public.wis_admin_review_member(uuid,text,text) from public,anon;
grant execute on function wis_private.admin_members(),wis_private.admin_review_member(uuid,text,text) to authenticated;
grant execute on function public.wis_admin_members(),public.wis_admin_review_member(uuid,text,text) to authenticated;

commit;
