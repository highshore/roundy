create table public.account_legal_consents (
 user_id uuid not null references auth.users(id) on delete cascade,
 version text not null check (version = '2026-09-28'),
 terms boolean not null check (terms),
 privacy boolean not null check (privacy),
 accepted_at timestamptz not null default now(),
 primary key (user_id, version)
);
alter table public.account_legal_consents enable row level security;
revoke all on public.account_legal_consents from public, anon, authenticated;
grant select on public.account_legal_consents to authenticated;
grant insert (user_id, version, terms, privacy) on public.account_legal_consents to authenticated;
grant all on public.account_legal_consents to service_role;
create policy "Read own consent" on public.account_legal_consents for select to authenticated
 using ((select auth.uid()) = user_id);
create policy "Record own consent" on public.account_legal_consents for insert to authenticated
 with check ((select auth.uid()) = user_id and coalesce((select auth.jwt())->>'is_anonymous','false') = 'false');
