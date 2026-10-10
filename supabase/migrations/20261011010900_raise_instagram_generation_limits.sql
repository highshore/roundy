-- Increase Roundy Instagram generation budget while retaining application-side controls.
-- These are conservative reservations, not OpenAI invoice or provider billing limits.
alter table public.marketing_ai_control
  drop constraint if exists marketing_ai_control_daily_budget_usd_check,
  drop constraint if exists marketing_ai_control_monthly_budget_usd_check;

alter table public.marketing_ai_control
  alter column daily_budget_usd set default 5.00,
  alter column monthly_budget_usd set default 20.00;

alter table public.marketing_ai_control
  add constraint marketing_ai_control_daily_budget_usd_check
    check (daily_budget_usd >= 0 and daily_budget_usd <= 5.00),
  add constraint marketing_ai_control_monthly_budget_usd_check
    check (monthly_budget_usd >= 0 and monthly_budget_usd <= 20.00);

update public.marketing_ai_control
set daily_budget_usd = 5.00,
    monthly_budget_usd = 20.00,
    updated_at = now()
where singleton = true;

-- Preserve the current function body, permissions, and safety checks (advisory
-- lock, cooldown, duplicate detection, fail-closed billing, admin pause, etc.).
-- Expand only the paid job count caps to make the larger budget usable.
do $$
declare
  previous_clause constant text := 'if cost>0 and (daily_count>=5 or monthly_count>=90) then';
  replacement_clause constant text := 'if cost>0 and (daily_count>=10 or monthly_count>=180) then';
  definition text;
begin
  select pg_get_functiondef('public.reserve_marketing_generation(text,text,uuid,integer,text,uuid,boolean)'::regprocedure)
    into definition;
  if position(previous_clause in definition) > 0 then
    execute replace(definition, previous_clause, replacement_clause);
  elsif position(replacement_clause in definition) = 0 then
    raise exception 'Unexpected marketing generation safety function: cannot safely update job caps';
  end if;
end;
$$;
