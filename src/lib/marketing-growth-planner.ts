/**
 * Roundy Instagram editorial growth planner.
 *
 * This is Roundy's own topic allocation, NOT an assertion about Instagram's
 * ranking weights. Pure and deterministic: no API calls and no paid retries.
 */
export type GrowthPillar='seoul'|'culture'|'humor'|'people'|'brand';
export type GrowthWeights=Record<GrowthPillar,number>;
export type GrowthFormat='carousel'|'reel_candidate'|'brand';
export type GrowthSlot={
 date:string;pillar:GrowthPillar;topic_type:string|null;
 content_mode:'growth_carousel'|'prelaunch';language:'ko'|'en';
 recommended_format:GrowthFormat;editorial_goal:string;
};
export type GrowthSignal={pillar:GrowthPillar;reach:number;shares:number;saves:number;comments:number;likes:number};
export type PillarSummary={pillar:GrowthPillar;posts:number;reach:number;shares:number;saves:number;comments:number;likes:number;share_rate:number;save_rate:number};
export const BASE_GROWTH_WEIGHTS:GrowthWeights={seoul:35,culture:10,humor:10,people:30,brand:15};
export const GROWTH_LEARNING_THRESHOLDS={min_posts:30,min_reach:5000,min_pillar_posts:5,min_pillar_reach:500} as const;
export const GROWTH_PILLARS:GrowthPillar[]=['seoul','culture','humor','people','brand'];

export function growthPillarForTopic(topic:string|null|undefined,draftKind:string|null|undefined):GrowthPillar {
 if(draftKind!=='growth_carousel')return 'brand';
 if(['seoul_trend','seoul_dating'].includes(topic||''))return 'seoul';
 if(topic==='korea_life')return 'culture';
 if(['meme_remix','mini_quiz'].includes(topic||''))return 'humor';
 return 'people';
}
export function aggregateGrowthSignals(signals:GrowthSignal[]):PillarSummary[] {
 return GROWTH_PILLARS.map(pillar=>{
  const subset=signals.filter(s=>s.pillar===pillar);
  const sum=(key:'reach'|'shares'|'saves'|'comments'|'likes')=>subset.reduce((n,s)=>n+Math.max(0,Number(s[key])||0),0);
  const reach=sum('reach'),shares=sum('shares'),saves=sum('saves');
  return {pillar,posts:subset.length,reach,shares,saves,comments:sum('comments'),likes:sum('likes'),share_rate:reach?Number((shares/reach*100).toFixed(3)):0,save_rate:reach?Number((saves/reach*100).toFixed(3)):0};
 });
}
export function recommendGrowthWeights(summaries:PillarSummary[]):{weights:GrowthWeights;learning:boolean;reason:string} {
 const totalPosts=summaries.reduce((n,s)=>n+s.posts,0),totalReach=summaries.reduce((n,s)=>n+s.reach,0);
 const t=GROWTH_LEARNING_THRESHOLDS;
 const active=GROWTH_PILLARS.filter(p=>p!=='brand');
 if(totalPosts<t.min_posts||totalReach<t.min_reach||
    active.some(p=>{const s=summaries.find(x=>x.pillar===p);return !s||s.posts<t.min_pillar_posts||s.reach<t.min_pillar_reach;})){
  return {weights:{...BASE_GROWTH_WEIGHTS},learning:false,reason:'Insufficient sample. Baseline experimentation remains active.'};
 }
 const measurements=active.map(p=>{
  const s=summaries.find(x=>x.pillar===p)!;
  return {pillar:p,rate:(s.shares*3+s.saves*2+s.comments*.4+s.likes*.1)/s.reach};
 });
 const editorialShare=100-BASE_GROWTH_WEIGHTS.brand;
 const center=measurements.reduce((n,m)=>n+m.rate*BASE_GROWTH_WEIGHTS[m.pillar],0)/editorialShare;
 if(center<=0)return {weights:{...BASE_GROWTH_WEIGHTS},learning:false,reason:'No substantive engagement signals yet.'};
 // The learning adjustment is deliberately limited to +/-20%, preserving
 // editorial diversity. Small viral outliers cannot dominate the calendar.
 const raw=measurements.map(m=>({
  pillar:m.pillar,weight:BASE_GROWTH_WEIGHTS[m.pillar]*Math.max(.8,Math.min(1.2,1+.2*(m.rate/center-1)))
 }));
 const total=raw.reduce((n,m)=>n+m.weight,0);
 const weights={...BASE_GROWTH_WEIGHTS};
 for(const m of raw)weights[m.pillar]=m.weight/total*editorialShare;
 return {weights,learning:true,reason:'Conservative share/save-weighted allocation, with brand held at 15%.'};
}

