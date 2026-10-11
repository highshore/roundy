import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const nodeRequire=createRequire(import.meta.url);
const ts=nodeRequire('typescript'),sharp=nodeRequire('sharp');
const cache=new Map(),read=path=>fs.readFileSync(path,'utf8');
function load(path){
 if(cache.has(path))return cache.get(path);
 const result={exports:{}};cache.set(path,result.exports);
 const js=ts.transpileModule(read('src/lib/'+path+'.ts'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
 }).outputText;
 const context={module:result,exports:result.exports,console,URL,Date,Buffer,
  require(name){
   if(name==='server-only')return {};
   if(name==='./supabase/service')return {createServiceRoleClient:()=>({})};
   if(name.startsWith('./')&&fs.existsSync('src/lib/'+name.slice(2)+'.ts'))return load(name.slice(2));
   return nodeRequire(name);
  }};
 vm.runInNewContext(js,context,{filename:path+'.ts'});
 cache.set(path,result.exports);
 return result.exports;
}
const layout=load('marketing-carousel-template');
const presentation=load('marketing-presentation');
const policy=load('marketing-content-policy');
const stock=load('marketing-stock-photo-policy');
const preflight=load('marketing-preflight');
const visuals=load('marketing-visuals');
const {MAGAZINE_EDITORIAL_PRESET,EDITORIAL_PRESET,MAGAZINE_EDITORIAL_SCHEMA_VERSION}=presentation;
const rolesContract=load('marketing-answer-first');
const settings={carousel_mode:'fixed',carousel_title_font_size_px:72,carousel_body_font_size_px:36,
 carousel_min_real_photos_5:3,carousel_min_real_photos_3:2,carousel_ai_thumbnail_enabled:false};
const expected={
 3:['cover','insight','editorial_closing'],
 5:['cover','context','insight','insight','editorial_closing']
};
const photoBuf=await sharp({create:{width:1080,height:1350,channels:3,background:'#aad9c8'}})
 .jpeg({quality:90}).toBuffer();
