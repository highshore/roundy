import { NextRequest, NextResponse } from 'next/server';
import type { createClient } from './supabase/server';
import { createServiceRoleClient } from './supabase/service';

type Client=Awaited<ReturnType<typeof createClient>>;
type ContentMode='prelaunch'|'live_event';
type RegenerationMode='text'|'image'|'both';
type GrowthTopic='mbti'|'dating_archetype'|'book_insight'|'trend_research'|'meme_remix'|'dating_myth'|'conversation_prompt'|'seoul_dating'|'mini_quiz';
type CarouselSlide={eyebrow:string;title:string;body:string;source_label:string;variant:'hook'|'content'|'source'|'roundy'};
type ResearchSource={title:string;publisher:string;url:string;date:string};
type DraftRow={
 id:string;draft_date:string;event_id:string|null;content_pillar:string;caption:string;cta:string;destination_url:string;
 images:string[];status:string;generation_reason:string;recommended_time_kst:string;window_start_kst:string;window_end_kst:string;
 scheduled_for:string|null;revision:number;content_mode:ContentMode;draft_kind:'brand'|'growth_carousel';growth_topic_type:GrowthTopic|null;
 carousel_slides:CarouselSlide[];research_sources:ResearchSource[];research_status:'not_required'|'pending'|'generated'|'failed';
};
type EventRow={
 id:string;slug:string;title:string;starts_at:string;venue:string;neighborhood:string;age_min:number;age_max:number;
 capacity:number;seats_remaining:number;price_gents:number;price_ladies:number;
};
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});

async function invokeMarketingWorker(db:Client,body:Record<string,unknown>,timeout=45000){
 const {data:{session},error:sessionError}=await db.auth.getSession();
 if(sessionError||!session?.access_token)throw new Error('Sign in required');
 const result=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+'/functions/v1/roundy-marketing',{
  method:'POST',
  headers:{Authorization:'Bearer '+session.access_token,apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,'Content-Type':'application/json'},
  body:JSON.stringify(body),
  signal:AbortSignal.timeout(timeout)
 });
 const payload=await result.json().catch(()=>({}));
 if(!result.ok)throw new Error(typeof payload.error==='string'?payload.error:'Marketing request failed');
 return payload;
}

type AiTransport={base:string;key:string;gateway:boolean};
async function upstreamApiError(response:Response,fallback:string){
 const raw=await response.text().catch(()=> '');
 let detail='';
 if(raw){
  try{
   const parsed=JSON.parse(raw) as {error?:{message?:unknown};message?:unknown};
   detail=typeof parsed.error?.message==='string'?parsed.error.message:typeof parsed.message==='string'?parsed.message:'';
  }catch{detail=raw;}
 }
 detail=detail.replace(/\s+/g,' ').trim().slice(0,500);
 return new Error(detail?fallback+': '+detail:fallback+' ('+response.status+').');
}
function aiTransport():AiTransport{
 const direct=process.env.OPENAI_API_KEY?.trim();
 if(direct)return {base:'https://api.openai.com/v1',key:direct,gateway:false};
 const gateway=(process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN)?.trim();
 if(gateway)return {base:'https://ai-gateway.vercel.sh/v1',key:gateway,gateway:true};
 throw new Error('AI generation is not available in this deployment.');
}
async function openAIJson(system:string,input:Record<string,unknown>){
 const ai=aiTransport();
 const response=await fetch(ai.base+'/chat/completions',{
  method:'POST',
  headers:{Authorization:'Bearer '+ai.key,'Content-Type':'application/json'},
  body:JSON.stringify({
   model:ai.gateway?(process.env.MARKETING_GATEWAY_COPY_MODEL||'openai/gpt-5.6-sol'):(process.env.MARKETING_COPY_MODEL||'gpt-4.1-mini'),
   temperature:.7,
   response_format:{type:'json_object'},
   messages:[
    {role:'system',content:system},
    {role:'user',content:JSON.stringify(input)}
   ]
  }),
  signal:AbortSignal.timeout(45000)
 });
 if(!response.ok)throw await upstreamApiError(response,'Could not generate marketing copy');
 const result=await response.json();
 const raw=result.choices?.[0]?.message?.content;
 if(typeof raw!=='string')throw new Error('AI returned an invalid marketing draft.');
 try{return JSON.parse(raw) as Record<string,unknown>;}catch{
  const first=raw.indexOf('{'),last=raw.lastIndexOf('}');
  if(first>=0&&last>first)return JSON.parse(raw.slice(first,last+1)) as Record<string,unknown>;
  throw new Error('AI returned invalid JSON.');
 }
}


