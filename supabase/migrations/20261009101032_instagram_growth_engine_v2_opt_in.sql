alter table public.marketing_automation_settings
  add column if not exists growth_mode_enabled boolean not null default false;

comment on column public.marketing_automation_settings.growth_mode_enabled is
  'Opt-in Instagram editorial growth planner. Existing daily content and publication approvals remain unchanged until enabled.';
