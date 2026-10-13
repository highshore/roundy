import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const nodeRequire=createRequire(import.meta.url),ts=nodeRequire('typescript');
const load=(path,requireModule)=>{
 const out={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
 }).outputText,{exports:out.exports,module:out,require:requireModule,Intl,URL,Date,console,Set,Number,Object,Math,JSON},{filename:path});
 return out.exports;
};
const plans=load('src/lib/marketing-carousel-template.ts',()=>{throw Error('NO_EXTERNAL_IMPORT')});
const brand=load('src/lib/marketing-brand-outro.ts',name=>{
 if(name==='./marketing-carousel-template')return plans;
 throw Error('UNEXPECTED_IMPORT:'+name);
});
const policy=load('src/lib/marketing-stock-photo-policy.ts',name=>{
 if(name==='./marketing-photo-rights')return {creditForPhoto:()=>'',validLicensedPhoto:()=>true};
 throw Error('UNEXPECTED_IMPORT:'+name);
});
let checks=0;const check=fn=>{fn();checks++};
for(const storyCount of [3,5]){
 const plan={version:1,mode:'fixed',slide_count:storyCount,reservation_number:null,
  title_font_size_px:72,body_font_size_px:36};
 const roles=storyCount===3?['cover','key_insight','editorial_closing']:
  ['cover','context','insight','insight','editorial_closing'];
 const story=roles.map((role,i)=>({role,title:'제목 '+i,body:'카드 본문 '+i,body_ko:'카드 본문 '+i,
  body_en:'Card body '+i,closing_type:role==='editorial_closing'?'summary':'none'}));
 const doc={design_preset:'roundy_magazine_editorial_v2',carousel_template:plan,slides:story};
 const result=brand.appendRoundyOutro(doc,story,'ko',plan);
 const n=storyCount+1;
 check(()=>assert.equal(result.slides.length,n));
 check(()=>assert.equal(result.document.slides.length,n));
 check(()=>assert.equal(result.slides.at(-1).role,'brand_outro'));
 check(()=>assert.equal(result.slides.at(-2).role,'editorial_closing'));
 check(()=>assert.match(result.slides.at(-1).body,/Roundy/));
 check(()=>assert.equal(brand.brandedStoryCount(result.document),storyCount));
 check(()=>assert.equal(brand.totalMagazineSlides(result.document),n));
 check(()=>assert.equal(brand.storyOnlyDocument(result.document).slides.length,storyCount));
 check(()=>assert.equal(doc.slides.length,storyCount,'input document must remain immutable'));
 const settings={carousel_min_real_photos_5:3,carousel_min_real_photos_3:2,carousel_ai_thumbnail_enabled:false};
 const slots=roles.concat('brand_outro');
 const sourcing=policy.configuredPhotoSourcingPolicy(settings,slots);
 check(()=>assert.equal(sourcing.version,2));
 check(()=>assert.equal(sourcing.min_real_photos,storyCount));
 check(()=>assert.equal(sourcing.slide_count,n));
 check(()=>assert.equal(policy.savedPhotoSourcingPolicy(sourcing).version,2));
 check(()=>assert.deepEqual([...policy.requiredPhotoSlotsForRoles(slots,sourcing)],
  Array.from({length:storyCount},(_,i)=>i)));
 check(()=>assert.equal(policy.allSelectedPhotosApproved(slots,Array.from({length:storyCount},(_,i)=>
  ({slot:i,review_status:'approved',storage_path:'stock/'+i+'.jpg'})),sourcing),true));
 check(()=>assert.equal(policy.allSelectedPhotosApproved(slots,Array.from({length:storyCount-1},(_,i)=>
  ({slot:i,review_status:'approved',storage_path:'stock/'+i+'.jpg'})),sourcing),false));
 check(()=>assert.equal(policy.allSelectedPhotosApproved(slots,Array.from({length:storyCount},(_,i)=>
  ({slot:i,review_status:i===2?'pending':'approved',storage_path:'stock/'+i+'.jpg'})),sourcing),false));
 if(storyCount===5){
  const ai=policy.configuredPhotoSourcingPolicy({...settings,carousel_ai_thumbnail_enabled:true},slots);
  check(()=>assert.equal(ai.ai_image_slot,0));
  check(()=>assert.equal(ai.min_real_photos,4));
  check(()=>assert.deepEqual([...policy.requiredPhotoSlotsForRoles(slots,ai)],[1,2,3,4]));
  check(()=>assert.equal(policy.savedPhotoSourcingPolicy({...ai,min_real_photos:3}),null));
 }
 check(()=>assert.throws(()=>brand.appendRoundyOutro(doc,story.slice(0,-1),'ko',plan),/STORY_CONTRACT/));
}
const src=fs.readFileSync('src/lib/marketing-generation.ts','utf8');
const render=fs.readFileSync('src/lib/marketing-visuals.ts','utf8');
const preflight=fs.readFileSync('src/lib/marketing-preflight.ts','utf8');
const db=fs.readFileSync('supabase/migrations/20261012161000_marketing_story_photos_and_independent_brand.sql','utf8');
check(()=>assert.match(fs.readFileSync('src/lib/marketing-content-controller.ts','utf8'),/brand_outro_enabled:true/));
check(()=>assert.match(fs.readFileSync('src/lib/marketing-content-workers.ts','utf8'),/approvedStockCardAssets/));
check(()=>assert.match(render,/photographicMagazineTakeaway/));
check(()=>assert.match(render,/standaloneRoundyBrand/));
check(()=>assert.match(render,/ROUNDY_STORY_PHOTO_MISSING/));
check(()=>assert.match(preflight,/모든 스토리 카드에 서로 다른 승인 실사 사진/));
check(()=>assert.match(preflight,/독립적인 Roundy 소개 카드/));
check(()=>assert.match(db,/expected_photos:=story_count/));
check(()=>assert.match(db,/carousel_brand_outro_enabled/));
console.log('PASS '+checks+' story-photo and standalone Roundy outro assertions without external requests.');
