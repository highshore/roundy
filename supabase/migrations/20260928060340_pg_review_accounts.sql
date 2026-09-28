-- Explicitly labeled, non-admin PG reviewer fixtures. No bookings or tickets are created.
insert into public.profiles(user_id,profile)
select u.id,jsonb_build_object('full_name',case when a.username='test' then '[TEST] PG Reviewer 1' else '[TEST] PG Reviewer 2' end,'birth_date','1996-01-01','gender',case when a.username='test' then 'male' else 'female' end,'nationality','KR','height_cm',170,'mbti','INTJ','job_title','Test reviewer','workplace','Roundy test account','public_job','Test reviewer','public_workplace','Roundy test account','phone','010-0000-0000','contact_consent',true,'interests',jsonb_build_array('Coffee','Art','Travel'),'photos',jsonb_build_array('/icon.svg'))
from auth.users u join public.account_usernames a on a.user_id=u.id
where (a.username='test' and u.email='roundy-review-test@roundy.team') or (a.username='test2' and u.email='roundy-review-test2@roundy.team')
on conflict(user_id) do nothing;
insert into public.verifications(user_id,status,method,document_path)
select u.id,'Verified','document',o.name from auth.users u join public.account_usernames a on a.user_id=u.id
join lateral (select name from storage.objects where bucket_id='wis-verification-documents' and split_part(name,'/',1)=u.id::text order by created_at desc limit 1) o on true
where (a.username='test' and u.email='roundy-review-test@roundy.team') or (a.username='test2' and u.email='roundy-review-test2@roundy.team')
on conflict(user_id) do nothing;