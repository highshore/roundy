/** External source content is untrusted inspiration, not media we may republish. */
export const EDITORIAL_PILLARS = ['dating_opinions','seoul_guides'] as const;
export type EditorialPillar = typeof EDITORIAL_PILLARS[number];
export type EditorialSourceInput = {pillar:EditorialPillar;source_url:string;title:string;creator:string;summary:string;source_published_at:string|null};
export type EditorialCard = {title:string;body:string};
type Row=Record<string,unknown>;
const clean=(value:unknown,max:number)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
const validId=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export const editorialId=validId;
export function canonicalEditorialUrl(input:unknown):string {
 if(typeof input!=='string'||input.length>1800)throw new Error('SOURCE_URL_INVALID');
 let url:URL;try{url=new URL(input.trim());}catch{throw new Error('SOURCE_URL_INVALID');}
 const host=url.hostname.toLowerCase();
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!host||host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||host.includes('..')||
  /^\d+\.\d+\.\d+\.\d+$/.test(host)||host.includes(':'))throw new Error('SOURCE_URL_NOT_PUBLIC');
 url.hash='';url.username='';url.password='';
 for(const key of [...url.searchParams.keys()])if(/^(utm_|fbclid$|gclid$|igshid$|ref_src$)/i.test(key))url.searchParams.delete(key);
 url.hostname=host.replace(/^www\./,'');
 url.pathname=url.pathname.replace(/\/+$/,'')||'/';
 return url.toString().replace(/\/(\?|$)/,'$1');
}
export function parseEditorialSource(input:unknown):EditorialSourceInput {
 const v=(input&&typeof input==='object'&&!Array.isArray(input)?input:{}) as Row;
 const pillar=v.pillar;
 if(!EDITORIAL_PILLARS.includes(pillar as EditorialPillar))throw new Error('EDITORIAL_PILLAR_REQUIRED');
 const title=clean(v.title,160),summary=clean(v.summary,1300),creator=clean(v.creator,90);
 if(title.length<8||summary.length<20)throw new Error('SOURCE_TITLE_AND_SUMMARY_REQUIRED');
 const raw=clean(v.source_published_at,20);
 const date=raw?new Date(raw+'T00:00:00Z'):null;
 if(raw&&(!/^\d{4}-\d{2}-\d{2}$/.test(raw)||!Number.isFinite(date?.getTime())||date!.toISOString().slice(0,10)!==raw||date!.getTime()>Date.now()+86400000))throw new Error('SOURCE_DATE_INVALID');
 return {pillar:pillar as EditorialPillar,source_url:canonicalEditorialUrl(v.source_url),title,summary,creator,source_published_at:raw?raw:null};
}
export function parseEditorialDraft(input:unknown) {
 const v=(input&&typeof input==='object'&&!Array.isArray(input)?input:{}) as Row;
 const angle=clean(v.angle,200);
 const hooks=Array.isArray(v.hooks)?v.hooks.map(h=>clean(h,110)):[];
 const selected_hook=clean(v.selected_hook,110);
 const storyboard=Array.isArray(v.storyboard)?v.storyboard.map(c=>{
  const card=c&&typeof c==='object'&&!Array.isArray(c)?c as Row:{};
  return {title:clean(card.title,100),body:clean(card.body,240)};
 }):[];
 if(angle.length<8||hooks.length!==3||hooks.some(h=>h.length<8)||new Set(hooks.map(h=>h.toLowerCase())).size!==3||
  !hooks.includes(selected_hook)||![3,5].includes(storyboard.length)||storyboard.some(c=>c.title.length<3||c.body.length<8))throw new Error('EDITORIAL_BRIEF_INCOMPLETE');
 return {angle,hooks,selected_hook,storyboard};
}
export function initialEditorialDraft(source:EditorialSourceInput) {
 const topic=source.title.slice(0,90);
 const angle=source.summary.slice(0,180);
 // These are editable starting points, not falsely labeled AI-generated or observed trends.
 return {angle,hooks:[topic,source.pillar==='dating_opinions'?'이 이야기, 당신이라면 어떻게 생각해?':'저장해둘 서울 데이트 아이디어',source.pillar==='dating_opinions'?'서로 다른 두 시선으로 보는 첫 만남':'서울에서 첫 만남을 준비한다면?'],
  selected_hook:topic,storyboard:(source.pillar==='dating_opinions'?
    [{title:'주제가 된 상황',body:'출처의 핵심 상황을 구체적인 한 문장으로 정리하세요.'},{title:'첫 번째 시선',body:'서로 다른 관점을 구체적인 행동이나 대화로 보여주세요.'},{title:'다른 시선과 질문',body:'반대의 시선과 독자에게 남길 질문을 작성하세요.'}]:
    [{title:'장소 선택 기준',body:'출처가 제시한 추천 기준을 명확하게 정리하세요.'},{title:'확인된 선택지',body:'공식 자료로 검증된 장소와 정보만 입력하세요.'},{title:'나에게 맞는 선택',body:'장소별 차이와 실용적인 선택 기준을 정리하세요.'}])};
}
/** Pass the selected idea as bounded editorial direction; the existing worker independently researches facts. */
export function editorialHandoffInstruction(source:EditorialSourceInput,draft:ReturnType<typeof parseEditorialDraft>):string {
 const sourceLabel=source.source_url.slice(0,165);
 const sequence=draft.storyboard.map(c=>c.title).join(' > ').slice(0,120);
 const text=['FIXED SUBJECT: '+draft.angle,'PREFERRED HOOK: '+draft.selected_hook,
  'STORY FLOW: '+sequence,'Inspiration URL (not factual proof): '+sourceLabel,
  'Create original editorial content; do not quote or reuse source media. Independently verify every real place, event, date and price.'];
 return text.join(' | ').slice(0,500);
}
export function editorialReady(source:EditorialSourceInput,draft:ReturnType<typeof parseEditorialDraft>) {
 if(!source.source_url||!draft.selected_hook)throw new Error('EDITORIAL_BRIEF_INCOMPLETE');
 return true;
}