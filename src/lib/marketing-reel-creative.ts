/**
 * Stage 4 Reel creative contracts: pure, versioned and free of network calls.
 * Editorial scores help humans triage copy; they do not predict Instagram reach.
 */
import {createHash} from 'node:crypto';

export const REEL_CREATIVE_VERSION=1;
export const REEL_FORMATS=['myth_vs_reality','three_quick_tips','awkward_moment_fix','what_to_say_instead','relatable_observation'] as const;
export type ReelFormat=typeof REEL_FORMATS[number];
export type ReelScene={
 role:'hook'|'body'|'ending';duration_sec:number;overlay_text:string;voiceover_line:string;asset_id:string|null;
};
export type ReelPlan={
 version:1;format_type:ReelFormat;language:'ko'|'en';title:string;hook_text:string;
 caption:string;share_reason:string;voiceover_script:string;cta_soft:string;scenes:ReelScene[];
 hook_review:HookReview;duration_seconds:number;
};
export type HookReview={score:number;passed:boolean;issues:string[];first_three_seconds:string;version:1};
export type ReelIdea={
 title:string;hook_text:string;core_message:string;share_reason:string;
 format_type:ReelFormat;target_audience:string;estimated_duration_sec:number;
 novelty:number;value:number;shareability:number;score:number;status:'eligible'|'discarded';reasons:string[];
};
type Dict=Record<string,any>;
const safe=(v:unknown)=>typeof v==='string'?v.trim():'';
const validUrl=(v:string)=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&u.port===''&&v.length<=1500;}catch{return false;}};
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const norm=(v:unknown)=>safe(v).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');

