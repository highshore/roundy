/**
 * Editorial topic discovery policy. Pure, bounded, deterministic review.
 * A model proposes angles and self-scores; the server independently rejects
 * generic, invalid and recent-duplicate candidates. Scores are editorial
 * triage only, never predictions of Instagram reach.
 */
export const TOPIC_DISCOVERY_VERSION=1;
export const TOPIC_CANDIDATE_COUNT=5;
export const TOPIC_MIN_SCORE=80;
export const TOPIC_HISTORY_DAYS=60;

export type TopicCandidate={
 headline:string;angle_key:string;reader_payoff:string;scene:string;core_insight:string;
 novelty:number;reader_value:number;curiosity:number;shareability:number;editorial_reason:string;
};
export type TopicHistoryItem={headline:string;angle_key:string;core_insight:string;created_at:string};
export type TopicAssessment=TopicCandidate & {score:number;status:'selected'|'discarded'|'eligible';reasons:string[]};
export type TopicSelection={
 version:number;status:'selected'|'discarded';selected:TopicAssessment|null;
 candidates:TopicAssessment[];recent_count:number;history_days:number;threshold:number;reviewed_at:string;
};
type Row=Record<string,any>;
const str=(v:unknown)=>typeof v==='string'?v.trim():'';
const key=(v:unknown)=>str(v).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
const normalized=(v:unknown)=>str(v).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
const words=(v:unknown)=>new Set(str(v).normalize('NFKC').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(x=>x.length>=2));
function similarity(a:unknown,b:unknown){
 const left=normalized(a),right=normalized(b);
 if(!left||!right)return 0;
 if(left===right)return 1;
 if(left.length>=12&&right.length>=12&&(left.includes(right)||right.includes(left)))return .91;
 const grams=(s:string)=>{const set=new Set<string>();for(let i=0;i+3<=s.length;i++)set.add(s.slice(i,i+3));return set;};
 const a3=grams(left),b3=grams(right);
 let same=0;for(const item of a3)if(b3.has(item))same++;
 const dice=a3.size+b3.size?2*same/(a3.size+b3.size):0;
 const aw=words(a),bw=words(b);let matching=0;for(const w of aw)if(bw.has(w))matching++;
 const token=aw.size+bw.size?2*matching/(aw.size+bw.size):0;
 return Math.max(dice,token);
}
export function topicHistoryFromRows(drafts:unknown[],jobs:unknown[],excludeDraftId='',now=new Date()):TopicHistoryItem[]{
 const cutoff=now.getTime()-TOPIC_HISTORY_DAYS*86400000,items:TopicHistoryItem[]=[];
 const add=(row:Row,doc:Row,slides:Row[])=>{
  const when=Date.parse(str(row.created_at)||str(row.generated_at)||str(row.updated_at)||'');
  if(!Number.isFinite(when)||when<cutoff||when>now.getTime()+60000)return;
  const chosen=doc?.editorial_topic_selection?.selected||doc?.topic_selection?.selected||{};
  const headline=str(chosen.headline)||str(slides[0]?.title);
  if(!headline)return;
  items.push({headline:headline.slice(0,140),angle_key:key(chosen.angle_key),core_insight:(str(chosen.core_insight)||str(slides[1]?.body)).slice(0,230),created_at:new Date(when).toISOString()});
 };
 for(const raw of Array.isArray(drafts)?drafts:[]){
  const row=raw as Row;if(row.id===excludeDraftId)continue;
  const doc=row.content_document||{},slides=Array.isArray(row.carousel_slides)?row.carousel_slides:Array.isArray(doc.slides)?doc.slides:[];
  add(row,doc,slides);
 }
 for(const raw of Array.isArray(jobs)?jobs:[]){
  const row=raw as Row,snapshot=row.result_snapshot||{};
  if(snapshot.draft_id===excludeDraftId)continue;
  const doc=snapshot.content_document||{},slides=Array.isArray(snapshot.carousel_slides)?snapshot.carousel_slides:Array.isArray(doc.slides)?doc.slides:[];
  add(row,doc,slides);
 }
 const selected:TopicHistoryItem[]=[];
 for(const item of items.sort((a,b)=>b.created_at.localeCompare(a.created_at))){
  const duplicateIndex=selected.findIndex(prev=>(Boolean(item.angle_key)&&item.angle_key===prev.angle_key)||
   similarity(item.headline,prev.headline)>=.90);
  if(duplicateIndex>=0){
   // An imported draft may hold the selected topic key while an adjacent
   // completed job snapshot only holds its title. Keep the stronger metadata.
   if(item.angle_key&&!selected[duplicateIndex].angle_key)
    selected[duplicateIndex]={...item,created_at:selected[duplicateIndex].created_at};
   continue;
  }
  selected.push(item);
  if(selected.length>=120)break;
 }
 return selected;
}
export function assessTopicCandidates(raw:unknown,history:TopicHistoryItem[],language:string,now=new Date()):TopicSelection{
 if(!raw||typeof raw!=='object'||!Array.isArray((raw as Row).candidates)||((raw as Row).candidates as unknown[]).length!==TOPIC_CANDIDATE_COUNT)
  throw new Error('TOPIC_CANDIDATES_INVALID: exactly five structured topic angles are required');
 const prior=Array.isArray(history)?history.slice(0,120):[];
 const inspected:TopicAssessment[]=[];
 const ko=language!=='en';
 const staleGeneric=ko
  ?/(?:자연스럽게\s*대화|좋은\s*질문|질문을\s*이어|상대에게\s*관심|상대방을\s*존중|의미\s*있는\s*만남|대화의\s*시작|답에서\s*하나|메뉴판.*질문|소통의\s*중요성|친해지는\s*방법)/i
  :/(?:start\s+a\s+conversation|keep\s+the\s+conversation\s+going|better\s+communication|ask\s+(?:more|follow.?up)\s+questions|show\s+interest|be\s+yourself|meaningful\s+connection)/i;
 for(const item of (raw as Row).candidates){
  const row=item&&typeof item==='object'?item as Row:{};
  const candidate:TopicCandidate={
   headline:str(row.headline).slice(0,120),angle_key:key(row.angle_key).slice(0,90),
   reader_payoff:str(row.reader_payoff).slice(0,220),scene:str(row.scene).slice(0,220),
   core_insight:str(row.core_insight).slice(0,220),editorial_reason:str(row.editorial_reason).slice(0,170),
   novelty:Number(row.novelty),reader_value:Number(row.reader_value),
   curiosity:Number(row.curiosity),shareability:Number(row.shareability)
  };
  const reasons:string[]=[];
  const num=[candidate.novelty,candidate.reader_value,candidate.curiosity,candidate.shareability];
  const validNumbers=num.every(v=>Number.isInteger(v)&&v>=1&&v<=5);
  const score=validNumbers?Math.round((candidate.novelty*30+candidate.reader_value*30+candidate.curiosity*20+candidate.shareability*20)/5):0;
  if(!validNumbers)reasons.push('평가 점수가 1~5 범위를 벗어났습니다.');
  if(candidate.headline.length<(ko?9:12)||candidate.headline.length>(ko?55:95))reasons.push('주목도 높은 구체적인 제목이 부족합니다.');
  if(!/^[a-z][a-z0-9]*(?:_[a-z0-9]+){2,7}$/.test(candidate.angle_key))reasons.push('재사용 가능한 구체적인 주제 키가 없습니다.');
  if(candidate.reader_payoff.length<(ko?14:25)||candidate.scene.length<(ko?14:25)||candidate.core_insight.length<(ko?18:30))
   reasons.push('독자에게 줄 새로운 정보, 구체적 장면 또는 핵심 관찰이 부족합니다.');
  if(staleGeneric.test([candidate.headline,candidate.core_insight].join(' ')))
   reasons.push('누구나 아는 일반적인 조언이라 발행 가치가 낮습니다.');
  if(candidate.novelty<4||candidate.reader_value<4||score<TOPIC_MIN_SCORE)
   reasons.push('참신성, 독자 가치 또는 종합 편집 점수가 기준 미달입니다.');
  const compared=[...prior,...inspected.filter(p=>p.status!=='discarded').map(p=>({
   headline:p.headline,angle_key:p.angle_key,core_insight:p.core_insight,created_at:now.toISOString()
  }))];
  const duplicate=compared.find(p=>
   Boolean(p.angle_key)&&p.angle_key===candidate.angle_key||
   similarity(p.headline,candidate.headline)>=.72||
   Boolean(p.core_insight)&&similarity(p.core_insight,candidate.core_insight)>=.76
  );
  if(duplicate)reasons.push('최근 '+TOPIC_HISTORY_DAYS+'일 내 유사 주제: '+duplicate.headline.slice(0,60));
  inspected.push({...candidate,score,status:reasons.length?'discarded':'eligible',reasons});
 }
 const eligible=inspected.filter(x=>x.status==='eligible').sort((a,b)=>b.score-a.score||b.novelty-a.novelty||a.headline.localeCompare(b.headline));
 const selected=eligible[0]||null;
 if(selected)selected.status='selected';
 return {version:TOPIC_DISCOVERY_VERSION,status:selected?'selected':'discarded',selected,
  candidates:inspected,recent_count:prior.length,history_days:TOPIC_HISTORY_DAYS,
  threshold:TOPIC_MIN_SCORE,reviewed_at:now.toISOString()};
}
export function topicCandidateSchema(){
 const string=(maxLength:number)=>({type:'string',maxLength});
 const rating={type:'integer',minimum:1,maximum:5};
 const properties={
  headline:string(95),angle_key:string(70),reader_payoff:string(180),scene:string(180),
  core_insight:string(180),novelty:rating,reader_value:rating,curiosity:rating,
  shareability:rating,editorial_reason:string(140)
 };
 return {type:'object',additionalProperties:false,properties:{
  candidates:{type:'array',minItems:TOPIC_CANDIDATE_COUNT,maxItems:TOPIC_CANDIDATE_COUNT,
   items:{type:'object',additionalProperties:false,properties,required:Object.keys(properties)}}
 },required:['candidates']};
}
