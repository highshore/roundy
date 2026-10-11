import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const cache={};
function load(file){
 if(cache[file])return cache[file];
 const module={exports:{}};cache[file]=module.exports;
 const js=ts.transpileModule(fs.readFileSync('src/lib/'+file+'.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
 }).outputText;
 const context={module,exports:module.exports,Date,Intl,URL,JSON,Set,Map,Math,console,
  require:name=>name.startsWith('./marketing-')?load(name.slice(2)):require(name)};
 vm.runInNewContext(js,context,{filename:file});
 return module.exports;
}
const story=load('marketing-editorial-storyboard');
const edit=load('marketing-manual-slide');
const answer=load('marketing-answer-first');
const policy=load('marketing-content-policy');
const pres=load('marketing-presentation');
const plan={version:1,mode:'alternating',slide_count:5,reservation_number:2,title_font_size_px:72,body_font_size_px:36};
const roles=['cover','context','insight','insight','editorial_closing'];
const titles=['소개팅이 면접처럼 느껴지는 이유','첫 만남의 대화가 딱딱해지는 이유','대화의 속도가 달라지는 순간','소개팅이 면접과 달라지는 부분','서로의 이야기를 꺼내는 순간'];
const slides=roles.map((role,index)=>({
 role,title:index===0?titles[0]:'새로운 이야기와 관점 '+index,
 body:index===0?'질문만 주고받던 자리가 어색한 이유를 살펴봅니다.':
  index===1?'첫 만남에서는 질문만 하면 마치 면접처럼 느껴질 수 있습니다.':
  index===2?'내가 먼저 주말 이야기를 하면 상대도 부담 없이 경험을 말할 수 있습니다.':
  index===3?'작은 공통점을 찾아보는 대화는 서로의 기분을 이해하는 기회가 됩니다.':
  '서로 이야기를 나누는 것이 질문을 많이 던지는 것보다 중요할 수 있습니다.',
 secondary_body:'Sharing a personal story can invite a more relaxed conversation.',
 body_ko:'본문 한국어 카드 원본을 보존합니다.',
 body_en:'Sharing a personal story can invite a more relaxed conversation.',
 eyebrow:'SEOUL / SOCIAL',highlight:'',source_ids:index===1?['S1']:[],
 closing_type:index===4?'summary':'none',options:[]
}));
const source={
 id:'11111111-1111-4111-8111-111111111111',revision:4,status:'needs_approval',
 content_language:'ko',visual_source:'stock',
 images:roles.map((_,i)=>'https://images.example/card-'+i+'.jpg'),
 content_document:{design_preset:pres.MAGAZINE_EDITORIAL_PRESET,carousel_template:plan,
  cover_layout:pres.MAGAZINE_IMMERSIVE_LAYOUT,answer_first:true,cover_editorial_version:1,
  editorial_storyboard_version:1,thumbnail_candidates:titles,thumbnail_selected_index:0,slides},
 carousel_slides:slides
};
const payload={request_key:'manual:12345678-1234-4234-8234-123456789abc',revision:4,index:2,
 title:'내 이야기를 꺼내는 순간의 변화',
 body:'먼저 내 경험을 짧게 들려주면 상대도 자기 주말 이야기를 나눌 여유가 생길 수 있습니다.',
 secondary_body:'Sharing one small personal experience may invite a comfortable exchange.',
 highlight:'대화는 서로의 경험으로 이어집니다.'};
