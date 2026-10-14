-- Discovery only. The dispatcher checks KST hour and whether autopilot is enabled.
begin;
select cron.schedule('roundy-editorial-autopilot-dispatch','20 * * * *',
 'select public.dispatch_marketing_editorial_autopilot()');
commit;
