begin;
alter table public.reports add column kind text not null default 'report' check(kind in ('report','feedback'));
alter table public.reports add column status text not null default 'new' check(status in ('new','reviewing','resolved','dismissed'));
grant insert(kind) on public.reports to authenticated;
create policy admin_read_reports on public.reports for select to authenticated using ((select public.is_admin()));
create table public.report_reviews (
 report_id uuid primary key references public.reports(id),
 notes text not null default '' check(length(notes)<=10000),
 updated_at timestamptz not null default now(),
 updated_by uuid not null
);
alter table public.report_reviews enable row level security;
revoke all on public.report_reviews from anon,authenticated;
grant select on public.report_reviews to authenticated;
create policy admin_read_report_reviews on public.report_reviews for select to authenticated using ((select public.is_admin()));
create index reports_inbox_idx on public.reports(status,created_at desc);
create function roundy_private.review_report(p_report uuid,p_status text,p_notes text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 if p_status is null or p_status not in ('new','reviewing','resolved','dismissed') or p_notes is null or length(p_notes)>10000 then raise exception 'Invalid review'; end if;
 update public.reports set status=p_status where id=p_report;
 if not found then raise exception 'Report not found'; end if;
 insert into public.report_reviews(report_id,notes,updated_by) values(p_report,p_notes,auth.uid())
 on conflict(report_id) do update set notes=excluded.notes,updated_by=excluded.updated_by,updated_at=now();
end;$$;
create function public.admin_review_report(p_report uuid,p_status text,p_notes text) returns void language sql security invoker set search_path='' as $$ select roundy_private.review_report(p_report,p_status,p_notes) $$;
revoke all on function roundy_private.review_report(uuid,text,text),public.admin_review_report(uuid,text,text) from public,anon;
grant execute on function roundy_private.review_report(uuid,text,text),public.admin_review_report(uuid,text,text) to authenticated;
commit;
