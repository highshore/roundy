// Independent, bounded editorial review. Never publishes or changes research evidence.
// Scores screen draft copy; they do not predict social-media reach.
import type {TopicSelection,TopicAssessment} from './marketing-topic-planner';

export const EDITORIAL_CRITIC_VERSION=1;
export const EDITORIAL_CRITIC_MIN_SCORE=80;
export const EDITORIAL_CRITIC_MAX_REVIEWS=2;

type Rating = 1|2|3|4|5;
type Row=Record<string,unknown>;
const isRow=(x:unknown):x is Row=>Boolean(x)&&typeof x==='object'&&!Array.isArray(x);
const clean=(x:unknown)=>typeof x==='string'?x.trim().slice(0,220):'';
const rating=(x:unknown):Rating=>{
 if(typeof x!=='number'||!Number.isInteger(x)||x<1||x>5)throw new Error('EDITORIAL_CRITIC_INVALID_RATING');
 return x as Rating;
};
const field=(x:Row,key:string)=>rating(x[key]);
const scored=(values:number[],weights:number[])=>Math.round(values.reduce((sum,value,i)=>sum+value*weights[i],0)/5);
const shortText=(x:unknown)=>{const s=clean(x);if(s.length<8)throw new Error('EDITORIAL_CRITIC_MISSING_REASON');return s;};

export function storyFirstPostType(type:string):boolean {
 return ['conversation_prompt','dating_archetype','mbti','meme_remix','korea_life','mini_quiz'].includes(type);
}
export function topicCriticSchema(){
 const number={type:'integer',minimum:1,maximum:5};
 const item={type:'object',additionalProperties:false,properties:{
  angle_key:{type:'string'},hook:number,scene:number,originality:number,usefulness:number,shareability:number,
  decision:{type:'string',enum:['approve','reject']},reason:{type:'string'}
 },required:['angle_key','hook','scene','originality','usefulness','shareability','decision','reason']};
 return {type:'object',additionalProperties:false,properties:{reviews:{type:'array',minItems:1,maxItems:5,items:item}},required:['reviews']};
}
export function topicCriticPrompt(language:string):string {
 return [
  'You are an INDEPENDENT, skeptical editor. You did NOT write these topic ideas.',
  'Evaluate each candidate solely from its headline, scene, core insight and reader payoff. The generator self-ratings have deliberately been hidden.',
  'Do not accept generic advice dressed up with a novelty word, a numbered list, or a question mark. A familiar first-date problem alone is insufficient without a fresh scene or observation.',
  'A good idea has a recognizable social moment, a specific tension, a non-obvious observation, and enough DISTINCT material for the requested 3 or 5 cards.',
  'Return one review for EACH supplied angle_key, once and only once. Score hook, scene, originality, usefulness and shareability individually 1 to 5.',
  '1=weak textbook tip; 3=competent but ordinary; 5=exceptionally specific and worth saving or sharing. Reject weak ideas, even if they are grammatically polished.',
  'Do not invent studies, relationship outcomes, trends or other facts. Your job is topic appeal, not fact validation.',
  'Primary reader language: '+(language==='en'?'English':'Korean')+'. The reason may use that language.',
  'Output the strict JSON schema only.'
 ].join('\n');
}
export type TopicCriticReview={angle_key:string;score:number;approved:boolean;reason:string};
export function independentlyRankTopics(selection:TopicSelection,value:unknown):{selection:TopicSelection;reviews:TopicCriticReview[]} {
 if(!isRow(value)||!Array.isArray(value.reviews))throw new Error('EDITORIAL_TOPIC_CRITIC_INVALID');
 const eligible=selection.candidates.filter(c=>c.status!=='discarded');
 const items=value.reviews;
 if(items.length!==eligible.length)throw new Error('EDITORIAL_TOPIC_CRITIC_COUNT_MISMATCH');
 const expected=new Set(eligible.map(x=>x.angle_key));
 const seen=new Set<string>();
 const reviews:TopicCriticReview[]=items.map((raw:unknown)=>{
  if(!isRow(raw))throw new Error('EDITORIAL_TOPIC_CRITIC_INVALID');
  const key=clean(raw.angle_key);
  if(!expected.has(key)||seen.has(key))throw new Error('EDITORIAL_TOPIC_CRITIC_UNMATCHED_KEY');
  seen.add(key);
  const hook=field(raw,'hook'),scene=field(raw,'scene'),originality=field(raw,'originality'),
   usefulness=field(raw,'usefulness'),shareability=field(raw,'shareability');
  const score=scored([hook,scene,originality,usefulness,shareability],[25,20,25,20,10]);
  return {angle_key:key,score,approved:raw.decision==='approve'&&score>=EDITORIAL_CRITIC_MIN_SCORE&&
   hook>=4&&originality>=4&&scene>=4,reason:shortText(raw.reason)};
 });
 if(seen.size!==eligible.length)throw new Error('EDITORIAL_TOPIC_CRITIC_MISSING_KEY');
 const reviewsByKey=new Map(reviews.map(x=>[x.angle_key,x]));
 const candidates:TopicAssessment[]=selection.candidates.map(candidate=>{
  const r=reviewsByKey.get(candidate.angle_key);
  return {...candidate,status:!r||!r.approved?'discarded':'eligible',
   reasons:r&&!r.approved?[...candidate.reasons,'독립 편집 평가 탈락: '+r.reason]:candidate.reasons};
 });
 const ordered=candidates.filter(c=>c.status==='eligible').sort((a,b)=>
  (reviewsByKey.get(b.angle_key)?.score||0)-(reviewsByKey.get(a.angle_key)?.score||0)||
  b.score-a.score||a.headline.localeCompare(b.headline));
 const selected=ordered[0]||null;
 if(selected)selected.status='selected';
 return {selection:{...selection,status:selected?'selected':'discarded',selected,candidates},reviews};
}

