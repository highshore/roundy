import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const nodeRequire=createRequire(import.meta.url),ts=nodeRequire('typescript'),sharp=nodeRequire('sharp'),{fixture}=nodeRequire('./marketing-fixtures.cjs'),cache={};
function load(file){if(cache[file])return cache[file];const context={exports:{},URL,Buffer,console,require:n=>n==='server-only'?{}:n==='./supabase/service'?{createServiceRoleClient:()=>({})}:n.startsWith('./')&&fs.existsSync('src/lib/'+n.slice(2)+'.ts')?load('src/lib/'+n.slice(2)+'.ts'):nodeRequire(n)};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context);return cache[file]=context.exports;}
const p=load('src/lib/marketing-content-policy.ts'),e=load('src/lib/marketing-editorial.ts');fs.mkdirSync('quality-artifacts',{recursive:true});
const hashes=new Set();
for(const language of ['en','ko']){const doc=fixture('book_insight',language,p.CONTENT_PROFILES),sources=[{id:'S1',url:'https://publisher.example/listening',title:'Listening Across Difference by Alex Lee',evidence:'Listening Across Difference by Alex Lee explains attentive listening.'}],prepared=p.prepareContent(doc,'book_insight',language,sources);for(let i=0;i<prepared.slides.length;i++){const png=Buffer.from(await e.editorialCard(prepared.slides[i],i,prepared.slides.length,{...prepared.document,content_language:language}).arrayBuffer());const info=await sharp(png).metadata();assert.equal(info.width,1080);assert.equal(info.height,1350);hashes.add(createHash('sha256').update(png).digest('hex'));await sharp(png).jpeg({quality:85}).toFile('quality-artifacts/'+language+'-'+i+'.jpg');}}
assert.equal(hashes.size,12);
const layout=load('src/lib/marketing-carousel-template.ts');
const standard=load('src/lib/marketing-visuals.ts');
const brightPhoto=await sharp({create:{width:1080,height:1350,channels:3,background:'#ffffff'}}).jpeg().toBuffer();
const backdrop='data:image/jpeg;base64,'+brightPhoto.toString('base64');
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
 const doc={design_preset:'roundy_compact_editorial_v1',content_language:language,
  carousel_template:plan};
 for(let i=0;i<count;i++){
  const image=standard.renderCompactEditorial(cards[i],i,count,doc,{cardPhotos:{0:backdrop,1:backdrop},reusePhotos:false});
  const jpg=Buffer.from(await image.arrayBuffer());
  const meta=await sharp(jpg).metadata();
  assert.equal(meta.width,1080);assert.equal(meta.height,1350);
  assert.ok(jpg.length>1000);
  if(i===0||i===1){
   // White photography must not create invisible white-on-white headlines.
   // Pixel-level QA complements geometry-only render smoke tests.
   const photoPixel=await sharp(jpg)
    .extract({left:540,top:175,width:1,height:1}).removeAlpha().raw().toBuffer();
   assert.ok(Math.max(...photoPixel)<160,
    'BRIGHT_PHOTO_SCRIM_MISSING: '+count+' '+language+' card '+(i+1)+' RGB='+Array.from(photoPixel).join(','));
   const {data:sample,info:sampleInfo}=await sharp(jpg)
    .extract({left:80,top:300,width:920,height:750})
    .removeAlpha().raw().toBuffer({resolveWithObject:true});
   let visibleInk=0;
   for(let p=0;p<sample.length;p+=sampleInfo.channels)
    if(sample[p]>200&&sample[p+1]>200&&sample[p+2]>200)visibleInk++;
   assert.ok(visibleInk>300&&visibleInk<200000,
    'TEXT_MISSING_OR_PHOTO_TOO_BRIGHT: '+count+' '+language+' '+i+' bright='+visibleInk);
  }
  await sharp(jpg).jpeg({quality:85}).toFile('quality-artifacts/standard-'+count+'-'+language+'-'+i+'.jpg');
  standardCards++;
 }
}
assert.equal(standardCards,16);
const source=fs.readFileSync('src/lib/marketing-visuals.ts','utf8');
assert.ok(source.includes('M22 40C28.6274'));
assert.ok(source.includes('compactEditorialTree'));
assert.ok(source.includes('officialRoundyLogo'));
console.log('PASS: 12 distinct 1080x1350 branded cards, including Korean glyphs. These are fixtures, not posted content.');