export function reviewFirstThreeSeconds(hook:unknown,body:unknown,language:'ko'|'en'):HookReview{
 const txt=safe(hook),rest=safe(body),issues:string[]=[];
 let score=100;
 const deduct=(points:number,message:string)=>{score-=points;issues.push(message);};
 const graphemes=Array.from(txt);
 if(graphemes.length<(language==='ko'?9:15)||graphemes.length>(language==='ko'?34:64))
  deduct(27,language==='ko'?'3초 안에 읽을 수 있는 짧고 구체적인 문구로 바꾸세요.':'Use a readable, specific hook that fits the first three seconds.');
 if(/(?:의미\s*있는\s*연결|좋은\s*대화|중요한\s*관계|자연스럽게\s*소통|알아두면\s*좋은|meaningful\s+connection|better\s+conversation|learn\s+more|click\s+here)/i.test(txt))
  deduct(34,'Generic advice or promotional language.');
 if(/(?:충격|역대급|무조건|반드시|100\s*%|guaranteed|shocking|never\s+fails|you\s+won.t\s+believe)/i.test(txt))
  deduct(50,'Unsubstantiated certainty or sensationalism.');
 if(!/(?:왜|이유|대신|말고|실수|어색|공감|첫|친구|서울|차이|그런데|순간|면접|데이트|소개팅|[?？]|\d|why|instead|awkward|first|friend|seoul|date|mistake|moment|pov|versus|\d)/i.test(txt))
  deduct(14,'The opening lacks a recognizable situation or sharp contrast.');
 if(rest&&norm(txt).length>14&&norm(rest).length>14){
  // Do not require verbatim repetition; reject only obvious unrelated copy.
  const chars=(s:string)=>{const val=norm(s),out=new Set<string>();for(let i=0;i+2<val.length;i++)out.add(val.slice(i,i+3));return out;};
  const a=chars(txt),b=chars(rest);
  if(a.size>=8&&b.size>=8&&[...a].filter(x=>b.has(x)).length<2)
   deduct(12,'Check that the opening matches the Reel body.');
 }
 return {version:1,score:Math.max(0,Math.min(100,score)),passed:score>=75,issues,first_three_seconds:txt};
}
export function evaluateReelIdeas(raw:unknown,language:'ko'|'en',recent:unknown[]=[]):ReelIdea[]{
 const data=raw as Dict;
 if(!data||!Array.isArray(data.candidates)||data.candidates.length!==5)throw new Error('REEL_IDEAS_MUST_BE_FIVE');
 const previous=(Array.isArray(recent)?recent:[]).map(norm).filter(Boolean);
 const used=new Set<string>();
 return data.candidates.map((item:unknown)=>{
  const x=item&&typeof item==='object'?item as Dict:{};
  const title=safe(x.title),hook_text=safe(x.hook_text),core_message=safe(x.core_message);
  const share_reason=safe(x.share_reason),target_audience=safe(x.target_audience);
  const format_type=REEL_FORMATS.includes(x.format_type)?x.format_type as ReelFormat:'relatable_observation';
  const novelty=Number(x.novelty),value=Number(x.value),shareability=Number(x.shareability);
  const estimated_duration_sec=Number(x.estimated_duration_sec);
  const valid=[novelty,value,shareability].every(n=>Number.isInteger(n)&&n>=1&&n<=5);
  const score=valid?Math.round((novelty*30+value*35+shareability*35)/5):0;
  const reasons:string[]=[];
  if(!valid||score<75||novelty<4||value<4)reasons.push('Originality or reader value below the editorial bar.');
  if(title.length<9||title.length>100||core_message.length<18||share_reason.length<16||target_audience.length<4)
   reasons.push('Insufficient concrete information or audience detail.');
  if(!Number.isInteger(estimated_duration_sec)||estimated_duration_sec<15||estimated_duration_sec>30)
   reasons.push('Reel must plan 15–30 seconds.');
  const hook=reviewFirstThreeSeconds(hook_text,core_message,language);
  if(!hook.passed)reasons.push(...hook.issues);
  const fingerprint=norm(core_message).slice(0,85),titlenorm=norm(title);
  if(used.has(fingerprint)||used.has(titlenorm)||previous.some(v=>v===titlenorm||(v.length>13&&titlenorm.includes(v))))
   reasons.push('Recent or within-batch duplicate.');
  used.add(fingerprint);used.add(titlenorm);
  return {title,hook_text,core_message,share_reason,format_type,target_audience,
   estimated_duration_sec,novelty,value,shareability,score,
   status:reasons.length?'discarded':'eligible',reasons};
 });
}
export function validateReelPlan(value:unknown,language:'ko'|'en'):ReelPlan{
 const x=value as Dict,scenes=x?.scenes as unknown[];
 if(!x||typeof x!=='object'||!REEL_FORMATS.includes(x.format_type)||!Array.isArray(scenes)||scenes.length<3||scenes.length>6)
  throw new Error('REEL_STORYBOARD_INVALID');
 if(x.language!==language)throw new Error('REEL_LANGUAGE_MISMATCH');
 const bounded=(v:unknown,min:number,max:number,name:string)=>{
  const t=safe(v);if(t.length<min||t.length>max)throw new Error('REEL_'+name+'_INVALID');return t;
 };
 const items:ReelScene[]=scenes.map((raw,i)=>{
  const r=raw as Dict,role=i===0?'hook':i===scenes.length-1?'ending':'body';
  if(r?.role!==role||!Number.isInteger(r.duration_sec)||r.duration_sec<3||r.duration_sec>9)
   throw new Error('REEL_SCENE_TIMELINE_INVALID');
  if(r.asset_id!==null&&r.asset_id!==undefined&&!uuid(r.asset_id))throw new Error('REEL_SCENE_ASSET_ID_INVALID');
  return {role,duration_sec:r.duration_sec,overlay_text:bounded(r.overlay_text,3,110,'SCENE_TEXT'),
   voiceover_line:bounded(r.voiceover_line,3,280,'SCENE_VOICEOVER'),asset_id:r.asset_id||null};
 });
 const total=items.reduce((n,s)=>n+s.duration_sec,0);
 if(items[0].duration_sec!==3||total<15||total>30)throw new Error('REEL_DURATION_OR_3_SECOND_HOOK_INVALID');
 const title=bounded(x.title,3,100,'TITLE'),hook_text=bounded(x.hook_text,3,110,'HOOK');
 if(items[0].overlay_text!==hook_text)throw new Error('REEL_OPENING_MUST_MATCH_HOOK');
 const body=items.slice(1).map(s=>s.overlay_text+' '+s.voiceover_line).join(' ');
 const check=reviewFirstThreeSeconds(hook_text,body,language);
 if(!check.passed)throw new Error('REEL_HOOK_REQUIRES_REVISION: '+check.issues.join(' '));
 const caption=bounded(x.caption,5,2000,'CAPTION');
 const plan:ReelPlan={
  version:1,format_type:x.format_type,language,title,hook_text,caption,
  share_reason:bounded(x.share_reason,16,250,'SHARE_REASON'),
  voiceover_script:bounded(x.voiceover_script,20,1800,'VOICEOVER'),
  cta_soft:bounded(x.cta_soft,2,140,'SOFT_CTA'),
  scenes:items,hook_review:check,duration_seconds:total
 };
 if(/(?:무조건|100\s*%|절대\s*실패|guaranteed|you\s+won.t\s+believe)/i.test([title,caption,plan.voiceover_script].join(' ')))
  throw new Error('REEL_UNSUPPORTED_CLAIM');
 return plan;
}
export function reelPlanHash(plan:ReelPlan):string{
 // Hash the full immutable creative instructions, selected media IDs and durations.
 return createHash('sha256').update(JSON.stringify(plan)).digest('hex');
}
export function videoSourceRights(value:unknown){
 const v=value as Dict,kind=safe(v?.kind);
 if(!['licensed_video','approved_photo','ai_image'].includes(kind))throw new Error('REEL_ASSET_KIND_INVALID');
 const creator=safe(v.creator),license_note=safe(v.license_note),source_url=safe(v.source_url),license_url=safe(v.license_url);
 if(creator.length<2||creator.length>140||license_note.length<8||license_note.length>700
  ||v.rights_attested!==true||v.commercial_use_allowed!==true||v.modifications_allowed!==true)
  throw new Error('REEL_ASSET_RIGHTS_EVIDENCE_REQUIRED');
 const original_owned=v.original_owned===true;
 if(!original_owned&&kind!=='ai_image'&&(!validUrl(source_url)||!validUrl(license_url)))
  throw new Error('REEL_THIRD_PARTY_SOURCE_AND_LICENSE_REQUIRED');
 if(kind==='ai_image'&&!safe(v.ai_model)&&!original_owned)
  throw new Error('REEL_AI_IMAGE_ORIGIN_REQUIRED');
 return {kind,creator,license_note,source_url:source_url||'',license_url:license_url||'',
  original_owned,commercial_use_allowed:true,modifications_allowed:true,rights_attested:true,
  ai_model:safe(v.ai_model).slice(0,100)};
}
export function reelIdeasJsonSchema(){
 const text={type:'string'};
 const prop={title:text,hook_text:text,core_message:text,share_reason:text,
  format_type:{type:'string',enum:[...REEL_FORMATS]},target_audience:text,
  estimated_duration_sec:{type:'integer'},novelty:{type:'integer'},value:{type:'integer'},shareability:{type:'integer'}};
 return {type:'object',additionalProperties:false,properties:{
  candidates:{type:'array',minItems:5,maxItems:5,items:{type:'object',additionalProperties:false,properties:prop,required:Object.keys(prop)}}
 },required:['candidates']};
}
export function reelScriptJsonSchema(){
 const text={type:'string'};
 const scene={role:{type:'string',enum:['hook','body','ending']},duration_sec:{type:'integer'},
  overlay_text:text,voiceover_line:text,asset_id:{type:['string','null']}};
 const props={format_type:{type:'string',enum:[...REEL_FORMATS]},language:{type:'string',enum:['ko','en']},
  title:text,hook_text:text,caption:text,share_reason:text,voiceover_script:text,
  cta_soft:text,scenes:{type:'array',minItems:4,maxItems:5,items:{type:'object',additionalProperties:false,properties:scene,required:Object.keys(scene)}}};
 return {type:'object',additionalProperties:false,properties:props,required:Object.keys(props)};
}
export function reelAiIdeasPrompt(language:'ko'|'en',pillar:string,history:string[]){
 return [
  'You are the skeptical editorial producer for Roundy, a magazine about Seoul, friendships, first meetings, and human connection.',
  'Return exactly FIVE distinct, organic Instagram Reel ideas with the supplied strict JSON schema. No extra keys.',
  'Primary language:',language==='ko'?'natural modern Korean':'natural conversational English',
  'Pillar:',pillar,'Length: 15-30 seconds each. Formats:',REEL_FORMATS.join(', '),
  'Ideas need a truthful hook readable in THREE SECONDS, one recognisable situation, novel useful insight, and a reason someone would DM it to a friend.',
  'Score each novelty, value, shareability 1-5, strictly; basic advice earns at most 2.',
  'Do not invent trending statistics, studies, venue hours, real events, quotes or testimonials. Avoid overpromising, generic motivational copy and clickbait.',
  'Do not repeat these recent Reel angles (metadata only):',JSON.stringify(history.slice(0,25)),
  'Never turn one idea into five paraphrases. Each idea must explore a different observed social friction.',
  'Publishing, imagery and asset rights remain under human review.'
 ].join('\n');
}
export function reelAiScriptPrompt(language:'ko'|'en',idea:ReelIdea){
 return [
  'Create ONE ready-to-edit Instagram Reel script, NOT a published post. Respond ONLY with strict JSON schema.',
  'Primary language:',language==='ko'?'Korean':'English','Selected FORMAT:',idea.format_type,
  'Selected subject:',JSON.stringify({title:idea.title,hook_text:idea.hook_text,core_message:idea.core_message,share_reason:idea.share_reason}),
  'Write exactly 4 or 5 scenes spanning 15–30 seconds. FIRST scene is exactly 3 seconds, role hook. The last scene role ending; every middle scene role body. Each scene 3–9 seconds.',
  'Scene 0 overlay_text must exactly equal hook_text and be readable in three seconds; keep it concise. Each next scene adds useful or amusing information.',
  'Use overlay_text as a short mobile-friendly subtitle, voiceover_line as fuller optional spoken text. A voiceover script can later be recorded by a human; do not suggest that the generated silent MP4 contains spoken audio.',
  'asset_id must always be null. Media is attached after script generation from separately approved licensed media by a human.',
  'Ground claims only in the supplied editorial idea. Never invent research findings, venue facts, event details, surveys or quotations.',
  'Use a soft and truthful Roundy association, no fake CTA buttons, promises or forced advertising.',
  'Return title,hook_text,caption,share_reason,voiceover_script,cta_soft,format_type,language,scenes as requested.'
 ].join('\n');
}
