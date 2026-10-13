import {isEditorFirst} from './marketing-editor-first';
// Editorial-only Answer-First contract. Does not generate images or schedule publication.
import {type CarouselPlan,withCarouselPlan,savedCarouselPlan} from './marketing-carousel-template';
import {EDITORIAL_HEADLINE_VERSION} from './marketing-editorial-storyboard';
export type CopyRow=Record<string,any>;
export const ANSWER_FIRST_VERSION=1;
const clean=(v:unknown)=>typeof v==='string'?v.replace(/\r\n?/g,'\n').trim():'';
const norm=(v:unknown)=>clean(v).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');

const FIVE_ROLE_CHOICES:Record<string,string[]>={
 book_insight:['cover','book','insight','practice','cta'],
 trend_research:['cover','finding','context','practice','cta'],
 mbti:['cover','scenario','example','reflection','cta'],
 dating_archetype:['cover','scenario','example','reflection','cta'],
 meme_remix:['cover','setup','punchline','practice','cta'],
 dating_myth:['cover','myth','finding','practice','cta'],
 conversation_prompt:['cover','opener','followup','practice','cta'],
 seoul_dating:['cover','scenario','etiquette','plan','cta'],
 seoul_trend:['cover','trend','why_now','practical','cta'],
 korea_life:['cover','scenario','example','reflection','cta'],
 mini_quiz:['cover','question','options','reveal','cta'],
};
const THREE_ROLE_CHOICES:Record<string,string[]>={
 book_insight:['cover','insight','cta'],trend_research:['cover','finding','cta'],
 mbti:['cover','example','cta'],dating_archetype:['cover','example','cta'],
 meme_remix:['cover','punchline','cta'],dating_myth:['cover','finding','cta'],
 conversation_prompt:['cover','opener','cta'],seoul_dating:['cover','plan','cta'],
 seoul_trend:['cover','practical','cta'],korea_life:['cover','example','cta'],
 mini_quiz:['cover','reveal','cta']
};
export function threeEditorialRoles(type:string,legacy:readonly string[]):string[]{
 if(type==='seoul_trend'&&legacy.includes('facts'))return ['cover','facts','cta'];
 return THREE_ROLE_CHOICES[type]||[legacy[0],legacy.find(x=>x!=='cover'&&x!=='cta')||legacy[1],legacy[legacy.length-1]];
}
export function magazineRolesForCount(count:3|5):string[]{
 return count===3?['cover','key_insight','editorial_closing']:['cover','context','insight','insight','editorial_closing'];
}
export function magazineAnswerFirstPrompt(count:3|5,storyFirst=false):string {
 if(storyFirst)return [
  'STORY-FIRST (REQUIRED): This is a human-first Instagram narrative, NOT a result-first service article. The cover poses one concrete social dilemma, tension or true-to-life question. Card 2 shows a recognisable scene. Later cards reveal what changed or why it mattered. The closing offers one specific take-home line without preaching.',
  count===3?'Three cards: compelling truthful scene on cover, specific development or example in key_insight, earned takeaway in editorial_closing.':'Five cards: hook/scene on cover, actual social context, a first revealing observation, a DIFFERENT example or consequence, and a natural useful closing. Never pad a banal tip just to reach five cards.',
  'Return EXACTLY FIVE semantically DISTINCT, natural thumbnail_candidates for this SAME specific story. Candidate 1 MUST exactly equal slides[0].title. Candidates 2-5 must take different editorial approaches (recognizable tension, specific scene, honest contrast, reader decision, revealing outcome) and cannot merely swap synonyms or repeat candidate 1. The selected cover must be fulfilled by the following cards. A real question is allowed if the next slide answers it; no clickbait, invented statistics or guarantees.',
  'No signup, links, direct brand CTA or advertorial claims on cards. The renderer adds one light Roundy brand bridge below the human takeaway. Preserve source IDs and factual qualifications if any.',
  'Do not copy the example story or use generic claims about everyone behaving alike.'
 ].join('\n');
 return [
  'ANSWER-FIRST (REQUIRED): SEOUL MAGAZINE EDITORIAL. Deliver a precise conclusion first, then verifiable context, one idea per slide. This is reader service journalism, not an advertising campaign.',
  count===3?'Three cards: cover with answer-first headline, key_insight with a concrete and source-grounded fact, editorial_closing with a thoughtful summary, insight or subtle brand outro.':'Five cards: cover with answer-first headline, context giving real background, two distinct insights with verifiable details, editorial_closing with a useful summary, insight or subtle brand outro.',
  'No signup, click, link, learn more, fake button, or sales CTA on feed cards. The last editorial_closing must give a useful take-home point; the server adds a different context-aware Roundy brand bridge beneath that point, plus one friendly invitation in the caption. Do not repeat the brand line in the generated body.',
  'Preserve all attribution and limitations, source IDs and truthful specific Seoul venue names. Never invent statistics or claim venue availability.',
  'Produce exactly FIVE semantically DISTINCT and truthful thumbnail_candidates: a relatable moment, a contrast, a defensible surprising observation, a concrete benefit and a specific perspective. Candidate 1 MUST exactly equal slides[0].title; candidates 2-5 must not repeat it or each other, including near-synonyms. Never strengthen evidence, invent insights or promise results. All five must accurately describe the same sourced story.'
 ].join('\n');
}
export function editorialRolesForCount(type:string,legacy:readonly string[],count:3|5){
 return count===3?threeEditorialRoles(type,legacy):fiveEditorialRoles(type,legacy);
}
export function campaignRolesForCount(pattern:string,legacy:readonly string[],count:3|5){
 if(count===5)return fiveCampaignRoles(pattern,legacy);
 const middle=pattern==='problem_solution'?'solution':pattern==='how_it_works'?'step':pattern==='countdown'?'countdown':'benefit';
 return ['hook',middle,'cta'];
}
export function eventRolesForCount(pattern:string,legacy:readonly string[],count:3|5){
 if(count===5)return fiveEventRoles(pattern,legacy);
 const middle=pattern==='event_poster'?'facts':pattern==='social_proof'?'participants':pattern==='offer'?'offer':pattern==='last_call'?'status':'step';
 return ['hook',middle,'cta'];
}
export function fiveEditorialRoles(type:string,legacy:readonly string[]):string[]{
 if(type==='seoul_trend'&&legacy.includes('facts')){
  // Fact Pack: retain verified facts, program/experience and sourced practical guidance.
  return ['cover','facts','experience','practical','cta'];
 }
 return FIVE_ROLE_CHOICES[type]||[...legacy];
}
export function fiveCampaignRoles(pattern:string,legacy:readonly string[]):string[]{
 if(pattern==='poster')return ['hook','problem','solution','benefit','cta'];
 if(pattern==='countdown')return ['hook','benefit','countdown','benefit','cta'];
 return [...legacy];
}
export function fiveEventRoles(pattern:string,legacy:readonly string[]):string[]{
 if(pattern==='event_poster')return ['hook','experience','facts','step','cta'];
 if(pattern==='social_proof')return ['hook','participants','experience','facts','cta'];
 if(pattern==='offer')return ['hook','offer','facts','experience','cta'];
 if(pattern==='last_call')return ['hook','status','facts','experience','cta'];
 return [...legacy];
}
export function withAnswerFirstSchema(schema:CopyRow,language:string,enabled:boolean){
 if(!enabled)return schema;
 const max=language==='en'?64:34;
 const magazine=schema?.properties?.design_preset?.enum?.[0]==='roundy_magazine_editorial_v2';
 const quantity=magazine?5:3;
 return {...schema,properties:{...schema.properties,thumbnail_candidates:{
  type:'array',minItems:quantity,maxItems:quantity,items:{type:'string',minLength:6,maxLength:max}
 }},required:[...schema.required,'thumbnail_candidates']};
}
export function answerFirstPrompt(language:string,count:3|5=5){
 return [
  'ANSWER-FIRST (REQUIRED): Start with a practical answer, concrete takeaway, recommendation, or a defensible finding. NEVER open with a vague abstract question or a suspense hook.',
  count===3?'Exactly THREE slides: 1 Result = verified actionable conclusion; 2 Value/Detail = specific verified evidence, practical next step, critical limitations or context compressed without distorting claims; 3 CTA = subtle truthful Roundy reference.':'Exactly FIVE slides, in order: 1 Result = the conclusion on the cover; 2 Context = situation and why it matters; 3 Detail = specific example/evidence; 4 Value = useful practice, limitations or next step; 5 CTA = concise recap and a subtle, truthful Roundy connection.',
  'Keep the existing role names in the JSON schema: slide POSITION dictates Result / Context / Detail / Value / CTA. The role labels may differ for source verification, but the narrative must follow the five-part order.',
  'Return EXACTLY three different thumbnail_candidates. Each is a short, natural, factual, specific RESULT-FIRST headline in the primary post language. Candidate 1 MUST exactly equal slides[0].title. Never suggest an unrelated angle or a stronger claim than the verified body.',
  'Example: instead of "어디서 데이트할까?" use "성수 첫 데이트, 서울숲부터 시작하는 코스" ONLY if 서울숲 is actually verified in supplied facts/sources. This is a style example, NEVER a factual instruction to name 서울숲.',
  'Avoid clickbait, bait-and-switch, unsupported rankings/numbers, invented opening hours, popularity, venues, participants, guarantees or absolute claims. A sourced claim may not be strengthened by removing its qualification.',
  'For research/myth cards, preserve study scope and its material limitations together with practical advice, especially on the Value card. Only cited source IDs may support claim cards. Preserve existing research metadata and limitations.',
  'For Seoul recommendations, use only explicitly verified place names; if evidence is missing, present a generic practical recommendation WITHOUT inventing a destination.',
  'Mobile legibility: cover title should be concise, body cards one short point each, ideally <= 2 compact lines per paragraph; no walls of text.',
  'Do not present the Roundy brand as objective evidence. Final CTA is low-pressure and never claims that joining guarantees a date, match, safety or outcome.',
  language==='en'?'Write all three candidate headlines in English.':'썸네일 후보 3개 모두 한국어로 작성하고 질문형 낚시 문구를 사용하지 마세요.'
 ].join('\n');
}
export function answerFirstIssues(doc:CopyRow,language:string):string[]{
 if(doc?.answer_first!==true)return [];
 const storyFirst=doc?.editorial_narrative_mode==='story_first';
 const issues:string[]=[];
 const add=(x:string)=>{if(!issues.includes(x))issues.push(x);};
 const slides=Array.isArray(doc.slides)?doc.slides:[];
 const count=savedCarouselPlan(doc)?.slide_count||5;
 if(slides.length!==count)add('Answer-First 카드뉴스는 설정한 '+count+'장 구성이 필요합니다.');
 if(slides[0]?.role!=='cover'&&slides[0]?.role!=='hook')add('Answer-First 첫 장은 결론형 표지여야 합니다.');
 if(doc?.design_preset==='roundy_magazine_editorial_v2'){
  const expected=magazineRolesForCount(count);
  if(slides.some((slide:CopyRow,i:number)=>slide.role!==expected[i]))add('Answer-First 에디토리얼 카드 역할 또는 순서가 올바르지 않습니다.');
 }else if(slides[count-1]?.role!=='cta')add('Answer-First 마지막 장은 CTA여야 합니다.');
 const choices=doc.thumbnail_candidates;
 const desired=isEditorFirst(doc)?1:doc?.cover_editorial_version===EDITORIAL_HEADLINE_VERSION?5:3;
 if(!Array.isArray(choices)||choices.length!==desired)add('썸네일 문구 후보가 정확히 '+desired+'개 필요합니다.');
 else{
  const limit=language==='en'?64:34;
  if(choices.some((c:unknown)=>typeof c!=='string'||clean(c).length<6||clean(c).length>limit))add('썸네일 문구 후보는 모바일에서 읽기 쉬운 길이로 작성해야 합니다.');
  if(new Set(choices.map(norm)).size!==choices.length)add('썸네일 문구 후보가 서로 달라야 합니다.');
  for(const title of choices){
   if(typeof title!=='string')continue;
   if(!storyFirst&&(/[?？]\s*$/.test(clean(title))||/^(어디서|어떻게|뭘|무엇을|왜|어떤)\b/.test(clean(title))||/^(where|how|why|what|which)\b/i.test(clean(title))))
    add('썸네일은 추상적인 질문이 아닌 결과 또는 구체적인 제안으로 시작해야 합니다.');
   if(/충격|소름|역대급|100\s*%|무조건|반드시|비밀\s*공개|절대\s*실패|you won.t believe|guaranteed|must[- ]see|shocking|#1\b|best ever/i.test(title))
    add('썸네일에서 클릭베이트 또는 검증되지 않은 보장 표현을 사용할 수 없습니다.');
   if(/^(?:이것만\s*기억|이것만\s*알면|자세히\s*알아보|지금\s*확인|함께\s*알아보|여기서\s*확인|궁금하다면)|(?:지금\s*확인하세요|궁금하지\s*않나요|계속\s*읽어보세요|click\s*here|learn\s*more|read\s*on|find\s*out)\s*[.!?]?$/i.test(clean(title)))
    add('썸네일에 구체적인 결론 또는 실용적인 추천을 적어주세요. 확인 유도 문구만으로는 Answer-First를 충족하지 못합니다.');
  }
  const selected=Number(doc.thumbnail_selected_index??0);
  if(!Number.isInteger(selected)||selected<0||selected>=choices.length||clean(slides[0]?.title)!==clean(choices[selected]))
   add('선택한 썸네일 문구와 첫 장 제목이 일치해야 합니다.');
 }
 if(doc.thumbnail_render_pending===true)add('선택한 썸네일 문구를 기존 이미지에 다시 렌더링해야 게시할 수 있습니다.');
 const all=slides.slice(0,4).map((slide:CopyRow)=>clean(slide.title)+' '+clean(slide.body)).join(' ');
 if(/(?:진정한\s*인연|meaningful connection|당신의\s*운명)/i.test(all))
  add('추상적인 광고 문구 대신 구체적인 정보와 실행 가능한 가치를 제공하세요.');
 return issues;
}
export function applyAnswerFirstDocument(raw:CopyRow,enabled:boolean,plan:CarouselPlan|null=null){
 if(!enabled)return withCarouselPlan(raw,plan);
 // New magazine versions have five candidates; historical posts retain three.
 const choices=Array.isArray(raw.thumbnail_candidates)?raw.thumbnail_candidates.map(clean):[];
 const slides=Array.isArray(raw.slides)?raw.slides:[];
 const magazine=raw?.design_preset==='roundy_magazine_editorial_v2'&&!!plan;
 return {...withCarouselPlan(raw,plan),answer_first:true,answer_first_version:ANSWER_FIRST_VERSION,
  ...(magazine?{cover_editorial_version:EDITORIAL_HEADLINE_VERSION,editorial_storyboard_version:1}:{}),
  thumbnail_candidates:choices,thumbnail_selected_index:0,thumbnail_render_pending:false,
  slides:slides.map((s:CopyRow,i:number)=>i===0&&choices[0]?{...s,title:choices[0]}:s)};
}
export function selectAnswerFirstHeadline(doc:CopyRow,index:number,hasRenderedImages:boolean){
 if(doc?.answer_first!==true||!Array.isArray(doc.thumbnail_candidates)||doc.thumbnail_candidates.length<3)
  throw new Error('THUMBNAIL_CHOICES_UNAVAILABLE');
 if(!Number.isInteger(index)||index<0||index>=doc.thumbnail_candidates.length)throw new Error('INVALID_THUMBNAIL_CHOICE');
 const current=Number(doc.thumbnail_selected_index??0);
 if(index===current)return doc;
 const title=doc.thumbnail_candidates[index];
 if(typeof title!=='string'||!clean(title))throw new Error('INVALID_THUMBNAIL_CHOICE');
 const slides=Array.isArray(doc.slides)?doc.slides:[];
 if(!slides.length)throw new Error('THUMBNAIL_CHOICES_UNAVAILABLE');
 return {...doc,thumbnail_selected_index:index,thumbnail_render_pending:hasRenderedImages,
  editorial_critic:null,editorial_critic_history:[],editorial_critic_policy:null,
  slides:slides.map((slide:CopyRow,i:number)=>i===0?{...slide,title}:slide)};
}
