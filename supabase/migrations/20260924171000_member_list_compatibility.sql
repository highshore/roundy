begin;

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

commit;
