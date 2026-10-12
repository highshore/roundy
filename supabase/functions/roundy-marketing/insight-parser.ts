// Read-only, defensive parsing of official Meta Insights responses.
// Unsupported, missing, untrusted or non-numeric metrics stay null: NEVER zero.
type Row=Record<string,any>;
export type ObservedMetric=number|null;
export const OBSERVED_METRIC_KEYS=[
 'reach','views','likes','comments','saved','shares','total_interactions',
 'follows','profile_visits','ig_reels_avg_watch_time','ig_reels_video_view_total_time'
] as const;
const safeNumber=(v:unknown):ObservedMetric=>
 (typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))&&
 Number.isSafeInteger(Number(v))&&Number(v)>=0&&Number(v)<=2147483647?Number(v):null;
export function readMediaMetric(response:unknown,metric:string):ObservedMetric{
 const data=(response as Row)?.data;
 const rows=Array.isArray(data)?data:[];
 const item=rows.find((r:Row)=>r?.name===metric);
 const raw=item?.value??item?.total_value?.value??item?.values?.[0]?.value;
 return safeNumber(raw);
}
export function parseMediaSignals(primary:unknown,optional:unknown,watch:unknown,isReel:boolean){
 const values:Record<string,number|null>={};
 const observed:Record<string,boolean>={};
 for(const name of OBSERVED_METRIC_KEYS){
  const input=name==='follows'||name==='profile_visits'?optional:
   name.startsWith('ig_reels_')?watch:primary;
  const value=(isReel&&['follows','profile_visits'].includes(name))||
   (!isReel&&name.startsWith('ig_reels_'))?null:readMediaMetric(input,name);
  values[name]=value;observed[name]=value!==null;
 }
 return {values,observed};
}
export type AccountAudienceBreakdown={reached_followers:number;reached_nonfollowers:number;total_reach:number};
function category(raw:unknown):'follower'|'nonfollower'|null{
 const key=String(raw??'').trim().toUpperCase();
 if(key==='FOLLOWER'||key==='FOLLOWERS')return 'follower';
 if(key==='NON_FOLLOWER'||key==='NON_FOLLOWERS'||key==='NONFOLLOWER'||key==='NONFOLLOWERS')return 'nonfollower';
 return null;
}
export function parseAccountAudienceReach(response:unknown):AccountAudienceBreakdown|null{
 const data=(response as Row)?.data,reach=Array.isArray(data)?data.find((x:Row)=>x?.name==='reach'):null;
 if(!reach)return null;
 const value=reach.total_value||reach.values?.[0]||{},breakdowns=value.breakdowns;
 if(!Array.isArray(breakdowns))return null;
 const record:{follower:number|null;nonfollower:number|null}={follower:null,nonfollower:null};
 for(const breakdown of breakdowns){
  const keys=breakdown?.dimension_keys;
  if(!Array.isArray(keys)||!keys.some((x:unknown)=>String(x).toLowerCase().replaceAll('_','')==='followtype'))
   continue;
  const idx=keys.findIndex((x:unknown)=>String(x).toLowerCase().replaceAll('_','')==='followtype');
  for(const result of Array.isArray(breakdown.results)?breakdown.results:[]){
   const kind=category(result?.dimension_values?.[idx]);
   if(!kind)continue;
   const num=safeNumber(result?.value);
   if(num===null||record[kind]!==null)return null; // duplicated or malformed: no guess.
   record[kind]=num;
  }
 }
 if(record.follower===null||record.nonfollower===null)return null;
 const sum=record.follower+record.nonfollower;
 if(!Number.isSafeInteger(sum)||sum>2147483647)return null;
 const reported=safeNumber(value.value);
 // Meta breakdown may be sampled; large discrepancies mean do not present false precision.
 if(reported!==null&&Math.abs(reported-sum)>Math.max(5,reported*.05))return null;
 return {reached_followers:record.follower,reached_nonfollowers:record.nonfollower,
  total_reach:reported??sum};
}
