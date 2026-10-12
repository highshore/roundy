import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const worker=fs.readFileSync(new URL('../supabase/functions/roundy-marketing/index.ts',import.meta.url),'utf8');
const start=worker.indexOf('function stockPublishPhotoSlots(');
const end=worker.indexOf('function kstNow(',start);
assert.ok(start>0&&end>start,'Expected live Feed stock publishing guard');
const source=worker.slice(start,end);
assert.match(source,/function stockPublishPhotoSlots/);
assert.match(source,/async function validateReviewedStockDraft/);
const compiled=ts.transpileModule(source+
 '\nexports.validateReviewedStockDraft=validateReviewedStockDraft;'+
 '\nexports.stockPublishPhotoSlots=stockPublishPhotoSlots;',{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;

function fixture(stories=5,ai=stories===5?0:null,version=2){
 const roles=stories===5?['cover','context','insight','insight','editorial_closing']:['cover','key_insight','editorial_closing'];
 if(version===2)roles.push('brand_outro');else roles[roles.length-1]='cta';
 const total=roles.length;
 const slots=roles.map((_,i)=>i).filter(i=>i<stories&&i!==ai);
 if(version!==2)slots.splice(3);
 const rows=slots.map(slot=>({
  slot,asset_id:'asset-'+slot,
  marketing_photo_assets:{
   provider:'pexels',review_status:'approved',
   storage_path:'stock/pexels/'+slot+'.jpg',
   content_sha256:String(slot+1).repeat(64),
   reviewed_at:'2026-10-12T10:00:00Z',reviewed_by:'admin',
   license_checked_at:'2026-10-12T09:00:00Z',license_name:'Pexels License',
   license_url:'https://www.pexels.com/license/',
   source_url:'https://www.pexels.com/photo/photo-'+slot+'/',
   license_evidence_url:'https://www.pexels.com/license/',
   commercial_use_allowed:true,modifications_allowed:true,
   attribution_required:false,photographer:'Test Photographer'
  }
 }));
 const caption='Photo sources / 사진 출처:\nPexels\nTest Photographer\n'+rows.map(r=>r.marketing_photo_assets.source_url).join('\n');
 const draft={
  id:'test-draft',status:'scheduled',revision:7,quality_revision:7,caption,
  images:roles.map((_,i)=>'https://roundy.test/photo-'+i+'.jpg'),
  carousel_slides:roles.map(role=>({role})),visual_source:'stock',
  approved_at:'2026-10-12T10:00:00Z',approved_by:'admin',
  content_document:{photo_sourcing:version===2?{
   version:2,slide_count:total,min_real_photos:slots.length,
   ai_image_slot:ai,ai_thumbnail_enabled:ai===0,
   requested_ai_thumbnail:ai===0
  }:{version:1,slide_count:stories,min_real_photos:3,ai_thumbnail_enabled:false,requested_ai_thumbnail:false}},
  quality_report:{status:'passed',preflight:{status:'passed',revision:7,
   photo_manifest:rows.map(r=>({slot:r.slot,asset_id:r.asset_id,sha256:r.marketing_photo_assets.content_sha256}))}}
 };
 return {draft,rows,template:{channel:'instagram',draft_id:draft.id,caption,images:structuredClone(draft.images)}};
}
async function attempt(data){
 const events=[];
 const db={from(table){
  events.push('from:'+table);
  assert.ok(['instagram_post_drafts','marketing_draft_photos'].includes(table),'unexpected table');
  return {
   select(fields){
    if(table==='instagram_post_drafts')for(const f of ['content_document','carousel_slides','quality_report','revision','quality_revision'])assert.ok(fields.includes(f),'missing draft verification '+f);
    else for(const f of ['slot','asset_id','content_sha256'])assert.ok(fields.includes(f),'missing asset verification '+f);
    return this;
   },
   eq(key,value){assert.equal(value,data.draft.id);assert.equal(key,table==='instagram_post_drafts'?'id':'draft_id');return this;},
   async single(){assert.equal(table,'instagram_post_drafts');return {data:data.draft,error:null};},
   then(resolve){assert.equal(table,'marketing_draft_photos');return Promise.resolve({data:data.rows,error:null}).then(resolve);}
  };
 }};
 const context={exports:{},service:db,console};
 vm.runInNewContext(compiled,context,{filename:'stock-publisher.ts'});
 await context.exports.validateReviewedStockDraft(data.template);
 assert.equal(events.length,2,'only two read-only database queries');
}
let count=0;const pass=async(label,d)=>{await attempt(d);console.log('PASS '+label);count++;};
const block=async(label,d,error)=>{await assert.rejects(attempt(d),error);console.log('PASS blocked '+label);count++;};
await pass('5 story + 1 brand, 4 approved photos and AI cover',fixture());
await pass('5 story + 1 brand, 5 approved real photos',fixture(5,null));
await pass('3 story + 1 brand, 3 approved real photos',fixture(3,null));
await pass('legacy five-card stock: historically three photos',fixture(5,null,1));
const mutate=(f,fn)=>{const data=f();fn(data);return data;};
await block('missing fourth approved photo',mutate(fixture,d=>d.rows.pop()),/STOCK_PHOTO_REVIEW_REQUIRED/);
await block('extra unapproved slot',mutate(fixture,d=>d.rows.push(structuredClone(d.rows[0]))),/STOCK_PHOTO_REVIEW_REQUIRED/);
await block('wrong slot',mutate(fixture,d=>d.rows[0].slot=0),/STOCK_PHOTO_APPROVED_MANIFEST_CHANGED/);
await block('duplicate asset ID',mutate(fixture,d=>d.rows[1].asset_id=d.rows[0].asset_id),/STOCK_PHOTO_APPROVED_MANIFEST_CHANGED/);
await block('changed content SHA',mutate(fixture,d=>d.rows[1].marketing_photo_assets.content_sha256='x'.repeat(64)),/STOCK_PHOTO_APPROVED_MANIFEST_CHANGED/);
await block('replaced asset',mutate(fixture,d=>d.rows[1].asset_id='other'),/STOCK_PHOTO_APPROVED_MANIFEST_CHANGED/);
await block('missing approved photo manifest',mutate(fixture,d=>delete d.draft.quality_report.preflight.photo_manifest),/STOCK_PHOTO_PREFLIGHT_STALE/);
await block('failed preflight',mutate(fixture,d=>d.draft.quality_report.preflight.status='rejected'),/STOCK_PHOTO_PREFLIGHT_STALE/);
await block('invalid quality revision',mutate(fixture,d=>d.draft.quality_revision=6),/STOCK_PHOTO_PREFLIGHT_STALE/);
await block('missing brand outro',mutate(fixture,d=>d.draft.carousel_slides.at(-1).role='cta'),/STOCK_PHOTO_LAYOUT_CHANGED/);
await block('missing version-2 sourcing policy',mutate(fixture,d=>delete d.draft.content_document.photo_sourcing),/STOCK_PHOTO_POLICY_REQUIRED/);
await block('fake min-real count',mutate(fixture,d=>d.draft.content_document.photo_sourcing.min_real_photos=3),/STOCK_PHOTO_POLICY_INVALID/);
await block('AI assigned to brand card',mutate(fixture,d=>d.draft.content_document.photo_sourcing.ai_image_slot=5),/STOCK_PHOTO_AI_SLOT_INVALID/);
await block('unapproved asset',mutate(fixture,d=>d.rows[2].marketing_photo_assets.review_status='pending'),/STOCK_PHOTO_RIGHTS_OR_APPROVAL_REQUIRED/);
await block('missing image archive',mutate(fixture,d=>d.rows[2].marketing_photo_assets.storage_path=null),/STOCK_PHOTO_RIGHTS_OR_APPROVAL_REQUIRED/);
await block('missing rights evidence',mutate(fixture,d=>d.rows[2].marketing_photo_assets.license_evidence_url=null),/STOCK_PHOTO_RIGHTS_OR_APPROVAL_REQUIRED/);
await block('no commercial use',mutate(fixture,d=>d.rows[2].marketing_photo_assets.commercial_use_allowed=false),/STOCK_PHOTO_RIGHTS_OR_APPROVAL_REQUIRED/);
await block('invalid license',mutate(fixture,d=>d.rows[2].marketing_photo_assets.license_url='https://another.invalid/'),/STOCK_LICENSE_UNSUPPORTED/);
await block('missing caption credits',mutate(fixture,d=>{d.draft.caption='caption';d.template.caption='caption';}),/STOCK_SOURCE_CREDIT_REQUIRED/);
await block('edited caption after approval',mutate(fixture,d=>d.draft.caption+=' revision'),/STOCK_CAPTION_CHANGED_AFTER_APPROVAL/);
await block('changed image after approval',mutate(fixture,d=>d.draft.images[0]='changed'),/STOCK_RENDER_CHANGED_AFTER_APPROVAL/);
await block('approval revoked',mutate(fixture,d=>d.draft.approved_at=null),/STOCK_DRAFT_APPROVAL_REQUIRED/);
await block('legacy cap remains enforced',mutate(()=>fixture(5,null,1),d=>{d.rows.push(structuredClone(d.rows[0]));}),/STOCK_PHOTO_REVIEW_REQUIRED/);
console.log('PASS '+count+' Edge worker photo-review/publishing guards with mock DB. No live Meta API, DB writes, retries or publishing.');