const changed=edit.composeManualMagazineEdit(source,payload);
let n=0;const test=fn=>{fn();n++;};
test(()=>assert.equal(changed.index,2));
test(()=>assert.equal(changed.slides.length,5));
test(()=>assert.equal(changed.slides[1].source_ids[0],'S1'));
test(()=>assert.equal(changed.slides[2].title,payload.title));
test(()=>assert.equal(changed.slides[2].body_ko,payload.body));
test(()=>assert.equal(changed.slides[2].body_en,payload.secondary_body));
test(()=>assert.equal(changed.document.carousel_template.reservation_number,2));
test(()=>assert.equal(changed.document.carousel_template.slide_count,5));
test(()=>assert.equal(changed.document.thumbnail_candidates.length,5));
test(()=>assert.equal(changed.document.editorial_headline_reviews.length,5));
test(()=>assert.equal(source.carousel_slides[2].title,'새로운 이야기와 관점 2'));
test(()=>assert.equal(source.images[2],'https://images.example/card-2.jpg'));
test(()=>assert.equal(changed.slides[0].title,source.carousel_slides[0].title));
test(()=>assert.equal(changed.document.slides[2].title,payload.title));
test(()=>assert.throws(()=>edit.composeManualMagazineEdit(source,{...payload,revision:3}),/DRAFT_CHANGED_REFRESH_FIRST/));
test(()=>assert.throws(()=>edit.composeManualMagazineEdit(source,{...payload,index:9}),/INVALID_MANUAL_SLIDE_INDEX/));
test(()=>assert.throws(()=>edit.composeManualMagazineEdit(source,{...payload,body:'A'.repeat(261)}),/MANUAL_TEXT_LENGTH_INVALID/));
test(()=>assert.throws(()=>edit.composeManualMagazineEdit(source,{...payload,body:'지금 신청하기'}),/FEED_AD_CTA_NOT_ALLOWED/));
test(()=>assert.throws(()=>edit.composeManualMagazineEdit({...source,content_document:{...source.content_document,carousel_template:{...plan,slide_count:3}}},payload),/CAROUSEL_RESERVATION_MISMATCH/));
const cover=edit.composeManualMagazineEdit(source,{...payload,index:0,title:'첫 만남에서 말문이 막히는 이유'});
test(()=>assert.equal(cover.document.thumbnail_candidates[0],'첫 만남에서 말문이 막히는 이유'));
test(()=>assert.equal(cover.document.thumbnail_render_pending,true));
test(()=>assert.equal(source.content_document.thumbnail_candidates[0],titles[0]));
test(()=>assert.throws(()=>edit.composeManualMagazineEdit(source,{...payload,index:0,title:titles[1]}),/DUPLICATE_THUMBNAIL_COPY/));
const shortlist=story.evaluateHeadlineOptions(source.content_document,'ko');
test(()=>assert.equal(shortlist.length,5));
test(()=>assert.equal(shortlist.every(x=>Number.isInteger(x.score)&&x.score>=0&&x.score<=100),true));
const review=story.reviewMagazineStoryboard(source.content_document,'ko');
test(()=>assert.equal(review.reserved_count,5));
test(()=>assert.equal(review.note.includes('immutable'),true));
const repeated={...source.content_document,slides:slides.map((slide,i)=>i>0&&i<4?{...slide,body:'질문에 답하고 다음 질문을 이어가세요.'}:slide)};
test(()=>assert.equal(story.reviewMagazineStoryboard(repeated,'ko').issues.length>0,true));
const fullSchema=policy.contentSchema('conversation_prompt','ko','',true,plan);
test(()=>assert.equal(fullSchema.properties.thumbnail_candidates.minItems,5));
test(()=>assert.equal(fullSchema.properties.thumbnail_candidates.maxItems,5));
const legacy=policy.contentSchema('conversation_prompt','ko','',true,null);
test(()=>assert.equal(legacy.properties.thumbnail_candidates.minItems,3));
const historic={...source.content_document,cover_editorial_version:undefined,thumbnail_candidates:titles.slice(0,3)};
test(()=>assert.equal(answer.answerFirstIssues(historic,'ko').some(i=>i.includes('후보가 정확히')),false));
const fresh=answer.applyAnswerFirstDocument({
 ...source.content_document,thumbnail_candidates:titles,slides
},true,plan);
test(()=>assert.equal(fresh.cover_editorial_version,1));
test(()=>assert.equal(fresh.editorial_storyboard_version,1));
const admin=fs.readFileSync('src/components/admin-marketing.tsx','utf8');
const screen=fs.readFileSync('src/components/admin-marketing-editorial-studio.tsx','utf8');
const regen=fs.readFileSync('src/lib/marketing-regeneration.ts','utf8');
const route=fs.readFileSync('src/lib/marketing.ts','utf8');
const css=fs.readFileSync('src/components/admin-marketing-editorial-studio.css','utf8');
test(()=>assert.match(admin,/AdminMarketingEditorialStudio/));
test(()=>assert.match(screen,/versions\/manual/));
test(()=>assert.match(screen,/onRequestAiEdit/));
test(()=>assert.match(route,/editManualMagazineSlideVersion/));
test(()=>assert.match(regen,/renderVersionCards\(db,changed,\[index\]\)/));
test(()=>assert.match(regen,/insertVersion\(db,source,snapshot,photos/));
test(()=>assert.match(css,/@media\(max-width:465px\)/));
test(()=>assert.match(css,/object-fit:contain/));
console.log('PASS '+n+' editorial studio assertions: five headlines, 3/5 reservation, KO/EN manual fields, single-card version integrity, source protection, mobile layout. No paid API calls.');
