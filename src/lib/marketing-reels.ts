import 'server-only';
import {NextRequest,NextResponse} from 'next/server';
import type {createClient} from './supabase/server';
import {createServiceRoleClient} from './supabase/service';
import {
 assertReelPath,parseReelCopy,parseReelVideoMetadata,REEL_BUCKET,REEL_PREVIEW_SECONDS,
 evaluateReelCohorts,type ReelMetric
} from './marketing-reel-policy';
import {inspectReelMp4} from './marketing-reel-mp4';
import {planGrowthSlot} from './marketing-growth-planner';
import {factPackReady} from './marketing-trend-guide';

type Client=Awaited<ReturnType<typeof createClient>>;
type Row=Record<string,any>;
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private,no-store'}});
const uuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function checked<T>(result:{data:T;error:any}):T{if(result.error)throw result.error;return result.data;}
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
async function reelPreview(service:ReturnType<typeof createServiceRoleClient>,row:Row){
 if(!row.video_storage_path)return {...row,preview_url:null};
 const signed=await service.storage.from(REEL_BUCKET).createSignedUrl(String(row.video_storage_path),REEL_PREVIEW_SECONDS);
 return {...row,preview_url:signed.data?.signedUrl||null,preview_error:signed.error?.message||null};
}
async function readReel(service:ReturnType<typeof createServiceRoleClient>,id:string){
 if(!uuid(id))throw new Error('INVALID_REEL_ID');
 const row=checked(await service.from('instagram_reel_drafts').select('*').eq('id',id).maybeSingle());
 if(!row)throw new Error('REEL_NOT_FOUND');
 return row as Row;
}
async function getReelStats(service:ReturnType<typeof createServiceRoleClient>,drafts?:Row[]){
 const all=drafts||checked(await service.from('instagram_reel_drafts').select('*').order('created_at',{ascending:false}).limit(250)) as Row[];
 const ids=all.map(d=>String(d.marketing_run_id||'')).filter(uuid);
 if(!ids.length)return {summary:evaluateReelCohorts([]),posts:[],insight_horizons:[24,72]};
 const insights=checked(await service.from('instagram_post_insights')
  .select('run_id,horizon_hours,reach,views,likes,comments,saves,shares,reel_avg_watch_time_ms,reel_total_watch_time_ms,captured_at')
  .in('run_id',ids).order('horizon_hours',{ascending:false}).limit(500)) as Row[];
 const latest=new Map<string,Row>();
 for(const s of insights)if(!latest.has(s.run_id))latest.set(s.run_id,s);
 const posts=all.filter(d=>d.marketing_run_id&&latest.has(d.marketing_run_id)).map(d=>{
  const insight=latest.get(d.marketing_run_id)!;
  return {id:d.id,title:d.title,status:d.status,pillar:d.pillar,hook_style:d.hook_style,language:d.language,
   published_at:d.published_at,horizon_hours:insight.horizon_hours,reach:insight.reach,views:insight.views,
   shares:insight.shares,saves:insight.saves,likes:insight.likes,comments:insight.comments,
   avg_watch_ms:insight.reel_avg_watch_time_ms,total_watch_ms:insight.reel_total_watch_time_ms,
   duration_seconds:d.duration_seconds};
 });
 const eligible:ReelMetric[]=posts.filter(row=>Number(row.reach)>0).map(row=>({
  hook_style:row.hook_style,pillar:row.pillar,reach:Number(row.reach),views:Number(row.views||0),
  shares:Number(row.shares||0),saves:Number(row.saves||0),
  avg_watch_ms:row.avg_watch_ms===null?null:Number(row.avg_watch_ms),
  duration_seconds:Number(row.duration_seconds||0)
 }));
 return {summary:evaluateReelCohorts(eligible),posts,insight_horizons:[24,72]};
}
function seededIdea(pillar:string,language:'ko'|'en',suggestion?:Row){
 if(pillar==='seoul'&&suggestion){
  const name=String(suggestion.display_name||'').slice(0,60);
  const lead=language==='ko'?name+'에서 알아두면 좋은 것':name+': what to know before visiting';
  const summary=String(language==='ko'?suggestion.summary_ko||suggestion.summary||'':suggestion.summary||'').slice(0,240);
  return {title:name,hook_text:lead,caption:summary||lead,source_urls:suggestion.source_urls||[],frames:[lead,name,language==='ko'?'방문 전에는 공식 일정을 확인하세요':'Check official details before you visit'],source_required:true};
 }
 const ideas:Record<string,{ko:[string,string,string,string],en:[string,string,string,string]}>={
  seoul:{ko:['서울에서 한번 해볼 만한 것','서울 주말의 한 장면','친구와 같이 해볼 것','저장해 두면 쓸 수 있는 서울 아이디어'],en:['A little Seoul discovery','The small things you notice in Seoul','One idea for a weekend with friends','A Seoul idea to save for later']},
  culture:{ko:['한국 생활하면서 놀란 순간','서울 생활 공감','이럴 땐 어떻게 해야 할까?','한국에서 생활하며 배운 것'],en:['Living in Seoul, explained','A small Korean culture surprise','Does this happen to you too?','One thing I learned in Seoul']},
  humor:{ko:['서울 살면 공감하는 순간','나만 그런 줄 알았는데','분명 계획은 이랬는데','당신은 몇 번 유형?'],en:['POV: You live in Seoul','The plan vs. reality','Tell me this is not just me','Every international friend knows this']},
  people:{ko:['처음 만난 친구와 대화법','대화가 끊길 때','이 질문 하나만 바꿔보자','다음 모임에서 써보기'],en:['Meeting new friends in Seoul','When the conversation stalls','Try asking this instead','One question for your next meetup']},
  brand:{ko:['Roundy가 기록하는 서울','우리가 관심 있는 이야기','서울 사람들의 새로운 발견','다음 Roundy 소식'],en:['A little note from Roundy','What we are exploring in Seoul','New ideas, new faces','Follow Roundy for Seoul discoveries']}
 };
 const copy=ideas[pillar]||ideas.culture,parts=copy[language];
 return {title:parts[0],hook_text:parts[1],caption:parts[3],frames:parts.slice(0,3),source_urls:[],source_required:false};
}
export async function reelsApi(req:NextRequest,db:Client,path:string[]){
 const service=createServiceRoleClient(),user=(await db.auth.getUser()).data.user;
 if(!user)return json({error:'Sign in required'},401);
 const id=path[0];
 if(!id&&req.method==='GET'){
  const rows=checked(await service.from('instagram_reel_drafts').select('*').order('created_at',{ascending:false}).limit(100)) as Row[];
  const previews=await Promise.all(rows.map(row=>reelPreview(service,row)));
  const stats=await getReelStats(service,rows);
  return json({drafts:previews,metrics:stats});
 }
 if(!id&&req.method==='POST'){
  const body=await req.json().catch(()=>({})),copy=parseReelCopy(body);
  const draft=checked(await service.from('instagram_reel_drafts')
   .insert({...copy,created_by:user.id,status:'draft'}).select('*').single());
  return json({draft},201);
 }
 if(id==='ideas'&&req.method==='GET'){
  const date=String(req.nextUrl.searchParams.get('date')||today());
  const slot=planGrowthSlot(date);
  const pillar=String(req.nextUrl.searchParams.get('pillar')||slot.pillar);
  if(!['seoul','culture','humor','people','brand'].includes(pillar))return json({error:'INVALID_REEL_PILLAR'},400);
  const language=req.nextUrl.searchParams.get('language')==='ko'?'ko':'en';
  let selected:Row|undefined;
  if(pillar==='seoul'){
   const recent=checked(await service.from('marketing_trends').select('*')
    .gte('last_seen_at',new Date(Date.now()-7*86400000).toISOString())
    .in('status',['emerging','rising','peak'])
    .order('trend_score',{ascending:false}).limit(15)) as Row[];
   selected=recent.find(row=>factPackReady(row));
  }
  const safe=selected?seededIdea(pillar,language,selected):seededIdea(pillar==='seoul'?'culture':pillar,language);
  return json({idea:{...safe,pillar,language,hook_style:'curiosity',verified_trend_id:selected?.id||null,
   brief:'Proposed creative concept only. Verify claims and license every uploaded photo/video before approval.'}});
 }
 if(id==='metrics'&&req.method==='GET')return json(await getReelStats(service));
 if(!uuid(id))return json({error:'INVALID_REEL_ROUTE'},404);
 if(path.length===1&&req.method==='PATCH'){
  const body=await req.json().catch(()=>({})),copy=parseReelCopy(body),row=await readReel(service,id);
  if(!['draft','needs_review'].includes(row.status))return json({error:'REEL_LOCKED_AFTER_APPROVAL'},409);
  if(!Number.isInteger(body.revision)||body.revision!==row.revision)return json({error:'REEL_DRAFT_CHANGED_REFRESH_FIRST'},409);
  const updated=checked(await service.from('instagram_reel_drafts')
   .update({...copy,revision:row.revision+1,rights_attested:false,status:row.video_storage_path?'needs_review':'draft',updated_at:new Date().toISOString()})
   .eq('id',id).eq('revision',row.revision).in('status',['draft','needs_review']).select('*').maybeSingle());
  if(!updated)return json({error:'REEL_DRAFT_CHANGED_REFRESH_FIRST'},409);
  return json({draft:await reelPreview(service,updated)});
 }
 if(path.length===2&&path[1]==='register'&&req.method==='POST'){
  const body=await req.json().catch(()=>({})),row=await readReel(service,id);
  if(!['draft','needs_review'].includes(row.status))return json({error:'REEL_LOCKED_AFTER_APPROVAL'},409);
  if(!Number.isInteger(body.revision)||body.revision!==row.revision)return json({error:'REEL_DRAFT_CHANGED_REFRESH_FIRST'},409);
  const videoMeta=parseReelVideoMetadata(body);
  const storagePath=assertReelPath(id,body.storage_path);
  const downloaded=await service.storage.from(REEL_BUCKET).download(storagePath);
  if(downloaded.error||!downloaded.data)throw new Error('REEL_UPLOADED_FILE_NOT_FOUND');
  const buf=new Uint8Array(await downloaded.data.arrayBuffer()),actual=inspectReelMp4(buf);
  if(actual.bytes!==videoMeta.file_size)throw new Error('REEL_UPLOADED_FILE_SIZE_MISMATCH');
  if(actual.width!==videoMeta.width||actual.height!==videoMeta.height)throw new Error('REEL_VIDEO_DIMENSIONS_MISMATCH');
  if(actual.duration_seconds!==null&&Math.abs(actual.duration_seconds-videoMeta.duration_seconds)>1.5)
   throw new Error('REEL_VIDEO_DURATION_MISMATCH');
  const duration=actual.duration_seconds??videoMeta.duration_seconds;
  const updated=checked(await service.from('instagram_reel_drafts').update({
   video_storage_path:storagePath,source_kind:videoMeta.source_kind,
   width:actual.width,height:actual.height,duration_seconds:duration,file_size:actual.bytes,
   rights_attested:false,status:'needs_review',revision:row.revision+1,updated_at:new Date().toISOString()
  }).eq('id',id).eq('revision',row.revision).in('status',['draft','needs_review']).select('*').maybeSingle());
  if(!updated)return json({error:'REEL_DRAFT_CHANGED_REFRESH_FIRST'},409);
  // Remove only the replaced file, after the current DB write succeeded.
  if(row.video_storage_path&&row.video_storage_path!==storagePath){
   await service.storage.from(REEL_BUCKET).remove([row.video_storage_path]).catch(()=>{});
  }
  return json({draft:await reelPreview(service,updated),validated:{codec:actual.codec,duration_verified:actual.duration_verified}});
 }
 if(path.length===2&&path[1]==='review'&&req.method==='POST'){
  const body=await req.json().catch(()=>({})),row=await readReel(service,id);
  if(body.confirm_rights!==true||body.confirm_editorial!==true||body.confirm_video_preview!==true)
   return json({error:'REEL_EXPLICIT_REVIEW_REQUIRED'},400);
  if(!['draft','needs_review'].includes(row.status)||row.revision!==body.revision)
   return json({error:'REEL_DRAFT_CHANGED_REFRESH_FIRST'},409);
  if(!row.video_storage_path||!row.duration_seconds||!row.caption||!row.title||!row.hook_text)
   return json({error:'REEL_VIDEO_AND_COPY_REQUIRED'},400);
  const updated=checked(await service.from('instagram_reel_drafts').update({
   status:'needs_review',rights_attested:true,revision:row.revision+1,updated_at:new Date().toISOString()
  }).eq('id',id).eq('revision',row.revision).in('status',['draft','needs_review']).select('*').maybeSingle());
  if(!updated)return json({error:'REEL_DRAFT_CHANGED_REFRESH_FIRST'},409);
  return json({draft:await reelPreview(service,updated)});
 }
 if(path.length===2&&path[1]==='approve'&&req.method==='POST'){
  const body=await req.json().catch(()=>({})),row=await readReel(service,id);
  if(body.confirm_publish!==true||body.confirm_final_preview!==true)return json({error:'REEL_PUBLISH_CONFIRMATION_REQUIRED'},400);
  if(row.status!=='needs_review'||row.rights_attested!==true||row.revision!==body.revision)
   return json({error:'REEL_REVIEW_REQUIRED_OR_DRAFT_CHANGED'},409);
  const when=body.scheduled_for===null||body.scheduled_for===''?null:typeof body.scheduled_for==='string'&&
    Number.isFinite(Date.parse(body.scheduled_for))?body.scheduled_for:undefined;
  if(when===undefined)return json({error:'INVALID_REEL_SCHEDULE'},400);
  const queued=checked(await service.rpc('enqueue_instagram_reel',{
   p_reel:id,p_revision:row.revision,p_actor:user.id,p_schedule:when
  }));
  return json({queued,info:'Approved and queued. Publisher will process at the scheduled time. Recheck history before retrying.'});
 }
 if(path.length===2&&path[1]==='retry'&&req.method==='POST'){
  const body=await req.json().catch(()=>({})),row=await readReel(service,id);
  if(body.confirm_retry!==true||row.status!=='failed'||row.revision!==body.revision||!row.marketing_run_id)
   return json({error:'REEL_RETRY_UNAVAILABLE'},409);
  const run=checked(await service.from('marketing_runs').select('status').eq('id',row.marketing_run_id).single());
  if(!run||run.status!=='failed')return json({error:'REEL_PUBLISH_MAY_HAVE_STARTED'},409);
  const attempt=checked(await service.from('instagram_reel_publish_attempts').select('stage').eq('run_id',row.marketing_run_id).maybeSingle());
  if(['publishing','sent'].includes(attempt?.stage))return json({error:'REEL_PUBLISH_MAY_HAVE_STARTED'},409);
  const updated=checked(await service.from('instagram_reel_drafts').update({
   status:'needs_review',marketing_run_id:null,approved_by:null,approved_at:null,
   approved_revision:null,rights_attested:false,scheduled_for:null,revision:row.revision+1,updated_at:new Date().toISOString()
  }).eq('id',id).eq('revision',row.revision).eq('status','failed').select('*').maybeSingle());
  if(!updated)return json({error:'REEL_DRAFT_CHANGED_REFRESH_FIRST'},409);
  return json({draft:await reelPreview(service,updated)});
 }
 if(path.length===2&&path[1]==='resolve'&&req.method==='POST'){
  const body=await req.json().catch(()=>({})),row=await readReel(service,id);
  if(body.confirm_external_check!==true||typeof body.published!=='boolean'||row.status!=='needs_review_publish'||!row.marketing_run_id)
   return json({error:'MANUAL_EXTERNAL_CHECK_REQUIRED'},409);
  const run=checked(await service.from('marketing_runs').select('status').eq('id',row.marketing_run_id).single());
  if(!run||run.status!=='needs_review')return json({error:'REEL_RUN_STATUS_CHANGED'},409);
  checked(await db.rpc('resolve_marketing_run',{p_run:row.marketing_run_id,p_published:body.published}));
  const updated=checked(await service.from('instagram_reel_drafts').update({
   status:body.published?'published':'failed',published_at:body.published?new Date().toISOString():null,
   updated_at:new Date().toISOString()
  }).eq('id',id).eq('status','needs_review_publish').select('*').maybeSingle());
  return json({draft:updated||null});
 }
 return json({error:'INVALID_REEL_ROUTE'},404);
}