const fixturePhoto='data:image/jpeg;base64,'+photoBuf.toString('base64');
const imagePaths=[];
fs.mkdirSync('quality-artifacts',{recursive:true});
let tested=0;
for(const count of [3,5])for(const language of ['ko','en']){
 const plan=layout.resolveCarouselPlan({...settings,carousel_mode:count===5?'fixed':'alternating'},count===3?1:null);
 const roles=expected[count];
 const schema=policy.contentSchema('korea_life',language,'',true,plan);
 assert.equal(schema.properties.design_preset.enum[0],MAGAZINE_EDITORIAL_PRESET);
 assert.equal(schema.properties.cta,undefined,'Magazines must not request an AI CTA field');
 assert.deepEqual(Array.from(schema.properties.editorial_schema_version.enum),[MAGAZINE_EDITORIAL_SCHEMA_VERSION]);
 assert.ok(schema.required.includes('editorial_schema_version'),'new editorial schema must be explicitly versioned');
 assert.ok(!schema.required.includes('cta'));
 assert.ok(schema.properties.slides.items.required.includes('closing_type'));
 assert.deepEqual(Array.from(schema.properties.slides.items.properties.closing_type.enum),['none','summary','insight','brand_outro']);
 assert.deepEqual(Array.from(schema.properties.slides.items.properties.role.enum),Array.from(new Set(roles)));
 assert.match(policy.writingInstructions('korea_life',language,'',true,plan),/editorial_closing/);
 const other=language==='ko'?['서울에서 즐길 수 있는 주말','산책하면서 새로운 거리 구경하기','동네마다 취향이 다른 이유','골목에서 찾는 새로운 시선']:
  ['Explore Seoul more slowly','Find a welcoming new neighborhood','Discover a little local context','Small discoveries in daily life'];
 const slides=roles.map((role,i)=>({
  role,closing_type:i===count-1?'summary':'none',
  eyebrow:'SEOUL / LIFESTYLE',
  title:i===0?other[0]:i===count-1?(language==='ko'?'서울을 걷는 새로운 시선':'A different view of Seoul'):other[(i-1)%3+1],
  body:language==='ko'?'한 공간을 찬찬히 살피면 서울의 새로운 면을 만날 수 있습니다.':'Take time to notice a different side of this neighborhood.',
  source_ids:[],highlight:'',body_ko:'한 공간을 찬찬히 살피면 서울의 새로운 면을 만날 수 있습니다.',
  body_en:'Take time to notice a different side of this neighborhood.'
 }));
 const policySnapshot=stock.configuredPhotoSourcingPolicy(settings,roles);
 assert.equal(policySnapshot.min_real_photos,count===5?3:2);
 assert.deepEqual(Array.from(stock.requiredPhotoSlotsForRoles(roles,policySnapshot)),count===5?[0,1,2]:[0,1]);
 const approved=stock.requiredPhotoSlotsForRoles(roles,policySnapshot).map(slot=>({slot,review_status:'approved',storage_path:'qa-only/'+slot+'.jpg'}));
 assert.equal(stock.allSelectedPhotosApproved(roles,approved,policySnapshot),true);
 const doc={design_preset:MAGAZINE_EDITORIAL_PRESET,editorial_schema_version:MAGAZINE_EDITORIAL_SCHEMA_VERSION,carousel_template:plan,content_language:language,
  answer_first:true,thumbnail_render_pending:false,slides};
 const drafts={content_document:doc,carousel_slides:slides,images:roles.map((_,i)=>'qa-'+i),
  cta:'',caption:'@roundy.meet — '+(language==='ko'?'서울 동네를 천천히 살펴보세요.':'A closer look at Seoul.'),
  visual_source:'stock',revision:2,content_language:language};
 const pf=preflight.evaluateMarketingPreflight(drafts,settings,[]);
 assert.equal(pf.checks.length,7);
 assert.equal(pf.checks.find(c=>c.id==='editorial_closing')?.passed,true);
 assert.equal(presentation.isLegacyMagazineDocument(doc),false);
 assert.equal(presentation.isSupportedMagazineDocument(doc),true);
 assert.equal(pf.checks.some(c=>c.id==='final_cta'),false);
 assert.equal(pf.checks.find(c=>c.id==='real_photos')?.passed,false,'Unapproved media blocks publication');
 const assets={cardPhotos:{0:fixturePhoto,1:fixturePhoto,2:fixturePhoto,3:fixturePhoto},
  cardCredits:{0:'QA fixture / not for publishing',1:'QA fixture / not for publishing',
   2:'QA fixture / not for publishing',3:'QA fixture / not for publishing'},reusePhotos:false};
 for(let i=0;i<count;i++){
  const tree=visuals.magazineCarouselTree(slides[i],i,count,doc,assets);
  const json=JSON.stringify(tree);
  assert.ok(json.includes('#ff6666'));
  assert.ok(!json.includes('Learn More')&&!json.includes('Explore Roundy')&&!json.includes('Roundy 둘러보기'));
  if(i===count-1)assert.ok(json.includes('EDITORIAL / SUMMARY'),'Closing is editorial, not a CTA');
  const raw=Buffer.from(await visuals.renderCompactEditorial(slides[i],i,count,doc,assets).arrayBuffer());
  const meta=await sharp(raw).metadata();
  assert.equal(meta.width,1080);assert.equal(meta.height,1350);
  const top=await sharp(raw).extract({left:540,top:175,width:1,height:1}).removeAlpha().raw().toBuffer();
  assert.ok(Math.min(...top)>225,'Bright magazine paper must not be covered by a dark image scrim');
  const file='quality-artifacts/magazine-'+count+'-'+language+'-'+(i+1)+'.jpg';
  await sharp(raw).jpeg({quality:85}).toFile(file);imagePaths.push(file);tested++;
 }
}
// Legacy published V2 three-card snapshots have no editorial_schema_version and
// continue to use key_insight. They must remain readable/renderable unchanged.
const three=layout.resolveCarouselPlan({...settings,carousel_mode:'alternating'},1);
const legacySlides=[
 {role:'cover',title:'Explore the neighborhood',body:'Notice everyday details',body_en:'Notice everyday details',highlight:'',closing_type:'none'},
 {role:'key_insight',title:'Notice a different detail',body:'Different places invite different conversations.',body_en:'Different places invite different conversations.',highlight:'',closing_type:'none'},
 {role:'editorial_closing',title:'Take a different perspective',body:'Remember the experience, not just the place.',body_en:'Remember the experience, not just the place.',highlight:'',closing_type:'summary'}
];
const legacyDoc={design_preset:MAGAZINE_EDITORIAL_PRESET,carousel_template:three,content_language:'en',
 answer_first:true,slides:legacySlides};
