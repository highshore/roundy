import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create role anon;create role service_role;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid,name text,bucket_id text);create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`);
await db.exec('grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;alter table storage.objects enable row level security;');
// Reproduce hosted default privileges, not just a restrictive local database.
await db.exec('alter default privileges in schema public grant all on tables to anon, authenticated');
// pg_cron and pg_net are hosted infrastructure; all application DDL still runs here.
for(const f of (await readdir('supabase/migrations')).sort()){
 let sql=await readFile('supabase/migrations/'+f,'utf8');
 if(f==='20260924111615_roundy_reminder_schedule.sql') sql=sql.replace(/create extension[^;]+;/g,'').replace(/select cron.schedule[^;]+;/g,'');
 if(f.endsWith('_marketing_scheduler.sql')) continue;
 await db.exec(sql);
}
const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
await db.exec(`insert into auth.users select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,4)n;insert into user_roles(user_id,role) values('${uid(4)}','admin');`);
for(let n=1;n<=4;n++)await db.query('insert into profiles(user_id,profile) values($1,$2)',[uid(n),{full_name:'Test member',birth_date:'1997-05-10',gender:n===3?'male':'female',nationality:n===2?'JP':'KR',height_cm:170,job_title:'Designer',workplace:'Studio',public_job:'Designer',public_workplace:'Studio',phone:'010-1234-5678',contact_consent:true,photos:['private/photo'],interests:['Coffee','Art','Travel']}]);
await db.exec(`insert into verifications(user_id,instagram,status) select id,'test','Verified' from auth.users;insert into credit_lots(user_id,quantity,remaining,payment_reference) select id,3,3,id::text from auth.users;`);
async function as(n,sql,args=[]){await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(n)]);try{return await db.query(sql,args);}finally{await db.exec('reset role');}}
async function denied(n,sql,pattern){await assert.rejects(()=>as(n,sql),pattern);}
const e=uid(100);
await as(4,`insert into events(id,title,starts_at,venue,address,capacity,status,age_min,age_max,lockdown_minutes) values('${e}','Late applications',now()+interval '30 minutes','Venue','Address',12,'live',18,100,60)`);
assert.equal((await as(4,'select theme from events where id=$1',[e])).rows[0].theme,'1:1 Speed Mingle');
assert.ok((await as(1,'select apply($1) id',[e])).rows[0].id,'Apply during lockdown');
const booking=(await as(1,'select redeem($1,true) id',[e])).rows[0].id;
assert.ok(booking,'Redeem during lockdown');
assert.equal((await as(1,'select redeem($1,true) id',[e])).rows[0].id,booking,'Retry is idempotent');
await denied(1,`select cancel_booking('${e}')`,/cancellation is locked/);
await as(4,`update events set starts_at=now()+interval '3 hours' where id='${e}'`);
assert.equal((await as(1,'select cancel_booking($1) ok',[e])).rows[0].ok,true,'Cancel before cutoff');
assert.equal((await db.query('select remaining from credit_lots where user_id=$1',[uid(1)])).rows[0].remaining,3,'Cancellation refunds ticket');
await as(4,`update events set nationality_requirements='{"female":{"mode":"non_korean","countries":[]},"male":{"mode":"korean","countries":[]}}' where id='${e}'`);
await denied(1,`select apply('${e}')`,/nationality/);
await denied(1,`select redeem('${e}',true)`,/nationality/);
assert.equal((await db.query('select remaining from credit_lots where user_id=$1',[uid(1)])).rows[0].remaining,3,'Rejected nationality does not consume ticket');
assert.ok((await as(2,'select apply($1) id',[e])).rows[0].id);
assert.ok((await as(3,'select apply($1) id',[e])).rows[0].id);
await as(4,`update events set nationality_requirements='{"female":{"mode":"selected","countries":["US"]},"male":{"mode":"all","countries":[]}}' where id='${e}'`);
await denied(2,`select redeem('${e}',true)`,/nationality/);
await assert.rejects(()=>as(4,`update events set nationality_requirements='{"female":{"mode":"selected","countries":[]},"male":{"mode":"all","countries":[]}}' where id='${e}'`),/at least one/);
await as(4,`update events set starts_at=now()-interval '1 minute' where id='${e}'`);
await denied(3,`select apply('${e}')`,/not accepting|not available|available|closed/);
console.log('PASS: apply/redeem during lockdown, cancellation cutoff/refund, nationality enforcement by gender, no ticket loss, invalid requirements, event default category');
await denied(1,"insert into marketing_templates(channel,name) values('instagram','Unauthorized')",/row-level/);
const t=(await as(4,"insert into marketing_templates(channel,name,title,caption) values('koreapas','Test template','Test title','Test copy') returning id")).rows[0].id;
assert.equal((await as(1,'select * from marketing_templates')).rows.length,0);
await denied(1,`select enqueue_marketing('${t}','${uid(200)}')`,/Administrator/);
const run=(await as(4,'select enqueue_marketing($1,$2) id',[t,uid(200)])).rows[0].id;
assert.equal((await as(4,'select enqueue_marketing($1,$2) id',[t,uid(200)])).rows[0].id,run);
await as(4,'update marketing_templates set caption=$1 where id=$2',['Edited copy',t]);
assert.equal((await as(4,'select snapshot from marketing_runs where id=$1',[run])).rows[0].snapshot.caption,'Test copy','Queued posts keep immutable snapshot');
await denied(4,'select claim_marketing()',/permission denied/);
await db.exec('set role service_role');let claimed;try{claimed=(await db.query('select claim_marketing() jobs')).rows[0].jobs;assert.equal(claimed.length,1);assert.equal((await db.query('select claim_marketing() jobs')).rows[0].jobs.length,0);}finally{await db.exec('reset role');}
await db.query("update marketing_runs set status='sent',finished_at=now() where id=$1",[run]);
await as(4,'select enqueue_marketing($1,$2)',[t,uid(201)]);
await db.exec('set role service_role');try{assert.equal((await db.query('select claim_marketing() jobs')).rows[0].jobs.length,0);}finally{await db.exec('reset role');}
assert.equal((await db.query("select count(*)::int n from marketing_runs where status='skipped'")).rows[0].n,1,'24-hour Koreapas interval enforced');
await as(4,`update marketing_templates set enabled=true,days='{}' where id='${t}'`);
assert.equal((await as(4,'select enabled from marketing_templates where id=$1',[t])).rows[0].enabled,false,'No selected days pauses schedule');
await denied(4,"select marketing_scheduler_authorized('guess')",/permission denied/);
console.log('PASS: marketing admin-only RLS, queue idempotency, snapshots, service-only claims, no duplicate claims, 24-hour interval, paused schedules, private scheduler authentication');

// Editing a duplicate must keep identity and content separate from its source.
const original=uid(301),duplicate=uid(302);
await as(4,`insert into events(id,title,description,starts_at,venue,address,capacity,status,age_min,age_max,lockdown_minutes,images)
 values('${original}','Original','Original description',now()+interval '2 days','Original venue','Address',10,'live',18,100,60,array['/images/yeouido.webp'])`);
await as(4,`insert into events(id,title,description,starts_at,venue,address,capacity,status,age_min,age_max,lockdown_minutes,images)
 select '${duplicate}','Edited duplicate','New description',starts_at,'New venue',address,capacity,status,age_min,age_max,lockdown_minutes,array['/images/anam-korea-university.webp'] from events where id='${original}'`);
const before=(await as(4,'select * from events where id=$1',[duplicate])).rows[0];
await as(4,"update events set title=$1,description=$2,starts_at=starts_at+interval '1 day' where id=$3",['Saved duplicate','Latest description',duplicate]);
const after=(await as(1,'select * from events where id=$1',[duplicate])).rows[0];
assert.equal(after.title,'Saved duplicate');assert.equal(after.description,'Latest description');assert.equal(after.image,'/images/anam-korea-university.webp');assert.ok(after.previous_slugs.includes(before.slug));
assert.equal((await as(1,'select description from events where id=$1',[original])).rows[0].description,'Original description');
const creditsBefore=(await as(1,'select remaining from credit_lots where user_id=$1',[uid(1)])).rows[0].remaining;
await as(1,'select redeem($1,true)',[duplicate]);
await denied(1,`select admin_delete_event('${duplicate}')`,/Administrator/);
assert.equal((await as(4,'select admin_delete_event($1) result',[duplicate])).rows[0].result.tickets_returned,1);
assert.equal((await as(4,'select admin_delete_event($1) result',[duplicate])).rows[0].result.tickets_returned,0,'Repeated delete does not return ticket twice');
assert.equal((await as(1,'select remaining from credit_lots where user_id=$1',[uid(1)])).rows[0].remaining,creditsBefore);
assert.equal((await db.query('select count(*)::int n from bookings where event_id=$1',[duplicate])).rows[0].n,1,'Historical booking retained');
assert.equal((await as(1,'select * from events where id=$1',[duplicate])).rows.length,0,'Removed event hidden from members');
await denied(1,`select cancel_booking('${duplicate}')`,/unavailable/);
await denied(2,`select redeem('${duplicate}',true)`,/available|accepting|closed/);
await db.exec('set role anon');try{assert.equal((await db.query('select * from events where id=$1',[duplicate])).rows.length,0);await assert.rejects(()=>db.query('select admin_delete_event($1)',[original]),/permission denied/);}finally{await db.exec('reset role');}
await as(1,'select redeem($1,true)',[original]);
await as(4,"update events set starts_at=now()-interval '3 hours' where id=$1",[original]);
assert.equal((await as(4,'select admin_delete_event($1) result',[original])).rows[0].result.tickets_returned,0,'Past attendance is not refunded');
assert.equal((await db.query('select count(*)::int n from bookings where event_id=$1',[original])).rows[0].n,1);
console.log('PASS duplicate edit identity, description/image persistence, date aliases, deletion with bookings, preserved history, one-time future ticket return, no past refund, anonymous/member denial');
const report=(await as(1,"insert into reports(user_id,context,reason,kind) values($1,'General feedback','Please add more weekend events','feedback') returning id",[uid(1)])).rows[0].id;
assert.equal((await as(2,'select * from reports where id=$1',[report])).rows.length,0,'Other members cannot read reports');
assert.equal((await as(4,'select * from reports where id=$1',[report])).rows.length,1,'Admins can read reports');
await denied(1,`select admin_review_report('${report}','resolved','private')`,/Administrator/);
await as(4,'select admin_review_report($1,$2,$3)',[report,'reviewing','Private investigation']);
assert.equal((await as(1,'select * from report_reviews')).rows.length,0,'Reporter cannot read staff notes');
assert.equal((await as(4,'select notes from report_reviews where report_id=$1',[report])).rows[0].notes,'Private investigation');
assert.equal((await as(1,'select status from reports where id=$1',[report])).rows[0].status,'reviewing');
await denied(1,`update reports set status='resolved' where id='${report}'`,/permission/);
await denied(4,`select admin_review_report('${report}','invalid','')`,/Invalid review/);
console.log('PASS reports: own-only submissions, admin inbox, private staff notes, status updates, non-admin and invalid-state denial');
await db.close();
