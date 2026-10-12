import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try{
 await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema roundy_private;
 create table public.instagram_post_drafts(id uuid primary key,status text,content_document jsonb,carousel_slides jsonb,images text[],recommended_time_kst time,scheduled_for timestamptz);
 create table public.marketing_automation_settings(singleton boolean,carousel_mode text,feed_daily_max_posts int,daily_time_kst time);
 create table public.marketing_runs(id uuid,channel text,snapshot jsonb,scheduled_for timestamptz,status text);
 create table public.marketing_carousel_slot_reservations(draft_id uuid,planned_for timestamptz);
 create table public.marketing_feed_schedule_slots(draft_id uuid primary key,run_id uuid,sequence_number bigint unique,alternating_sequence bigint unique,slot_date date,slot_position smallint,scheduled_for timestamptz,carousel_mode text,slide_count smallint check(slide_count in (3,5)),created_at timestamptz default now(),updated_at timestamptz default now(),unique(slot_date,slot_position));
 insert into public.marketing_automation_settings values(true,'fixed',5,'20:00');
 `);
 await db.exec(fs.readFileSync('scripts/marketing-workflow-schema.sql','utf8'));
 const ids=[];
 async function draft(number,count,{brand=false,manual=false,mode='fixed',wrongImage=false}={}){
  const id='00000000-0000-4000-8000-'+String(number).padStart(12,'0');ids.push(id);
  const total=count+(brand?1:0),slides=Array.from({length:total},(_,i)=>({role:i===total-1&&brand?'brand_outro':i===total-(brand?2:1)?'editorial_closing':'insight'}));
  const doc={carousel_template:{mode,slide_count:count},...(brand?{brand_outro_version:1}:{}),...(manual?{editorial_workflow_version:1,story_length_source:'admin'}:{})};
  await db.query('insert into instagram_post_drafts values($1, $2, $3, $4, $5, $6, now()+interval \'1 day\')',[id,'needs_approval',doc,slides,Array(total-(wrongImage?1:0)).fill('https://fixture.invalid/a.jpg'),'20:00']);
  return id;
 }
 const legacy=await draft(1,5),branded=await draft(2,5,{brand:true}),short=await draft(3,3,{brand:true,manual:true});
 for(const [id,expected] of [[legacy,5],[branded,5],[short,3]]){
  const row=(await db.query('select (roundy_private.reserve_marketing_feed_slot($1,false)).*',[id])).rows[0];
  assert.equal(row.slide_count,expected,'ledger stores immutable story count');
  const again=(await db.query('select (roundy_private.reserve_marketing_feed_slot($1,false)).*',[id])).rows[0];
  assert.equal(again.sequence_number,row.sequence_number,'same draft is idempotent');
 }
 const wrong=await draft(4,5,{brand:true,wrongImage:true});
 await assert.rejects(db.query('select roundy_private.reserve_marketing_feed_slot($1,false)',[wrong]),/CAROUSEL_FINAL_ORDER/);
 const oldShort=await draft(5,3);await assert.rejects(db.query('select roundy_private.reserve_marketing_feed_slot($1,false)',[oldShort]),/CAROUSEL_FINAL_ORDER/);
 await db.exec("update marketing_automation_settings set carousel_mode='alternating'");
 const a=await draft(6,3,{brand:true,mode:'alternating'}),b=await draft(7,5,{brand:true,mode:'alternating'});
 for(const id of [a,b])await db.query('select roundy_private.reserve_marketing_feed_slot($1,false)',[id]);
 const alt=(await db.query("select slide_count from marketing_feed_schedule_slots where carousel_mode='alternating' order by alternating_sequence")).rows;
 assert.deepEqual(alt.map(r=>r.slide_count),[3,5]);
 assert.equal((await db.query("select count(*)::int as count from marketing_runs")).rows[0].count,0,'reserving never publishes');
 assert.equal((await db.query("select count(*)::int as count from instagram_post_drafts where status<>'needs_approval'")).rows[0].count,0,'approval is not changed');
 console.log('PASS: real PostgreSQL 3/5 story + 1 brand reservations, legacy preservation, image count rejection, alternating order, idempotency; no external calls.');
}finally{await db.close();}
