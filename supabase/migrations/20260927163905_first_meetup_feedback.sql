begin;
alter table public.reports add column survey jsonb, add column feedback_event_id uuid references public.events(id);
alter table public.reports add constraint feedback_survey_kind check (survey is null or (kind='feedback' and feedback_event_id is not null));
create unique index reports_first_meetup_feedback_unique on public.reports(user_id) where survey is not null;

-- Private functions validate identity and attendance before bypassing table RLS.
create function roundy_private.first_meetup_feedback_context() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); e public.events; submitted boolean;
begin
 if u is null then raise exception 'Sign in required'; end if;
 select exists(select 1 from public.reports where user_id=u and survey is not null) into submitted;
 select ev.* into e from public.bookings b join public.events ev on ev.id=b.event_id
 where b.user_id=u and b.checked_in_at is not null order by ev.starts_at,ev.id limit 1;
 return jsonb_build_object('submitted',submitted,'eligible',e.id is not null and e.ends_at<=now() and not submitted,
 'event',case when e.id is null then null else jsonb_build_object('id',e.id,'title',e.title,'theme',e.theme,'starts_at',e.starts_at,'ends_at',e.ends_at) end);
end;$$;
create function public.first_meetup_feedback_context() returns jsonb language sql stable security invoker set search_path='' as $$select roundy_private.first_meetup_feedback_context()$$;

create function roundy_private.submit_first_meetup_feedback(p_event uuid,p_survey jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); ctx jsonb; k text; result uuid;
begin
 if u is null then raise exception 'Sign in required'; end if;
 -- Serialize retries from multiple tabs; never replace an existing response.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,0));
 select id into result from public.reports where user_id=u and survey is not null;
 if result is not null then return result; end if;
 ctx:=roundy_private.first_meetup_feedback_context();
 if not (ctx->>'eligible')::boolean or p_event is distinct from (ctx->'event'->>'id')::uuid then raise exception 'First completed attendance required'; end if;
 if p_survey is null or jsonb_typeof(p_survey)<>'object' then raise exception 'Invalid survey'; end if;
 foreach k in array array['overall','connection','return','recommend'] loop
  if not (p_survey ? k) or jsonb_typeof(p_survey->k)<>'number' or p_survey->>k not in ('1','2','3','4','5') then raise exception 'Ratings must be integers from 1 to 5'; end if;
 end loop;
 foreach k in array array['difficulty','improvement'] loop
  if not (p_survey ? k) or jsonb_typeof(p_survey->k)<>'string' or length(p_survey->>k)>1500 then raise exception 'Written answers must be at most 1500 characters'; end if;
 end loop;
 if p_survey->>'locale' is null or p_survey->>'locale' not in ('en','ko') then raise exception 'Invalid language'; end if;
 -- Whitelist fields so arbitrary metadata cannot be stored via the RPC.
 p_survey:=jsonb_build_object('version',1,'overall',(p_survey->>'overall')::int,'connection',(p_survey->>'connection')::int,'return',(p_survey->>'return')::int,'recommend',(p_survey->>'recommend')::int,'difficulty',trim(p_survey->>'difficulty'),'improvement',trim(p_survey->>'improvement'),'locale',p_survey->>'locale');
 insert into public.reports(user_id,context,reason,kind,feedback_event_id,survey)
 values(u,'First meetup / '||(ctx->'event'->>'title'),'First-meetup survey','feedback',p_event,p_survey) returning id into result;
 return result;
end;$$;
create function public.submit_first_meetup_feedback(p_event uuid,p_survey jsonb) returns uuid language sql security invoker set search_path='' as $$select roundy_private.submit_first_meetup_feedback(p_event,p_survey)$$;
revoke all on function roundy_private.first_meetup_feedback_context(),public.first_meetup_feedback_context(),roundy_private.submit_first_meetup_feedback(uuid,jsonb),public.submit_first_meetup_feedback(uuid,jsonb) from public,anon;
grant execute on function roundy_private.first_meetup_feedback_context(),public.first_meetup_feedback_context(),roundy_private.submit_first_meetup_feedback(uuid,jsonb),public.submit_first_meetup_feedback(uuid,jsonb) to authenticated;
-- No direct client INSERT grants for survey or event linkage. Existing report RLS still applies.
commit;
