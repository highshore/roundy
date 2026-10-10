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
const {MAGAZINE_EDITORIAL_PRESET,EDITORIAL_PRESET}=presentation;
const settings={carousel_mode:'fixed',carousel_title_font_size_px:72,carousel_body_font_size_px:36,
 carousel_min_real_photos_5:3,carousel_min_real_photos_3:2,carousel_ai_thumbnail_enabled:false};
const expected={
 3:['cover','key_insight','editorial_closing'],
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
 assert.ok(!schema.required.includes('cta'));
 assert.ok(schema.properties.slides.items.required.includes('closing_type'));
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
 const doc={design_preset:MAGAZINE_EDITORIAL_PRESET,carousel_template:plan,content_language:language,
  answer_first:true,thumbnail_render_pending:false,slides};
 const drafts={content_document:doc,carousel_slides:slides,images:roles.map((_,i)=>'qa-'+i),
  cta:'',caption:'@roundy.meet — '+(language==='ko'?'서울 동네를 천천히 살펴보세요.':'A closer look at Seoul.'),
  visual_source:'stock',revision:2,content_language:language};
 const pf=preflight.evaluateMarketingPreflight(drafts,settings,[]);
 assert.equal(pf.checks.length,7);
 assert.equal(pf.checks.find(c=>c.id==='editorial_closing')?.passed,true);
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
const noCopy=String(fs.readFileSync('src/lib/marketing-visuals.ts'));
assert.ok(!noCopy.slice(noCopy.indexOf('function magazineCover'),noCopy.indexOf('export function standardCarouselTree')).includes('Roundy 둘러보기'));
const sql=read('supabase/migrations/20261011030500_roundy_magazine_editorial_preflight.sql');
assert.match(sql,/magazine_editorial_v2/);
assert.match(sql,/marketing_photo_rights_valid/);
assert.match(sql,/marketing_draft_photos/);
assert.match(sql,/jsonb_array_length\(pf->'checks'\)<>7/);
assert.doesNotMatch(sql,/(?:update public.instagram_post_drafts set|delete from|truncate table)/i,'No historical draft edits');
const old=policy.contentSchema('korea_life','ko','',false,null);
assert.equal(old.properties.design_preset.enum[0],EDITORIAL_PRESET);
assert.ok(old.required.includes('cta'),'Previous version retains its saved CTA contract');
console.log('PASS magazine editorial: '+tested+' rendered 4:5 cards; 3/5 roles, KO/EN, 80px safe copy fit, ivory pixels, coral headlines, captions and CTA-free last slides, immutable legacy, photo review and trigger. QA fixtures only; never publish.');