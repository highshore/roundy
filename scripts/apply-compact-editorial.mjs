import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function replace(s,from,to,label){if(!s.includes(from))throw new Error('Missing integration anchor: '+label);return s.replace(from,()=>to);}
function between(s,start,end,to,label){const a=s.indexOf(start),b=s.indexOf(end,a+start.length);if(a<0||b<0)throw new Error('Missing integration bounds: '+label);return s.slice(0,a)+to+s.slice(b);}
{
 const p='src/lib/marketing-content-policy.ts';let s=read(p);
 s="import {EDITORIAL_PRESET, compactContentSchema, compactWritingInstructions, normalizeCompactDocument, compactQualityIssues, buildBilingualCaption, isCompactDocument, hasObsoletePositioning} from './marketing-presentation';\n"+s;
 s=replace(s,'export const CONTENT_POLICY_VERSION = 3;','export const CONTENT_POLICY_VERSION = 4;','policy version');
 s=s.replaceAll('the English-only 1:1 format','the in-person 1:1 mingle format');
 s=s.replaceAll('ACTUAL non-invasive English opener','ACTUAL non-invasive opener in the primary post language');
 s=s.replaceAll('Korean posts may explain these original English sentences in Korean.','Korean posts should use natural Korean conversation examples.');
 s=replace(s,'export function contentSchema(type:PostType){','function roleContentSchema(type:PostType){','schema rename');
 s=replace(s,'const AIISH_PHRASES={',"export function contentSchema(type:PostType,language='ko'){return compactContentSchema(roleContentSchema(type),language);}\nconst AIISH_PHRASES={",'schema extension');
 s=replace(s,"'COVER: specific tension/question or useful promise, 10-64 characters; short subhead <=100 characters, no dense paragraph. It should make sense without Roundy branding. No clickbait certainty, fake urgency, guaranteed engagement or algorithm promises.'","'COVER: short specific tension/question or useful promise. Aim for Korean 8-22 characters or English 3-9 words. Short subhead, no dense paragraph. No fake urgency or algorithm promises.'",'cover copy');
 s=replace(s,"'Body cards: 30-230 characters each; examples must be concrete. Optional highlight <=80 characters (empty when unused). options only for contrast/options/checklist. Caption <=1300 characters; CTA <=70.'","'Body cards: one concrete point, Korean 40-90 characters / English 8-20 words. One optional highlight, not a repeated paragraph. options only for contrast/options/checklist. Captions are short bilingual summaries; CTA <=70.'",'compact body');
 s=replace(s,'Roundy is an English-only 1:1 mingle in Seoul, NOT an English class or language exchange.','Roundy is a 1:1 mingle in Seoul for Korean and international adults, including Korean-Korean meetings, NOT a language class or language exchange.','brand positioning');
 s=replace(s,"language==='en'?'All copy is natural English; no Korean translations.':'Natural Korean copy that sounds spoken, not translated. Original book/author names and original English conversation examples may remain English. Do not translate the entire post twice.'","language==='en'?'Primary title/body/highlight are English; secondary_body is Korean.':'Primary title/body/highlight are Korean; secondary_body is English. Original book titles/authors may remain English on the book card.'",'bilingual primary language');
 s=replace(s,"'MBTI/archetypes/quizzes are entertainment and self-reflection only. No diagnostic scores or gender stereotypes. No Middle Dot in Korean prose.'].join('\\n');","'MBTI/archetypes/quizzes are entertainment and self-reflection only. No diagnostic scores or gender stereotypes. No Middle Dot in Korean prose.'].join('\\n')+'\\n'+compactWritingInstructions(language);",'presentation prompt integration');
 s=replace(s,"const c=value as Row,slides=Array.isArray(c.slides)?c.slides:[],profile=CONTENT_PROFILES[type];","const c=normalizeCompactDocument(value as Row,language),slides=Array.isArray(c.slides)?c.slides:[],profile=CONTENT_PROFILES[type];for(const issue of compactQualityIssues(c,language))add(issue);",'normalized validation');
 s=replace(s,'str(cover.title).length<10','str(cover.title).length<6','short Korean hooks');
 s=replace(s,"if(language==='en'&&/[가-힣]/.test(all))","if(language==='en'&&!isCompactDocument(c)&&/[가-힣]/.test(all))",'legacy language gate');
 s=replace(s,"if(type==='conversation_prompt')for(const role of ['opener','followup']){const s=slides.find((v:Row)=>v.role===role);if(!s||!/\\?/.test(s.body+' '+s.highlight)||!/[A-Za-z]{3}/.test(s.body+' '+s.highlight))add('실제로 사용할 영어 질문과 후속 질문이 필요합니다.');}","if(type==='conversation_prompt')for(const role of ['opener','followup']){const s=slides.find((v:Row)=>v.role===role);if(!s||!/[?？]/.test(s.body+' '+s.highlight))add('실제로 사용할 질문과 후속 질문이 필요합니다.');}",'language-neutral questions');
 s=replace(s,"if(/\\b(qualified|screened|vetted|elite|high[- ]caliber|high[- ]status)\\b", "if(hasObsoletePositioning(all))add('현재 브랜드 설명과 맞지 않는 English-only 표현이 있습니다.');\n if(/\\b(qualified|screened|vetted|elite|high[- ]caliber|high[- ]status)\\b",'obsolete positioning block');
 const a=s.indexOf('export function prepareContent(');if(a<0)throw new Error('prepareContent missing');
 s=s.slice(0,a)+`export function prepareContent(value:Row,type:PostType,language:string,sources:Evidence[]){
 const document=normalizeCompactDocument(value,language),report=evaluateContent(document,type,language,sources),profile=CONTENT_PROFILES[type];
 const entertainment=['mbti','dating_archetype','mini_quiz'].includes(type);
 const disclaimerKo=entertainment?'재미와 자기 성찰을 위한 콘텐츠이며 성격이나 궁합을 판정하지 않습니다.':'';
 const disclaimerEn=entertainment?'For entertainment and reflection, not a personality or compatibility assessment.':'';
 const used=new Set<string>();for(const s of document.slides||[])for(const id of s.source_ids||[])used.add(id);if(type==='book_insight')used.add(document.book?.source_id);
 const cited=sources.filter(s=>used.has(s.id));
 const slides=(document.slides||[]).map((s:Row,i:number)=>{
  const labels=(s.source_ids||[]).map((id:string)=>sources.find(x=>x.id===id)?.title).filter(Boolean);
  const source=type==='book_insight'&&['book','insight'].includes(s.role)?document.book.title+' / '+document.book.author:document.study?.title&&['finding','context','limitation'].includes(s.role)?document.study.title+' ('+document.study.publication_year+')':labels.join(' / ');
  return {...s,variant:s.role==='cover'?'hook':s.role==='cta'?'roundy':s.role,source_label:source,footer_note:s.role==='cta'?(language==='ko'?disclaimerKo:disclaimerEn):''};
 });
 let caption:string;
 if(isCompactDocument(document))caption=buildBilingualCaption(document,cited,disclaimerKo,disclaimerEn);
 else caption=[str(document.caption),language==='ko'?'서울에서 만나는 1:1 밍글, Roundy.':'Roundy — a 1:1 mingle in Seoul.',cited.length?'출처 / Sources\\n'+cited.map(s=>s.title+' — '+s.url).join('\\n'):'', '@roundy.meet | roundy.team'].filter(Boolean).join('\\n\\n');
 if(caption.length>2000){report.issues.push('출처를 포함한 캡션이 2,000자를 넘습니다.');report.status='rejected';}
 return {document:{...document,content_language:language},report,slides,caption,cta:str(document.cta),sources:cited,profile:profile.label};
}
`;
 write(p,s);
}
{
 const p='src/lib/marketing-editorial.ts';let s=read(p);
 s="import {isCompactDocument,bilingualCaptionIssues} from './marketing-presentation';\nimport {renderCompactEditorial,type EditorialAssets} from './marketing-visuals';\n"+s;
 s=s.replaceAll('contentSchema(type)','contentSchema(type,language)');
 s=replace(s,'const prepared=prepareContent(document,type,language,sources);','const prepared=prepareContent(document,type,language,sources);document=prepared.document;','normalized document persistence');
 s=replace(s,"if(eventCard){eventCard.body=[facts.title,new Date(facts.starts_at).toLocaleString(language==='ko'?'ko-KR':'en-GB',{timeZone:'Asia/Seoul'} )+' KST',facts.venue||facts.neighborhood].filter(Boolean).join('\\n');eventCard.source_label=language==='ko'?'관리자가 등록한 정식 이벤트':'Published Roundy event';}","if(eventCard){const factsText=[facts.title,new Date(facts.starts_at).toLocaleString(language==='ko'?'ko-KR':'en-GB',{timeZone:'Asia/Seoul'})+' KST',facts.venue||facts.neighborhood].filter(Boolean).join('\\n');eventCard.body=factsText;eventCard.body_ko=[facts.title,new Date(facts.starts_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' KST',facts.venue||facts.neighborhood].filter(Boolean).join('\\n');eventCard.body_en=[new Date(facts.starts_at).toLocaleString('en-GB',{timeZone:'Asia/Seoul'})+' KST',facts.venue||facts.neighborhood].filter(Boolean).join('\\n');eventCard.source_label='Roundy에 등록된 행사 정보 / Published event';}",'event facts in both languages');
 s=replace(s,"return evaluateContent({...document,caption:draft.caption,cta:draft.cta},type,draft.content_language||'ko',draft.research_sources||[]);","const report=evaluateContent({...document,caption:isCompactDocument(document)?document.caption:draft.caption,cta:draft.cta},type,draft.content_language||'ko',draft.research_sources||[]);if(isCompactDocument(document)){const issues=bilingualCaptionIssues(String(draft.caption||''));report.issues.push(...issues);if(issues.length)report.status='rejected';}return report;",'bilingual recheck');
 const a=s.indexOf('// Rendering is deterministic:');if(a<0)throw new Error('renderer replacement anchor missing');
 s=s.slice(0,a)+`// All typography, official logo paths, source footnotes and contact details are server rendered.
export function editorialCard(slide:Row,index:number,total:number,document:Row,assets:EditorialAssets={}){return renderCompactEditorial(slide,index,total,document,assets);}
export function editorialPhotoCover(slide:Row,encoded:string){return renderCompactEditorial({...slide,role:'cover'},0,1,{},{photo:'data:image/jpeg;base64,'+encoded});}
`;
 write(p,s);
}
{
 const p='src/lib/marketing-generation.ts';let s=read(p);
 s="import {loadEditorialAssets} from './marketing-render-assets';\nimport {CONTENT_POLICY_VERSION} from './marketing-content-policy';\n"+s;
 s=between(s,'function normalizePositioning(','async function generateCopy(', '', 'remove obsolete unused positioning');
 s=replace(s,'async function renderCards(db:DB,draft:Row,job:Row){','async function renderCards(db:DB,draft:Row,job:Row,photoOverride?:string){','render assets signature');
 s=replace(s,' const urls:string[]=[];\n for(let i=0;i<cards.length;i++){',' const assets=await loadEditorialAssets();if(photoOverride)assets.photo=photoOverride;\n const urls:string[]=[];\n for(let i=0;i<cards.length;i++){','render shared assets');
 s=replace(s,'editorialCard(cards[i],i,cards.length,draft.content_document)','editorialCard(cards[i],i,cards.length,{...draft.content_document,slides:cards},assets)','shared branded render');
 s=replace(s,'One candid hyper-realistic editorial photograph for Roundy, an English-only 1:1 mingle in Seoul.','One candid editorial lifestyle photograph for Roundy, a Seoul-based 1:1 mingle for Korean and international adults. Korean-Korean meetings are also part of the service.','photo positioning');
 s=replace(s,'Compose vertically for Instagram 4:5 with breathing room for a headline overlay.','Compose vertically for Instagram 4:5: place the people in the upper half, leave clean dark negative space in the lower half for a bold Gothic headline and coral highlight. The same photograph will be reused as the closing card image. No sidebar, UI frame, artificial chart, text or logo.','photo art direction');
 s=replace(s," const cover=editorialPhotoCover(draft.carousel_slides[0],encoded);\n const jpeg=await sharp(Buffer.from(await cover.arrayBuffer())).jpeg({quality:88}).toBuffer();\n return [await storeImage(db,job,jpeg,0)];"," // One paid background, a complete server-rendered carousel. Never pay per card.\n return renderCards(db,draft,job,'data:image/jpeg;base64,'+encoded);",'full photo carousel');
 s=s.replace('content_policy_version:2','content_policy_version:CONTENT_POLICY_VERSION');
 write(p,s);
}
{
 const p='src/components/admin-marketing.tsx';let s=read(p);
 s=s.replaceAll('Editorial cards + contextual illustrations — no image AI charge','Approved coral editorial + brand photo — no image AI charge').replaceAll('에디토리얼 카드 + 유형별 일러스트 — 이미지 AI 비용 없음','승인한 코랄 에디토리얼 + 브랜드 사진 — 이미지 AI 비용 없음');
 s=s.replaceAll('Flare photo + Roundy logo — recommended for event/brand','New Flare background + full branded carousel').replaceAll('Flare 사진 + Roundy 로고 — 이벤트/브랜드 홍보 추천','새 Flare 배경 사진 + 전체 브랜드 캐러셀');
 s=s.replaceAll('Content language','Cover / headline language').replaceAll('콘텐츠 언어','표지 / 제목 언어');
 s=s.replaceAll('Card mode automatically adds a Roundy logo and contextual editorial illustration where it helps. Photo mode uses Flare for a 4:5 lifestyle image, then overlays the real Roundy mark server-side.','Default: photo-led cover, compact Korean/English content, and Roundy outro with Instagram + website. Official logo, coral and Gothic typography are composed server-side. Brand photography is reused; only New Flare requests a paid image.');
 s=s.replaceAll('카드 모드는 필요한 장면에 유형별 에디토리얼 일러스트와 Roundy 로고를 자동으로 넣습니다. 사진 모드는 Flare로 4:5 라이프스타일 이미지를 만든 뒤 실제 Roundy 마크를 서버에서 합성합니다.','사진형 표지 → 짧은 한영 본문 → 라운디 소개 카드로 구성합니다. 공식 로고, 코랄색, 고딕체와 작은 출처 표기를 서버에서 합성합니다. 기본은 기존 브랜드 사진을 재사용하며 새 Flare 사진을 선택할 때만 이미지 API를 호출합니다.');
 s=s.replace("const cost=renderOnly?'$0':photo?'$0.05':","const cost=renderOnly?'$0':photo?(mode==='both'?'$0.07':'$0.05'):");
 const anchor="     <p className=\"admin-help\">{t('Default: photo-led cover";
 // A visible explanation of curation provenance; no invented search-volume badge.
 const generatorButton="     <button type=\"button\" className=\"admin-primary\" disabled={busy||!!running||blocked} onClick={()=>void generate(false)}>";
 if(!s.includes(generatorButton))throw new Error('generator button anchor missing');
 s=s.replace(generatorButton,()=>"     <p className=\"admin-help\">{t('Caption order: Korean → English → sources → tagline and 5 relevant tags. Tags are selected for topic relevance; live search volume is not measured.','캡션 순서: 국문 → 영어 → 출처 → 태그라인과 관련 태그 5개. 태그는 주제 관련성으로 선별하며 실시간 검색량 순위는 아닙니다.')}</p>\n"+generatorButton);
 write(p,s);
}
{
 const p='next.config.ts';let s=read(p);
 s=replace(s,'{ poweredByHeader: false,','{ poweredByHeader: false, outputFileTracingIncludes: {\'/*\':[\'./public/images/discovery-hero-v2-poster.webp\',\'./node_modules/@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff\']},','trace brand assets');
 write(p,s);
}
{
 const p='scripts/test-marketing-generation.mjs';let s=read(p);
 s=replace(s,"if(name==='server-only')return {};","if(name==='./marketing-render-assets')return {loadEditorialAssets:async()=>({photo:null,fonts:[]})};if(name==='server-only')return {};",'mock free render assets');
 s=s.replace('CONTENT_POLICY_VERSION,3','CONTENT_POLICY_VERSION,4');
 s=replace(s,"check(()=>assert.ok(editorialSource.includes('roundyMark')));\ncheck(()=>assert.ok(editorialSource.includes('visualMotif')));\ncheck(()=>assert.ok(editorialSource.includes(\"roundyLockup(46,true)\")));","const visualSource=fs.readFileSync(new URL('../src/lib/marketing-visuals.ts',import.meta.url),'utf8');\ncheck(()=>assert.ok(visualSource.includes('OFFICIAL_ROUNDY_PATHS')));\ncheck(()=>assert.ok(visualSource.includes('roundy.team')||visualSource.includes('BRAND.website')));\ncheck(()=>assert.ok(editorialSource.includes('renderCompactEditorial')));",'renderer contract checks');
 write(p,s);
 const fixturePath='scripts/marketing-fixtures.cjs';let fixture=read(fixturePath);
 fixture=fixture.replaceAll('English-only 1:1 mingle','1:1 mingle').replaceAll('English-only','in-person').replaceAll('영어로 진행되는 1:1','직접 만나는 1:1').replaceAll('서울에서 영어로','서울에서 직접');
 write(fixturePath,fixture);
 const rp='scripts/test-marketing-renderer.mjs';let r=read(rp);
 r=r.replaceAll("'src/lib/marketing-editorial.ts','utf8'","'src/lib/marketing-visuals.ts','utf8'");
 r=r.replaceAll("source.includes('visualMotif')","source.includes('compactEditorialTree')").replaceAll("source.includes('roundyLockup')","source.includes('officialRoundyLogo')");
 write(rp,r);
}
console.log('Compact editorial preset integrated. No live generation, publication or budget mutation performed.');
