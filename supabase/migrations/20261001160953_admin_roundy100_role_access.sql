begin;

create or replace function roundy_private.grant_admin_for_verified_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  phone_hash text;
begin
  phone_hash := md5(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'));

  if phone_hash in (
    'a54ad6984f7dc64283001fea5909a2cc',
    '051d9d09e41db79f99d98e11b0442ff3',
    '6ca46e61f6e7f0b2004dfbac2e30b625',
    '4e3161c39552e75befda87cfd33a8b79'
  ) then
    insert into public.user_roles(user_id, role)
    values (new.id, 'admin')
    on conflict (user_id) do update
    set role = excluded.role,
        updated_at = now();
  end if;

  return new;
end;
$$;

revoke all on function roundy_private.grant_admin_for_verified_phone() from public, anon, authenticated;

insert into public.user_roles(user_id, role)
values ('01f361ec-c487-46a7-bf2b-1f701b9f63b4'::uuid, 'admin')
on conflict (user_id) do update
set role = excluded.role,
    updated_at = now();

alter table public.marketing_promo_codes
  add column if not exists required_role text;

alter table public.marketing_promo_codes
  drop constraint if exists marketing_promo_codes_required_role_check;

alter table public.marketing_promo_codes
  add constraint marketing_promo_codes_required_role_check
  check (required_role is null or required_role in ('member','host','admin'));

update public.marketing_promo_codes
set discount_percent = 100,
    active = true,
    max_redemptions = null,
    max_redemptions_per_user = null,
    allowed_user_id = null,
    required_role = 'admin'
where code = 'ROUNDY100';

do $patch_quote$
declare
  ddl text;
  before_ddl text;
begin
  select pg_get_functiondef('roundy_private.event_checkout_quote(uuid,text)'::regprocedure)
    into ddl;
  before_ddl := ddl;

  ddl := replace(
    ddl,
    'if promo.allowed_user_id is not null and promo.allowed_user_id<>u then',
    E'if promo.required_role is not null and not exists(\n          select 1 from public.user_roles ur\n          where ur.user_id=u and ur.role=promo.required_role\n        ) then\n          code_valid:=false;\n          code_reason:=''not_eligible'';\n        elsif promo.allowed_user_id is not null and promo.allowed_user_id<>u then'
  );

  if ddl is null or ddl = before_ddl then
    raise exception 'Could not patch event_checkout_quote promo eligibility';
  end if;

  execute ddl;
end;
$patch_quote$;

do $patch_claim$
declare
  ddl text;
  before_ddl text;
begin
  select pg_get_functiondef('roundy_private.claim_event_payment_order(text,uuid)'::regprocedure)
    into ddl;
  before_ddl := ddl;

  ddl := replace(
    ddl,
    'if promo.allowed_user_id is not null and promo.allowed_user_id<>p_user then',
    E'if promo.required_role is not null and not exists(\n      select 1 from public.user_roles ur\n      where ur.user_id=p_user and ur.role=promo.required_role\n    ) then\n      raise exception ''Promo code is not available for this account'';\n    elsif promo.allowed_user_id is not null and promo.allowed_user_id<>p_user then'
  );

  if ddl is null or ddl = before_ddl then
    raise exception 'Could not patch claim_event_payment_order promo eligibility';
  end if;

  execute ddl;
end;
$patch_claim$;

commit;
