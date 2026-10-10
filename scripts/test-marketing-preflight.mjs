import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const cache=new Map();
const read=p=>fs.readFileSync('src/lib/'+p+'.ts','utf8');
function load(name){
 if(cache.has(name))return cache.get(name);
 const context={exports:{},URL,Date,console,require:request=>{
  if(request.startsWith('./'))return load(request.slice(2));
  return require(request);
 }};
 vm.runInNewContext(ts.transpileModule(read(name),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
 }).outputText,context);
 cache.set(name,context.exports);return context.exports;
}
const {evaluateMarketingPreflight,mergePreflightQuality,photoReviewManifest}=load('marketing-preflight');
const {resolveCarouselPlan}=load('marketing-carousel-template');
const validSettings={carousel_mode:'fixed',carousel_default_slides:5,carousel_min_real_photos_5:3,
 carousel_min_real_photos_3:2,carousel_answer_first_enabled:true,
 carousel_title_font_size_px:72,carousel_body_font_size_px:36};
const makeSlides=n=>Array.from({length:n},(_,i)=>({
 role:i===0?'cover':i===n-1?'cta':'detail',
 title:i===0?'성수 첫 데이트 산책 코스':i===n-1?'라운디에서 직접 만나보기':'서울에서 대화할 장소 추천',
 body:i===0?'서울숲을 중심으로 동선을 계획해보세요.':i===n-1?'서울의 로테이션 소개팅, 라운디에서 만나요.':'실제 방문 가능한 장소와 운영 정보를 확인하세요.',
 highlight:'',source_ids:[],body_ko:i===0?'서울숲을 중심으로 동선을 계획해보세요.':i===n-1?'서울의 로테이션 소개팅, 라운디에서 만나요.':'실제 방문 가능한 장소와 운영 정보를 확인하세요.',
 body_en:'Useful context for an in-person conversation.'
}));
const goodPhoto=(slot)=>({slot,asset_id:'00000000-0000-4000-8000-'+String(slot+1).padStart(12,'0'),
 provider:'pexels',provider_photo_id:String(100+slot),
 source_url:'https://www.pexels.com/photo/sample-'+slot+'/',
 image_url:'https://images.pexels.com/photos/'+(100+slot)+'/photo.jpeg',
 license_name:'Pexels License',license_url:'https://www.pexels.com/license/',
 photographer:'Test Photographer',photographer_url:'https://www.pexels.com/@photographer/',
 license_checked_at:'2026-10-10T10:00:00Z',review_status:'approved',
 reviewed_at:'2026-10-10T10:02:00Z',
 reviewed_by:'00000000-0000-4000-8000-000000000001',
 storage_path:'stock/pexels/'+slot+'.jpg',content_sha256:'a'.repeat(64),perceptual_hash:'a'.repeat(16)});
function fixture(count=5){
 const plan=resolveCarouselPlan({...validSettings,carousel_mode:count===5?'fixed':'alternating'},count===3?1:null);
 const slides=makeSlides(count);
 const photo_sourcing={version:1,slide_count:count,min_real_photos:count===5?3:2,
  ai_thumbnail_enabled:false,requested_ai_thumbnail:false};
 const titles=['성수 첫 데이트 산책 코스','서울숲을 중심으로 한 산책','서울에서 함께 걷는 첫 만남'];
 return {id:'11111111-1111-4111-8111-111111111111',revision:7,
  visual_source:'pexels',content_language:'ko',draft_kind:'growth_carousel',images:slides.map((_,i)=>'https://static.roundy.team/'+i+'.jpg'),
  caption:'성수에서 시작하는 데이트 코스\n라운디가 전하는 장소 팁\n\n@roundy.meet | roundy.team',
  cta:'Roundy 둘러보기',destination_url:'https://roundy.team',
  carousel_slides:slides,content_document:{schema_version:2,post_type:'seoul_dating',answer_first:true,
   thumbnail_render_pending:false,thumbnail_candidates:titles,thumbnail_selected_index:0,
   carousel_template:plan,photo_sourcing,slides:structuredClone(slides)}};
}
const evaluate=(draft,photos,settings=validSettings)=>evaluateMarketingPreflight(draft,settings,photos);
for(const n of [3,5]){
 const d=fixture(n),p=(n===3?[0,1]:[0,1,2]).map(goodPhoto);
 const report=evaluate(d,p);
 assert.equal(report.status,'passed',JSON.stringify(report.issues));
 assert.equal(report.checks.length,7);
 assert.equal(report.min_real_photos,n===3?2:3);
 assert.equal(report.photo_manifest.length,n===3?2:3);
 assert.deepEqual(Array.from(report.checks.filter(x=>!x.passed)),[]);
}
const d=fixture(),photos=[0,1,2].map(goodPhoto);
const fail=(draft,assets,checkId)=>{const p=evaluate(draft,assets);assert.equal(p.status,'rejected',checkId);
 assert.ok(p.checks.find(c=>c.id===checkId&&!c.passed),checkId+': '+JSON.stringify(p.issues));return p;};
