-- A regular PG review account created for the review walkthrough; no admin access.
insert into public.account_usernames(user_id,username)
select id,'pg-review' from auth.users where email='pg-review-20260928@roundy.team'
on conflict(user_id) do nothing;
