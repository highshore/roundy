// Reusable, source-linked facts for Roundy's Seoul Trend editorial cards.
// Never use the user's prose prompt or the model's own output as an authority for these facts.
export const TREND_GUIDE_LAYOUTS={
 event_guide:['cover','facts','experience','date_plan','practical','cta'],
 popup_guide:['cover','facts','experience','practical','cta'],
 place_guide:['cover','facts','date_plan','practical','cta'],
 culture_brief:['cover','facts','practice','cta']
} as const;
export type TrendGuideLayout=keyof typeof TREND_GUIDE_LAYOUTS;
export const TREND_FACT_KINDS=['when','where','price','booking','program','experience','access','context'] as const;
export type TrendFactKind=(typeof TREND_FACT_KINDS)[number];
export type TrendFact={
 kind:TrendFactKind;
 value_ko:string;
 value_en:string;
 source_ids:string[];
};
export type TrendFactPack={
 version:1;
 origin:string;
 checked_at:string;
 expires_at:string|null;
 layout:TrendGuideLayout;
 facts:TrendFact[];
};
type Row=Record<string,any>;
const clean=(value:unknown,max=220)=>typeof value==='string'?value.trim().slice(0,max):'';
const kinds=new Set<string>(TREND_FACT_KINDS);
const layouts=new Set<string>(Object.keys(TREND_GUIDE_LAYOUTS));
export function layoutForTrend(category:string,factCount:number):TrendGuideLayout{
 if(category==='place')return 'place_guide';
 if(category==='meme'||category==='research'||factCount<3)return 'culture_brief';
 if(category==='lifestyle')return 'popup_guide';
 return factCount>=4?'event_guide':'popup_guide';
}
export function trendGuideRoles(layout:string):readonly string[]{
 return layouts.has(layout)?TREND_GUIDE_LAYOUTS[layout as TrendGuideLayout]:['cover','trend','why_now','date_version','practical','cta'];
}
export function readTrendFactPack(value:unknown,knownSources:string[]=[]):TrendFactPack|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const raw=value as Row;
 if(raw.version!==1||!Array.isArray(raw.facts))return null;
 const allowed=new Set(knownSources);
 const facts:TrendFact[]=raw.facts.slice(0,14).flatMap((item:Row)=>{
  if(!item||!kinds.has(String(item.kind)))return [];
  const sourceIds=Array.isArray(item.source_ids)?[...new Set(item.source_ids.map(String))].filter((id:string)=>allowed.has(id)).slice(0,5):[];
  const ko=clean(item.value_ko),en=clean(item.value_en);
  if(!sourceIds.length||!ko||!en)return [];
  return [{kind:item.kind as TrendFactKind,value_ko:ko,value_en:en,source_ids:sourceIds}];
 });
 const dedup=[...new Map(facts.map(f=>[f.kind+':'+f.value_ko,f])).values()];
 const checkedAt=clean(raw.checked_at,40),expiresAt=clean(raw.expires_at,40);
 const layout=layouts.has(String(raw.layout))?raw.layout as TrendGuideLayout:layoutForTrend(String(raw.category||''),dedup.length);
 return {version:1,origin:clean(raw.origin,48)||'unknown',checked_at:checkedAt,expires_at:expiresAt||null,layout,facts:dedup};
}
export function trendFactPackIssues(pack:TrendFactPack|null,category:string,now=Date.now()):string[]{
 if(!pack)return ['TREND_FACT_PACK_MISSING'];
 const issues:string[]=[];
 if(pack.expires_at&&Number.isFinite(Date.parse(pack.expires_at))&&Date.parse(pack.expires_at)<=now)issues.push('TREND_FACT_PACK_EXPIRED');
 if(pack.facts.length<3||new Set(pack.facts.map(f=>f.kind)).size<2)issues.push('TREND_FACT_PACK_INSUFFICIENT');
 const kindsPresent=new Set(pack.facts.map(f=>f.kind));
 if(category==='place'&&!kindsPresent.has('where'))issues.push('TREND_FACT_PACK_PLACE_MISSING');
 if(['event','activity','food'].includes(category)&&!kindsPresent.has('when'))issues.push('TREND_FACT_PACK_TIME_MISSING');
 // The cited fact sheet must identify the actual venue or activity, not only an aesthetic theme.
 if(['event','activity','food','lifestyle'].includes(category)&&!kindsPresent.has('where')&&!kindsPresent.has('program'))issues.push('TREND_FACT_PACK_DETAIL_MISSING');
 return issues;
}
export function factPackReady(trend:Row,now=Date.now()):boolean{
 const sources=Array.isArray(trend?.source_urls)?trend.source_urls:[];
 const pack=readTrendFactPack(trend?.fact_pack,sources.slice(0,8).map((_:unknown,i:number)=>'S'+(i+1)));
 return trendFactPackIssues(pack,String(trend?.category||''),now).length===0;
}
export function selectGuideFacts(pack:TrendFactPack,max=4):TrendFact[]{
 const priorities=['when','where','price','booking','program','experience','access','context'];
 return [...pack.facts].sort((a,b)=>priorities.indexOf(a.kind)-priorities.indexOf(b.kind)).slice(0,max);
}
export function factLabel(kind:TrendFactKind,language:'ko'|'en'):string{
 const labels:Record<TrendFactKind,[string,string]>={
  when:['언제','WHEN'],where:['어디서','WHERE'],price:['비용','PRICE'],booking:['예약','BOOKING'],
  program:['프로그램','PROGRAM'],experience:['즐길 거리','TO DO'],access:['가는 법','ACCESS'],context:['알아둘 것','DETAIL']
 };
 return labels[kind][language==='ko'?0:1];
}
export function trendPackForModel(pack:TrendFactPack){
 return {
  version:pack.version,layout:pack.layout,checked_at:pack.checked_at,expires_at:pack.expires_at,
  facts:pack.facts.map(f=>({...f}))
 };
}

/** UI-only grouping. used_at records completed content generation, not necessarily publication. */
export function groupTrendsByUsage<T extends {used_at?:string|null;published?:boolean}>(trends:readonly T[]):{unused:T[];used:T[]}{
 const unused:T[]=[],used:T[]=[];
 for(const trend of trends){
  if((typeof trend.used_at==='string'&&trend.used_at.trim())||trend.published===true)used.push(trend);
  else unused.push(trend);
 }
 const time=(value:string|null|undefined)=>{const stamp=Date.parse(value||'');return Number.isFinite(stamp)?stamp:0;};
 used.sort((a,b)=>time(b.used_at)-time(a.used_at));
 return {unused,used};
}
