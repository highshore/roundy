import 'server-only';
import {createServiceRoleClient} from './supabase/service';
import {contentResult,startContentWorkflow} from './marketing-content-controller';
import {kstDate} from './marketing-generation';
import {growthLearningWeights} from './marketing-growth';
import {planGrowthSlot} from './marketing-growth-planner';
import {selectTrendForAutomaticContent} from './marketing-trend-radar';
import {selectAutomaticEventCampaign} from './marketing-event-campaign';
import {seriesForTopic} from './marketing-editor-first';
type DB=ReturnType<typeof createServiceRoleClient>;
export async function startAutomaticContentWorkflow(db:DB,event=false){
 if(process.env.VERCEL_ENV&&process.env.VERCEL_ENV!=='production')throw new Error('PRODUCTION_ONLY');
 const control=contentResult(await db.from('marketing_content_workflow_control').select('enabled').eq('singleton',true).single());
 if(!control?.enabled)return {skipped:true,reason:'CONTENT_WORKFLOW_PAUSED'};
 const settings=contentResult(await db.from('marketing_automation_settings').select('*').eq('singleton',true).single());
 const date=kstDate(),time=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
 if(event?settings.event_campaign_enabled===false:!settings.daily_instagram_enabled||time<String(settings.draft_generation_time_kst).slice(0,5))return {skipped:true};
 const key='auto:'+date;
 if(!event){
  const old=contentResult(await db.from('marketing_generation_jobs').select('id').eq('request_key',key).maybeSingle());
  if(old)return {deduplicated:true,job:old};
  const current=contentResult(await db.from('marketing_contents').select('*').eq('request_key',key).maybeSingle());
  if(current)return {content:current,deduplicated:true};
 }
 const recent=contentResult(await db.from('marketing_contents').select('request_payload').order('created_at',{ascending:false}).limit(1).maybeSingle());
 const language=recent?.request_payload?.language==='ko'?'en':'ko';
 if(event){
  const opportunity=await selectAutomaticEventCampaign(db,Number(settings.event_campaign_max_posts||5));
  if(!opportunity)return {skipped:true,reason:'NO_EVENT_CAMPAIGN_OPPORTUNITY'};
  return startContentWorkflow(db,{request_key:'auto:event:'+opportunity.event_id+':'+opportunity.stage,
   revision:1,mode:'both',visual_mode:'cards',visual_source:'stock',content_mode:'live_event',language,
   event_id:opportunity.event_id,event_campaign_stage:opportunity.stage,event_campaign_pattern:opportunity.pattern,instruction:''},null,'automatic');
 }
 const plan=settings.growth_mode_enabled?planGrowthSlot(date,await growthLearningWeights(db)):null;
 const trend=(!plan||plan.pillar==='seoul')&&settings.trend_radar_enabled&&settings.trend_override_enabled
  ?await selectTrendForAutomaticContent(db,Number(settings.trend_override_score||80)):null;
 const topic=trend?'seoul_trend':plan?.pillar==='seoul'?'korea_life':plan?.topic_type||'conversation_prompt';
 const mode=plan?.pillar==='brand'?'prelaunch':'growth_carousel';
 return startContentWorkflow(db,{request_key:key,revision:1,mode:'both',visual_mode:'cards',visual_source:'stock',
  content_mode:mode,topic_type:mode==='growth_carousel'?topic:undefined,language:plan?.language||language,
  editorial_series:seriesForTopic(topic),instruction:trend?[trend.display_name,trend.content_angle||trend.summary||''].filter(Boolean).join(': ').slice(0,500):''},
  null,'automatic',{trend_id:trend?.id||null});
}
