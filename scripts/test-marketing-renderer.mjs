import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const nodeRequire=createRequire(import.meta.url),ts=nodeRequire('typescript'),sharp=nodeRequire('sharp'),{fixture}=nodeRequire('./marketing-fixtures.cjs'),cache={};
function load(file){if(cache[file])return cache[file];const context={exports:{},URL,Buffer,console,require:n=>n==='server-only'?{}:n==='./supabase/service'?{createServiceRoleClient:()=>({})}:n.startsWith('./')&&fs.existsSync('src/lib/'+n.slice(2)+'.ts')?load('src/lib/'+n.slice(2)+'.ts'):nodeRequire(n)};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context);return cache[file]=context.exports;}
const p=load('src/lib/marketing-content-policy.ts'),e=load('src/lib/marketing-editorial.ts');fs.mkdirSync('quality-artifacts',{recursive:true});
const hashes=new Set();
for(const language of ['en','ko']){const doc=fixture('book_insight',language,p.CONTENT_PROFILES),sources=[{id:'S1',url:'https://publisher.example/listening',title:'Listening Across Difference by Alex Lee',evidence:'Listening Across Difference by Alex Lee explains attentive listening.'}],prepared=p.prepareContent(doc,'book_insight',language,sources);for(let i=0;i<prepared.slides.length;i++){const png=Buffer.from(await e.editorialCard(prepared.slides[i],i,prepared.slides.length,{...prepared.document,content_language:language}).arrayBuffer());const info=await sharp(png).metadata();assert.equal(info.width,1080);assert.equal(info.height,1350);if(i===0){
 const contrastPixel=await sharp(png).extract({left:540,top:190,width:1,height:1}).removeAlpha().raw().toBuffer();
 assert.ok(Math.max(...contrastPixel)<160,
  'LEGACY_COVER_WHITE_TEXT_ON_BRIGHT_BACKGROUND: '+language+' RGB='+Array.from(contrastPixel).join(','));
}
hashes.add(createHash('sha256').update(png).digest('hex'));await sharp(png).jpeg({quality:85}).toFile('quality-artifacts/'+language+'-'+i+'.jpg');}}
assert.equal(hashes.size,12);
const layout=load('src/lib/marketing-carousel-template.ts');
const standard=load('src/lib/marketing-visuals.ts');
// These pixels test the actual ImageResponse renderer, not a CSS or Figma mock.
const brightPhoto=await sharp({create:{width:1080,height:1350,channels:3,background:'#acd9c8'}}).jpeg().toBuffer();
const backdrop='data:image/jpeg;base64,'+brightPhoto.toString('base64');
function collectText(node,out=[]){
 if(typeof node==='string'){out.push(node);return out;}
 if(!node||typeof node!=='object')return out;
 if(Array.isArray(node)){node.forEach(n=>collectText(n,out));return out;}
 if(Array.isArray(node.props?.children))node.props.children.forEach(n=>collectText(n,out));
 else if(node.props?.children)collectText(node.props.children,out);
 return out;
}
const samplePixel=async(jpg,x,y)=>Array.from(await sharp(jpg).extract({left:x,top:y,width:1,height:1}).removeAlpha().raw().toBuffer());
let standardCards=0;
for(const language of ['en','ko'])for(const count of [3,5]){
 const plan=layout.resolveCarouselPlan({carousel_mode:count===5?'fixed':'alternating',
  carousel_title_font_size_px:72,carousel_body_font_size_px:36},count===5?null:1);
 const cards=Array.from({length:count},(_,i)=>({
  role:i===0?'cover':i===count-1?'cta':'content',
  title:language==='ko'?['서울에서 직접 만나는 방법','함께 확인할 실용적인 정보','로테이션 소개팅 Roundy'][i===0?0:i===count-1?2:1]
   :['Meet people in Seoul','One clear practical detail','Explore Roundy'][i===0?0:i===count-1?2:1],
  body:language==='ko'?'핵심 정보를 먼저 설명하고 다음 행동을 간결하게 안내합니다.':'A specific takeaway comes first, followed by clear useful context.',
  source_label:i===1?'Verified source':null
 }));
 const doc={design_preset:'roundy_compact_editorial_v1',content_language:language,carousel_template:plan};
 for(let i=0;i<count;i++){
  const assets={cardPhotos:{0:backdrop,1:backdrop,2:backdrop},
   cardCredits:{0:'QA photo / example only',1:'Photo: Wikimedia Commons / Creator',2:'QA photo / example only'},
   reusePhotos:false};
  const tree=standard.standardCarouselTree(cards[i],i,count,doc,assets);
  const label=collectText(tree).join(' | ');
  assert.doesNotMatch(label,/\b\d\d\s*\/\s*\d\d\b/,'No page counters on any card');
  assert.ok(JSON.stringify(tree).includes('#ff6666'),'Brand coral must be used for accent text');
  if(i===count-1){
   assert.ok(label.includes('@roundy.meet')&&label.includes('roundy.team'));
   assert.ok(label.includes(language==='ko'?'Roundy 둘러보기':'Explore Roundy'));
   assert.equal((JSON.stringify(tree).match(/"viewBox":"0 0 96 96"/g)||[]).length,1,
    'CTA must have only the official top-left logo and no extra symbol decoration');
  }
  const jpg=Buffer.from(await standard.renderCompactEditorial(cards[i],i,count,doc,assets).arrayBuffer());
  const meta=await sharp(jpg).metadata();
  assert.equal(meta.width,1080);assert.equal(meta.height,1350);assert.ok(jpg.length>1000);
  const paper=await samplePixel(jpg,540,175);
  assert.ok(Math.min(...paper)>230,'TOP_MUST_REMAIN_IVORY: '+language+'/'+count+'/'+i+' '+paper);
  if(i===0||i===1||(count===5&&i===2)){
   const photoPixel=await samplePixel(jpg,540,1050);
   assert.ok(photoPixel[0]>135&&photoPixel[0]<210&&photoPixel[1]>180&&photoPixel[2]>160,
    'PHOTOGRAPH_MUST_RETAIN_UNOVERLAID_COLORS: '+language+'/'+count+'/'+i+' '+photoPixel);
  }
  await sharp(jpg).jpeg({quality:85}).toFile('quality-artifacts/standard-'+count+'-'+language+'-'+i+'.jpg');
  standardCards++;
 }
}
assert.equal(standardCards,16);
// Photo credit is on the ivory baseline, inside the 80px safe area. Its
// original URL, full license, and photographer remain in the existing caption pipeline.
const samplePlan=layout.resolveCarouselPlan({carousel_mode:'fixed'},null);
const sampleCards=[{role:'cover',title:'Meet in Seoul',body:'Roundy source test'},
 {role:'content',title:'Original source',body:'Photo with an on-card credit'},
 {role:'content',title:'Information',body:'Roundy source test'},
 {role:'content',title:'Information',body:'Roundy source test'},
 {role:'cta',title:'Join Roundy',body:'Learn more'}];