const growthTopics:GrowthTopic[]=['mbti','dating_archetype','book_insight','trend_research','meme_remix','dating_myth','conversation_prompt','seoul_dating','mini_quiz'];
function growthTopicGuidance(topic:GrowthTopic){
 const guides:Record<GrowthTopic,string>={
  mbti:'Create a playful MBTI dating-archetype carousel. Clearly frame it as entertainment and not scientific compatibility prediction. Avoid negative stereotyping.',
  dating_archetype:'Create original, relatable dating archetypes based on everyday behavior, not protected traits or mental-health labels.',
  book_insight:'Use a relationship, communication or human-connection idea from a real book. Prefer paraphrase. Any direct copyrighted-book quote must be 15 words or fewer and verified. Attribute title and author. Never fabricate a quote.',
  trend_research:'Find a recent, credible relationship, communication, social-connection or dating study or research result. Prefer peer-reviewed journals, universities or established research organizations. Distinguish correlation from causation.',
  meme_remix:'Find a current harmless meme or social format relevant to dating or social life, then create an original Roundy interpretation. Do not reproduce the meme image, screenshot, creator text or punchline verbatim.',
  dating_myth:'Take one common dating myth and replace it with a nuanced, non-manipulative perspective. Avoid pickup tactics or adversarial gender framing.',
  conversation_prompt:'Create useful first-conversation prompts people may want to save. Avoid sexual, invasive, financial or discriminatory questions.',
  seoul_dating:'Create a relatable Seoul social/dating observation without stereotyping Koreans or foreigners. If making factual claims, source them.',
  mini_quiz:'Create a light self-reflection mini quiz about first-date or conversation style. It must not diagnose personality, compatibility or mental health.'
 };
 return guides[topic];
}
function growthSystemPrompt(topic:GrowthTopic){
 return [
  'You are an editorial strategist for Roundy, a pre-launch Seoul offline 1:1 rotation dating/mingle service for Korean and international adults.',
  'Create ORIGINAL Instagram carousel editorial content designed to be useful, relatable and naturally shareable or saveable without engagement bait.',
  'Instagram recommendation eligibility matters: do not use clickbait, fake urgency, engagement bait, copied posts, copied meme screenshots, sensational misinformation or low-value reposting.',
  'Slides 1 through 5 must stand on their own as useful or entertaining content. Only slide 6 may bridge to Roundy and mention the pre-launch brand.',
  'Roundy is NOT officially launched. Never mention test event dates, venue, ticket price, seats, attendees, reviews, launch date, booking availability or an active event.',
  'Avoid manipulative dating advice, pickup tactics, gender hostility, sexual content, body shaming, mental-health diagnosis, substance use, political content and discriminatory stereotypes.',
  'Use Korean-first carousel copy because the account is Seoul-focused, with brief English phrases only when natural. Keep slides clean enough to fit a 1080x1350 card.',
  'Do not ask people to tag friends, spam comments, or perform artificial engagement actions.',
  growthTopicGuidance(topic),
  'Create exactly 6 slides. Slide 1 is the hook. Slides 2-4 deliver the core value. Slide 5 is a takeaway/source/context slide. Slide 6 is the only Roundy bridge and should softly say Roundy is preparing face-to-face 1:1 rotation meetings in Seoul and invite people to follow @roundy.meet for launch updates.',
  'For research/book/trend factual claims, use web search and include up to 3 trustworthy source URLs. If a claim cannot be verified, omit it.',
  'Return JSON only with keys: topic_type, headline, caption, cta, generation_reason, slides, sources.',
  'Each slide object must contain eyebrow, title, body, source_label, variant. variant must be hook, content, source, or roundy.',
  'Each source object must contain title, publisher, url, date. Keep caption under 1500 characters and CTA under 80 characters. No em dash.'
 ].join(' ');
}
function responseText(result:any){
 const parts:string[]=[];
 for(const item of Array.isArray(result?.output)?result.output:[]){
  if(item?.type!=='message'||!Array.isArray(item.content))continue;
  for(const content of item.content)if(content?.type==='output_text'&&typeof content.text==='string')parts.push(content.text);
 }
 return parts.join('\n').trim();
}
function parseJsonObject(raw:string){
 const clean=raw.trim();
 try{return JSON.parse(clean) as Record<string,unknown>;}catch{
  const start=clean.indexOf('{'),end=clean.lastIndexOf('}');
  if(start>=0&&end>start)return JSON.parse(clean.slice(start,end+1)) as Record<string,unknown>;
  throw new Error('AI returned invalid carousel JSON.');
 }
}
function validateGrowthSlides(value:unknown){
 if(!Array.isArray(value)||value.length!==6)throw new Error('Growth carousel must contain exactly 6 slides.');
 return value.map((item,index)=>{
  if(!item||typeof item!=='object')throw new Error('Invalid carousel slide.');
  const row=item as Record<string,unknown>;
  const eyebrow=String(row.eyebrow??'').trim().slice(0,60);
  const title=String(row.title??'').trim().slice(0,120);
  const body=String(row.body??'').trim().slice(0,420);
  const source_label=String(row.source_label??'').trim().slice(0,140);
  const variant=String(row.variant??(index===0?'hook':index===5?'roundy':'content'));
  if(!title||!body||!['hook','content','source','roundy'].includes(variant))throw new Error('Invalid carousel slide content.');
  if(index===5&&variant!=='roundy')throw new Error('The final slide must be the Roundy bridge.');
  return {eyebrow,title,body,source_label,variant:variant as CarouselSlide['variant']};
 });
}
function validateResearchSources(value:unknown){
 if(!Array.isArray(value))return [] as ResearchSource[];
 const rows:ResearchSource[]=[];
 for(const item of value.slice(0,3)){
  if(!item||typeof item!=='object')continue;
  const row=item as Record<string,unknown>,sourceUrl=String(row.url??'').trim();
  if(!sourceUrl.startsWith('https://'))continue;
  rows.push({
   title:String(row.title??'').trim().slice(0,180),
   publisher:String(row.publisher??'').trim().slice(0,100),
   url:sourceUrl.slice(0,1000),
   date:String(row.date??'').trim().slice(0,40)
  });
 }
 return rows;
}
async function generateGrowthCarousel(db:Client,draftId:string,body:Record<string,unknown>){
 const instruction=typeof body.instruction==='string'?body.instruction.trim():'';
 if(instruction.length>500)throw new Error('Growth instructions must be 500 characters or fewer.');
 const requested=String(body.topic_type??'') as GrowthTopic;
 const {data:draft,error:draftError}=await db.from('instagram_post_drafts').select('*').eq('id',draftId).eq('status','needs_approval').maybeSingle();
 if(draftError)throw draftError;if(!draft)throw new Error('Only a draft waiting for approval can be generated.');
 const current=draft as DraftRow;
 const topic=growthTopics.includes(requested)?requested:(current.growth_topic_type&&growthTopics.includes(current.growth_topic_type)?current.growth_topic_type:'mbti');
 const ai=aiTransport();
 const prompt=[
  'Topic type: '+topic,
  instruction?'Admin direction: '+instruction:'Use the topic naturally and make it highly relevant to Seoul adults in their 20s and 30s.',
  'Today: '+new Date().toISOString().slice(0,10),
  'Do not use any Roundy test event information.',
  'Return JSON only.'
 ].join('\n');
 const response=await fetch(ai.base+'/responses',{
  method:'POST',
  headers:{Authorization:'Bearer '+ai.key,'Content-Type':'application/json'},
  body:JSON.stringify({
   model:ai.gateway?(process.env.MARKETING_GATEWAY_RESEARCH_MODEL||'openai/gpt-5.6-sol'):(process.env.MARKETING_RESEARCH_MODEL||'gpt-5'),
   tools:[{type:'web_search'}],
   instructions:growthSystemPrompt(topic),
   input:prompt,
   max_output_tokens:5000
  }),
  signal:AbortSignal.timeout(90000)
 });
 if(!response.ok)throw await upstreamApiError(response,'Could not research the Growth Carousel');
 const result=await response.json(),generated=parseJsonObject(responseText(result));
 const slides=validateGrowthSlides(generated.slides),sources=validateResearchSources(generated.sources);
 const caption=String(generated.caption??'').trim(),cta=String(generated.cta??'Follow @roundy.meet for launch updates').trim();
 if(!caption||caption.length>1500)throw new Error('Generated Growth Carousel caption was invalid.');
 if(cta.length>80)throw new Error('Generated Growth Carousel CTA was invalid.');
 const generationReason=String(generated.generation_reason??'Original Growth Carousel generated with current web research.').slice(0,1000);
 const {data:updated,error:updateError}=await db.from('instagram_post_drafts').update({
  draft_kind:'growth_carousel',
  growth_topic_type:topic,
  carousel_slides:slides,
  research_sources:sources,
  research_status:'generated',
  caption,
  cta,
  destination_url:'https://roundy.team',
  content_mode:'prelaunch',
  event_id:null,
  generation_reason:generationReason,
  images:[],
  revision:Number(current.revision||1)+1,
  last_regeneration_mode:'both',
  last_regeneration_instruction:instruction,
  regenerated_at:new Date().toISOString()
 }).eq('id',draftId).eq('status','needs_approval').select('*').single();
 if(updateError)throw updateError;
 return updated;
}