function dateIndex(dateKey:string):number {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(dateKey))throw new Error('INVALID_GROWTH_DATE');
 const timestamp=Date.parse(dateKey+'T00:00:00Z');
 if(!Number.isFinite(timestamp)||new Date(timestamp).toISOString().slice(0,10)!==dateKey)throw new Error('INVALID_GROWTH_DATE');
 return Math.floor(timestamp/86400000);
}
export function planGrowthSlot(dateKey:string,weights:GrowthWeights=BASE_GROWTH_WEIGHTS):GrowthSlot {
 const ordinal=dateIndex(dateKey);
 // Smooth weighted round-robin over a 100-day repeatable planning window.
 const index=((ordinal%100)+100)%100,current=Object.fromEntries(GROWTH_PILLARS.map(p=>[p,0])) as GrowthWeights;
 const safe=Object.fromEntries(GROWTH_PILLARS.map(p=>[p,Math.max(0,Number(weights[p])||0)])) as GrowthWeights;
 const total=GROWTH_PILLARS.reduce((n,p)=>n+safe[p],0);
 if(total<=0)throw new Error('INVALID_GROWTH_WEIGHTS');
 let pillar:GrowthPillar='seoul';
 for(let day=0;day<=index;day++){
  for(const p of GROWTH_PILLARS)current[p]+=safe[p];
  pillar=GROWTH_PILLARS.reduce((best,p)=>current[p]>current[best]?p:best,GROWTH_PILLARS[0]);
  current[pillar]-=total;
 }
 const language: 'ko'|'en' = [2,5].includes(((ordinal%7)+7)%7)?'ko':'en'; // 5 EN / 2 KO
 const topics:Record<GrowthPillar,string|null>={seoul:'seoul_trend',culture:'korea_life',humor:'meme_remix',people:'conversation_prompt',brand:null};
 const goals:Record<GrowthPillar,string>={
  seoul:'A verified Seoul discovery seen through a real shared outing or date dilemma. Lead with the reader hook and sourced practical details.',
  culture:'Useful social skills and recognisable everyday Seoul/Korea situations, never a tourism brochure.',
  humor:'Original social and relationship humor a Seoul reader wants to send to a friend.',
  people:'Real first meetings, dating, friendship and conversational friction, with one surprising observation and something worth saving.',
  brand:'Useful truthful introductions to face-to-face rotation dating, with no fabricated claims or sales pressure.'
 };
 return {
  date:dateKey,pillar,topic_type:topics[pillar],content_mode:pillar==='brand'?'prelaunch':'growth_carousel',
  language,recommended_format:pillar==='humor'||pillar==='culture'?'reel_candidate':pillar==='brand'?'brand':'carousel',
  editorial_goal:goals[pillar]
 };
}
export function growthWeekPlan(firstDate:string,weights:GrowthWeights=BASE_GROWTH_WEIGHTS):GrowthSlot[]{
 const first=dateIndex(firstDate);
 return Array.from({length:7},(_,i)=>planGrowthSlot(new Date((first+i)*86400000).toISOString().slice(0,10),weights));
}
