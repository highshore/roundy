begin;

-- Only the consent-aware enrolment RPC remains callable by members.
revoke all on function wis_private.redeem(uuid),public.wis_redeem(uuid) from authenticated;
grant execute on function wis_private.redeem(uuid,boolean),public.wis_redeem(uuid,boolean) to authenticated;

commit;
