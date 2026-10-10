import 'server-only';
import {createElement as h} from 'react';
import {ImageResponse} from 'next/og';
import sharp from 'sharp';
import {createServiceRoleClient} from './supabase/service';
import {loadEditorialAssets} from './marketing-render-assets';
import {fitCarouselCopy} from './marketing-carousel-template';
import {ROUNDY_IDENTITY} from './marketing-presentation';
import {randomUUID} from 'node:crypto';

type Row=Record<string,any>;
type DB=ReturnType<typeof createServiceRoleClient>;
const checked=(r:{data:any;error:any})=>{if(r.error)throw r.error;return r.data;};
const kstDate=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{
 timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'
}).format(date);
const nextKstDate=(date:string)=>kstDate(new Date(Date.parse(date+'T00:00:00+09:00')+86400000));
const validUuid=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
function eligibleFeed(run:Row,draft:Row|undefined,tomorrow:string){
 const cover=String(run?.snapshot?.images?.[0]||'');
 return Boolean(draft&&run?.status==='queued'&&run?.channel==='instagram'
  &&(run?.snapshot?.media_kind||'feed')==='feed'
  &&run?.snapshot?.draft_id===draft.id
  &&draft.status==='scheduled'&&draft.marketing_run_id===run.id
  &&draft.approved_at&&draft.approved_by
  &&draft.quality_report?.status==='passed'
  &&draft.quality_report?.preflight?.status==='passed'
  &&draft.quality_revision===draft.revision
  &&draft.images?.[0]===cover
  &&new Date(run.scheduled_for).toISOString()>=new Date(tomorrow+'T00:00:00+09:00').toISOString()
  &&new Date(run.scheduled_for).toISOString()<new Date(nextKstDate(tomorrow)+'T00:00:00+09:00').toISOString());
}
function teaserHeading(draft:Row){
 const title=String(draft.content_document?.slides?.[0]?.title||draft.carousel_slides?.[0]?.title||'').trim();
 // The Feed-approved result headline is the source. Do not create unsupported claims.
 if(!title)throw new Error('STORY_FEED_COVER_HEADLINE_REQUIRED');
 if(title.length>95)throw new Error('STORY_HEADLINE_TOO_LONG_REVIEW_FEED_COPY');
 return title.replace(/\s+/g,' ');
}
function safeOwnedCover(url:string){
 const base=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,'')||'';
 const prefix=base+'/storage/v1/object/public/wis-event-images/';
 if(!base||!url.startsWith(prefix))throw new Error('STORY_COVER_MUST_BE_APPROVED_ROUNDY_MEDIA');
 const path=url.slice(prefix.length);
 if(!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/i.test(path))
  throw new Error('STORY_COVER_STORAGE_PATH_UNSUPPORTED');
 return path;
}
async function drawStory(db:DB,sourceCoverUrl:string,title:string,language:string){
 const path=safeOwnedCover(sourceCoverUrl);
 const downloaded=await db.storage.from('wis-event-images').download(path);
 if(downloaded.error||!downloaded.data)throw new Error('STORY_FEED_THUMBNAIL_UNAVAILABLE');
 const original=Buffer.from(await downloaded.data.arrayBuffer());
 if(original.length>6*1024*1024)throw new Error('STORY_COVER_TOO_LARGE');
 // Deliberately reveal just PART of the original 4:5 cover.
 const crop=await sharp(original).rotate().resize(1080,1350,{fit:'cover'})
  .extract({left:0,top:210,width:1080,height:850})
  .resize(924,724,{fit:'cover'}).jpeg({quality:82}).toBuffer();
 const fit=fitCarouselCopy(title,{width:895,availableHeight:312,
  preferred:language==='ko'?74:77,minimum:56,maxLines:4,label:'STORY_TEASER_TITLE'});
 const heading=language==='ko'?'내일 공개':'COMING TOMORROW';
 const description=language==='ko'?'전체 이야기는 내일 Feed에서 확인하세요.':'Find the full story in tomorrow’s Feed.';
 const assets=await loadEditorialAssets();
 const font=language==='ko'?'Noto Sans KR':'DM Sans';
 const t=(value:string,size:number,weight=700,color=ROUNDY_IDENTITY.paper)=>h('div',{
  style:{display:'flex',color,fontFamily:font,fontSize:size,fontWeight:weight,lineHeight:1.2,
   whiteSpace:'pre-wrap',wordBreak:'keep-all'}},value);
 const tree=h('div',{style:{width:1080,height:1920,display:'flex',position:'relative',
  flexDirection:'column',backgroundColor:ROUNDY_IDENTITY.ink,
  color:ROUNDY_IDENTITY.paper,padding:'170px 84px 200px',
  fontFamily:font,overflow:'hidden'}},
  h('div',{style:{display:'flex',width:'100%',justifyContent:'space-between',alignItems:'center'}},
   t('roundy',55,900),
   h('div',{style:{display:'flex',padding:'16px 26px',borderRadius:48,
    backgroundColor:ROUNDY_IDENTITY.accent,color:'#20211f',fontSize:29,fontWeight:800}},heading)
  ),
  h('div',{style:{display:'flex',width:'100%',height:720,marginTop:115,marginBottom:63,
   overflow:'hidden',borderRadius:42,position:'relative'}},
   h('img',{src:'data:image/jpeg;base64,'+crop.toString('base64'),width:924,height:724,
    style:{height:724,width:924,objectFit:'cover'}}),
   h('div',{style:{display:'flex',position:'absolute',bottom:0,left:0,right:0,
    height:155,background:'linear-gradient(0deg,rgba(32,33,31,.7),transparent)'}})
  ),
  h('div',{style:{display:'flex',flexDirection:'column',gap:13,width:'100%',maxHeight:340}},
   ...fit.lines.map((line,i)=>h('div',{key:i,style:{display:'flex',fontSize:fit.fontSize,
    fontWeight:900,lineHeight:1.18,fontFamily:font,color:'#fffefa',whiteSpace:'nowrap'}},line))),
  h('div',{style:{display:'flex',height:5,width:100,marginTop:37,backgroundColor:ROUNDY_IDENTITY.accent}}),
  h('div',{style:{display:'flex',marginTop:36}},t(description,31,400,'#fffefa')),
  h('div',{style:{display:'flex',position:'absolute',bottom:155,left:84,right:84,
   alignItems:'center',justifyContent:'space-between'}},
   t('@roundy.meet',29,700),t('ROUNDY  /  SEOUL',26,700,'#ff9999'))
 );
 const img=new ImageResponse(tree,{width:1080,height:1920,fonts:assets.fonts?.length?assets.fonts:undefined});
 const bytes=await sharp(Buffer.from(await img.arrayBuffer())).jpeg({quality:88,mozjpeg:true}).toBuffer();
 const metadata=await sharp(bytes).metadata();
 if(metadata.width!==1080||metadata.height!==1920||bytes.length>5*1024*1024)
  throw new Error('STORY_RENDER_FORMAT_INVALID');
 return bytes;
}
async function getTomorrowFeeds(db:DB,today=kstDate()){
 const tomorrow=nextKstDate(today),after=nextKstDate(tomorrow);
 const runs=checked(await db.from('marketing_runs').select('id,channel,status,scheduled_for,snapshot')
  .eq('channel','instagram').eq('status','queued')
  .gte('scheduled_for',tomorrow+'T00:00:00+09:00')
  .lt('scheduled_for',after+'T00:00:00+09:00')
  .order('scheduled_for',{ascending:true}).limit(40)) as Row[];
 const feedIds=[...new Set(runs.map((r:Row)=>String(r.snapshot?.draft_id||'')).filter(validUuid))];
 if(!feedIds.length)return [];
 const drafts=checked(await db.from('instagram_post_drafts').select('*').in('id',feedIds)) as Row[];
 const byId=new Map(drafts.map(d=>[d.id,d]));
 return runs.filter((r:Row)=>eligibleFeed(r,byId.get(r.snapshot?.draft_id),tomorrow))
  .map((r:Row)=>({run:r,draft:byId.get(r.snapshot.draft_id) as Row,tomorrow,today}));
}
export async function generateStoryForFeed(db:DB,feed:Awaited<ReturnType<typeof getTomorrowFeeds>>[number]){
 const {run,draft,tomorrow,today}=feed;
 const cover=String(run.snapshot.images[0]);
 safeOwnedCover(cover);
 const title=teaserHeading(draft),language=draft.content_language==='en'?'en':'ko';
 const input={feed_run_id:run.id,feed_draft_id:draft.id,feed_scheduled_for:run.scheduled_for,
  feed_date_kst:tomorrow,preview_date_kst:today,source_cover_url:cover,
  teaser_title:title,language,media_format:'jpeg_static',status:'generating'};
 // Unique feed_run_id prevents duplicate creation under concurrent cron invocations.
 const attempt=await db.from('marketing_story_previews')
  .upsert(input,{onConflict:'feed_run_id',ignoreDuplicates:true}).select('*');
 if(attempt.error)throw attempt.error;
 const row=attempt.data?.[0] as Row|undefined;
 if(!row)return {skipped:true,reason:'STORY_ALREADY_CREATED',feed_run_id:run.id};
 try{
  const output=await drawStory(db,cover,title,language);
  const mediaPath='story-previews/'+row.id+'/'+randomUUID()+'.jpg';
  checked(await db.storage.from('wis-event-images').upload(mediaPath,output,{contentType:'image/jpeg',upsert:false}));
  const publicUrl=db.storage.from('wis-event-images').getPublicUrl(mediaPath).data.publicUrl;
  const saved=checked(await db.from('marketing_story_previews').update({
   status:'generated',image_path:mediaPath,image_url:publicUrl,updated_at:new Date().toISOString()
  }).eq('id',row.id).eq('status','generating').select('*').single());
  return {story:saved,created:true};
 }catch(error){
  const detail=error instanceof Error?error.message:'Story preview generation failed';
  checked(await db.from('marketing_story_previews').update({
   status:'failed',error_code:'STORY_GENERATION_FAILED',error_message:detail.slice(0,500),updated_at:new Date().toISOString()
  }).eq('id',row.id).eq('status','generating'));
  return {story_id:row.id,error:detail,created:false};
 }
}
export async function generateTomorrowStoryPreviews(options:{manual?:boolean}={}){
 const db=createServiceRoleClient();
 if(!options.manual){
  const settings=checked(await db.from('marketing_automation_settings')
   .select('story_preview_auto_enabled').eq('singleton',true).single());
  if(settings.story_preview_auto_enabled!==true)return {skipped:true,reason:'STORY_PREVIEW_DISABLED'};
 }
 const ready=await getTomorrowFeeds(db);
 const results=[];
 for(const feed of ready)results.push(await generateStoryForFeed(db,feed));
 return {checked_feeds:ready.length,created:results.filter(x=>'created'in x&&x.created).length,results};
}
export async function generateSelectedStoryPreview(feedRunId:string){
 if(!validUuid(feedRunId))throw new Error('INVALID_FEED_RUN_ID');
 const db=createServiceRoleClient(),feeds=await getTomorrowFeeds(db);
 const feed=feeds.find(item=>item.run.id===feedRunId);
 if(!feed)throw new Error('STORY_FEED_MUST_BE_APPROVED_AND_SCHEDULED_FOR_TOMORROW');
 return generateStoryForFeed(db,feed);
}
