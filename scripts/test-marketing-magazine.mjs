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
// Real information-rich editorial fixtures from Seoul Metropolitan Government
// public materials. These images remain local QA previews, NEVER approved assets.
const editorialPlan=layout.resolveCarouselPlan(settings);
const officialSources={
 forest:'https://english.seoul.go.kr/%EA%B3%B5%EC%9B%90/?pidx=11',
 garden:'https://english.seoul.go.kr/experience-the-beauty-of-traditional-korean-gardens-at-namsan-as-korean-forest-garden-opens-june-27/',
 parks:'https://english.seoul.go.kr/wp-content/uploads/2026/03/2026_guidebook_EN.pdf'
};
const richSamples=[
 {index:1,expectedLayout:'photo',slug:'photo-context',
  title:'서울숲, 다섯 풍경',highlight:'숲길과 연못',
  body:'서울숲은 2005년 6월 문을 연 도심 공원으로, 뚝섬문화예술공원과 생태숲 등 다른 성격의 공간을 한곳에 모았습니다. 연못과 숲길을 번갈아 걸으며 한 장소에서도 산책 동선을 다르게 짤 수 있습니다.',
  source_label:'서울특별시 공원 안내',source_ids:['S1'],reference:officialSources.forest},
 {index:2,expectedLayout:'information',slug:'information-insight',
  title:'남산 한국숲정원, 11개 정원',highlight:'폐식물원 부지를 재구성한 도심 정원',
  body:'남산 한국숲정원은 2026년 6월 27일 개장한 약 3만㎡ 규모의 정원입니다. 서울시는 기존 남산 야외식물원 부지를 활용해 3개 주제로 나뉜 11개 정원을 만들었습니다. 전통적인 자연 경관을 현대적인 산책 공간으로 경험할 수 있다는 점이 핵심입니다.',
  source_label:'서울특별시, 2026년 7월 보도자료',source_ids:['S1'],reference:officialSources.garden},
 {index:3,expectedLayout:'split',slug:'split-insight',
  title:'서울숲 vs 월드컵공원',highlight:'도심 숲과 매립지 재생 공원의 차이',
  body:'서울숲과 월드컵공원은 같은 서울의 녹지이지만 경험이 다릅니다. 서울숲은 문화예술공원과 생태숲 등 여러 주제 공간을 가까이에서 옮겨 다니기 좋습니다. 반면 월드컵공원은 난지도 쓰레기 매립지를 생태공원으로 바꾼 장소로, 하늘공원과 노을공원 등 5개 공원으로 구성됩니다.',
  source_label:'서울특별시 2026 방문 가이드',source_ids:['S1'],reference:officialSources.parks}
];
const fixturePhotoPaths=['public/images/yeouido.webp',
 'public/images/roundy-mingle-hero-photo.webp','public/images/discovery-hero-poster.webp'];
const officialFixturePhotos=await Promise.all(fixturePhotoPaths.map(async path=>{
 assert.ok(fs.existsSync(path),'Image QA fixture required: '+path);
 return 'data:image/jpeg;base64,'+
  (await sharp(fs.readFileSync(path)).resize(900,1180,{fit:'inside'}).jpeg({quality:83}).toBuffer()).toString('base64');
}));
const editorialAssets={cardPhotos:{1:officialFixturePhotos[0],2:officialFixturePhotos[1],
 3:officialFixturePhotos[2]},cardCredits:{1:'QA / existing Roundy site photo',
 2:'QA / existing Roundy site photo',3:'QA / existing Roundy site photo'},reusePhotos:false};
const noOverlap=(a,b)=>a.x>=b.x+b.width||b.x>=a.x+a.width||
 a.y>=b.y+b.height||b.y>=a.y+a.height;
const fullCopy=value=>String(value).replace(/㎡/g,'m²').replace(/㎢/g,'km²')
 .replace(/㎞/g,'km').replace(/㎝/g,'cm').replace(/㎜/g,'mm').replace(/㎏/g,'kg').replace(/\s/gu,'');
