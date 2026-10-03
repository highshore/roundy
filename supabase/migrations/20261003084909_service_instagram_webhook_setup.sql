begin;

create or replace function public.instagram_webhook_setup_service()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare c roundy_private.instagram_webhook_config;
begin
  select * into c from roundy_private.instagram_webhook_config where singleton;
  return jsonb_build_object(
    'callback_key',c.callback_key,
    'verify_token',c.verify_token,
    'verified_at',c.verified_at,
    'last_received_at',c.last_received_at
  );
end;
$$;
revoke all on function public.instagram_webhook_setup_service() from public,anon,authenticated;
grant execute on function public.instagram_webhook_setup_service() to service_role;

commit;
