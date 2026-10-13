// Independent, bounded editorial review. Never publishes or changes research evidence.
// Scores screen draft copy; they do not predict social-media reach.
import type { TopicAssessment,TopicSelection } from './marketing-topic-planner';

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
export type EditorialCopyCritique={
 version:number;score:number;status:'passed'|'rewrite'|'replace_topic';
 reason:string;issues:string[];
 ratings:{hook:number;scene:number;originality:number;progression:number;shareability:number};
};

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