async function generateMarketingImage(prompt:string,draftId:string){
 const ai=aiTransport();
 let encoded:string|undefined;
 if(ai.gateway){
  const response=await fetch(ai.base+'/images/generations',{
   method:'POST',
   headers:{Authorization:'Bearer '+ai.key,'Content-Type':'application/json'},
   body:JSON.stringify({
    model:process.env.MARKETING_GATEWAY_IMAGE_MODEL||'openai/gpt-image-2.5-flare',
    prompt,
    n:1,
    size:'1024x1280',
    quality:'low',
    output_format:'jpeg'
   }),
   signal:AbortSignal.timeout(120000)
  });
  if(!response.ok)throw await upstreamApiError(response,'Could not generate the marketing image');
  const result=await response.json();
  encoded=result.data?.[0]?.b64_json;
 }else{
  const response=await fetch(ai.base+'/responses',{
   method:'POST',
   headers:{Authorization:'Bearer '+ai.key,'Content-Type':'application/json'},
   body:JSON.stringify({
    model:process.env.MARKETING_IMAGE_ORCHESTRATOR_MODEL||'gpt-5',
    input:[{role:'user',content:[{type:'input_text',text:prompt}]}],
    tools:[{
     type:'image_generation',
     model:process.env.MARKETING_IMAGE_MODEL||'gpt-image-2.5-flare',
     action:'generate',
     size:'1024x1280',
     quality:'low',
     output_format:'jpeg',
     background:'opaque'
    }],
    tool_choice:{type:'image_generation'}
   }),
   signal:AbortSignal.timeout(120000)
  });
  if(!response.ok)throw await upstreamApiError(response,'Could not generate the marketing image');
  const result=await response.json();
  const imageCall=Array.isArray(result.output)?result.output.find((item:Record<string,unknown>)=>item?.type==='image_generation_call'&&typeof item.result==='string'):null;
  encoded=typeof imageCall?.result==='string'?imageCall.result:undefined;
 }
 if(typeof encoded!=='string'||encoded.length<100)throw new Error('AI did not return an image.');
 const bytes=Buffer.from(encoded,'base64');
 if(bytes.length>12*1024*1024)throw new Error('Generated image is too large.');
 const service=createServiceRoleClient();
 const objectPath=draftId+'/'+crypto.randomUUID()+'.jpg';
 const {error}=await service.storage.from('wis-event-images').upload(objectPath,bytes,{contentType:'image/jpeg',upsert:false});
 if(error)throw error;
 return service.storage.from('wis-event-images').getPublicUrl(objectPath).data.publicUrl;
}