const sampleTree=standard.standardCarouselTree(sampleCards[1],1,5,{
 content_language:'en',carousel_template:samplePlan
},{cardPhotos:{1:backdrop},cardCredits:{1:'Photo: Wikimedia Commons / Creator'},reusePhotos:false});
const treeText=JSON.stringify(sampleTree);
assert.ok(treeText.includes('Photo: Wikimedia Commons / Creator'),'Visible on-card credit must survive');
assert.ok(treeText.includes('"top":1224'),'Credit must stay in the bottom image-safe area');
assert.ok(!treeText.includes('rgba(13,18,15,.83)'),'No opaque photograph scrim');
const source=fs.readFileSync('src/lib/marketing-visuals.ts','utf8');
assert.ok(source.includes('M22 40C28.6274'));
assert.ok(source.includes('compactEditorialTree'));
assert.ok(source.includes('officialRoundyLogo'));

// Render the complete 5-card QA set through the same production ImageResponse
// function. These three internal site visuals are TEST FIXTURES, NOT confirmed
// licensed/administrator-approved marketing assets and MUST NOT be published.
const photoPaths=['public/images/discovery-offline.webp','public/images/roundy-mingle-hero-photo.webp','public/images/discovery-hero-poster.webp'];
for(const path of photoPaths)assert.ok(fs.existsSync(path),'Internal fixture missing: '+path);
const demoPhotos={};
for(let i=0;i<3;i++){
 const raw=await sharp(fs.readFileSync(photoPaths[i])).resize(1080,1350,{fit:'cover'}).jpeg({quality:84}).toBuffer();
 demoPhotos[i]='data:image/jpeg;base64,'+raw.toString('base64');
}
const demoCredits=Object.fromEntries([0,1,2].map(i=>[i,'QA FIXTURE / internal site media']));
const demoCards=[
 {role:'cover',eyebrow:'SEOUL / DATING GUIDE',title:'서울 첫 만남, 산책부터 시작하세요',body:'큰 계획보다 걷기 좋은 동선 하나가 편안한 대화에 도움이 됩니다.'},
 {role:'content',title:'처음엔 걷기 좋은 장소',body:'너무 시끄럽지 않고, 서로의 걸음에 맞춰 이야기할 수 있는 길을 먼저 살펴보세요.',highlight:'TIP 01 · 대화하기 좋은 동선'},
 {role:'content',title:'중간에 쉬어갈 카페',body:'산책 중 부담 없이 앉을 수 있는 곳을 미리 확인하면 첫 만남의 긴장이 줄어듭니다.',highlight:'TIP 02 · 쉬어갈 곳 하나'},
 {role:'content',title:'중요한 건 대화의 속도',body:'일정을 빽빽하게 채우기보다 상대의 이야기에 귀 기울일 시간을 남겨두세요.',highlight:'한 번에 한 사람에게 집중'},
 {role:'cta',title:'서울에서 자연스럽게 만나기',body:'한 사람씩 직접 만나고, 마음이 맞을 때 서로 연결됩니다.'}
];
const sheets=[];
for(let i=0;i<demoCards.length;i++){
 const image=standard.renderCompactEditorial(demoCards[i],i,5,{
  design_preset:'roundy_compact_editorial_v1',content_language:'ko',carousel_template:samplePlan
 },{cardPhotos:demoPhotos,cardCredits:demoCredits,reusePhotos:false});
 const png=Buffer.from(await image.arrayBuffer());
 const meta=await sharp(png).metadata();
 assert.equal(meta.width,1080);assert.equal(meta.height,1350);
 const out='quality-artifacts/roundy-bright-five-ko-'+String(i+1).padStart(2,'0')+'.jpg';
 await sharp(png).jpeg({quality:88}).toFile(out);
 sheets.push(await sharp(png).resize(270,338).jpeg({quality:85}).toBuffer());
}
await sharp({create:{width:1350,height:338,channels:3,background:'#fffefa'}})
 .composite(sheets.map((input,i)=>({input,left:i*270,top:0}))).jpeg({quality:86})
 .toFile('quality-artifacts/roundy-bright-five-contact-sheet.jpg');
console.log('PASS: legacy and 3/5 bright carousel ImageResponse pixel tests, 5-card QA images, credits and no page counters. QA visuals are unapproved fixtures; NO publication.');
