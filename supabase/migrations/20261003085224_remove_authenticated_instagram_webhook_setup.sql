begin;

revoke all on function public.admin_instagram_webhook_setup() from public,anon,authenticated,service_role;
drop function public.admin_instagram_webhook_setup();

commit;