async function liveEventForDraft(service:ReturnType<typeof createServiceRoleClient>,draft:DraftRow){
 if(draft.event_id){
  const {data,error}=await service.from('events').select('id,slug,title,starts_at,venue,neighborhood,age_min,age_max,capacity,seats_remaining,price_gents,price_ladies').eq('id',draft.event_id).is('deleted_at',null).maybeSingle();
  if(error)throw error;if(data)return data as EventRow;
 }
 const {data,error}=await service.from('events').select('id,slug,title,starts_at,venue,neighborhood,age_min,age_max,capacity,seats_remaining,price_gents,price_ladies').eq('status','live').is('deleted_at',null).gt('starts_at',new Date().toISOString()).order('starts_at').limit(1).maybeSingle();
 if(error)throw error;
 if(!data)throw new Error('No upcoming live event is available for event-based content.');
 return data as EventRow;
}

function prelaunchSystem(){
 return [
  'You create Instagram marketing copy for Roundy, a Seoul-based offline 1:1 rotation dating/mingle service for Korean and international adults.',
  'Roundy has NOT officially launched yet. The current goal is audience building and attracting early users before launch.',
  'Current website event rows are TEST DATA. Never mention or infer any event date, venue, ticket price, seat count, availability, attendee count, launch date, real participant, testimonial, review, booking status, sellout status, or claim that an event is currently open.',
  'Do not say book now, tickets available, almost full, early bird, tonight, this weekend, or similar live-event language.',
  'Safe factual concepts: Seoul, offline face-to-face 1:1 conversations, rotation format, Korean and international community, mutual interest before reconnecting, moving beyond endless swiping.',
  'Primary CTA should be to follow @roundy.meet and/or visit https://roundy.team for launch updates. Do not invent a waitlist unless the input explicitly says one exists.',
  'Write English first and Korean second. Keep one clear idea per post, a concise hook, natural premium dating tone, and a few relevant hashtags. No em dash.',
  'Return JSON only with caption, cta, content_pillar, generation_reason, image_brief.',
  'content_pillar must be one of problem, concept, seoul, trust.'
 ].join(' ');
}

function liveEventSystem(){
 return [
  'You create Instagram marketing copy for Roundy, a Seoul-based offline 1:1 rotation dating/mingle service for Korean and international adults.',
  'Use only the event facts supplied in the user data. Never invent attendee demographics, reviews, popularity, availability, discounts or claims not present in the data.',
  'Roundy uses short face-to-face 1:1 conversations and reconnects people only when interest is mutual.',
  'Write English first and Korean second. Keep one clear idea per post, a concise hook, natural premium dating tone, and a few relevant hashtags. No em dash.',
  'Return JSON only with caption, cta, content_pillar, generation_reason, image_brief.',
  'content_pillar must be one of event, urgency, problem, concept, seoul, trust.'
 ].join(' ');
}

