-- 100% referral checkout. Roundy keeps the existing wis_ namespace used by its tables and RPCs.
begin;

create table public.wis_referral_codes(
  code text primary key check(code ~ '^[A-Z0-9]{6}$'),
  referrer_user_id uuid not null unique references public.wis_members(id),
  discount_percent smallint not null default 100 check(discount_percent between 0 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.wis_referral_redemptions(
  id uuid primary key default gen_random_uuid(),
  referral_code text not null references public.wis_referral_codes(code),
  referrer_user_id uuid not null references public.wis_members(id),
  referred_user_id uuid not null unique references public.wis_members(id),
  event_id uuid not null references public.wis_events(id),
  credit_lot_id uuid not null unique references public.wis_credit_lots(id),
  quantity int not null check(quantity in(1,3)),
  subtotal_amount int not null check(subtotal_amount>=0),
  discount_percent smallint not null check(discount_percent between 0 and 100),
  discount_amount int not null check(discount_amount>=0 and discount_amount<=subtotal_amount),
  final_amount int not null check(final_amount>=0 and final_amount=subtotal_amount-discount_amount),
  redeemed_at timestamptz not null default now()
);

alter table public.wis_referral_codes enable row level security;
alter table public.wis_referral_redemptions enable row level security;
revoke all on public.wis_referral_codes,public.wis_referral_redemptions from public,anon,authenticated;

create or replace function wis_private.deactivate_referral_code_on_member_delete()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.wis_referral_codes
    set active=false
    where referrer_user_id=new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists wis_deactivate_referral_code on public.wis_members;
create trigger wis_deactivate_referral_code
after update of deleted_at on public.wis_members
for each row execute function wis_private.deactivate_referral_code_on_member_delete();

create or replace function wis_private.get_my_referral_code()
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  result text;
begin
  if u is null then raise exception 'Sign in required'; end if;
  select code into result
  from public.wis_referral_codes
  where referrer_user_id=u and active
  limit 1;
  return result;
end;
$$;

create or replace function wis_private.get_or_create_referral_code()
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  existing_code text;
  existing_active boolean;
  candidate text;
  attempt int;
begin
  if u is null then raise exception 'Sign in required'; end if;

  select code,active into existing_code,existing_active
  from public.wis_referral_codes
  where referrer_user_id=u
  limit 1;

  if existing_code is not null then
    if not existing_active then raise exception 'Referral code is disabled'; end if;
    return existing_code;
  end if;

  for attempt in 1..20 loop
    candidate:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
    begin
      insert into public.wis_referral_codes(code,referrer_user_id,discount_percent,active)
      values(candidate,u,100,true);
      return candidate;
    exception when unique_violation then
      select code,active into existing_code,existing_active
      from public.wis_referral_codes
      where referrer_user_id=u
      limit 1;
      if existing_code is not null then
        if not existing_active then raise exception 'Referral code is disabled'; end if;
        return existing_code;
      end if;
    end;
  end loop;

  raise exception 'Could not generate a unique referral code';
end;
$$;

create or replace function wis_private.referral_quote(p_code text,p_quantity int)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  normalized text:=upper(btrim(coalesce(p_code,'')));
  profile_data jsonb;
  unit_price int;
  subtotal int;
  discount_amount int;
  referral public.wis_referral_codes;
begin
  if u is null then raise exception 'Sign in required'; end if;
  if p_quantity not in(1,3) then raise exception 'Choose either 1 or 3 tickets'; end if;

  select profile into profile_data
  from public.wis_profiles
  where user_id=u;

  if coalesce(profile_data->>'gender','') not in('male','female') then
    return jsonb_build_object(
      'valid',false,'reason','profile_required','code',normalized,
      'discount_percent',0,'subtotal_amount',0,'discount_amount',0,'final_amount',0
    );
  end if;

  unit_price:=case when profile_data->>'gender'='female' then 19800 else 29800 end;
  subtotal:=unit_price*p_quantity;

  if normalized !~ '^[A-Z0-9]{6}$' then
    return jsonb_build_object(
      'valid',false,'reason','invalid','code',normalized,
      'discount_percent',0,'subtotal_amount',subtotal,'discount_amount',0,'final_amount',subtotal
    );
  end if;

  select r.* into referral
  from public.wis_referral_codes r
  join public.wis_members m on m.id=r.referrer_user_id
  where r.code=normalized and r.active and m.deleted_at is null;

  if referral.code is null then
    return jsonb_build_object(
      'valid',false,'reason','invalid','code',normalized,
      'discount_percent',0,'subtotal_amount',subtotal,'discount_amount',0,'final_amount',subtotal
    );
  end if;

  if referral.referrer_user_id=u then
    return jsonb_build_object(
      'valid',false,'reason','self','code',normalized,
      'discount_percent',0,'subtotal_amount',subtotal,'discount_amount',0,'final_amount',subtotal
    );
  end if;

  if exists(select 1 from public.wis_referral_redemptions where referred_user_id=u) then
    return jsonb_build_object(
      'valid',false,'reason','already_redeemed','code',normalized,
      'discount_percent',0,'subtotal_amount',subtotal,'discount_amount',0,'final_amount',subtotal
    );
  end if;

  discount_amount:=least(subtotal,round(subtotal*referral.discount_percent/100.0)::int);
  return jsonb_build_object(
    'valid',true,'reason','valid','code',normalized,
    'discount_percent',referral.discount_percent,
    'subtotal_amount',subtotal,
    'discount_amount',discount_amount,
    'final_amount',subtotal-discount_amount
  );
end;
$$;

-- Same booking rules as normal redemption, with an optional preferred credit lot.
-- Referral checkout passes the newly-issued lot so the free ticket is the one consumed.
create or replace function wis_private.redeem_with_credit(
  p_event uuid,
  p_terms_accepted boolean,
  p_preferred_credit uuid
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  e public.wis_events;
  credit uuid;
  booking uuid;
  profile_data jsonb;
  verification_status text;
  member_gender text;
  years int;
  same_gender_bookings int;
begin
  if u is null then raise exception 'Sign in required';end if;
  if coalesce(p_terms_accepted,false) is not true then
    raise exception 'Confirm the cancellation guidelines and terms before enrolling';
  end if;

  select * into e
  from public.wis_events
  where id=p_event
  for update;

  select id into booking
  from public.wis_bookings
  where event_id=p_event and user_id=u;

  if booking is not null then return booking;end if;

  if e.id is null or e.status<>'live' or e.starts_at<=now() or e.seats_remaining<1 then
    raise exception 'No place available';
  end if;

  if now()>=e.starts_at-make_interval(mins=>e.lockdown_minutes) then
    raise exception 'Event registration is locked';
  end if;

  select profile into profile_data
  from public.wis_profiles
  where user_id=u;

  if profile_data is null
    or coalesce(profile_data->>'full_name','')=''
    or coalesce(profile_data->>'birth_date','')=''
    or coalesce(profile_data->>'gender','') not in ('male','female')
    or coalesce(profile_data->>'nationality','')=''
    or coalesce(profile_data->>'job_title','')=''
    or coalesce(profile_data->>'workplace','')=''
    or coalesce((profile_data->>'height_cm')::int,0) not between 100 and 250
    or coalesce(profile_data->>'phone','')!~'^010-[0-9]{4}-[0-9]{4}$'
    or coalesce((profile_data->>'contact_consent')::boolean,false)=false
    or coalesce(jsonb_array_length(profile_data->'photos'),0) not between 1 and 3
    or coalesce(jsonb_array_length(profile_data->'interests'),0) not between 3 and 10 then
    raise exception 'Complete all required profile fields before enrolling';
  end if;

  select status into verification_status
  from public.wis_verifications
  where user_id=u;

  if coalesce(verification_status,'')<>'Verified' then
    raise exception 'Your profile must be approved before enrolling';
  end if;

  years=extract(year from age(current_date,(profile_data->>'birth_date')::date));
  if years not between e.age_min and e.age_max then
    raise exception 'Your age is outside this event range';
  end if;

  member_gender=profile_data->>'gender';

  if e.theme='1:1 Speed Meetup' then
    select count(*) into same_gender_bookings
    from public.wis_bookings b
    join public.wis_profiles p on p.user_id=b.user_id
    where b.event_id=e.id
      and p.profile->>'gender'=member_gender;

    if same_gender_bookings>=e.capacity/2 then
      raise exception 'The % seats for this event are currently full',
        case member_gender when 'female' then 'women''s' else 'men''s' end;
    end if;
  end if;

  select id into credit
  from public.wis_credit_lots
  where user_id=u
    and remaining>0
    and expires_at>now()
  order by case when id=p_preferred_credit then 0 else 1 end,expires_at
  for update
  limit 1;

  if credit is null then
    raise exception 'No valid ticket available';
  end if;

  update public.wis_credit_lots
  set remaining=remaining-1
  where id=credit;

  insert into public.wis_bookings(event_id,user_id,credit_lot_id,terms_accepted_at)
  values(p_event,u,credit,now())
  returning id into booking;

  return booking;
end;
$$;

create or replace function wis_private.redeem(p_event uuid,p_terms_accepted boolean)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
begin
  return wis_private.redeem_with_credit(p_event,p_terms_accepted,null);
end;
$$;

create or replace function wis_private.redeem_referral(
  p_event uuid,
  p_quantity int,
  p_code text,
  p_terms_accepted boolean
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  normalized text:=upper(btrim(coalesce(p_code,'')));
  quote jsonb;
  reason text;
  referrer uuid;
  credit uuid;
  booking uuid;
  credits_remaining int;
begin
  if u is null then raise exception 'Sign in required'; end if;
  if coalesce(p_terms_accepted,false) is not true then
    raise exception 'Confirm the cancellation guidelines and terms before enrolling';
  end if;
  if exists(select 1 from public.wis_bookings where event_id=p_event and user_id=u) then
    raise exception 'Seat already confirmed';
  end if;

  quote:=wis_private.referral_quote(normalized,p_quantity);
  if coalesce((quote->>'valid')::boolean,false) is not true then
    reason:=coalesce(quote->>'reason','invalid');
    raise exception '%',case reason
      when 'self' then 'You cannot use your own referral code'
      when 'already_redeemed' then 'A referral code has already been used on this account'
      when 'profile_required' then 'Complete your profile before using a referral code'
      else 'Invalid or inactive referral code'
    end;
  end if;

  if coalesce((quote->>'final_amount')::int,-1)<>0 then
    raise exception 'Referral code does not fully cover this purchase';
  end if;

  select referrer_user_id into referrer
  from public.wis_referral_codes
  where code=normalized and active
  for share;

  insert into public.wis_credit_lots(
    user_id,quantity,remaining,purchased_at,expires_at,payment_reference
  ) values(
    u,p_quantity,p_quantity,now(),now()+interval '90 days',
    'referral:'||normalized||':'||u::text
  )
  returning id into credit;

  insert into public.wis_referral_redemptions(
    referral_code,referrer_user_id,referred_user_id,event_id,credit_lot_id,quantity,
    subtotal_amount,discount_percent,discount_amount,final_amount
  ) values(
    normalized,referrer,u,p_event,credit,p_quantity,
    (quote->>'subtotal_amount')::int,(quote->>'discount_percent')::smallint,
    (quote->>'discount_amount')::int,(quote->>'final_amount')::int
  );

  booking:=wis_private.redeem_with_credit(p_event,p_terms_accepted,credit);
  select remaining into credits_remaining from public.wis_credit_lots where id=credit;

  return jsonb_build_object(
    'booking_id',booking,
    'credit_lot_id',credit,
    'credits_remaining',credits_remaining,
    'referral_code',normalized,
    'discount_percent',(quote->>'discount_percent')::int,
    'final_amount',0
  );
end;
$$;

create or replace function public.wis_get_my_referral_code()
returns text
language sql
security invoker
set search_path=''
as $$select wis_private.get_my_referral_code();$$;

create or replace function public.wis_get_or_create_referral_code()
returns text
language sql
security invoker
set search_path=''
as $$select wis_private.get_or_create_referral_code();$$;

create or replace function public.wis_referral_quote(p_code text,p_quantity int)
returns jsonb
language sql
security invoker
set search_path=''
as $$select wis_private.referral_quote(p_code,p_quantity);$$;

create or replace function public.wis_redeem_referral(
  p_event uuid,
  p_quantity int,
  p_code text,
  p_terms_accepted boolean
)
returns jsonb
language sql
security invoker
set search_path=''
as $$select wis_private.redeem_referral(p_event,p_quantity,p_code,p_terms_accepted);$$;

revoke all on function wis_private.deactivate_referral_code_on_member_delete() from public,anon,authenticated;
revoke all on function wis_private.redeem_with_credit(uuid,boolean,uuid) from public,anon,authenticated;
revoke all on function wis_private.get_my_referral_code(),wis_private.get_or_create_referral_code(),wis_private.referral_quote(text,int),wis_private.redeem_referral(uuid,int,text,boolean) from public,anon,authenticated;
revoke all on function public.wis_get_my_referral_code(),public.wis_get_or_create_referral_code(),public.wis_referral_quote(text,int),public.wis_redeem_referral(uuid,int,text,boolean) from public,anon,authenticated;

grant execute on function wis_private.get_my_referral_code(),wis_private.get_or_create_referral_code(),wis_private.referral_quote(text,int),wis_private.redeem_referral(uuid,int,text,boolean) to authenticated;
grant execute on function public.wis_get_my_referral_code(),public.wis_get_or_create_referral_code(),public.wis_referral_quote(text,int),public.wis_redeem_referral(uuid,int,text,boolean) to authenticated;

commit;
