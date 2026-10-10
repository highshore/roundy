import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=[
 read('supabase/migrations/20261010160500_feed_kst_reservations.sql'),
 read('supabase/migrations/20261010161000_feed_kst_approval_rpc.sql'),
 read('supabase/migrations/20261010162000_feed_claim_attempt_audit.sql'),
 read('supabase/migrations/20261010163000_feed_manual_retry_after_review.sql')
];
const kstDate=d=>new Intl.DateTimeFormat('en-CA',{
 timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'
}).format(d);
const kstStamp=(date,clock)=>new Date(date+'T'+clock+':00+09:00');
const nextDate=date=>new Date(date+'T00:00:00+09:00').toISOString().slice(0,10);
function followingKstDate(day){
 const time=Date.parse(day+'T00:00:00+09:00')+86400000;
 return kstDate(new Date(time));
}
// This simulated slot DB mirrors KST occupancy and a global serial approval lock.
// It is entirely in memory; zero real Meta or Supabase API requests.
function mockQueue({today='2026-10-10',clock='20:00',limit=1,mode='fixed'}={}){
 const ledger=[],ids=new Set();
 const approve=(id,now)=>{
  if(ids.has(id))return ledger.find(row=>row.id===id);
  let day=today;
  if(kstStamp(day,clock).getTime()<=now.getTime()+30000)day=followingKstDate(day);
  while(ledger.filter(s=>s.day===day).length>=limit)day=followingKstDate(day);
  const sequence=ledger.length+1,alternatingNo=ledger.filter(s=>s.mode==='alternating').length+1;
  const count=mode==='alternating'?(alternatingNo%2===1?3:5):5;
  const position=ledger.filter(s=>s.day===day).length+1;
  const slot={id,day,count,sequence,mode,position,iso:kstStamp(day,clock).toISOString(),status:'queued',attempts:[]};
  ledger.push(slot);ids.add(id);return slot;
 };
 const claim=(now)=>{
  const day=kstDate(now),used=ledger.flatMap(s=>s.attempts).filter(a=>a.day===day).length;
  if(used>=limit)return [];
  const due=ledger.filter(s=>s.status==='queued'&&new Date(s.iso)<=now)
   .sort((a,b)=>a.sequence-b.sequence)[0];
  if(!due)return [];
  due.status='publishing';
  due.attempts.push({day,state:'publishing',external:false,error:null});
  return [due];
 };
 const finish=(slot,{result='sent',error=null,external=false}={})=>{
  const a=slot.attempts.at(-1);
  if(!a||a.state!=='publishing')throw Error('NO_ACTIVE_ATTEMPT');
  a.external=external;a.state=result;a.error=error;slot.status=result;
 };
 return {ledger,approve,claim,finish};
}
const when=new Date('2026-10-10T05:00:00.000Z');
const q=mockQueue();
const approved=['A','B','C'].map(x=>q.approve(x,when));
assert.deepEqual(approved.map(x=>x.day),['2026-10-10','2026-10-11','2026-10-12']);
assert.deepEqual(approved.map(x=>x.count),[5,5,5]);
assert.deepEqual(approved.map(x=>x.position),[1,1,1]);
assert.equal(q.approve('A',when),approved[0],'same draft is idempotent');
assert.equal(q.ledger.length,3,'approved contents remain queued without dropping any');
assert.equal(q.claim(new Date('2026-10-10T11:00:00.000Z')).length,1);
assert.equal(q.claim(new Date('2026-10-10T11:01:00.000Z')).length,0,'cannot claim same run twice or exceed daily cap');
q.finish(approved[0],{result:'sent',external:true});
assert.equal(q.claim(new Date('2026-10-11T11:00:00.000Z')).length,1);
q.finish(approved[1],{result:'sent',external:true});
assert.equal(q.claim(new Date('2026-10-12T11:00:00.000Z')).length,1);
q.finish(approved[2],{result:'sent',external:true});
assert.equal(q.ledger.filter(x=>x.status==='sent').length,3);
assert.equal(new Set(q.ledger.flatMap(x=>x.attempts).map(a=>a.day)).size,3);
assert.deepEqual(mockQueue({limit:2}).ledger,[]);
const two=mockQueue({limit:2});
assert.deepEqual(['a','b','c'].map(x=>two.approve(x,when).day),
 ['2026-10-10','2026-10-10','2026-10-11']);
const alternating=mockQueue({mode:'alternating'});
assert.deepEqual(['a','b','c','d'].map(x=>alternating.approve(x,when).count),[3,5,3,5]);
const late=mockQueue({today:'2026-10-10',clock:'20:00'});
assert.equal(late.approve('late',new Date('2026-10-10T12:20:00Z')).day,'2026-10-11',
 'approved after 20:00 KST moves to tomorrow');
assert.equal(kstDate(new Date('2026-10-10T15:30:00Z')),'2026-10-11','KST day differs from UTC');
assert.equal(followingKstDate('2026-12-31'),'2027-01-01');
const unknown=mockQueue();
const target=unknown.approve('unknown',when);
unknown.claim(new Date('2026-10-10T11:00:00Z'));
unknown.finish(target,{result:'needs_review',external:true,error:'Connection lost after /media_publish'});
assert.equal(unknown.claim(new Date('2026-10-11T11:00:00Z')).length,0,'needs_review cannot be auto-claimed');
assert.equal(target.attempts.length,1);
assert.match(target.attempts[0].error,/Connection lost/);
for(const q of sql)assert.match(q,/time zone 'Asia\/Seoul'|Asia\/Seoul/);
assert.match(sql[0],/unique \(slot_date,slot_position\)/);
assert.match(sql[0],/marketing_instagram_feed_draft_once/);
assert.match(sql[0],/CAROUSEL_FINAL_ORDER_REQUIRES_REGENERATION/);
assert.match(sql[1],/reserve_marketing_feed_slot\(p_id,false\)/);
assert.match(sql[1],/reserve_marketing_feed_slot\(p_id,true\)/);
assert.match(sql[1],/feed_date_kst/);
assert.match(sql[2],/pg_advisory_xact_lock\(20261010155000\)/);
assert.match(sql[2],/attempts_today\+legacy_sent_today>=cap/);
assert.match(sql[2],/FEED_DAILY_LIMIT_KST/);
assert.match(sql[2],/status='needs_review'/);
assert.match(sql[2],/mark_marketing_feed_external_attempt/);
assert.match(sql[3],/p_confirm_no_post is distinct from true/);
assert.match(sql[3],/marketing_feed_retry_reviews/);
const worker=read('supabase/functions/roundy-marketing/index.ts');
assert.match(worker,/await beforeFirstExternalPost\(\)/);
assert.match(worker,/await service\.rpc\('mark_marketing_feed_external_attempt'/);
assert.match(worker,/outcome=\{status:externalAttempt\?'needs_review':'failed'/);
const api=read('src/lib/marketing.ts');
assert.match(api,/queued\.deferred===true/);
assert.match(api,/retry_marketing_feed_after_review/);
assert.match(api,/path\[2\]==='attempts'/);
console.log('PASS simulated KST Feed reservations: 3 approvals -> 3 days, daily cap, mode parity, no double claims, uncertain-result quarantine. No real Instagram calls.');
