alter table public.account_legal_consents
  drop constraint if exists account_legal_consents_version_check;

alter table public.account_legal_consents
  add constraint account_legal_consents_version_check
  check (version in ('2026-09-28', '2026-09-30'));