fail({...d,images:d.images.slice(0,3)},photos,'slide_count');
fail(d,photos.slice(0,2),'real_photos');
fail(d,photos.map((p,i)=>i===1?{...p,license_url:'https://another.example'}:p),'photo_sources');
fail(d,photos.map((p,i)=>i===2?{...p,review_status:'pending',reviewed_at:null}:p),'photo_approval');
fail({...d,content_document:{...d.content_document,answer_first:false}},photos,'answer_first');
fail({...d,carousel_slides:d.carousel_slides.map((p,i)=>i===4?{...p,role:'other'}:p)},photos,'final_cta');
fail({...d,destination_url:'https://roundy.team.evil.example/collect'},photos,'final_cta');
fail({...d,carousel_slides:d.carousel_slides.map((p,i)=>i===4?{...p,title:'비트코인 거래소 가입',body:'가상화폐 코인 무료 구매하러 가세요.'}:p)},photos,'final_cta');
fail({...d,carousel_slides:d.carousel_slides.map((p,i)=>i===1?{...p,body:'길고 반복되는 문구 '.repeat(250),body_ko:'길고 반복되는 문구 '.repeat(250)}:p)},photos,'mobile_render');
fail({...d,content_document:{...d.content_document,thumbnail_render_pending:true}},photos,'answer_first');
assert.notDeepEqual(photoReviewManifest(photos),photoReviewManifest(photos.map((p,i)=>i===0?{...p,review_status:'pending'}:p)));
const rejected=fail({...d,visual_source:'uploaded'},photos,'real_photos');
assert.equal(rejected.min_real_photos,3,'uploads without a source-verification flow cannot bypass reviewed Pexels requirement');
const good=evaluate(d,photos),copy={version:2,status:'passed',issues:[],review_required:true};
assert.equal(mergePreflightQuality(copy,good).status,'passed');
assert.equal(mergePreflightQuality(copy,rejected).status,'rejected');
assert.equal(mergePreflightQuality(copy,rejected,false).status,'passed','generation retains valid copy while marked review-pending');
assert.equal(mergePreflightQuality(copy,rejected,false).preflight.status,'rejected');
const sql=fs.readFileSync('supabase/migrations/20261010130000_marketing_preflight_gate.sql','utf8');
assert.match(sql,/guard_marketing_preflight_runs/);
assert.match(sql,/guard_marketing_preflight_draft/);
assert.match(sql,/old\.status is distinct from 'needs_approval'/,'approval transition must not skip its own guard');
assert.match(sql,/quality_revision is distinct from d\.revision/);
assert.match(sql,/actual_manifest is distinct from pf->'photo_manifest'/);
assert.match(sql,/new\.approved_by is null/);
const scoped=fs.readFileSync('supabase/migrations/20261010131500_marketing_preflight_trigger_scoped_fields.sql','utf8');
assert.match(scoped,/if TG_TABLE_NAME='instagram_post_drafts' then[\s\S]*?new\.approved_by is null/);
assert.doesNotMatch(scoped,/TG_TABLE_NAME='instagram_post_drafts' and \(new\.approved_by/);

assert.match(sql,/preflight/);
assert.doesNotMatch(sql,/truncate|delete from public\.instagram_post_drafts|drop table public\.instagram_post_drafts/i);
const route=fs.readFileSync('src/lib/marketing.ts','utf8');
assert.match(route,/path\[1\]==='preflight'/);
assert.match(route,/recheckForPublishing\(current\)/);
assert.match(route,/MARKETING_PREFLIGHT_FAILED/);
console.log('PASS marketing preflight: seven checks, source/provenance, human approval, 3/5 photos, Answer-First, CTA, no-clipping, idempotent DB guards');
