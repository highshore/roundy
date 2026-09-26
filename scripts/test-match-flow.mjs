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
await db.exec(`insert into auth.users select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,4)n;`);
for(let n=1;n<=4;n++)await db.query('insert into profiles(user_id,profile) values($1,$2)',[uid(n),{full_name:'Member '+n,birth_date:'1997-05-10',gender:n===2?'female':'male',nationality:'KR',height_cm:175,job_title:'Private job',workplace:'Private workplace',public_job:'Designer',public_workplace:'Creative company',phone:'010-1234-5678',contact_consent:true,photos:['/api/photos/'+uid(n)+'/photo.webp'],interests:['Coffee','Art','Travel']}]);
const e=uid(100),future=uid(101),match=uid(200),notFinished=uid(201);
await db.query("insert into events(id,title,starts_at,ends_at,venue,address,capacity,status,age_min,age_max) values($1,'Past event',now()-interval '2 days',now()-interval '47 hours','Venue','Address',12,'live',18,100)",[e]);
await db.query("insert into events(id,title,starts_at,ends_at,venue,address,capacity,status,age_min,age_max) values($1,'Future event',now()+interval '2 days',now()+interval '49 hours','Venue','Address',12,'live',18,100)",[future]);
await db.query('insert into encounters(event_id,user_a,user_b,round_number,table_number) values($1,$2,$3,3,5)',[e,uid(1),uid(2)]);
await db.query('insert into matches(id,event_id,user_a,user_b) values($1,$2,$3,$4),($5,$6,$3,$4)',[match,e,uid(1),uid(2),notFinished,future]);
await db.query("insert into storage.objects(id,name,bucket_id) values($1,$2,'wis-profile-photos')",[uid(500),uid(2)+'/photo.webp']);
async function as(n,sql,args=[]){await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?uid(n):'']);try{return await db.query(sql,args);}finally{await db.exec('reset role');}}
const cards=async n=>(await as(n,'select match_cards() cards')).rows[0].cards;
const mine=await cards(1);assert.equal(mine.length,1);assert.equal(mine[0].full_name,'Member 2');assert.equal(mine[0].round_number,3);assert.equal(mine[0].table_number,5);assert.equal(mine[0].photos.length,1);assert.equal(mine[0].nationality,'KR');
for(const field of ['phone','birth_date','job_title','workplace','instagram','linkedin','user_id'])assert.equal(mine[0][field],undefined,'No private '+field+' in initial payload');
assert.equal((await cards(2))[0].full_name,'Member 1');assert.deepEqual(await cards(3),[]);assert.deepEqual((await as(3,'select match_cards($1) cards',[match])).rows[0].cards,[]);
assert.equal((await as(1,'select match_contact($1) contact',[match])).rows[0].contact.phone,'010-1234-5678');
await assert.rejects(()=>as(3,'select match_contact($1)',[match]),/Match unavailable/);
await assert.rejects(()=>as(1,'select match_contact($1)',[notFinished]),/Match unavailable/);
await assert.rejects(()=>as(null,'select match_cards()'),/Sign in required/);
await db.exec('set role anon');try{await assert.rejects(()=>db.query('select public.match_cards()'),/permission denied/);await assert.rejects(()=>db.query('select public.match_contact($1)',[match]),/permission denied/);}finally{await db.exec('reset role');}
assert.equal((await as(1,'select can_view_attendee_photo($1) ok',[uid(2)])).rows[0].ok,true,'Old mutual match photos remain authorized');assert.equal((await as(3,'select can_view_attendee_photo($1) ok',[uid(2)])).rows[0].ok,false);assert.equal((await as(1,'select count(*)::int n from storage.objects')).rows[0].n,1);assert.equal((await as(3,'select count(*)::int n from storage.objects')).rows[0].n,0);
await db.query("insert into event_sessions(event_id,state) values($1,'finished')",[future]);assert.equal((await cards(1)).length,2,'Staff-finished event unlocks matches before scheduled end');
await db.query("update profiles set profile=jsonb_set(profile,'{contact_consent}','false') where user_id=$1",[uid(2)]);assert.equal((await cards(1))[0].contact_available,false);await assert.rejects(()=>as(1,'select match_contact($1)',[match]),/Contact details unavailable/);
await db.query('update members set deleted_at=now() where id=$1',[uid(2)]);assert.deepEqual(await cards(1),[]);await assert.rejects(()=>as(1,'select match_contact($1)',[match]),/Match unavailable/);assert.equal((await as(1,'select can_view_attendee_photo($1) ok',[uid(2)])).rows[0].ok,false);
console.log('PASS match payload allowlist, owner-only access, event completion, opt-in contact, private photos, anonymous/outsider denial, deleted-member exclusion');await db.close();
