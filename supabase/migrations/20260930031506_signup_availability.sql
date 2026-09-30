-- Only the rate-limited Edge Function may inspect Auth emails. No account data is returned.
create or replace function public.check_signup_availability(p_key text, p_username text default null, p_email text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_username text := lower(trim(p_username));
  v_email text := lower(trim(p_email));
  v_result jsonb := '{}'::jsonb;
begin
  if (v_username is null and v_email is null)
    or (v_username is not null and v_username !~ '^[a-z0-9_][a-z0-9_-]{2,29}$')
    or (v_email is not null and (length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')) then
    return jsonb_build_object('code','invalid_input');
  end if;
  if not public.consume_username_login_attempt(p_key,30) then
    return jsonb_build_object('code','over_request_rate_limit');
  end if;
  if v_username is not null then
    v_result := v_result || jsonb_build_object('username_available',not exists(select 1 from public.account_usernames where username=v_username));
  end if;
  if v_email is not null then
    v_result := v_result || jsonb_build_object('email_available',not exists(select 1 from auth.users where lower(email)=v_email));
  end if;
  return v_result;
end;
$$;
-- SECURITY DEFINER is necessary for the internal Auth lookup; never grant to browser roles.
revoke all on function public.check_signup_availability(text,text,text) from public,anon,authenticated;
grant execute on function public.check_signup_availability(text,text,text) to service_role;
