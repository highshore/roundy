-- Additive, admin-only source-to-carousel studio. No scheduler, publisher, Reel or legacy data changes.
begin;

create table public.marketing_editorial_sources (
 id uuid primary key default gen_random_uuid(),
 pillar text not null check (pillar in ('dating_opinions','seoul_guides')),
 source_url text not null unique check (length(source_url) between 12 and 1800),
 title text not null check (length(title) between 8 and 160),
 creator text not null default '' check (length(creator)<=90),
 summary text not null check (length(summary) between 20 and 1300),
 source_published_at date,
 rights_status text not null default 'inspiration_only' check (rights_status in ('inspiration_only','licensed','owned','restricted')),
 status text not null default 'saved' check (status in ('saved','excluded')),
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index marketing_editorial_sources_pillar on public.marketing_editorial_sources(pillar,created_at desc);

create table public.marketing_editorial_ideas (
 id uuid primary key default gen_random_uuid(),
 source_id uuid not null references public.marketing_editorial_sources(id) on delete restrict,
 angle text not null check (length(angle)<=200),
 hooks jsonb not null default '[]'::jsonb check (jsonb_typeof(hooks)='array'),
 selected_hook text not null default '' check (length(selected_hook)<=110),
 storyboard jsonb not null default '[]'::jsonb check (jsonb_typeof(storyboard)='array'),
 status text not null default 'draft' check (status in ('draft','ready','handed_off')),
 content_id uuid unique references public.marketing_contents(id) on delete set null,
 revision integer not null default 1 check (revision>=1),
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(source_id)
);
create index marketing_editorial_ideas_recent on public.marketing_editorial_ideas(created_at desc);

-- Suggestion requests are deliberate, budgeted, idempotent and never replayed after an uncertain API result.
create table public.marketing_editorial_suggestion_runs (
 id uuid primary key default gen_random_uuid(),
 idea_id uuid not null references public.marketing_editorial_ideas(id) on delete restrict,
 revision integer not null,
 request_key text not null unique check (length(request_key) between 8 and 120),
 fingerprint text not null check (length(fingerprint)=64),
 status text not null default 'reserved' check (status in ('reserved','running','completed','failed','uncertain')),
 reserved_usd numeric(8,4) not null default 0.02,
 result jsonb,
 error_code text,
 requested_at timestamptz not null default now(),
 completed_at timestamptz
);
create index marketing_editorial_suggestion_day on public.marketing_editorial_suggestion_runs(requested_at desc);

alter table public.marketing_editorial_sources enable row level security;
alter table public.marketing_editorial_ideas enable row level security;
alter table public.marketing_editorial_suggestion_runs enable row level security;
revoke all on public.marketing_editorial_sources,public.marketing_editorial_ideas,public.marketing_editorial_suggestion_runs from public,anon,authenticated;
grant select on public.marketing_editorial_sources,public.marketing_editorial_ideas,public.marketing_editorial_suggestion_runs to authenticated;
grant all on public.marketing_editorial_sources,public.marketing_editorial_ideas,public.marketing_editorial_suggestion_runs to service_role;
create policy editorial_sources_admin_read on public.marketing_editorial_sources for select to authenticated using ((select public.is_admin()));
create policy editorial_ideas_admin_read on public.marketing_editorial_ideas for select to authenticated using ((select public.is_admin()));
create policy editorial_runs_admin_read on public.marketing_editorial_suggestion_runs for select to authenticated using ((select public.is_admin()));

create function public.reserve_marketing_editorial_suggestion(p_idea uuid,p_revision integer,p_key text,p_fingerprint text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.marketing_ai_control;r public.marketing_editorial_suggestion_runs;i public.marketing_editorial_ideas;
 day_start timestamptz:=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
 month_start timestamptz:=date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
 daily_spend numeric;monthly_spend numeric;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into i from public.marketing_editorial_ideas where id=p_idea for update;
 if not found or i.revision<>p_revision or i.content_id is not null then raise exception 'EDITORIAL_IDEA_CHANGED';end if;
 if p_key is null or length(p_key) not between 8 and 120 or p_fingerprint is null or length(p_fingerprint)<>64 then raise exception 'EDITORIAL_REQUEST_INVALID';end if;
 select * into r from public.marketing_editorial_suggestion_runs where request_key=p_key;
 if found then
  if r.fingerprint<>p_fingerprint or r.idea_id<>p_idea or r.revision<>p_revision then raise exception 'EDITORIAL_REQUEST_CONFLICT';end if;
  return to_jsonb(r);
 end if;
 select * into c from public.marketing_ai_control where singleton for update;
 if not found or not c.enabled or c.blocked_reason is not null then raise exception 'AI_PAUSED';end if;
 if exists(select 1 from public.marketing_editorial_suggestion_runs where idea_id=p_idea and revision=p_revision
  and status in ('reserved','running','uncertain')) then raise exception 'EDITORIAL_REQUEST_RECONCILIATION_REQUIRED';end if;
 if (select count(*) from public.marketing_editorial_suggestion_runs where requested_at>=day_start)>=4 then raise exception 'EDITORIAL_DAILY_LIMIT';end if;
 select coalesce((select sum(reserved_usd) from public.marketing_generation_jobs where created_at>=day_start),0)
  +coalesce((select sum(reserved_usd) from public.marketing_editorial_suggestion_runs where requested_at>=day_start),0) into daily_spend;
 select coalesce((select sum(reserved_usd) from public.marketing_generation_jobs where created_at>=month_start),0)
  +coalesce((select sum(reserved_usd) from public.marketing_editorial_suggestion_runs where requested_at>=month_start),0) into monthly_spend;
 if daily_spend+0.02>c.daily_budget_usd or monthly_spend+0.02>c.monthly_budget_usd then raise exception 'GENERATION_BUDGET_REACHED';end if;
 insert into public.marketing_editorial_suggestion_runs(idea_id,revision,request_key,fingerprint)
 values(p_idea,p_revision,p_key,p_fingerprint) returning * into r;
 return to_jsonb(r);
end;$$;
revoke all on function public.reserve_marketing_editorial_suggestion(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.reserve_marketing_editorial_suggestion(uuid,integer,text,text) to service_role;
commit;
