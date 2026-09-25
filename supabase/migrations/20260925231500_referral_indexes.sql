begin;

create index if not exists wis_referral_redemptions_code_idx
  on public.wis_referral_redemptions(referral_code);

create index if not exists wis_referral_redemptions_referrer_idx
  on public.wis_referral_redemptions(referrer_user_id);

create index if not exists wis_referral_redemptions_event_idx
  on public.wis_referral_redemptions(event_id);

commit;