let richRendered=0;
for(const sample of richSamples){
 assert.ok(sample.reference.startsWith('https://english.seoul.go.kr/'));
 const role=sample.index===1?'context':'insight';
 const slide={role,title:sample.title,body:sample.body,body_ko:sample.body,
  highlight:sample.highlight,source_label:sample.source_label,
  source_ids:sample.source_ids,closing_type:'none'};
 const fit=layout.magazineCarouselFit(slide,editorialPlan,sample.index,'ko');
 assert.equal(fit.editorial?.layout,sample.expectedLayout,sample.slug+' should auto-select '+sample.expectedLayout);
 assert.ok(fit.body.fontSize>=29,'Never shrink body copy below 29px');
 assert.equal(fullCopy(fit.body.lines.join('')),fullCopy(sample.body),'Body copy was shortened or lost');
 assert.equal(fullCopy(fit.title.lines.join('')),fullCopy(sample.title),'Headline was shortened or lost');
 assert.equal(fullCopy(fit.highlight.lines.join('')),fullCopy(sample.highlight),'Takeaway was shortened or lost');
 assert.ok(noOverlap(fit.editorial.titleRect,fit.editorial.photoRect));
 assert.ok(noOverlap(fit.editorial.bodyRect,fit.editorial.photoRect));
 assert.ok(noOverlap(fit.editorial.highlightRect,fit.editorial.photoRect));
 assert.ok(fit.editorial.bodyRect.y+fit.editorial.bodyRect.height<=1185);
 const doc={design_preset:MAGAZINE_EDITORIAL_PRESET,carousel_template:editorialPlan,content_language:'ko'};
 const tree=visuals.magazineCarouselTree(slide,sample.index,5,doc,editorialAssets);
 const json=JSON.stringify(tree);
 assert.ok(json.includes('objectFit')&&json.includes('contain'),'No subject-cropping photo fit');
 assert.ok(!json.includes('rgba(')&&!json.includes('Learn More')&&!json.includes('Roundy 둘러보기'));
 assert.ok(json.includes(sample.source_label),'Preserve source provenance');
 if(sample.slug==='information-insight'){
  assert.ok(json.includes('m²'),'Unicode square-meter units must be rendered legibly');
  assert.ok(!json.includes('㎡'),'Unsupported compatibility glyph must not be rasterized');
 }
 const raw=Buffer.from(await visuals.renderCompactEditorial(slide,sample.index,5,doc,editorialAssets).arrayBuffer());
 const meta=await sharp(raw).metadata();
 assert.equal(meta.width,1080);assert.equal(meta.height,1350);
 const output='quality-artifacts/magazine-body-'+sample.slug+'.jpg';
 await sharp(raw).jpeg({quality:88}).toFile(output);
 imagePaths.push(output);richRendered++;
}
// Korean long title + max-density body, English mixed numbers, and Hangul wrap.
const additionalCases=[
 {slug:'long-ko',index:2,language:'ko',
  title:'서울의 오래된 장소가 새로운 문화 공간으로 바뀌는 과정에서 생기는 차이',
  body:richSamples[1].body+' 계절에 따라 풍경과 이용 방식도 달라집니다.',
  highlight:'11개 정원, 3개 테마',expectedMinimum:30},
 {slug:'mixed-en',index:2,language:'en',
  title:'11 gardens, 3 themes in Seoul',
  body:'Seoul’s Korean Forest Garden opened June 27, 2026, transforming a roughly 30,000 m² site into 11 gardens organized around 3 themes. It offers a place to explore Korean forest landscapes through the seasons, not just one conventional garden path.',
  highlight:'30,000 m² in 3 themes',expectedMinimum:30}
];
for(const sample of additionalCases){
 const slide={role:'insight',title:sample.title,body:sample.body,
  body_ko:sample.language==='ko'?sample.body:'',
  body_en:sample.language==='en'?sample.body:'',
  highlight:sample.highlight,source_ids:['S1'],closing_type:'none'};
 const doc={design_preset:MAGAZINE_EDITORIAL_PRESET,carousel_template:editorialPlan,
  content_language:sample.language};
 const fit=layout.magazineCarouselFit(slide,editorialPlan,sample.index,sample.language);
 assert.ok(fit.body.fontSize>=sample.expectedMinimum);
 assert.equal(fullCopy(fit.body.lines.join('')),fullCopy(sample.body));
 assert.equal(fullCopy(fit.title.lines.join('')),fullCopy(sample.title));
 const raw=Buffer.from(await visuals.renderCompactEditorial(slide,sample.index,5,doc,editorialAssets).arrayBuffer());
 assert.equal((await sharp(raw).metadata()).width,1080);
 const output='quality-artifacts/magazine-body-'+sample.slug+'.jpg';
 await sharp(raw).jpeg({quality:85}).toFile(output);imagePaths.push(output);richRendered++;
}
console.log('PASS magazine body editorial: '+richRendered+' information-rich 1080x1350 QA renders; Photo, Information, Split layout selection, source labels, full Hangul copy, numeric/English text and collision checks.');

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