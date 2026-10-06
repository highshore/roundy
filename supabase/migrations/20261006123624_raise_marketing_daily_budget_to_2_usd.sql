alter table public.marketing_ai_control
  drop constraint if exists marketing_ai_control_daily_budget_usd_check;

alter table public.marketing_ai_control
  alter column daily_budget_usd set default 2.00;

alter table public.marketing_ai_control
  add constraint marketing_ai_control_daily_budget_usd_check
  check (daily_budget_usd >= 0 and daily_budget_usd <= 2.00);

update public.marketing_ai_control
set daily_budget_usd = 2.00,
    temporary_daily_budget_usd = null,
    temporary_daily_budget_expires_at = null,
    updated_at = now()
where singleton = true;
