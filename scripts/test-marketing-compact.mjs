import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),cache={};
function load(file){
 if(cache[file])return cache[file];
 const context={exports:{},Buffer,URL,AbortSignal,Intl,Date,process,console,setTimeout,clearTimeout,fetch,require:name=>{
  if(name.startsWith('./marketing-'))return load('src/lib/'+name.slice(2)+'.ts');
  return require(name);
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context,{filename:file});
 return cache[file]=context.exports;
}
const p=load('src/lib/marketing-presentation.ts'),policy=load('src/lib/marketing-content-policy.ts'),v=load('src/lib/marketing-visuals.ts');
let n=0;const check=f=>{f();n++;};
const {fixture}=require('./marketing-fixtures.cjs');
const evidence=[{id:'S1',url:'https://publisher.example/listening',title:'Listening Across Difference by Alex Lee',evidence:'TEST FIXTURE ONLY: Listening Across Difference by Alex Lee discusses attentive listening. This is not a real bibliographic citation.'}];
const koBodies={cover:'다음 질문보다, 방금 들은 말에 집중해보세요.',book:'이 예시 책은 상대의 말을 끝까지 듣는 태도를 다룹니다.',insight:'답을 준비하는 동안 상대의 말을 놓치고 있지는 않나요?',example:'“산책했어요.”라고 하면 “어디를 걸었어요?”라고 물어보세요.',practice:'상대가 쓴 단어 하나를 골라 후속 질문을 해보세요.',concept:'큰 모임 대신 한 사람씩 마주 앉아 대화하는 방식이에요.',cta:'서울에서 한 사람씩 만나보세요.'};
const enBodies={cover:'Stay with their answer before preparing the next question.',book:'This fixture book explores the practice of attentive listening.',insight:'Notice when planning your reply takes your attention away.',example:'They mention a walk. Ask which part of the route they liked.',practice:'Choose one detail from their answer for your next question.',concept:'Rotation Dating gives each conversation its own turn instead of putting everyone into one group.',cta:'Join Rotation Dating in Seoul.'};
function compactFixture(type='book_insight',lang='ko'){
 const d=fixture(type,lang,policy.CONTENT_PROFILES);
 d.design_preset=p.EDITORIAL_PRESET;d.caption_ko='다음 질문을 찾기 전에, 상대가 방금 한 말에 답해보세요.';d.caption_en='Before searching for another question, respond to what they just said.';
 d.caption=lang==='ko'?d.caption_ko:d.caption_en;d.tagline=lang==='ko'?'첫 대화에서 써볼 한 가지':'One thing to try in a first conversation';d.hashtags=['#독서','#대화법','#unrelated'];
 d.slides=d.slides.map(s=>({...s,title:s.title,body:(lang==='ko'?koBodies:enBodies)[s.role]||s.body,secondary_body:(lang==='ko'?enBodies:koBodies)[s.role]||'A short test example.',highlight:'',options:[]}));
 return d;
}
for(const lang of ['ko','en'])for(const type of ['prelaunch','book_insight']){
 const d=compactFixture(type,lang),schema=policy.contentSchema(type,lang);
 check(()=>assert.equal(schema.properties.design_preset.enum[0],p.EDITORIAL_PRESET));
 check(()=>assert.ok(schema.properties.slides.items.required.includes('secondary_body')));
 const prepared=policy.prepareContent(d,type,lang,type==='book_insight'?evidence:[]);
 check(()=>assert.equal(prepared.report.status,'passed',JSON.stringify(prepared.report)));
 check(()=>assert.ok(prepared.caption.indexOf(d.caption_ko)<prepared.caption.indexOf(d.caption_en)));
 check(()=>assert.ok(prepared.caption.indexOf(d.caption_en)<prepared.caption.indexOf('출처 / Sources')));
 check(()=>assert.ok(prepared.caption.includes('@roundy.meet')&&prepared.caption.includes('roundy.team')));
 check(()=>assert.equal(prepared.document.hashtag_selection.search_volume_verified,false));
 check(()=>assert.equal(prepared.document.hashtags.length,5));
 check(()=>assert.equal(p.hasObsoletePositioning(prepared.caption),false));
 check(()=>assert.ok(prepared.slides.at(-1).instagram==='@roundy.meet'&&prepared.slides.at(-1).website==='roundy.team'));
 if(type==='book_insight')check(()=>assert.ok(prepared.caption.includes(evidence[0].url)));
 const withOldClaim=structuredClone(d);withOldClaim.caption_en='Roundy is English-only.';
 check(()=>assert.equal(policy.prepareContent(withOldClaim,type,lang,type==='book_insight'?evidence:[]).report.status,'rejected'));
 const long=structuredClone(d);long.slides[1].body='긴 설명 '.repeat(100);
 check(()=>assert.equal(policy.prepareContent(long,type,lang,type==='book_insight'?evidence:[]).report.status,'rejected'));
}
check(()=>assert.equal(p.curateHashtags('conversation_prompt',['#1:1밍글','#nonsense','#대화법']).length,5));
check(()=>assert.ok(!p.curateHashtags('conversation_prompt',['#nonsense']).includes('#nonsense')));
check(()=>assert.equal(p.hasObsoletePositioning('서울에서 만나는 1:1 밍글'),true));check(()=>assert.equal(p.hasObsoletePositioning('서울에서 만나는 로테이션 소개팅'),false));
check(()=>assert.equal(p.hasObsoletePositioning('영어로만 진행합니다'),true));
check(()=>assert.equal(p.bilingualCaptionIssues('English-only').length>0,true));
const actual=fs.readFileSync('src/components/roundy-brand.tsx','utf8');
const paths=[...actual.matchAll(/<path d="([^"]+)"/g)].map(m=>m[1]);
check(()=>assert.deepEqual(Array.from(v.OFFICIAL_ROUNDY_PATHS),paths));
const css=fs.readFileSync('src/app/globals.css','utf8');check(()=>assert.ok(css.includes('--brand:'+p.ROUNDY_IDENTITY.accent)));
const g=fs.readFileSync('src/lib/marketing-generation.ts','utf8');
check(()=>assert.ok(g.includes('return renderCards(db,draft,job,\'data:image/jpeg;base64,\'+encoded)')));
check(()=>assert.ok(!g.includes('English-only 1:1 mingle')));check(()=>assert.ok(g.includes('Rotation Dating service')));
const design=fs.readFileSync('src/lib/marketing-visuals.ts','utf8');
check(()=>assert.ok(!design.includes('borderLeft')&&!design.includes('visualMotif')));
check(()=>assert.ok(design.includes("fontFamily:assets.fonts?.length?'Roundy Gothic, sans-serif':'sans-serif'")));
if(process.argv.includes('--render')){
 const sharp=require('sharp'),assets=await load('src/lib/marketing-render-assets.ts').loadEditorialAssets();
 fs.mkdirSync('quality-artifacts/compact',{recursive:true});
 const thumbs=[];
 for(const lang of ['ko','en']){
  const prepared=policy.prepareContent(compactFixture('book_insight',lang),'book_insight',lang,evidence);
  for(let i=0;i<prepared.slides.length;i++){
   const img=v.renderCompactEditorial(prepared.slides[i],i,prepared.slides.length,{...prepared.document,slides:prepared.slides},assets);
   const bytes=Buffer.from(await img.arrayBuffer()),meta=await sharp(bytes).metadata();
   assert.equal(meta.width,1080);assert.equal(meta.height,1350);
   await sharp(bytes).jpeg({quality:87}).toFile('quality-artifacts/compact/'+lang+'-'+i+'.jpg');
   if(lang==='ko')thumbs.push(await sharp(bytes).resize(270,338).jpeg().toBuffer());
  }
 }
 await sharp({create:{width:810,height:676,channels:3,background:'#e9e9e7'}}).composite(thumbs.map((input,i)=>({input,left:(i%3)*270,top:Math.floor(i/3)*338}))).jpeg({quality:85}).toFile('quality-artifacts/compact/contactsheet.jpg');
 console.log('Rendered 12 branded Gothic cards, both languages. QA fixtures only, no publication. Fonts loaded: '+assets.fonts?.map(f=>f.name+':'+f.weight).join(', '));
}
console.log('PASS '+n+' compact editorial assertions. No paid API calls.');