function imagePrompt(mode:ContentMode,instruction:string,caption:string,imageBrief:string){
 const base=[
  'Create one portrait 4:5 hyper-realistic Instagram marketing photograph for Roundy.',
  'Scene: Seoul, polished but natural social venue, a Korean and an international adult in their late 20s or early 30s having a warm face-to-face 1:1 conversation in a rotation mingle setting.',
  'Dating-appropriate smart casual clothing, realistic skin texture, candid body language, coffee or non-alcoholic drinks only.',
  'International Seoul atmosphere, premium editorial lifestyle photography, cinematic natural indoor lighting, shallow depth of field.',
  'No text, no captions, no logos, no watermarks, no UI, no alcohol, no exaggerated romance, no staged stock-photo look.'
 ];
 if(mode==='prelaunch')base.push('This is pre-launch brand awareness creative. Do not depict a specific advertised event, venue signage, ticketing, dates, prices or seat availability.');
 else base.push('The image may communicate an upcoming social event atmosphere, but must not show dates, prices, seat counts, venue signage or written event details.');
 if(imageBrief)base.push('Creative brief: '+imageBrief);
 if(caption)base.push('Post context: '+caption.slice(0,1000));
 if(instruction)base.push('Admin creative direction: '+instruction);
 return base.join('\n');
}

async function regenerateDraftAI(db:Client,draftId:string,body:Record<string,unknown>){
 const mode=body.mode as RegenerationMode;
 const contentMode=body.content_mode as ContentMode;
 const instruction=typeof body.instruction==='string'?body.instruction.trim():'';
 if(!['text','image','both'].includes(mode))throw new Error('Choose text, image, or both.');
 if(!['prelaunch','live_event'].includes(contentMode))throw new Error('Choose a content source.');
 if(instruction.length>500)throw new Error('Regeneration instructions must be 500 characters or fewer.');
 const {data:draft,error:draftError}=await db.from('instagram_post_drafts').select('*').eq('id',draftId).eq('status','needs_approval').maybeSingle();
 if(draftError)throw draftError;if(!draft)throw new Error('Only a draft waiting for approval can be regenerated.');
 const current=draft as DraftRow,service=createServiceRoleClient();
 let event:EventRow|null=null;
 if(contentMode==='live_event')event=await liveEventForDraft(service,current);

 let caption=current.caption,cta=current.cta,pillar=current.content_pillar,reason=current.generation_reason,imageBrief='';
 if(mode==='text'||mode==='both'){
  const facts=event?{
   id:event.id,title:event.title,starts_at:event.starts_at,venue:event.venue,neighborhood:event.neighborhood,
   age_min:event.age_min,age_max:event.age_max,capacity:event.capacity,seats_remaining:event.seats_remaining,
   price_gents:event.price_gents,price_ladies:event.price_ladies
  }:null;
  const generated=await openAIJson(contentMode==='prelaunch'?prelaunchSystem():liveEventSystem(),{
   content_mode:contentMode,
   admin_instruction:instruction,
   current_draft:{caption:current.caption,cta:current.cta,content_pillar:current.content_pillar},
   event:facts
  });
  if(typeof generated.caption!=='string'||!generated.caption.trim()||generated.caption.length>2000)throw new Error('AI caption was invalid.');
  if(typeof generated.cta!=='string'||generated.cta.length>80)throw new Error('AI CTA was invalid.');
  const allowed=contentMode==='prelaunch'?['problem','concept','seoul','trust']:['event','urgency','problem','concept','seoul','trust'];
  const nextPillar=String(generated.content_pillar||'');
  if(!allowed.includes(nextPillar))throw new Error('AI content pillar was invalid.');
  caption=generated.caption.trim();cta=generated.cta.trim();pillar=nextPillar;
  reason=typeof generated.generation_reason==='string'?generated.generation_reason.slice(0,1000):'AI regenerated from admin direction.';
  imageBrief=typeof generated.image_brief==='string'?generated.image_brief.slice(0,1000):'';
 }

 let images=current.images;
 if(mode==='image'||mode==='both'){
  const generatedImage=await generateMarketingImage(imagePrompt(contentMode,instruction,caption,imageBrief),draftId);
  images=[generatedImage];
 }

 const destination=contentMode==='prelaunch'?'https://roundy.team':event?'https://roundy.team/events/'+event.slug:'https://roundy.team';
 const now=new Date().toISOString();
 const {data:updated,error:updateError}=await db.from('instagram_post_drafts').update({
  event_id:event?.id??null,
  content_mode:contentMode,
  draft_kind:'brand',
  growth_topic_type:null,
  carousel_slides:[],
  research_sources:[],
  research_status:'not_required',
  content_pillar:pillar,
  caption,
  cta,
  destination_url:destination,
  images,
  generation_reason:reason,
  revision:Number(current.revision||1)+1,
  last_regeneration_mode:mode,
  last_regeneration_instruction:instruction,
  regenerated_at:now
 }).eq('id',draftId).eq('status','needs_approval').select('*').single();
 if(updateError)throw updateError;
 return updated;
}