export function copyCriticSchema(){
 const number={type:'integer',minimum:1,maximum:5};
 const fields={hook:number,scene:number,originality:number,progression:number,shareability:number,
  decision:{type:'string',enum:['pass','rewrite','replace_topic']},reason:{type:'string'},
  issues:{type:'array',maxItems:4,items:{type:'string'}}};
 return {type:'object',additionalProperties:false,properties:fields,required:Object.keys(fields)};
}
export function copyCriticPrompt(language:string,mode:'story_first'|'answer_first',count:3|5):string {
 return [
  'You are an INDEPENDENT, tough magazine editor, not the writer of this carousel.',
  'Judge whether a real reader would want to keep swiping, not whether a schema or marketing checklist is satisfied.',
  'Evaluate ONLY the supplied reader-visible title, body, highlight and editorial closing. Do not use author self-ratings or hidden rationales.',
  ...(mode==='answer_first'?[
   'This is a FACT-FIRST or service-journalism carousel. A concrete scene may be a reader deciding what to see, a verified activity or a practical trade-off; do not require invented dialogue or personal experience.',
   'Reward useful verified specifics and a coherent reader decision. Reject unrelated social advice inserted beside event, book or research facts, or an event listing that never fulfills its cover promise.',
   'A fictional conversation is optional, never a factual claim about event visitors. Judge the progression of on-screen facts and useful choices, not the theatrical intensity of a fabricated anecdote.'
  ]:[
   'Look for a recognisable human scene, emotional or practical tension, a fresh observation, different payoff per swipe and natural ending.',
   'The narrative should pay off the cover promise through tangible dialogue, reactions or changing choices, not just generic questions.'
  ]),
  'A single banal suggestion split across multiple cards MUST fail, even when it contains the words "instead", "but", or "why".',
  'BAD example: 언제 한번 대신 날짜 두 개 -> 첫 장도 뒤의 네 장도 날짜 두 개를 고르라는 조언의 반복. It is not publishable.',
  'GOOD structure: atmosphere was good on a first date, but a second meeting never happened -> real goodbye dialogue -> why the vague promise fizzles -> one usable concrete line -> humane closing.',
  'The examples teach DIFFERENCE in narrative depth, not text to reproduce. Reject near-copies of either example.',
  '1=generic filler, 3=acceptable prose but not compelling, 5=original, natural, specific and shareable.',
  'If copy is fixable without changing its core subject, choose rewrite with exact defects. If the core idea is banal or cannot support '+count+' distinct cards, choose replace_topic.',
  'Give pass only if you would publish the story as an editor, subject to separate factual, legal, source and image checks.',
  'No invented external facts, quotes attributed to real people or promised outcomes. No rewrite text; only ratings, decision and concise actionable issues.',
  'Narrative mode: '+mode+'. Primary language: '+(language==='en'?'English':'Korean')+'.',
  'Output JSON matching the schema.'
 ].join('\n');
}
export type EditorialCopyCritique={
 version:number;score:number;status:'passed'|'rewrite'|'replace_topic';
 reason:string;issues:string[];
 ratings:{hook:number;scene:number;originality:number;progression:number;shareability:number};
};
// Structured, bounded feedback given to the ONE permitted rewrite. Independent
// criticism is untrusted editorial feedback, never authority over verified facts.
export function editorialRevisionBrief(review:EditorialCopyCritique,count:3|5,sourceLocked:boolean){
 const weakest=Object.entries(review.ratings).sort((a,b)=>a[1]-b[1]).slice(0,3).map(([name])=>name);
 const steps=count===5
  ?['Cover: ONE concrete reader dilemma or decision and an honest promise.',
    'Card 2: demonstrate the exact context or reader friction promised on the cover.',
    'Card 3: provide one new observation or sourced fact that changes the situation.',
    'Card 4: advance with a DIFFERENT insight, example or grounded practical trade-off.',
    'Card 5: resolve the same thread with a genuinely useful, memorable takeaway.']
  :['Cover: one truthful, specific promise.','Card 2: fulfill it with a grounded example and distinct insight.',
    'Card 3: close the same thread with a concrete reader payoff.'];
 return {editor_reason:review.reason,editor_issues:review.issues.slice(0,4),
  weakest_dimensions:weakest,slide_progression:steps,
  factual_lock:sourceLocked?'Keep the verified subject, source IDs, facts and uncertainties. Move relevant facts into the thread instead of inventing emotional scenes.':'Keep the approved subject. Illustrative conversation is allowed but must not be presented as testimony or fact.'};
}

export function assessIndependentCopyReview(value:unknown):EditorialCopyCritique {
 if(!isRow(value)||!Array.isArray(value.issues)||value.issues.length>4)throw new Error('EDITORIAL_COPY_CRITIC_INVALID');
 if(!['pass','rewrite','replace_topic'].includes(String(value.decision)))throw new Error('EDITORIAL_COPY_CRITIC_INVALID_DECISION');
 const ratings={hook:field(value,'hook'),scene:field(value,'scene'),originality:field(value,'originality'),
  progression:field(value,'progression'),shareability:field(value,'shareability')};
 const score=scored(Object.values(ratings),[25,20,25,20,10]);
 const reason=shortText(value.reason);
 const issues=value.issues.map(shortText);
 const good=score>=EDITORIAL_CRITIC_MIN_SCORE&&ratings.hook>=4&&ratings.originality>=4&&ratings.progression>=4;
 const status=value.decision==='replace_topic'?'replace_topic':(value.decision==='pass'&&good?'passed':'rewrite');
 return {version:EDITORIAL_CRITIC_VERSION,score,status,reason,issues:status==='passed'?[]:
  issues.length?issues:[reason],ratings};
}