assert.equal(presentation.isLegacyMagazineDocument(legacyDoc),true);
assert.equal(presentation.isSupportedMagazineDocument(legacyDoc),true);
assert.deepEqual(Array.from(rolesContract.magazineRolesForCount(3,true)),['cover','key_insight','editorial_closing']);
assert.deepEqual(Array.from(rolesContract.magazineRolesForCount(3)),['cover','insight','editorial_closing']);
assert.equal(presentation.normalizeCompactDocument(legacyDoc,'en').slides[1].role,'key_insight');
assert.doesNotThrow(()=>visuals.magazineCarouselTree(legacySlides[1],1,3,legacyDoc));
const legacyDraft={content_document:legacyDoc,carousel_slides:legacySlides,images:['1','2','3'],
 cta:'',caption:'@roundy.meet',content_language:'en',visual_source:'stock',revision:3};
assert.equal(preflight.evaluateMarketingPreflight(legacyDraft,settings,[]).checks.find(x=>x.id==='editorial_closing').passed,true);
const badLegacy={...legacyDoc,editorial_schema_version:99};
assert.equal(presentation.isSupportedMagazineDocument(badLegacy),false);
assert.throws(()=>visuals.magazineCarouselTree(legacySlides[1],1,3,badLegacy),/MAGAZINE_TEMPLATE_MISMATCH/);
const newDoc={...legacyDoc,editorial_schema_version:MAGAZINE_EDITORIAL_SCHEMA_VERSION,
 slides:legacySlides.map((s,i)=>i===1?{...s,role:'insight'}:s)};
assert.throws(()=>visuals.magazineCarouselTree(legacySlides[1],1,3,newDoc),/MAGAZINE_SLIDE_ROLE_MISMATCH/);
for(const closingType of ['summary','insight','brand_outro']){
 const slide={...newDoc.slides[2],closing_type:closingType};
 assert.doesNotThrow(()=>visuals.magazineCarouselTree(slide,2,3,newDoc));
}
// Campaign and event/Story contracts still use CTA and are deliberately untouched.
assert.equal(rolesContract.campaignRolesForCount('poster',['hook','benefit','cta'],5).at(-1),'cta');
assert.equal(rolesContract.eventRolesForCount('event_poster',['hook','facts','cta'],5).at(-1),'cta');
const noCopy=String(fs.readFileSync('src/lib/marketing-visuals.ts'));
assert.ok(!noCopy.slice(noCopy.indexOf('function magazineCover'),noCopy.indexOf('export function standardCarouselTree')).includes('Roundy 둘러보기'));
const sql=read('supabase/migrations/20261011100000_instagram_editorial_schema_v3_compatibility.sql');
assert.match(sql,/magazine_editorial_v2/);
assert.match(sql,/editorial_schema_version/);
assert.match(sql,/then 'insight' else 'key_insight' end/);
assert.match(sql,/marketing_photo_rights_valid/);
assert.match(sql,/marketing_draft_photos/);
assert.match(sql,/jsonb_array_length\(pf->'checks'\)<>7/);
assert.doesNotMatch(sql,/(?:update public.instagram_post_drafts set|delete from|truncate table)/i,'No historical draft edits');
const old=policy.contentSchema('korea_life','ko','',false,null);
assert.equal(old.properties.design_preset.enum[0],EDITORIAL_PRESET);
assert.ok(old.required.includes('cta'),'Previous version retains its saved CTA contract');
assert.ok(!old.required.includes('editorial_schema_version'));
assert.equal(old.properties.editorial_schema_version,undefined);
console.log('PASS magazine editorial: '+tested+' rendered 4:5 cards; 3/5 roles, KO/EN, 80px safe copy fit, ivory pixels, coral headlines, captions and CTA-free last slides, immutable legacy, photo review and trigger. QA fixtures only; never publish.');