export async function marketingApi(req:NextRequest,db:Client,path:string[]){
 const id=path[0];
 if(!id&&req.method==='GET'){
  const [templates,runs,settings,inbox,webhook,drafts,recommendations,insights]=await Promise.all([
   db.from('marketing_templates').select('*').order('updated_at',{ascending:false}),
   db.from('marketing_runs').select('*').order('created_at',{ascending:false}).limit(100),
   db.from('marketing_automation_settings').select('*').eq('singleton',true).single(),
   db.from('instagram_inbox').select('*').in('status',['new','needs_review','failed']).order('received_at',{ascending:false}).limit(100),
   createServiceRoleClient().rpc('instagram_webhook_setup_service'),
   db.from('instagram_post_drafts').select('*').eq('draft_role','candidate').eq('status','needs_approval').order('imported_at',{ascending:false}).order('updated_at',{ascending:false}).limit(100),
   db.from('instagram_posting_time_recommendations').select('*').order('dow'),
   db.from('instagram_post_insights').select('*').order('captured_at',{ascending:false}).limit(30)
  ]);
  for(const result of [templates,runs,settings,inbox,webhook,drafts,recommendations,insights])if(result.error)throw result.error;
  const {data:{session}}=await db.auth.getSession();
  const connection=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+'/functions/v1/roundy-marketing',{headers:{Authorization:'Bearer '+session?.access_token,apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!},signal:AbortSignal.timeout(8000)}).then(r=>r.ok?r.json():null).catch(()=>null);
  const setup=webhook.data as {callback_key?:string;verify_token?:string;verified_at?:string|null;last_received_at?:string|null}|null;
  const callbackUrl=setup?.callback_key?process.env.NEXT_PUBLIC_SUPABASE_URL+'/functions/v1/instagram-webhook?key='+encodeURIComponent(setup.callback_key):'';
  return json({
   templates:templates.data,
   runs:runs.data,
   settings:settings.data,
   drafts:drafts.data,
   recommendations:recommendations.data,
   insights:insights.data,
   inbox:inbox.data,
   webhook:{callback_url:callbackUrl,verify_token:setup?.verify_token??'',verified_at:setup?.verified_at??null,last_received_at:setup?.last_received_at??null},
   connection:connection??{instagram:false,koreapas:false,unavailable:true}
  });
 }
 if(id==='settings'&&req.method==='PUT'){
  const body=await req.json().catch(()=>null);
  const timePattern=/^([01]\d|2[0-3]):[0-5]\d(:00)?$/;
  const growthDays:number[]=Array.isArray(body?.growth_days)?body.growth_days.map((value:unknown)=>Number(value)):[];
  const growthCount=Number(body?.growth_posts_per_week),trendThreshold=Number(body?.trend_override_score??80);
  const trendRadar=body?.trend_radar_enabled??true,trendOverride=body?.trend_override_enabled??true;
  if(!body||typeof body.daily_instagram_enabled!=='boolean'||typeof body.auto_reply_enabled!=='boolean'||typeof body.optimization_enabled!=='boolean'||typeof body.growth_carousel_enabled!=='boolean'||typeof trendRadar!=='boolean'||typeof trendOverride!=='boolean'||typeof body.daily_time_kst!=='string'||typeof body.draft_generation_time_kst!=='string'||!['prelaunch','live_event'].includes(body.content_mode)||!timePattern.test(body.daily_time_kst)||!timePattern.test(body.draft_generation_time_kst)||!Number.isInteger(growthCount)||growthCount<0||growthCount>7||growthDays.some(day=>!Number.isInteger(day)||day<0||day>6)||new Set(growthDays).size!==growthDays.length||growthDays.length!==growthCount||!Number.isInteger(trendThreshold)||trendThreshold<60||trendThreshold>100)return json({error:'Invalid automation settings'},400);
  const {data,error}=await db.from('marketing_automation_settings').update({
   daily_instagram_enabled:body.daily_instagram_enabled,
   daily_time_kst:body.daily_time_kst.slice(0,5),
   draft_generation_time_kst:body.draft_generation_time_kst.slice(0,5),
   optimization_enabled:body.optimization_enabled,
   auto_reply_enabled:body.auto_reply_enabled,
   content_mode:body.content_mode,
   growth_carousel_enabled:body.growth_carousel_enabled,
   growth_posts_per_week:growthCount,
   growth_days:growthDays,
   trend_radar_enabled:trendRadar,
   trend_scan_interval_hours:168,
   trend_override_enabled:trendOverride,
   trend_override_score:trendThreshold
  }).eq('singleton',true).select('*').single();
  if(error)throw error;return json({settings:data});
 }
 if(id==='draft'&&path[1]==='generate'&&req.method==='POST'){
  const result=await invokeMarketingWorker(db,{action:'generate_draft_now'});
  return json(result);
 }
 if(id==='draft'&&path[1]&&path[2]==='growth-generate'&&req.method==='POST'){
  if(!/^[0-9a-f-]{36}$/i.test(path[1]))return json({error:'Invalid draft'},400);
  const requestBody=await req.json().catch(()=>({}));
  try{
   const draft=await generateGrowthCarousel(db,path[1],requestBody&&typeof requestBody==='object'?requestBody as Record<string,unknown>:{});
   return json({draft});
  }catch(error){
   const message=error instanceof Error?error.message:'Growth Carousel generation failed.';
   await db.from('instagram_post_drafts').update({research_status:'failed',generation_reason:message.slice(0,1000)}).eq('id',path[1]).eq('status','needs_approval');
   throw error;
  }
 }
 if(id==='draft'&&path[1]&&path[2]==='regenerate'&&req.method==='POST'){
  if(!/^[0-9a-f-]{36}$/i.test(path[1]))return json({error:'Invalid draft'},400);
  const body=await req.json().catch(()=>null);
  if(!body||typeof body!=='object')return json({error:'Invalid regeneration request'},400);
  const draft=await regenerateDraftAI(db,path[1],body as Record<string,unknown>);
  return json({draft});
 }
 if(id==='draft'&&path[1]&&req.method==='PUT'){
  if(!/^[0-9a-f-]{36}$/i.test(path[1]))return json({error:'Invalid draft'},400);
  const body=await req.json().catch(()=>null);
  if(!body||typeof body.caption!=='string'||!body.caption.trim()||body.caption.length>2000||typeof body.cta!=='string'||body.cta.length>80||typeof body.destination_url!=='string')return json({error:'Invalid draft content'},400);
  if(body.destination_url){const destination=new URL(body.destination_url);if(destination.protocol!=='https:'||destination.username||destination.password)return json({error:'Use an HTTPS destination URL.'},400);}
  const update:Record<string,unknown>={caption:body.caption.trim(),cta:body.cta.trim(),destination_url:body.destination_url.trim()};
  if(body.images!==undefined){
   const base=process.env.NEXT_PUBLIC_SUPABASE_URL+'/storage/v1/object/public/wis-event-images/';
   if(!Array.isArray(body.images)||body.images.length>10||body.images.some((src:unknown)=>typeof src!=='string'||!src.startsWith(base)||!/^[-a-f0-9]+\/[-a-f0-9]+\.jpg$/.test(src.slice(base.length))))return json({error:'Invalid draft images'},400);
   update.images=body.images;
  }
  const {data,error}=await db.from('instagram_post_drafts').update(update).eq('id',path[1]).eq('status','needs_approval').select('*').maybeSingle();
  if(error)throw error;if(!data)return json({error:'Only a draft waiting for approval can be edited.'},409);return json({draft:data});
 }
 if(id==='draft'&&path[1]&&path[2]==='skip'&&req.method==='POST'){
  if(!/^[0-9a-f-]{36}$/i.test(path[1]))return json({error:'Invalid draft'},400);
  const {data,error}=await db.from('instagram_post_drafts').update({status:'skipped',eligible_for_optimization:false}).eq('id',path[1]).eq('status','needs_approval').select('*').maybeSingle();
  if(error)throw error;if(!data)return json({error:'Only a draft waiting for approval can be skipped.'},409);return json({draft:data});
 }
 if(id==='draft'&&path[1]&&path[2]==='approve'&&req.method==='POST'){
  if(!/^[0-9a-f-]{36}$/i.test(path[1]))return json({error:'Invalid draft'},400);
  const service=createServiceRoleClient();
  const {data:draft,error:draftError}=await db.from('instagram_post_drafts').select('*').eq('id',path[1]).eq('status','needs_approval').maybeSingle();
  if(draftError)throw draftError;if(!draft)return json({error:'Only a draft waiting for approval can be approved.'},409);
  if(!Array.isArray(draft.images)||!draft.images.length||!draft.caption?.trim())return json({error:'Complete the draft and generate an image before approving it.'},400);
  const now=Date.now(),recommended=draft.scheduled_for?new Date(draft.scheduled_for).getTime():now;
  const windowEnd=new Date(String(draft.draft_date)+'T'+String(draft.window_end_kst).slice(0,5)+':00+09:00').getTime();
  const missedWindow=now>windowEnd;
  const scheduledFor=new Date(recommended>now+60000?recommended:now+(missedWindow?10:5)*60000).toISOString();
  const eligible=!missedWindow;
  const snapshot={
   channel:'instagram',name:'Daily Instagram · '+draft.draft_date,title:'',caption:draft.caption,cta:draft.cta,destination_url:draft.destination_url,
   images:draft.images,draft_id:draft.id,event_id:draft.event_id,content_mode:draft.content_mode,draft_kind:draft.draft_kind,growth_topic_type:draft.growth_topic_type,content_pillar:draft.content_pillar,eligible_for_optimization:eligible,auto_generated:true
  };
  const requestKey='draft:'+draft.id+':'+draft.revision;
  const {data:run,error:runError}=await service.from('marketing_runs').insert({channel:'instagram',snapshot,request_key:requestKey,scheduled_for:scheduledFor}).select('*').single();
  if(runError){if(runError.code==='23505')return json({error:'This draft is already scheduled.'},409);throw runError;}
  const {data:updated,error:updateError}=await db.from('instagram_post_drafts').update({
   status:'scheduled',approved_at:new Date().toISOString(),approved_by:(await db.auth.getUser()).data.user?.id??null,
   marketing_run_id:run.id,scheduled_for:scheduledFor,eligible_for_optimization:eligible
  }).eq('id',draft.id).eq('status','needs_approval').select('*').single();
  if(updateError)throw updateError;return json({draft:updated,run,missed_window:missedWindow});
 }
 if(id==='inbox'&&path[1]==='reply'&&req.method==='POST'){
  const body=await req.json().catch(()=>null);
  if(!body||typeof body.inbox_id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.inbox_id)||typeof body.reply!=='string'||!body.reply.trim()||body.reply.length>2000)return json({error:'Invalid inbox reply'},400);
  await invokeMarketingWorker(db,{action:'reply_inbox',inbox_id:body.inbox_id,reply:body.reply.trim()});
  return json({ok:true});
 }
 if(id==='inbox'&&path[1]==='ignore'&&req.method==='POST'){
  const body=await req.json().catch(()=>null);
  if(!body||typeof body.inbox_id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.inbox_id))return json({error:'Invalid inbox item'},400);
  const {data,error}=await db.from('instagram_inbox').update({status:'ignored',decision_reason:'Dismissed by Roundy admin'}).eq('id',body.inbox_id).in('status',['new','needs_review','failed']).select('id').maybeSingle();
  if(error)throw error;if(!data)return json({error:'Inbox item is no longer waiting for review'},409);return json({ok:true});
 }
 if(id==='publish'&&req.method==='POST'){
  const body=await req.json();if(!/^[0-9a-f-]{36}$/i.test(body.template_id)||!/^[0-9a-f-]{36}$/i.test(body.request_key))return json({error:'Invalid publish request'},400);
  const result=await invokeMarketingWorker(db,{template_id:body.template_id,request_key:body.request_key},140000);
  return json(result);
 }
 if(id==='resolve'&&req.method==='POST'){
  const body=await req.json();if(typeof body.published!=='boolean'||!/^[0-9a-f-]{36}$/i.test(body.run_id))return json({error:'Invalid review'},400);
  const {error}=await db.rpc('resolve_marketing_run',{p_run:body.run_id,p_published:body.published});if(error)throw error;return json({ok:true});
 }
 if(id&&!/^[0-9a-f-]{36}$/i.test(id))return json({error:'Not found'},404);
 if(id&&req.method==='DELETE'){const {error}=await db.from('marketing_templates').delete().eq('id',id);if(error)throw error;return json({ok:true});}
 if((!id&&req.method==='POST')||(id&&req.method==='PUT')){
  const v=await req.json();
  const text=(key:string,max:number)=>{if(typeof v[key]!=='string'||v[key].length>max)throw new Error('Invalid '+key);return v[key].trim();};
  const base=process.env.NEXT_PUBLIC_SUPABASE_URL+'/storage/v1/object/public/wis-event-images/';
  const input={channel:text('channel',20),name:text('name',100),title:text('title',120),caption:text('caption',2000),cta:text('cta',80),destination_url:text('destination_url',2000),images:v.images,days:v.days,time_kst:text('time_kst',8),enabled:v.enabled};
  if(!['instagram','koreapas'].includes(input.channel)||!input.name||typeof input.enabled!=='boolean'||!Array.isArray(input.days)||input.days.some((d:unknown)=>!Number.isInteger(d)||Number(d)<0||Number(d)>6)||!/^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(input.time_kst))throw new Error('Check the template and schedule.');
  if(input.destination_url){const url=new URL(input.destination_url);if(url.protocol!=='https:'||url.username||url.password)throw new Error('Use an HTTPS destination URL.');}
  if(!Array.isArray(input.images)||input.images.length>10||input.images.some((src:unknown)=>typeof src!=='string'||!src.startsWith(base)||!/^[-a-f0-9]+\/[-a-f0-9]+\.jpg$/.test(src.slice(base.length))))throw new Error('Choose up to 10 uploaded JPEG images.');
  input.days=[...new Set(input.days)];if(!input.days.length)input.enabled=false;
  const q=id?db.from('marketing_templates').update(input).eq('id',id):db.from('marketing_templates').insert(input);
  const {data,error}=await q.select('*').single();if(error)throw error;return json({template:data},id?200:201);
 }
 return json({error:'Not found'},404);
}
