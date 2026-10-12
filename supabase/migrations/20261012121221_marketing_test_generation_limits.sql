begin;
select pg_advisory_xact_lock(70361005);
alter table public.marketing_ai_control
 add column if not exists daily_call_limit integer not null default 10 check (daily_call_limit between 1 and 50),
 add column if not exists monthly_call_limit integer not null default 180 check (monthly_call_limit between 1 and 1500),
 add column if not exists render_daily_limit integer not null default 10 check (render_daily_limit between 1 and 50);
alter table public.marketing_ai_control drop constraint marketing_ai_control_daily_budget_usd_check;
alter table public.marketing_ai_control add constraint marketing_ai_control_daily_budget_usd_check check (daily_budget_usd between 0 and 15.00);
alter table public.marketing_ai_control drop constraint marketing_ai_control_monthly_budget_usd_check;
alter table public.marketing_ai_control add constraint marketing_ai_control_monthly_budget_usd_check check (monthly_budget_usd between 0 and 300.00);
do $limits$
declare definition text;
begin
 definition:=pg_get_functiondef('public.reserve_marketing_generation(text,text,uuid,integer,text,uuid,boolean)'::regprocedure);
 if position('daily_count>=10 or monthly_count>=180' in definition)>0
  and position('operation=''render'')>=10' in definition)>0 then
  definition:=replace(definition,'daily_count>=10 or monthly_count>=180','daily_count>=c.daily_call_limit or monthly_count>=c.monthly_call_limit');
  definition:=replace(definition,'operation=''render'')>=10','operation=''render'')>=c.render_daily_limit');
  execute definition;
 elsif position('daily_count>=c.daily_call_limit or monthly_count>=c.monthly_call_limit' in definition)=0
  or position('operation=''render'')>=c.render_daily_limit' in definition)=0 then
  raise exception 'GENERATION_LIMIT_FUNCTION_CHANGED_REVIEW_REQUIRED';
 end if;
end;
$limits$;
-- Preserve actual row settings on subsequent replays, including a later end to testing.
-- Production test values are intentionally not hardcoded in schema replay.
commit;
