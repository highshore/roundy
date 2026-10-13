import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),{fixture}=require('./marketing-fixtures.cjs');
const compiledSources=new Map();
function compiled(file){if(!compiledSources.has(file))compiledSources.set(file,ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText);return compiledSources.get(file);}
let checks=0;const check=(f)=>{f();checks++;};
const id='4b9066d0-e01b-4cc4-92d1-469f56317a04';
const eventId='11111111-1111-4111-8111-111111111111';
const base={request_key:'manual:quality-test-001',revision:1,mode:'both',content_mode:'prelaunch',language:'en',visual_mode:'cards',instruction:''};
function harness({denied=false,network=false,badSources=false,duplicate=false,photo403=false,answerFirst=false,photoSettings=null,photoFixture='none',templateSettings=null,slotNumber=1,unsafeFallback=false,topicOutcome='pass',criticOutcome='pass',researchStatus='completed',extraResearchCalls=[],upstreamError=null,unreadableResponse=false,jobAgeMs=0,writerFailures=0,enforceDedupe=false}={}){
 const tables={instagram_post_drafts:[{id,status:'needs_approval',revision:1,caption:'Original',cta:'Follow',images:[],carousel_slides:[],content_mode:'prelaunch'}],marketing_generation_jobs:[],marketing_ai_control:[{singleton:true,enabled:true,blocked_reason:null}],marketing_automation_settings:[{singleton:true,carousel_answer_first_enabled:answerFirst,...(photoSettings||{}),...(templateSettings||{})}],marketing_uploaded_images:[],events:[{id:eventId,slug:'fixture',title:'Fixture event',title_ko:'테스트 모임',status:'live',deleted_at:null,marketing_enabled:true,starts_at:'2099-12-01T10:00:00Z',ends_at:'2099-12-01T12:00:00Z',venue:'Fixture public venue',capacity:12,seats_remaining:12,price_ladies:29000,price_gents:49000,event_language:'either',images:[]}]};
 const requests=[],stored=[];let copyReviewCalls=0,writerFailuresLeft=writerFailures;
 class Q{
  constructor(t){this.rows=tables[t]||[];this.pred=[];this.patch=null;this.n=Infinity;}
  select(){return this;}update(p){this.patch=p;return this;}eq(k,v){this.pred.push(r=>r[k]===v);return this;}gt(k,v){this.pred.push(r=>r[k]>v);return this;}gte(k,v){this.pred.push(r=>r[k]>=v);return this;}is(k,v){return this.eq(k,v);}in(k,v){this.pred.push(r=>v.includes(r[k]));return this;}order(){return this;}limit(n){this.n=n;return this;}single(){return this.exec(true);}maybeSingle(){return this.exec(true);}then(a,b){return this.exec().then(a,b);}
  exec(single=false){const rows=this.rows.filter(r=>this.pred.every(p=>p(r))).slice(0,this.n);if(this.patch)rows.forEach(r=>Object.assign(r,this.patch));return Promise.resolve({data:structuredClone(single?rows[0]||null:rows),error:null});}
 }
 const db={from:t=>new Q(t),rpc:async(name,p)=>{
  if(name==='reserve_marketing_carousel_slot')return {data:slotNumber,error:null};
  if(name==='event_public_roster')return {data:{women:[],men:[],women_count:0,men_count:0,total:0},error:null};
  if(name==='set_marketing_quality'){const d=tables.instagram_post_drafts[0];if(d.revision!==p.p_revision)return {error:{message:'DRAFT_CHANGED_REFRESH_FIRST'}};Object.assign(d,{quality_report:p.p_report,quality_revision:d.revision});return {data:structuredClone(d),error:null};}
  if(denied)return {error:{message:'GENERATION_BUDGET_REACHED'}};
  const old=tables.marketing_generation_jobs.find(j=>j.request_key===p.p_key);if(old)return {data:{accepted:false,job:structuredClone(old)},error:null};
  if(enforceDedupe&&tables.marketing_generation_jobs.some(j=>j.fingerprint===p.p_fingerprint&&['running','completed','uncertain'].includes(j.status)))return {error:{message:'DUPLICATE_GENERATION_BLOCKED'}};
  const cost=p.p_operation==='render'?0:p.p_operation==='research'?.05:p.p_operation==='photo'?.15:p.p_operation==='copy_photo'?.20:.02;const job={id:'12345678-1234-1234-1234-'+String(tables.marketing_generation_jobs.length+1).padStart(12,'0'),draft_id:p.p_draft,request_key:p.p_key,fingerprint:p.p_fingerprint,status:'running',created_at:new Date(Date.now()-jobAgeMs).toISOString(),reserved_usd:cost,operation:p.p_operation};tables.marketing_generation_jobs.push(job);return {data:{accepted:true,job:structuredClone(job)},error:null};
 },storage:{from:bucket=>({upload:async(path,bytes)=>{stored.push({bucket,path,bytes});return {error:null};},download:async(path)=>({data:{arrayBuffer:async()=>Buffer.alloc(1600)},error:null}),remove:async()=>({data:[],error:null}),getPublicUrl:path=>({data:{publicUrl:'https://storage.example/'+path}})})}};
 const cache={};
 function load(file){if(cache[file])return cache[file];const context={exports:{},Buffer,URL,AbortSignal,Intl,Date,console,setTimeout,clearTimeout,process:{env:{OPENAI_API_KEY:'mock-only'}},require:name=>{
  if(name==='./marketing-render-assets')return {loadEditorialAssets:async()=>({photo:null,photos:[],fonts:[]})};
  if(photoSettings&&name==='./marketing-stock-photos'){
   const policy=load('src/lib/marketing-stock-photo-policy.ts');
   const current=()=>tables.instagram_post_drafts[0];
   const slotsFor=d=>policy.requiredPhotoSlotsForRoles((d.carousel_slides||[]).map(s=>s.role),policy.savedPhotoSourcingPolicy(d.content_document?.photo_sourcing));
   const rowsFor=d=>photoFixture==='none'?[]:slotsFor(d).map(slot=>({slot,asset_id:'photo-'+slot,provider:'pexels',
    provider_photo_id:String(slot+1),source_url:'https://www.pexels.com/photo/test-'+slot+'/',
    image_url:'https://images.pexels.com/photos/'+(slot+1)+'/photo.jpeg',
    preview_url:'https://images.pexels.com/photos/'+(slot+1)+'/photo.jpeg',
    photographer_url:'https://www.pexels.com/@fixture/',license_evidence_url:'https://www.pexels.com/photo/test-'+slot+'/',
    license_name:'Pexels License',license_url:'https://www.pexels.com/license/',photographer:'Fixture Photographer',
    license_checked_at:'2026-10-10T10:00:00Z',commercial_use_allowed:true,modifications_allowed:true,attribution_required:false,
    review_status:photoFixture==='ready'?'approved':'pending',storage_path:photoFixture==='ready'?'stock/'+slot+'.jpg':null}));
   return {
    pexelsConfigured:()=>false,requiredStockSlots:slotsFor,
    listStockSelections:async()=>rowsFor(current()),
    prepareStockSelections:async(_db,d)=>rowsFor(d),
    stockReady:(d,photos)=>policy.allSelectedPhotosApproved((d.carousel_slides||[]).map(s=>s.role),photos,policy.savedPhotoSourcingPolicy(d.content_document?.photo_sourcing)),
    approvedStockCardAssets:async(_db,d)=>({photo:null,photos:[],reusePhotos:false,
      cardPhotos:Object.fromEntries(rowsFor(d).map(x=>[x.slot,'data:image/jpeg;base64,'+Buffer.alloc(200).toString('base64')]))}),
    photoSelectionSnapshot:rows=>rows.map(x=>({...x}))
   };
  }
  if(name==='server-only')return {};if(name==='./supabase/service')return {createServiceRoleClient:()=>db};
  if(name==='react')return {createElement:(tag,props,...children)=>({tag,props,children})};
  if(name==='next/og')return {ImageResponse:class{constructor(tree){this.tree=tree;}arrayBuffer(){return Promise.resolve(Buffer.from(JSON.stringify(this.tree)));}}};
  if(name==='sharp')return bytes=>{const api={metadata:async()=>({width:1080,height:1350}),rotate:()=>api,resize:()=>api,jpeg:()=>api,toBuffer:async()=>Buffer.from(bytes)};return api;};
  if(name.startsWith('./')&&fs.existsSync('src/lib/'+name.slice(2)+'.ts'))return load('src/lib/'+name.slice(2)+'.ts');return require(name);
 },fetch:async(url,init)=>{
  const body=JSON.parse(init.body);requests.push({url,body});if(upstreamError)return {ok:false,status:upstreamError.status,json:async()=>({error:{code:upstreamError.code,message:'Fixture upstream error'}})};if(unreadableResponse)return {ok:true,status:200,json:async()=>{throw Error('Unreadable response')}};if(network)throw new Error('timeout');
  if(url.endsWith('images/generations'))return photo403?{ok:false,status:403,json:async()=>({error:{message:'Verify organization'}})}:{ok:true,json:async()=>({data:Array.from({length:Number(body.n||3)},()=>({b64_json:Buffer.alloc(200).toString('base64')}))})};
  if(url.endsWith('/responses')){
   const inputText=String(body.input||''),seoul=inputText.includes('Seoul dating-location')||inputText.includes('6–10 real candidates'),seoulTrend=inputText.includes('emerging or rising Seoul')||inputText.includes('emerging/rising Seoul');
   const notes=seoul
    ?'노들섬 (Nodeul Island) is a Seoul riverside cultural space. 서울공예박물관 (Seoul Museum of Craft Art) is a public craft museum in Jongno. 하늘공원 (Haneul Park) is a Seoul park known for open views and walking.'
    :seoulTrend
     ?'회크닉 (Hoe-picnic) is appearing across current Seoul lifestyle reporting and public trend signals. 회크닉 (Hoe-picnic) combines takeaway sashimi with an outdoor picnic and is being discussed as a current Seoul date activity.'
     :'Listening Across Difference by Alex Lee explains attentive listening. Published by Fixture Press. Attentive Conversation Study (2024) observes association, not causation, in a limited sample.';
   const annotations=badSources?[]:seoul?[
    {type:'url_citation',url:'https://official.example/nodeul',title:'노들섬 official',start_index:0,end_index:notes.indexOf('서울공예박물관')-1},
    {type:'url_citation',url:'https://official.example/craftmuseum',title:'서울공예박물관 official',start_index:notes.indexOf('서울공예박물관'),end_index:notes.indexOf('하늘공원')-1},
    {type:'url_citation',url:'https://official.example/haneul',title:'하늘공원 official',start_index:notes.indexOf('하늘공원'),end_index:notes.length}
   ]:seoulTrend?[
    {type:'url_citation',url:'https://news.example/hoe-picnic',title:'회크닉 current lifestyle report',start_index:0,end_index:Math.floor(notes.length/2)},
    {type:'url_citation',url:'https://trends.google.com/trends/explore?geo=KR&q=%ED%9A%8C%ED%81%AC%EB%8B%89',title:'회크닉 search trend',start_index:Math.floor(notes.length/2),end_index:notes.length}
   ]:[{type:'url_citation',url:'https://doi.org/10.1234/attentive.2024',title:'Attentive Conversation Study (2024)',start_index:0,end_index:notes.length}];
   return {ok:true,json:async()=>({status:researchStatus,incomplete_details:researchStatus==='incomplete'?{reason:'max_output_tokens'}:null,output:[{type:'web_search_call',status:'completed',action:{sources:[{url:'https://unrelated.example/english-school'}]}},...extraResearchCalls,{type:'message',content:[{type:'output_text',text:notes,annotations}]}],usage:{input_tokens:800,output_tokens:180}})};
  }
  if(body.response_format?.json_schema?.name==='roundy_editorial_v2'&&writerFailuresLeft-->0)return {ok:false,status:503,json:async()=>({error:{code:'service_unavailable',message:'Writer unavailable'}})};
  if(body.response_format?.json_schema?.name==='roundy_topic_critic_v1'){
   // The independent critic receives NO writer self-scores, only eligible topics.
   const data=JSON.parse(body.messages[1].content);
   const reviews=data.candidates.map(c=>({
    angle_key:c.angle_key,hook:5,scene:5,originality:5,usefulness:5,shareability:5,
    decision:'approve',reason:'이 장면에는 구체적인 갈등과 서로 다른 관점이 충분히 담겨 있습니다.'
   }));
   return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reviews})}}],
    usage:{input_tokens:250,output_tokens:180}})};
  }
  if(body.response_format?.json_schema?.name==='roundy_copy_critic_v1'){
   copyReviewCalls++;
   const decision=criticOutcome==='reject'?'replace_topic':
    criticOutcome==='rewrite'&&copyReviewCalls===1?'rewrite':'pass';
   const weak=decision!=='pass';
   const document={hook:weak?2:5,scene:weak?2:5,originality:weak?1:5,
    progression:weak?1:5,shareability:weak?2:5,
    decision,reason:weak?'다섯 장 내내 한 가지 뻔한 조언만 반복해 공유할 만큼 새롭지 않습니다.':
     '장면과 핵심 관찰이 분명하고 각 카드가 서로 다른 유용한 정보를 제공합니다.',
    issues:weak?['반복하는 조언을 버리고 실제로 일어나는 구체적인 장면과 새로운 관찰을 넣으세요.']:[]};
   return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(document)}}],
    usage:{input_tokens:320,output_tokens:160}})};
  }
  if(body.response_format?.json_schema?.name==='roundy_topic_candidates_v1'){
   const ko=String(body.messages[0].content).includes('natural contemporary Korean');
   const heads=ko
    ?['소개팅이 면접처럼 느껴지는 이유','카톡에선 웃긴데 만나면 어색한 이유','첫 만남 직후 떠오르는 기억','주말 약속이 자꾸 미뤄지는 순간','시끄러운 카페에서 대화가 끊기는 이유']
    :['Why first dates can feel like interviews','Why texting feels easier than meeting','The first detail you remember after a date','Why weekend plans take so long','When a busy cafe makes talking difficult'];
   const concepts=['first_date_interview_questions','texting_versus_meeting_context','after_date_first_memory','weekend_social_planning_friction','loud_cafe_conversation_cost'];
   const insightsKo=[
    '질문을 연속해서 던지는 대신 자신의 작은 경험을 나누면 상대도 마음을 열 가능성이 생긴다.',
    '카톡에서 답을 편집하는 시간과 얼굴을 보고 침묵을 경험하는 시간은 다르게 느껴질 수 있다.',
    '헤어진 뒤 처음 떠오르는 장면이 직업이나 취미가 아니라 둘 사이의 느낌일 때가 있다.',
    '선택지가 너무 많아서 일정이 미뤄지면 장소보다 먼저 시간을 확정하는 방법이 있다.',
    '카페가 너무 시끄러우면 말의 내용보다 소음에 에너지를 써서 대화가 어려워질 수 있다.'
   ];
   const insightsEn=[
    'Sharing a small personal experience can open up a conversation better than firing several questions.',
    'A text message can be edited before sending, while a pause together face to face cannot be edited out.',
    'After a first meeting, people may remember a particular shared feeling before a list of job titles.',
    'Too many choices can delay weekend plans even when choosing a time first would make a real difference.',
    'Background noise in a cafe can consume attention that two people would rather give to their conversation.'
   ];
   const candidates=heads.map((headline,i)=>({
    headline,angle_key:concepts[i],
    reader_payoff:ko?'독자가 첫 만남에서 자주 생기는 어색함을 다르게 해석하고 실천할 만한 관찰을 얻습니다.':'Readers will gain a concrete and realistic way to understand a familiar social moment.',
    scene:ko?'첫 만남에서 질문은 많지만 대화가 이어지지 않는 현실적인 카페의 장면.':'Two adults meet at a cafe and notice a small but very familiar social friction.',
    core_insight:ko?insightsKo[i]:insightsEn[i],
    novelty:topicOutcome==='reject'?1:5,reader_value:topicOutcome==='reject'?1:5,curiosity:topicOutcome==='reject'?1:5,shareability:topicOutcome==='reject'?1:5,
    editorial_reason:'Distinct realistic perspective with a specific reader payoff.'
   }));
   return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({candidates})}}],usage:{input_tokens:450,output_tokens:720}})};
  }
  const data=JSON.parse(body.messages[1].content);
  let c;
  // Campaigns have their own model schemas; an editorial fixture is not a
  // valid campaign response. Mock the schema/roles actually sent to the model.
  const answerFirstSchema=Boolean(body.response_format?.json_schema?.schema?.properties?.thumbnail_candidates);
  const requestedSlides=Number(body.response_format?.json_schema?.schema?.properties?.slides?.minItems||0);
  if(data.campaign_pattern||data.event_campaign_stage){
   const schema=body.response_format.json_schema.schema.properties;
   const pattern=data.campaign_pattern||data.event_campaign_pattern;
   const oldRoles={
    poster:['hook','benefit','cta'],
    problem_solution:['hook','problem','solution','benefit','cta'],
    how_it_works:['hook','step','step','step','cta'],
    benefit_stack:['hook','benefit','benefit','benefit','cta'],
    countdown:['hook','countdown','cta'],
    event_poster:['hook','facts','cta'],
    experience:['hook','step','step','step','cta'],
    social_proof:['hook','participants','experience','cta'],
    offer:['hook','offer','facts','cta'],
    last_call:['hook','status','facts','cta']
   }[pattern];
   if(!oldRoles)throw new Error('UNMOCKED_CAMPAIGN_PATTERN: '+pattern);
   const helper=load('src/lib/marketing-answer-first.ts');
   const roles=requestedSlides===3?(data.campaign_pattern?helper.campaignRolesForCount(pattern,oldRoles,3):helper.eventRolesForCount(pattern,oldRoles,3)):
    answerFirstSchema?(data.campaign_pattern?helper.fiveCampaignRoles(pattern,oldRoles):helper.fiveEventRoles(pattern,oldRoles)):oldRoles;
   const ko=data.language==='ko';
   const enTitles=['Beyond the screen','One conversation at a time','Meet in Seoul','Focus on the person','Make room for a real story'];
   const koTitles=['화면 밖에서 시작하기','한 사람과 한 번의 대화','서울에서 직접 만나요','서로의 이야기에 집중하기','다음 이야기를 위한 여유'];
   const enBodies=['Meet people face to face','Give every voice some room','Have a real conversation','Be present with each other','Take it one step at a time'];
   const koBodies=['서로 마주 앉아 만나기','한 사람의 이야기에 집중하기','대화를 직접 이어가기','서로의 이야기에 귀 기울이기','천천히 한 번씩 만나기'];
   c={
    schema_version:2,
    campaign_version:schema.campaign_version.enum[0],
    design_preset:schema.design_preset.enum[0],
    post_type:schema.post_type.enum[0],
    caption_ko:'한 번에 한 사람과 만나기\n마주 앉아 차분하게 대화를 이어가는 새로운 만남입니다.',
    caption_en:'One person at a time\nMeet face to face and let each conversation unfold naturally.',
    ...(data.campaign_pattern?{
     campaign_pattern:data.campaign_pattern,campaign_tone:data.campaign_tone,campaign_goal:data.campaign_goal
    }:{
     event_campaign_stage:data.event_campaign_stage,event_campaign_pattern:data.event_campaign_pattern
    }),
    slides:roles.map((role,i)=>({
     role,eyebrow:'',title:ko?koTitles[i]:enTitles[i],
     body:ko?koBodies[i]:enBodies[i],secondary_body:ko?enBodies[i]:koBodies[i],
     visual_direction:'Candid photo of people talking in contemporary Seoul, without text or logos',
     step_number:0,source_ids:[]
    }))
   };
  }else{
   if(!data.editorial_type)throw new Error('UNMOCKED_EDITORIAL_REQUEST');
   c=fixture(data.editorial_type,data.language,load('src/lib/marketing-content-policy.ts').CONTENT_PROFILES);
   // Real AI replies honor the STRICT versioned JSON schema. Retrofit the mock
   // model too: old fixtures are used for legacy campaigns, but Magazine v2
   // must never return the old 5-card CTA or sales caption as if schema-valid.
   const schema=body.response_format.json_schema.schema;
   if(schema.properties.design_preset?.enum?.[0]==='roundy_magazine_editorial_v2'){
    const type=data.editorial_type,ko=data.language==='ko',old=c.slides;
    const translation=fixture(type,ko?'en':'ko',load('src/lib/marketing-content-policy.ts').CONTENT_PROFILES).slides;
    const source=(role)=>old.find(s=>s.role===role)||old.find(s=>s.role==='insight')||old[1];
    const prefer=type==='seoul_dating'?['scenario','etiquette','plan']:
     type==='dating_myth'?['myth','finding','limitation']:
     type==='book_insight'?['book','insight','practice']:
     type==='trend_research'?['finding','context','limitation']:
     type==='seoul_trend'?['trend','why_now','practical']:
     type==='conversation_prompt'?['opener','followup','listen']:
     type==='mini_quiz'?['question','options','reveal']:
     old.slice(1,-1).map(s=>s.role);
    const magazineRoles=requestedSlides===3?['cover','key_insight','editorial_closing']:
     ['cover','context','insight','insight','editorial_closing'];
    c.design_preset='roundy_magazine_editorial_v2';
    c.cta='';
    c.caption_ko='서울의 일상에 관한 작고 분명한 이야기.\n\n서로 다른 관점을 살펴보면 일상의 작은 장면이 달라집니다.';
    c.caption_en='A closer look at the everyday details of Seoul.\n\nDifferent perspectives can change what we notice.';
    c.caption=ko?c.caption_ko:c.caption_en;
    c.tagline=ko?'서울 라이프스타일 이야기':'Seoul lifestyle observations';
    c.hashtags=[];
    c.slides=magazineRoles.map((role,i)=>{
     const final=i===requestedSlides-1;
     const picked=i===0?old[0]:final?old[old.length-2]:
      source(prefer[Math.min(i-1,prefer.length-1)]);
     const other=translation.find(s=>s.role===picked.role)||translation[1];
     const clone={...picked,role,closing_type:final?'summary':'none',options:picked.options||[],
      secondary_body:other.body};
     if((type==='prelaunch'||type==='live_event')&&final){
      clone.title=ko?'한 가지 남겨 둘 관점':'The perspective to keep';
      clone.body=ko?'한 번의 대화에는 서로의 속도를 존중하는 시간이 필요합니다.':'Each conversation deserves time and attention to the person in front of us.';
      clone.secondary_body=ko?'Each conversation deserves time and attention to the person in front of us.':'한 번의 대화에는 서로의 속도를 존중하는 시간이 필요합니다.';
     }
     if((type==='prelaunch'||type==='live_event')&&i>1&&!final){
      clone.title=ko?(i===2?'경험의 속도를 바꿔 보기':'작은 대화의 단서'):i===2?'A slower way to meet':'A detail worth noticing';
      clone.body=ko?(i===2?'주변의 소음을 줄이면 누군가의 이야기에 머물기 쉬워집니다.':'상대가 건넨 짧은 말에서 다음 이야깃거리를 찾을 수 있습니다.')
       :i===2?'A quieter exchange gives one person room to finish a story.':'One small detail in an answer can lead to another perspective.';
      clone.secondary_body=ko?(i===2?'A quieter exchange gives one person room to finish a story.':'One small detail in an answer can lead to another perspective.')
       :i===2?'주변의 소음을 줄이면 누군가의 이야기에 머물기 쉬워집니다.':'상대가 건넨 짧은 말에서 다음 이야깃거리를 찾을 수 있습니다.';
     }
     if(role==='key_insight'&&type==='seoul_dating'){
      clone.body=c.seoul.venues.map(v=>v.name).join(' / ');
      clone.secondary_body=fixture(type,ko?'en':'ko',load('src/lib/marketing-content-policy.ts').CONTENT_PROFILES).seoul.venues.map(v=>v.name).join(' / ');
      clone.source_ids=['S1','S2','S3'];
     }
     if(role==='key_insight'&&type==='dating_myth'){
      clone.title=ko?'이 통념은 사실일까요?':'What does evidence suggest?';
      clone.body=c.myth.claim;
      clone.secondary_body=ko?'The more questions you ask, the more they like you':'질문을 많이 할수록 상대가 더 좋아한다';
     }
     if(!final&&i>0&&load('src/lib/marketing-content-policy.ts').CONTENT_PROFILES[type].research){
      clone.source_ids=type==='seoul_dating'?(requestedSlides===3?['S1','S2','S3']:['S'+Math.min(i,3)]):type==='seoul_trend'?['S1','S2']:['S1'];
     }
     if(role==='key_insight'&&type==='conversation_prompt'){
      clone.body=ko?'첫 질문: 요즘 재미있었던 건 뭐예요? 후속 질문: 어떤 점이 좋았어요?':'First question: What did you enjoy recently? Follow-up: What stood out?';
      clone.secondary_body=ko?'First question: What did you enjoy recently? Follow-up: What stood out?':'첫 질문: 요즘 재미있었던 건 뭐예요? 후속 질문: 어떤 점이 좋았어요?';
     }
     if(role==='editorial_closing'&&picked.role==='cta'){
      clone.title=ko?'오늘의 핵심 정리':'One lasting takeaway';clone.body=ko?'좋은 대화는 서로의 답에 귀 기울이는 데서 시작합니다.':'Good conversation begins by listening to the reply.';
     }
     return clone;
    });
   }
  }
  if(answerFirstSchema){
   const language=data.language==='en'?'en':'ko';
   const headlines=language==='ko'
    ?['서울에서 한 사람씩 직접 만나기','로테이션 소개팅으로 대화 시작하기','서울에서 서로를 알아가는 방법']
    :['Meet people face to face in Seoul','Try one-on-one conversations in Seoul','Choose matches mutually after talking'];
   const wanted=body.response_format.json_schema.schema.properties.thumbnail_candidates.minItems;
   if(wanted===5)headlines.push(language==='ko'?'서울에서 내 이야기부터 꺼내보는 순간':'Sharing a small story changes a first meeting',language==='ko'?'처음 만나서 함께 이야기할 때 생기는 변화':'A first conversation leaves room to listen');
   c.thumbnail_candidates=headlines;
   if(data.editorial_type){
    const helper=load('src/lib/marketing-answer-first.ts');
    if(c.design_preset!=='roundy_magazine_editorial_v2'){
     const roles=requestedSlides===3?helper.editorialRolesForCount(data.editorial_type,c.slides.map(x=>x.role),3):helper.fiveEditorialRoles(data.editorial_type,c.slides.map(x=>x.role));
     c.slides=roles.map(role=>c.slides.find(x=>x.role===role));
     if(c.slides.some(x=>!x))throw new Error('ANSWER_FIRST_TEST_ROLE_MISSING:'+data.editorial_type);
    }
   }
   c.slides[0].title=headlines[0];
   if(requestedSlides===3&&data.editorial_type==='conversation_prompt'){
    const value=c.slides[1],ko=language==='ko';
    value.body=ko?'첫 질문: 최근 기억에 남는 곳은 어디예요? 후속 질문: 어떤 점이 좋았어요?':'First question: Where did you enjoy going? Follow-up: What stood out?';
    value.secondary_body=ko?'First question: Where did you enjoy going? Follow-up: What stood out?':'첫 질문: 최근 기억에 남는 곳은 어디예요? 후속 질문: 어떤 점이 좋았어요?';
   }
  }
  if(unsafeFallback&&data.editorial_type==='korea_life'){
   c.slides[0].body='요즘 인기 급상승 서울 카페의 예약 시간은 19:30입니다.';
  }
  if(data.editorial_type==='dating_myth'&&data.myth_candidate==='backup'){
   const ko=data.language==='ko';c.myth={claim:ko?'침묵이 생기면 첫 데이트가 망한 것이다':'Silence means a first date is going badly',myth_key:'silence_means_failure',verdict:'not_well_supported',selection_reason:ko?'첫 후보와 다른 주제이며 대화 맥락 연구로 검토할 수 있습니다.':'A distinct backup belief with relevant conversation evidence.'};
   const card=c.slides.find(s=>s.role==='myth');if(card){card.title=ko?'침묵이 생기면 실패일까?':'Does silence mean failure?';card.body=c.myth.claim;}
  }
  if(duplicate)c.slides=c.slides.map(s=>({...s,title:c.slides[0].title,body:c.slides[0].body}));
  return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(c)}}],usage:{prompt_tokens:400,completion_tokens:600}})};
 }};
 vm.runInNewContext(compiled(file),context);cache[file]=context.exports;return context.exports;}
 return {api:load('src/lib/marketing-generation.ts'),policy:load('src/lib/marketing-content-policy.ts'),editorial:load('src/lib/marketing-editorial.ts'),tables,requests,stored};
}
for(const language of ['en','ko'])for(const type of Object.keys(harness().policy.CONTENT_PROFILES)){
 const h=harness(),input={...base,language,content_mode:type==='prelaunch'||type==='live_event'?type:'growth_carousel',topic_type:type==='prelaunch'||type==='live_event'?undefined:type,campaign_pattern:type==='prelaunch'?'poster':undefined,event_id:type==='live_event'?eventId:undefined,event_campaign_stage:type==='live_event'?'launch':undefined,instruction:type==='book_insight'?"You're Not Listening":''};
 const r=await h.api.runGeneration(id,input,null);
 check(()=>assert.equal(r.job.status,'completed',JSON.stringify(r)));
 check(()=>assert.equal(h.requests.length,type==='book_insight'?2:h.policy.CONTENT_PROFILES[type].research?3:2));
 check(()=>assert.equal(r.draft.quality_report.status,'passed'));
 check(()=>assert.equal(r.draft.images.length,h.policy.CONTENT_PROFILES[type].roles.length));
 check(()=>assert.equal(new Set(h.stored.map(x=>x.bytes.toString())).size,h.stored.length));
 check(()=>assert.ok(h.tables.marketing_generation_jobs[0].result_snapshot.content_document));
 const write=h.requests.find(x=>x.url.endsWith('chat/completions')).body;
 check(()=>assert.equal(write.response_format.json_schema.strict,true));check(()=>assert.equal(write.tools,undefined));check(()=>assert.equal(write.temperature,undefined));check(()=>assert.equal(write.reasoning_effort,'none'));
 if(['trend_research','dating_myth','seoul_dating'].includes(type)){check(()=>assert.equal(h.requests[0].body.max_tool_calls,3));check(()=>assert.equal(h.requests[0].body.tools?.[0]?.search_context_size,'high'));check(()=>assert.equal(h.requests[0].body.tools?.[0]?.external_web_access,true));check(()=>assert.equal(h.requests[0].body.text,undefined));}
 if(type==='trend_research'){check(()=>assert.match(String(h.requests[0].body.input),/5[–-]10 candidate|5–10 plausible PRIMARY studies/i));check(()=>assert.match(String(h.requests[0].body.input),/Roundy relevance 30/));}
 if(type==='seoul_trend'){check(()=>assert.match(String(h.requests[0].body.input),/emerging|rising/i));check(()=>assert.equal(r.draft.content_document.trend.trend_key,'hoe-picnic'));}
 if(type==='dating_myth'){check(()=>assert.match(String(h.requests[0].body.input),/6[–-]10 concise myth claims|6–10 plausible myth claims/i));check(()=>assert.match(String(h.requests[0].body.input),/PRIMARY MYTH/));check(()=>assert.match(String(h.requests[0].body.input),/BACKUP MYTH/));}
 const dup=await h.api.runGeneration(id,input,null);check(()=>assert.equal(dup.deduplicated,true));
}
{const h=harness({duplicate:true});const r=await h.api.runGeneration(id,{...base,content_mode:'growth_carousel',topic_type:'book_insight'},null);check(()=>assert.equal(r.job.status,'completed'));check(()=>assert.equal(r.job.stage,'editorial_review_required'));check(()=>assert.equal(r.job.quality_report.status,'rejected'));check(()=>assert.ok(r.job.result_snapshot.carousel_slides.length));check(()=>assert.ok(h.tables.marketing_generation_jobs[0].quality_report.issues.some(x=>x.includes('중복'))));check(()=>assert.equal(h.stored.length,0));check(()=>assert.equal(h.tables.instagram_post_drafts[0].caption,'Original'));check(()=>assert.ok(h.tables.marketing_generation_jobs[0].result_snapshot));}
{const h=harness(),input={...base,request_key:'manual:mixed-state-fix',topic_type:'dating_archetype'};check(()=>assert.equal(h.api.validateGenerationInput(input).topic_type,undefined));const r=await h.api.runGeneration(id,input,null);check(()=>assert.equal(r.job.status,'completed',JSON.stringify(r)));check(()=>assert.equal(h.tables.marketing_generation_jobs[0].request_payload.topic_type,null));const p=h.policy,d=fixture('prelaunch','en',p.CONTENT_PROFILES),preset=p.contentSchema('prelaunch','en').properties.design_preset.enum[0];d.design_preset=preset;d.caption_en='One conversation at a time\nCrowded rooms can make it harder to follow one person closely.\nA slower format can leave more room for the answer.';d.caption_ko='한 번에 한 대화\n큰 모임에서는 한 사람의 이야기를 끝까지 따라가기 어려울 수 있어요.\n조금 느린 방식이 답에 더 머물 여유를 줄 수 있습니다.';d.caption=d.caption_en;d.tagline='One person at a time';d.hashtags=[];d.slides=d.slides.map((s,i)=>({...s,secondary_body:i===0?'여러 대화가 겹치면 한 사람의 말을 듣기 어려울 수 있어요.':i===1?'한 사람씩 마주 앉아 대화에 집중해보세요.':'서울에서 한 사람씩 만나보세요.'}));d.slides[0].body='A loud group can make it hard to hear one person clearly, especially when several conversations compete for attention at the same time.';d.slides[d.slides.length-1].role='concept';const prepared=p.prepareContent(d,'prelaunch','en',[]);check(()=>assert.ok(d.slides[0].body.length>110));check(()=>assert.equal(prepared.report.status,'passed',JSON.stringify(prepared.report)));check(()=>assert.equal(prepared.document.slides.at(-1).role,'cta'));}
{const h=harness({badSources:true});const r=await h.api.runGeneration(id,{...base,content_mode:'growth_carousel',topic_type:'dating_myth'},null);check(()=>assert.equal(r.job.status,'completed',JSON.stringify(r)));check(()=>assert.equal(h.requests.length,3));check(()=>assert.equal(r.draft.growth_topic_type,'conversation_prompt'));check(()=>assert.match(r.draft.generation_reason,/safe fallback/));check(()=>assert.equal(r.job.result_snapshot.generation_recovery.effective_type,'conversation_prompt'));}
{const h=harness({badSources:true});const r=await h.api.runGeneration(id,{
 ...base,request_key:'manual:seoul-trend-source-safe',content_mode:'growth_carousel',topic_type:'seoul_trend'
},null);
 check(()=>assert.equal(r.job.status,'completed',JSON.stringify(r)));
 check(()=>assert.equal(r.draft.growth_topic_type,'korea_life','Uncited trend must be labeled Korea life, not Seoul trend'));
 check(()=>assert.equal(r.draft.research_sources.length,0));
 check(()=>assert.equal(r.draft.content_document.post_type,'korea_life'));
 check(()=>assert.equal(r.job.result_snapshot.generation_recovery.requested_type,'seoul_trend'));
 check(()=>assert.equal(r.job.result_snapshot.generation_recovery.effective_type,'korea_life'));
 check(()=>assert.equal(h.requests.filter(x=>x.url.endsWith('/responses')).length,1,'No paid Web Search retries'));
 check(()=>assert.equal(h.requests.filter(x=>x.url.endsWith('chat/completions')).length,1,'Only one copy write'));
 const write=h.requests.find(x=>x.url.endsWith('chat/completions')).body;
 check(()=>assert.match(write.messages[0].content,/SOURCE-FREE FALLBACK/));
 check(()=>assert.equal(JSON.parse(write.messages[1].content).editorial_type,'korea_life'));
 check(()=>assert.deepEqual(JSON.parse(write.messages[1].content).evidence,[]));
 check(()=>assert.equal(r.draft.quality_report.status,'passed'));
}
{const h=harness({badSources:true,unsafeFallback:true});const r=await h.api.runGeneration(id,{
 ...base,request_key:'manual:unsafe-seoul-trend-fallback',content_mode:'growth_carousel',topic_type:'seoul_trend'
},null);
 check(()=>assert.equal(r.job.status,'failed','Unsourced trending claim must not be imported'));
 check(()=>assert.match(String(r.job.error_message||''),/UNVERIFIED_SEOUL_TREND_FALLBACK_CLAIM/));
 check(()=>assert.equal(h.requests.filter(x=>x.url.endsWith('/responses')).length,1));
 check(()=>assert.equal(h.requests.filter(x=>x.url.endsWith('chat/completions')).length,1));
 check(()=>assert.equal(r.draft.caption,'Original','Unsafe copy must not overwrite saved draft'));
}
{const h=harness({badSources:true});const r=await h.api.runGeneration(id,{...base,request_key:'manual:trend-fallback',content_mode:'growth_carousel',topic_type:'trend_research'},null);check(()=>assert.equal(r.job.status,'completed',JSON.stringify(r)));check(()=>assert.equal(r.draft.growth_topic_type,'conversation_prompt'));check(()=>assert.match(r.draft.generation_reason,/safe fallback/));}
{const h=harness();h.tables.marketing_generation_jobs.push({id:'hist-trend-1',draft_id:'old',request_key:'hist',status:'completed',created_at:new Date().toISOString(),reserved_usd:.05,operation:'research',result_snapshot:{growth_topic_type:'trend_research',content_document:{study:{title:'Attentive Conversation Study',topic_key:'questions_liking'}},saved_at:new Date().toISOString()}});const r=await h.api.runGeneration(id,{...base,request_key:'manual:trend-history',content_mode:'growth_carousel',topic_type:'trend_research'},null);check(()=>assert.equal(r.job.status,'completed',JSON.stringify(r)));check(()=>assert.equal(r.draft.growth_topic_type,'conversation_prompt'));check(()=>assert.match(r.job.result_snapshot.generation_recovery.fallback_reason,/same_study_within_180d|similar_topic_within_60d/));}
{const h=harness();h.tables.marketing_generation_jobs.push({id:'hist-myth-1',draft_id:'old',request_key:'hist-myth',status:'completed',created_at:new Date().toISOString(),reserved_usd:.05,operation:'research',result_snapshot:{growth_topic_type:'dating_myth',content_document:{myth:{claim:'The more questions you ask, the more they like you',myth_key:'questions_and_liking'}},saved_at:new Date().toISOString()}});const r=await h.api.runGeneration(id,{...base,request_key:'manual:myth-history-backup',content_mode:'growth_carousel',topic_type:'dating_myth'},null);check(()=>assert.equal(r.job.status,'completed',JSON.stringify(r)));check(()=>assert.equal(r.draft.growth_topic_type,'dating_myth'));check(()=>assert.equal(r.draft.content_document.myth.myth_key,'silence_means_failure'));check(()=>assert.equal(r.job.result_snapshot.generation_recovery.myth_alternate_used,true));check(()=>assert.equal(r.job.result_snapshot.generation_recovery.fallback_reason,null));check(()=>assert.equal(h.requests.filter(x=>x.url.endsWith('chat/completions')).length,2));}
{const h=harness();const now=new Date().toISOString();h.tables.marketing_generation_jobs.push({id:'hist-myth-1',draft_id:'old1',request_key:'hist-myth-1',status:'completed',created_at:now,reserved_usd:.05,operation:'research',result_snapshot:{growth_topic_type:'dating_myth',content_document:{myth:{claim:'The more questions you ask, the more they like you',myth_key:'questions_and_liking'}},saved_at:now}},{id:'hist-myth-2',draft_id:'old2',request_key:'hist-myth-2',status:'completed',created_at:now,reserved_usd:.05,operation:'research',result_snapshot:{growth_topic_type:'dating_myth',content_document:{myth:{claim:'Silence means a first date is going badly',myth_key:'silence_means_failure'}},saved_at:now}});const r=await h.api.runGeneration(id,{...base,request_key:'manual:myth-history-fallback',content_mode:'growth_carousel',topic_type:'dating_myth'},null);check(()=>assert.equal(r.job.status,'completed',JSON.stringify(r)));check(()=>assert.equal(r.draft.growth_topic_type,'conversation_prompt'));check(()=>assert.equal(r.job.result_snapshot.generation_recovery.myth_alternate_used,true));check(()=>assert.match(r.job.result_snapshot.generation_recovery.fallback_reason,/same_myth_within_120d|similar_myth_topic_within_60d/));}
{const h=harness({badSources:true});const r=await h.api.runGeneration(id,{...base,request_key:'manual:seoul-fallback',content_mode:'growth_carousel',topic_type:'seoul_dating'},null);check(()=>assert.equal(r.job.status,'completed',JSON.stringify(r)));check(()=>assert.equal(r.draft.growth_topic_type,'conversation_prompt'));check(()=>assert.match(r.draft.generation_reason,/safe fallback/));}
{const h=harness({network:true});const r=await h.api.runGeneration(id,base,null);check(()=>assert.equal(r.job.status,'uncertain'));check(()=>assert.equal(h.requests.length,1));check(()=>assert.ok(h.tables.marketing_ai_control[0].blocked_reason));}
{const h=harness({denied:true});await assert.rejects(h.api.runGeneration(id,base,null));check(()=>assert.equal(h.requests.length,0));}
{const h=harness({photo403:true});const r=await h.api.runGeneration(id,{...base,visual_mode:'photo',confirm_photo:true},null);check(()=>assert.equal(r.job.status,'failed'));check(()=>assert.equal(h.requests.length,2));check(()=>assert.notEqual(h.tables.instagram_post_drafts[0].caption,'Original'));check(()=>assert.ok(h.tables.marketing_ai_control[0].blocked_reason));}
{const h=harness();await h.api.runGeneration(id,base,null);const before=h.requests.length,d=h.tables.instagram_post_drafts[0];const r=await h.api.runGeneration(id,{...base,request_key:'manual:render-fixture',revision:d.revision,mode:'image',render_only:true},null);check(()=>assert.equal(r.job.status,'completed'));check(()=>assert.equal(h.requests.length,before+1));check(()=>assert.equal(h.requests.at(-1).body.n,3));}
{const h=harness();await h.api.runGeneration(id,{...base,request_key:'manual:upload-seed'},null);const d=h.tables.instagram_post_drafts[0];d.draft_role='candidate';d.generation_source='manual';d.visual_source='uploaded';h.tables.marketing_uploaded_images.push({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',draft_id:id,storage_path:id+'/originals/test.jpg',sort_order:0,role:'cover',asset_type:'photo',width:1080,height:1350,file_size:1600,mime_type:'image/jpeg'});const before=h.requests.length;const r=await h.api.runGeneration(id,{...base,request_key:'manual:uploaded-render',revision:d.revision,mode:'image',render_only:true,visual_source:'uploaded'},null);check(()=>assert.equal(r.job.status,'completed',JSON.stringify(r)));check(()=>assert.equal(r.job.operation,'render'));check(()=>assert.equal(r.job.reserved_usd,0));check(()=>assert.equal(h.requests.length,before));check(()=>assert.equal(r.draft.visual_source,'uploaded'));check(()=>assert.ok(r.draft.images.length>0));}
{const h=harness();for(const bad of [{...base,visual_mode:'photo'},{...base,revision:99},{...base,instruction:'x'.repeat(501)},{...base,language:'fr'},{...base,mode:'loop'}])check(()=>assert.throws(()=>h.api.validateGenerationInput(bad)));}
{const p=harness().policy,c=fixture('trend_research','en',p.CONTENT_PROFILES);const bad=p.evaluateContent(c,'trend_research','en',[{id:'S1',url:'https://example.com/blog/research-summary',title:'Attentive Conversation Study (2024)',evidence:'Attentive Conversation Study 2024'}]);check(()=>assert.equal(bad.status,'rejected'));check(()=>assert.ok(bad.issues.some(x=>x.includes('원 논문'))));}
{const p=harness().policy,c=fixture('dating_myth','en',p.CONTENT_PROFILES);const bad=p.evaluateContent(c,'dating_myth','en',[{id:'S1',url:'https://example.com/blog/myth-summary',title:'Attentive Conversation Study (2024)',evidence:'Attentive Conversation Study 2024'}]);check(()=>assert.equal(bad.status,'rejected'));check(()=>assert.ok(bad.issues.some(x=>x.includes('원 논문'))));}
{const p=harness().policy,c=fixture('dating_myth','ko',p.CONTENT_PROFILES);c.caption_ko='연구가 증명했다. 이 통념은 완전히 거짓이다.';c.caption=c.caption_ko;const q=p.evaluateContent(c,'dating_myth','ko',[{id:'S1',url:'https://doi.org/10.1234/attentive.2024',title:'Attentive Conversation Study (2024)',evidence:'Attentive Conversation Study 2024 limited sample association'}]);check(()=>assert.equal(q.status,'rejected'));check(()=>assert.ok(q.issues.some(x=>x.includes('단정'))));}
{const p=harness().policy,c=fixture('trend_research','en',p.CONTENT_PROFILES);c.caption_en='Recent research suggests this pattern matters.';c.caption=c.caption_en;const q=p.evaluateContent(c,'trend_research','en',[{id:'S1',url:'https://doi.org/10.1234/attentive.2024',title:'Attentive Conversation Study (2024)',evidence:'Attentive Conversation Study 2024 limited sample association'}]);check(()=>assert.equal(q.status,'rejected'));check(()=>assert.ok(q.issues.some(x=>x.includes('현재 연도'))));}
{const p=harness().policy,c=fixture('book_insight','en',p.CONTENT_PROFILES);const q=p.evaluateContent(c,'book_insight','en',[{id:'S1',url:'https://english-school.example',title:'English lessons',evidence:'Unrelated tutoring services'}]);check(()=>assert.equal(q.status,'rejected'));const quiz=fixture('mini_quiz','en',p.CONTENT_PROFILES);quiz.slides[2].options=['Same','Same'];check(()=>assert.equal(p.evaluateContent(quiz,'mini_quiz','en').status,'rejected'));}
{const p=harness().policy;check(()=>assert.equal(p.CONTENT_POLICY_VERSION,17));const ko=fixture('prelaunch','ko',p.CONTENT_PROFILES);ko.caption='진정한 인연을 위한 특별한 만남';check(()=>assert.equal(p.evaluateContent(ko,'prelaunch','ko').status,'rejected'));const en=fixture('prelaunch','en',p.CONTENT_PROFILES);en.caption='Discover meaningful human connections in a premium experience.';check(()=>assert.equal(p.evaluateContent(en,'prelaunch','en').status,'rejected'));check(()=>assert.match(p.writingInstructions('conversation_prompt','ko'),/실제 SNS|당장 써볼 수|AI\/마케팅 표현|AI\/marketing|상투적인|generic AI/i));}

{const p=harness().policy;check(()=>assert.equal(p.qualitySeverity('실제 인용된 출처가 없습니다.'),'critical'));check(()=>assert.equal(p.qualitySeverity('카드 제목이 중복되거나 지나치게 유사합니다.'),'quality'));const presentation=harness().api?null:null;}
for(const language of ['ko','en'])for(const type of Object.keys(harness().policy.CONTENT_PROFILES)){
 const h=harness({answerFirst:true}),input={...base,request_key:'manual:answer-first-'+language+'-'+type,language,
  content_mode:type==='prelaunch'||type==='live_event'?type:'growth_carousel',
  ...(type==='prelaunch'?{campaign_pattern:'poster'}:{}),
  ...(type==='live_event'?{event_id:eventId,event_campaign_stage:'launch'}:{}),
  ...(!['prelaunch','live_event'].includes(type)?{topic_type:type}:{})};
 const r=await h.api.runGeneration(id,input,null);
 check(()=>assert.equal(r.job.status,'completed','Answer-First '+type+': '+JSON.stringify(r.job.error_message||r.draft.quality_report)));
 check(()=>assert.equal(r.draft.quality_report.status,'passed','Answer-First '+type));
 check(()=>assert.equal(r.draft.carousel_slides.length,5));
 check(()=>assert.equal(r.draft.images.length,5));
 check(()=>assert.equal(r.draft.content_document.answer_first,true));
 check(()=>assert.equal(r.draft.content_document.thumbnail_candidates.length,3));
 check(()=>assert.equal(r.draft.carousel_slides[0].title,r.draft.content_document.thumbnail_candidates[0]));
 const write=h.requests.find(x=>x.url.endsWith('chat/completions')).body;
 check(()=>assert.equal(write.response_format.json_schema.schema.properties.thumbnail_candidates.minItems,3));
 check(()=>assert.match(write.messages[0].content,/ANSWER-FIRST \(REQUIRED\)/));
}
{
 const baseConfig={carousel_min_real_photos_5:3,carousel_min_real_photos_3:2,carousel_ai_thumbnail_enabled:false};
 for(const status of ['none','pending','ready']){
  const h=harness({answerFirst:true,photoSettings:baseConfig,photoFixture:status});
  const r=await h.api.runGeneration(id,{...base,request_key:'manual:photo-first-'+status,visual_source:'auto_ai'},null);
  check(()=>assert.equal(r.job.status,'completed',JSON.stringify(r.job)));
  check(()=>assert.equal(r.draft.visual_source,'stock','auto AI routes through reviewed licensed photo assets'));
  check(()=>assert.equal(r.draft.content_document.photo_sourcing.min_real_photos,3));
  check(()=>assert.equal(r.draft.content_document.photo_sourcing.ai_thumbnail_enabled,false));
  check(()=>assert.equal(r.draft.images.length,status==='ready'?5:0));
  check(()=>assert.equal(r.job.stage,status==='ready'?'complete':'photo_review_required'));
  check(()=>assert.equal(h.requests.some(x=>x.url.endsWith('images/generations')),false));
 }
 for(const status of ['pending','ready']){
  const h=harness({answerFirst:true,photoSettings:{...baseConfig,carousel_ai_thumbnail_enabled:true},photoFixture:status});
  const r=await h.api.runGeneration(id,{...base,request_key:'manual:photo-ai-cover-'+status,visual_source:'auto_ai'},null);
  check(()=>assert.equal(r.job.status,'completed',JSON.stringify(r.job)));
  check(()=>assert.equal(r.draft.content_document.photo_sourcing.ai_thumbnail_enabled,true));
  check(()=>assert.equal(r.draft.images.length,status==='ready'?5:0));
  check(()=>assert.equal(r.job.stage,status==='ready'?'complete':'photo_review_required'));
  check(()=>assert.deepEqual(r.job.result_snapshot.stock_photo_selections.map(p=>p.slot),[1,2,3]));
  const imageCalls=h.requests.filter(x=>x.url.endsWith('images/generations'));
  check(()=>assert.equal(imageCalls.length,status==='ready'?1:0,'AI cover must NOT run before review'));
  if(status==='ready')check(()=>assert.equal(imageCalls[0].body.n,1,'cover uses one image only'));
 }
 {
  const h=harness({answerFirst:false,photoSettings:{...baseConfig,carousel_ai_thumbnail_enabled:true},photoFixture:'ready'});
  const r=await h.api.runGeneration(id,{...base,request_key:'manual:photo-3card',
    campaign_pattern:'poster',visual_source:'auto_ai'},null);
  check(()=>assert.equal(r.job.status,'completed',JSON.stringify(r.job)));
  check(()=>assert.equal(r.draft.carousel_slides.length,3));
  check(()=>assert.equal(r.draft.content_document.photo_sourcing.min_real_photos,2));
  check(()=>assert.equal(r.draft.content_document.photo_sourcing.ai_thumbnail_enabled,false));
  check(()=>assert.deepEqual(r.job.result_snapshot.stock_photo_selections.map(p=>p.slot),[0,1]));
  check(()=>assert.equal(h.requests.some(x=>x.url.endsWith('images/generations')),false));
 }
}
for(const language of ['ko','en'])for(const ordinal of [1,2,3,4]){
 const settings={carousel_mode:'alternating',carousel_default_slides:5,
  carousel_title_font_size_px:72,carousel_body_font_size_px:36};
 const h=harness({templateSettings:settings,answerFirst:true,slotNumber:ordinal});
 const input={...base,request_key:'manual:carousel-template-'+language+'-'+ordinal,language,visual_source:'auto_ai'};
 const result=await h.api.runGeneration(id,input,null);
 const expected=ordinal%2?3:5;
 check(()=>assert.equal(result.job.status,'completed',JSON.stringify({error:result.error,job:result.job.error_message,quality:result.draft.quality_report})));
 check(()=>assert.equal(result.draft.carousel_slides.length,expected));
 check(()=>assert.equal(result.draft.images.length,expected));
 check(()=>assert.equal(result.draft.content_document.carousel_template.slide_count,expected));
 check(()=>assert.equal(result.draft.content_document.carousel_template.reservation_number,ordinal));
 check(()=>assert.equal(result.draft.content_document.thumbnail_candidates.length,5));
 const writing=h.requests.find(x=>x.url.endsWith('chat/completions')).body;
 check(()=>assert.equal(writing.response_format.json_schema.schema.properties.slides.minItems,expected));
 check(()=>assert.match(writing.messages[0].content,/ANSWER-FIRST \(REQUIRED\)/));
}
for(const language of ['ko','en']){
 const settings={carousel_mode:'fixed',carousel_default_slides:3,carousel_title_font_size_px:72,carousel_body_font_size_px:36};
 const h=harness({templateSettings:settings,answerFirst:true});
 const r=await h.api.runGeneration(id,{...base,request_key:'manual:carousel-fixed-'+language,language},null);
 check(()=>assert.equal(r.job.status,'completed',JSON.stringify(r.job)));
 check(()=>assert.equal(r.draft.carousel_slides.length,5,'Fixed must produce five even if an older setting contains three'));
 check(()=>assert.equal(r.draft.content_document.carousel_template.reservation_number,null));
}
// Exercise the compact three-slide schema across real editorial research/topic contracts.
for(const language of ['ko','en'])for(const type of Object.keys(harness().policy.CONTENT_PROFILES)){
 const tSettings={carousel_mode:'alternating',carousel_default_slides:5,carousel_title_font_size_px:72,carousel_body_font_size_px:36};
 const h=harness({answerFirst:true,templateSettings:tSettings,slotNumber:1});
 const input={...base,request_key:'manual:compact-three-'+language+'-'+type,language,
  content_mode:type==='prelaunch'||type==='live_event'?type:'growth_carousel',
  ...(type==='prelaunch'?{campaign_pattern:'poster'}:{}),
  ...(type==='live_event'?{event_id:eventId,event_campaign_stage:'launch'}:{}),
  ...(!['prelaunch','live_event'].includes(type)?{topic_type:type}:{})};
 const r=await h.api.runGeneration(id,input,null);
 check(()=>assert.equal(r.job.status,'completed',JSON.stringify({type,language,error:r.error,job:r.job,quality:r.draft.quality_report})));
 check(()=>assert.equal(r.draft.carousel_slides.length,3,JSON.stringify({
  type,language,actual:r.draft.carousel_slides.length,
  stored_plan:r.draft.content_document?.carousel_template,
  writing_schema_lengths:h.requests.filter(x=>x.url.endsWith('chat/completions')&&x.body.response_format?.json_schema?.schema?.properties?.slides).map(x=>x.body.response_format.json_schema.schema.properties.slides.minItems),
  job_payload:h.tables.marketing_generation_jobs.at(-1)?.request_payload,
  draft_role:r.draft.draft_kind
 })));
 check(()=>assert.equal(r.draft.content_document.carousel_template.slide_count,3));
}
// A rejected five-topic batch never advances to paid writing, research or visuals.
{
 const h=harness({answerFirst:true,topicOutcome:'reject',templateSettings:{carousel_mode:'fixed',carousel_default_slides:5}});
 const request={...base,request_key:'manual:discard-topics-001',content_mode:'growth_carousel',topic_type:'conversation_prompt'};
 const r=await h.api.runGeneration(id,request,null);
 check(()=>assert.equal(r.job.status,'failed'));
 check(()=>assert.equal(r.job.error_code,'TOPIC_CANDIDATES_DISCARDED'));
 check(()=>assert.equal(h.tables.marketing_generation_jobs[0].request_payload.topic_selection.status,'discarded'));
 check(()=>assert.equal(h.tables.marketing_generation_jobs[0].quality_report.status,'rejected'));
 check(()=>assert.equal(h.requests.filter(x=>x.url.endsWith('chat/completions')).length,1));
 check(()=>assert.equal(h.requests.filter(x=>x.url.endsWith('/responses')||x.url.endsWith('images/generations')).length,0));
 check(()=>assert.equal(h.tables.instagram_post_drafts[0].images.length,0));
}

// No paid images or publishing after both independently reviewed topics are weak.
{
 const settings={carousel_mode:'fixed',carousel_default_slides:5,carousel_title_font_size_px:72,carousel_body_font_size_px:36};
 const h=harness({answerFirst:true,templateSettings:settings,criticOutcome:'reject'});
 const r=await h.api.runGeneration(id,{...base,request_key:'manual:weak-editorial-stop-001',
  content_mode:'growth_carousel',topic_type:'conversation_prompt'},null);
 check(()=>assert.equal(r.job.status,'completed',JSON.stringify(r)));
 check(()=>assert.equal(r.job.stage,'editorial_review_required'));
 check(()=>assert.equal(r.review_required,true));
 check(()=>assert.equal(r.draft.caption,'Original','Rejected edits do not overwrite the source draft'));
 check(()=>assert.ok(r.job.result_snapshot.carousel_slides.length));
 check(()=>assert.equal(r.job.error_code,'EDITORIAL_TOPIC_REJECTED'));
 check(()=>assert.equal(h.requests.filter(x=>x.body?.response_format?.json_schema?.name==='roundy_copy_critic_v1').length,2));
 check(()=>assert.equal(h.requests.filter(x=>x.url.endsWith('images/generations')).length,0));
 check(()=>assert.equal(h.tables.instagram_post_drafts[0].images.length,0));
 check(()=>assert.equal(h.tables.marketing_generation_jobs[0].quality_report.status,'rejected'));
}
// A fixable story gets only one rewrite followed by a second independent check.
{
 const settings={carousel_mode:'fixed',carousel_default_slides:5,carousel_title_font_size_px:72,carousel_body_font_size_px:36};
 const h=harness({answerFirst:true,templateSettings:settings,criticOutcome:'rewrite'});
 const r=await h.api.runGeneration(id,{...base,request_key:'manual:weak-editorial-repair-001',
  content_mode:'growth_carousel',topic_type:'conversation_prompt'},null);
 check(()=>assert.equal(r.job.status,'completed',JSON.stringify(r)));
 check(()=>assert.equal(h.requests.filter(x=>x.body?.response_format?.json_schema?.name==='roundy_copy_critic_v1').length,2));
 check(()=>assert.equal(h.requests.filter(x=>x.body?.response_format?.json_schema?.name==='roundy_editorial_v2').length,2));
 check(()=>assert.equal(r.draft.content_document.editorial_critic.status,'passed'));
 check(()=>assert.equal(r.draft.content_document.editorial_critic_history.length,2));
}


// New magazines reserve 3/5 STORY slides and append a server-authored, independent
// brand-only card. Every story slot must be photographed; old fixtures stay 3/5.
for(const [ordinal,expected] of [[1,4],[2,6]]){
 const photoConfig={carousel_min_real_photos_5:3,carousel_min_real_photos_3:2,carousel_ai_thumbnail_enabled:false};
 const settings={carousel_mode:'alternating',carousel_default_slides:5,
  carousel_brand_outro_enabled:true,carousel_title_font_size_px:72,carousel_body_font_size_px:36};
 const h=harness({answerFirst:true,templateSettings:settings,photoSettings:photoConfig,
  photoFixture:'ready',slotNumber:ordinal});
 const r=await h.api.runGeneration(id,{...base,request_key:'manual:branded-story-'+ordinal,
  content_mode:'growth_carousel',topic_type:'conversation_prompt',visual_source:'auto_ai'},null);
 check(()=>assert.equal(r.job.status,'completed',JSON.stringify({error:r.error,job:r.job})));
 check(()=>assert.equal(r.draft.carousel_slides.length,expected));
 check(()=>assert.equal(r.draft.images.length,expected));
 check(()=>assert.equal(r.draft.content_document.brand_outro_version,1));
 check(()=>assert.equal(r.draft.carousel_slides.at(-1).role,'brand_outro'));
 check(()=>assert.equal(r.draft.carousel_slides.at(-2).role,'editorial_closing'));
 check(()=>assert.equal(r.draft.content_document.photo_sourcing.version,2));
 check(()=>assert.equal(r.draft.content_document.photo_sourcing.min_real_photos,expected-1));
 check(()=>assert.deepEqual(r.job.result_snapshot.stock_photo_selections.map(p=>p.slot),
  Array.from({length:expected-1},(_,i)=>i)));
 check(()=>assert.equal(h.requests.filter(x=>x.url.endsWith('images/generations')).length,0));
}
{
 const photoConfig={carousel_min_real_photos_5:3,carousel_min_real_photos_3:2,carousel_ai_thumbnail_enabled:true};
 const settings={carousel_mode:'fixed',carousel_default_slides:5,carousel_brand_outro_enabled:true};
 const h=harness({answerFirst:true,templateSettings:settings,photoSettings:photoConfig,
  photoFixture:'ready'});
 const r=await h.api.runGeneration(id,{...base,request_key:'manual:branded-ai-cover-001',
  content_mode:'growth_carousel',topic_type:'conversation_prompt',visual_source:'auto_ai'},null);
 check(()=>assert.equal(r.job.status,'completed',JSON.stringify({error:r.error,job:r.job})));
 check(()=>assert.equal(r.draft.images.length,6));
 check(()=>assert.equal(r.draft.content_document.photo_sourcing.min_real_photos,4));
 check(()=>assert.deepEqual(r.job.result_snapshot.stock_photo_selections.map(p=>p.slot),[1,2,3,4]));
 const images=h.requests.filter(x=>x.url.endsWith('images/generations'));
 check(()=>assert.equal(images.length,1));
 check(()=>assert.equal(images[0].body.n,1));
}
{
 const photoConfig={carousel_min_real_photos_5:3,carousel_min_real_photos_3:2,carousel_ai_thumbnail_enabled:false};
 const settings={carousel_mode:'fixed',carousel_default_slides:5,carousel_brand_outro_enabled:true};
 const h=harness({answerFirst:true,templateSettings:settings,photoSettings:photoConfig,
  photoFixture:'pending'});
 const r=await h.api.runGeneration(id,{...base,request_key:'manual:branded-photo-review-001',
  content_mode:'growth_carousel',topic_type:'conversation_prompt',visual_source:'auto_ai'},null);
 check(()=>assert.equal(r.job.status,'completed'));
 check(()=>assert.equal(r.draft.images.length,0));
 check(()=>assert.equal(r.job.stage,'photo_review_required'));
 check(()=>assert.equal(h.requests.filter(x=>x.url.endsWith('images/generations')).length,0));
}

const adminMarketingSource=fs.readFileSync(new URL('../src/components/admin-marketing.tsx',import.meta.url),'utf8');
// New-post topic is conditional; existing renders exclusively use saved draft fields.
check(()=>assert.ok(adminMarketingSource.includes("topic_type:basis==='growth_carousel'?topic:undefined")));
check(()=>assert.ok(adminMarketingSource.includes("renderOnly?savedRenderContent(draft!)")));
check(()=>assert.ok(adminMarketingSource.includes("...contentInput,language:today?undefined:contentInput.language")));
check(()=>assert.ok(adminMarketingSource.includes("request.content_mode==='growth_carousel'")));
check(()=>assert.ok(adminMarketingSource.includes("message==='INVALID_QUALITY_REPORT'")));
const campaignSource=fs.readFileSync(new URL('../src/lib/marketing-campaign.ts',import.meta.url),'utf8');
const eventCampaignSource=fs.readFileSync(new URL('../src/lib/marketing-event-campaign.ts',import.meta.url),'utf8');
check(()=>assert.ok(campaignSource.includes("schema_version:{type:'integer',enum:[2]}")));
check(()=>assert.ok(campaignSource.includes("return {version:2,status:issues.length?'rejected':'passed'")));
check(()=>assert.ok(eventCampaignSource.includes("schema_version:{type:'integer',enum:[2]}")));
check(()=>assert.ok(eventCampaignSource.includes("return {version:2,status:issues.length?'rejected':'passed'")));
const generationSource=fs.readFileSync(new URL('../src/lib/marketing-generation.ts',import.meta.url),'utf8');
check(()=>assert.ok(generationSource.includes("IMAGE_MODEL='gpt-image-2.5-flare'")));
check(()=>assert.ok(generationSource.includes("size:'1024x1280'")));
check(()=>assert.ok(generationSource.includes("draft_role:'workspace'")));
check(()=>assert.ok(generationSource.includes("n:3")));
check(()=>assert.ok(generationSource.includes("FRESH_VISUAL_SET_REQUIRED")));
check(()=>assert.ok(generationSource.includes("static_photo_reuse:false")));
const editorialSource=fs.readFileSync(new URL('../src/lib/marketing-editorial.ts',import.meta.url),'utf8');
const visualSource=fs.readFileSync(new URL('../src/lib/marketing-visuals.ts',import.meta.url),'utf8');
check(()=>assert.ok(visualSource.includes('OFFICIAL_ROUNDY_PATHS')));
check(()=>assert.ok(visualSource.includes('roundy.team')||visualSource.includes('BRAND.website')));
check(()=>assert.ok(editorialSource.includes('renderCompactEditorial')));
console.log('PASS '+checks+' editorial/runtime assertions; zero live API calls.');
// Audit regressions: preserve the entire admin direction; research starts from evidence.
{
 const settings={carousel_mode:'fixed',carousel_default_slides:5,carousel_brand_outro_enabled:true};
 const h=harness({answerFirst:true,templateSettings:settings});
 const direction='Keep natural Korean and distinct scenes. '.repeat(10)+'LAST ADMIN INSTRUCTION';
 const r=await h.api.runGeneration(id,{...base,request_key:'manual:direction-full-001',content_mode:'growth_carousel',topic_type:'conversation_prompt',instruction:direction,story_card_count:3},null);
 const writes=h.requests.filter(x=>x.body?.response_format?.json_schema?.name==='roundy_editorial_v2');
 const messages=h.requests.filter(x=>x.body?.messages).flatMap(x=>x.body.messages).map(x=>x.content).join('\n');
 assert.ok(messages.includes('LAST ADMIN INSTRUCTION'));
 assert.equal(h.tables.marketing_generation_jobs[0].request_payload.story_card_count,3);
 const snapshot=r.job.result_snapshot||{};
 assert.equal((snapshot.content_document||r.draft.content_document)?.carousel_template?.slide_count,3);
 assert.equal((snapshot.carousel_slides||r.draft.carousel_slides).length,4);
}
{
 const h=harness({answerFirst:true,templateSettings:{carousel_mode:'fixed',carousel_default_slides:5}});
 await h.api.runGeneration(id,{...base,request_key:'manual:evidence-before-angle',content_mode:'growth_carousel',topic_type:'trend_research'},null);
 assert.ok(h.requests[0].url.endsWith('/responses'),'source research precedes any scene/appeal scoring');
 assert.equal(h.requests.some(x=>x.body?.response_format?.json_schema?.name==='roundy_topic_candidates_v1'),false);
}
console.log('PASS: full admin directions, evidence-first research and explicit 3+1 story format.');

// A rejected copy is saved before stock discovery; the result contract must
// expose an empty photo selection, never borrow photographs from the old draft.
for(const language of ['ko','en'])for(const source of ['stock','none']){
 const h=harness({answerFirst:true,criticOutcome:'reject',
  templateSettings:{carousel_mode:'fixed',carousel_default_slides:5,carousel_brand_outro_enabled:true},
  photoSettings:{carousel_min_real_photos_5:3,carousel_min_real_photos_3:2,carousel_ai_thumbnail_enabled:true}});
 const original=JSON.stringify(h.tables.instagram_post_drafts[0]);
 const result=await h.api.runGeneration(id,{...base,request_key:'manual:pre-photo-review-'+language+'-'+source,
  mode:source==='stock'?'both':'text',content_mode:'growth_carousel',topic_type:'conversation_prompt',
  visual_source:source,language},null);
 assert.equal(result.job.stage,'editorial_review_required',JSON.stringify(result));
 const saved=result.job.result_snapshot;
 assert.equal(saved.editorial_review_required,true);
 assert.ok(Array.isArray(saved.stock_photo_selections));
 assert.equal(saved.stock_photo_selections.length,0);
 assert.equal(saved.images.length,0);
 assert.equal(saved.photos_pending_review,source==='stock');
 assert.equal(saved.real_photos_required,source==='stock'?4:null);
 assert.equal(saved.real_photos_selected,0);assert.equal(saved.real_photos_approved,0);
 assert.equal(saved.photo_review_reason,source==='stock'?'EDITORIAL_REVIEW_BEFORE_PHOTO_SOURCING':null);
 assert.equal(h.requests.filter(x=>x.url.endsWith('images/generations')).length,0);
 assert.equal(JSON.stringify(h.tables.instagram_post_drafts[0]),original);
}
console.log('PASS 4 KO/EN pre-photo editorial-review snapshot scenarios; no real AI or photo requests.');

// Editor-first v2: production writer, persistence and render path, mocked external services only.
for(const language of ['ko','en'])for(const count of [3,5])for(const [topic,series] of [
 ['conversation_prompt','different_words'],['dating_archetype','read_the_room'],['seoul_dating','before_you_go']
]){
 const h=harness({topicOutcome:'reject',criticOutcome:'reject',answerFirst:true,
  templateSettings:{carousel_mode:'fixed',carousel_brand_outro_enabled:true},
  photoSettings:{carousel_min_real_photos_5:3,carousel_min_real_photos_3:2,carousel_ai_thumbnail_enabled:false}});
 const subject=language==='ko'?'사용자가 고른 소재와 참고 메모를 그대로 유지하세요.':'Preserve this specific human-selected subject and reference notes.';
 const result=await h.api.runGeneration(id,{...base,request_key:'manual:editor-first-'+language+'-'+count+'-'+topic,
  content_mode:'growth_carousel',topic_type:topic,language,visual_source:'stock',story_card_count:count,
  editorial_workflow_version:2,editorial_series:series,instruction:subject},null);
 assert.equal(result.job.status,'completed',JSON.stringify(result));
 assert.equal(result.job.stage,'photo_review_required',JSON.stringify(result.job));
 const requests=h.requests.filter(x=>x.url.endsWith('chat/completions'));
 assert.equal(requests.length,1,'exactly one writer, no planner/critic/automatic rewrite');
 assert.equal(h.requests.filter(x=>x.url.endsWith('/responses')).length,topic==='seoul_dating'?1:0);
 const writer=requests[0].body;
 assert.equal(writer.response_format.json_schema.schema.properties.thumbnail_candidates.maxItems,1);
 assert.equal(JSON.parse(writer.messages[1].content).direction,subject);
 assert.equal(result.draft.content_document.editorial_subject,subject);
 assert.equal(result.draft.content_document.editorial_workflow_version,2,'manual size must not overwrite v2');
 assert.equal(result.draft.content_document.editorial_series,series);
 assert.equal(result.draft.content_document.thumbnail_candidates.length,1);
 assert.equal(result.draft.carousel_slides.length,count+1);
 assert.equal(result.draft.carousel_slides.at(-1).role,'brand_outro');
 assert.equal(result.draft.content_document.photo_sourcing.min_real_photos,count);
 assert.equal(result.job.result_snapshot.images.length,0,'missing photos keep copy, never generate filler');
 assert.equal(h.requests.filter(x=>x.url.endsWith('images/generations')).length,0);
 assert.equal(h.tables.marketing_generation_jobs[0].request_payload.editorial_workflow_version,2);
 assert.equal(h.tables.marketing_generation_jobs[0].request_payload.editorial_series,series);
 assert.equal(result.draft.approved_at,undefined,'writing is not publishing approval');
 console.log('PASS editor-first '+language+' '+count+' '+series+' retains subject, writes once, preserves images/approval boundaries');
}
{
 const h=harness({badSources:true,answerFirst:true,templateSettings:{carousel_mode:'fixed',carousel_brand_outro_enabled:true},
  photoSettings:{carousel_min_real_photos_5:3,carousel_min_real_photos_3:2,carousel_ai_thumbnail_enabled:false}});
 const result=await h.api.runGeneration(id,{...base,request_key:'manual:editor-first-no-sources',content_mode:'growth_carousel',
  topic_type:'dating_myth',language:'ko',visual_source:'stock',story_card_count:3,editorial_workflow_version:2,
  editorial_series:'read_the_room',instruction:'첫인상에 관한 특정 통념을 검토하세요.'},null);
 assert.equal(result.job.status,'completed');
 assert.equal(result.job.stage,'source_review_required');
 assert.equal(result.job.quality_report.severity,'critical');
 assert.equal(result.job.result_snapshot.growth_topic_type,'dating_myth');
 assert.equal(h.requests.length,1,'missing research does not cause a paid fallback writer');
 assert.equal(h.tables.instagram_post_drafts[0].caption,'Original');
 assert.equal(h.stored.length,0);
 console.log('PASS editor-first missing evidence retains source review and original subject, no fallback or images');
}
{
 const h=harness({duplicate:true,answerFirst:true,templateSettings:{carousel_mode:'fixed',carousel_brand_outro_enabled:true},
  photoSettings:{carousel_min_real_photos_5:3,carousel_min_real_photos_3:2,carousel_ai_thumbnail_enabled:false}});
 const result=await h.api.runGeneration(id,{...base,request_key:'manual:editor-first-advisory',content_mode:'growth_carousel',
  topic_type:'dating_archetype',language:'ko',visual_source:'stock',story_card_count:3,editorial_workflow_version:2,
  editorial_series:'read_the_room',instruction:'같은 침묵을 서로 다르게 읽는 장면'},null);
 assert.equal(result.job.status,'completed');
 assert.equal(result.job.stage,'photo_review_required',JSON.stringify(result.job));
 assert.equal(h.requests.length,1);
 assert.ok(result.draft.quality_report.suggestions.some(x=>x.includes('중복')));
 assert.equal(result.draft.content_document.editorial_review_required,false);
 console.log('PASS editorial repetition becomes a retained suggestion, not another paid rewrite');
}

// Incident regression: usable cited research must not be confused with an
// unrelated tool's terminal state or the requested tool budget.
{
 const p=harness().policy;
 const result={status:'completed',output:[
  {type:'web_search_call',status:'completed'},
  {type:'web_search_call',status:'incomplete'},
  {type:'message',status:'completed',content:[{type:'output_text',text:'Verified venue information.',annotations:[
   {type:'url_citation',url:'https://official.example/venue',title:'Official venue',start_index:0,end_index:26}
  ]}]}
 ]};
 assert.equal(p.extractResearchEvidence(result).completed,true,'A completed cited response with a successful search must remain usable despite an unused incomplete call');
 console.log('PASS cited response with partial tool history remains usable');
}

// Fault-injection tests execute the same runGeneration code used by the HTTP route.
const resilientOptions={answerFirst:true,templateSettings:{carousel_mode:'fixed',carousel_brand_outro_enabled:true},
 photoSettings:{carousel_min_real_photos_5:3,carousel_min_real_photos_3:2,carousel_ai_thumbnail_enabled:false}};
const resilientInput={...base,content_mode:'growth_carousel',topic_type:'seoul_dating',language:'ko',visual_source:'stock',
 story_card_count:5,editorial_workflow_version:2,editorial_series:'before_you_go',instruction:'비 오는 날 서울 실내 장소 세 곳의 차이'};
{
 const h=harness({...resilientOptions,extraResearchCalls:[{type:'web_search_call',status:'incomplete'}]});
 const r=await h.api.runGeneration(id,{...resilientInput,request_key:'manual:partial-tool-history'},null);
 assert.equal(r.job.stage,'photo_review_required',JSON.stringify(r));
 const cache=h.tables.marketing_generation_jobs[0].research_cache;
 assert.equal(cache.search_completed,true);assert.equal(cache.diagnostics.successful_web_calls,1);
 assert.equal(cache.diagnostics.web_call_count,2);
 const writer=h.requests.find(r=>r.body.response_format?.json_schema?.name==='roundy_editorial_v2');
 assert.ok(JSON.parse(writer.body.messages[1].content).research_notes.includes('하늘공원'));
 assert.equal(JSON.parse(writer.body.messages[1].content).seoul_format,'places');
 assert.equal(h.requests.filter(r=>r.url.endsWith('/responses')).length,1);
 console.log('PASS completed cited response flows into one writer with full research notes and stable comparison format');
}
{
 const h=harness({...resilientOptions,researchStatus:'incomplete',enforceDedupe:true});
 const r=await h.api.runGeneration(id,{...resilientInput,request_key:'manual:unfinished-research'},null);
 assert.equal(r.job.stage,'source_review_required');
 assert.equal(r.job.quality_report.research_diagnostics.reason,'response_incomplete');
 assert.equal(r.job.quality_report.research_diagnostics.incomplete_reason,'max_output_tokens');
 assert.ok(r.job.result_snapshot.research_sources.length>0);
 assert.match(r.job.error_message,/끝까지 완료되지/);
 assert.equal(h.requests.length,1,'incomplete response must not be passed to a paid writer');
 const retry=await h.api.runGeneration(id,{...resilientInput,request_key:'retry:unfinished-research'},null,false,
  {threadId:r.job.id,retryOfJobId:r.job.id,attemptNumber:2});
 assert.equal(retry.job.stage,'source_review_required');
 assert.notEqual(h.tables.marketing_generation_jobs[0].fingerprint,h.tables.marketing_generation_jobs[1].fingerprint,
  'explicit source-review retry must not be rejected by the completed-parent fingerprint');
 console.log('PASS incomplete answers retain evidence and diagnostics; explicit same-revision retry has distinct reservation identity');
}
{
 const h=harness({...resilientOptions,writerFailures:2});
 const first=await h.api.runGeneration(id,{...resilientInput,request_key:'manual:cache-chain-1'},null);
 assert.equal(first.job.status,'failed');
 const firstCache=structuredClone(h.tables.marketing_generation_jobs[0].research_cache);
 const second=await h.api.runGeneration(id,{...resilientInput,request_key:'retry:cache-chain-2'},null,false,
  {threadId:first.job.id,retryOfJobId:first.job.id,attemptNumber:2});
 assert.equal(second.job.status,'failed');
 const third=await h.api.runGeneration(id,{...resilientInput,request_key:'retry:cache-chain-3'},null,false,
  {threadId:first.job.id,retryOfJobId:second.job.id,attemptNumber:3});
 assert.equal(third.job.stage,'photo_review_required',JSON.stringify(third));
 assert.equal(h.requests.filter(r=>r.url.endsWith('/responses')).length,1,'retries reuse research across the full attempt chain');
 assert.equal(h.tables.marketing_generation_jobs[2].research_cache.saved_at,firstCache.saved_at,'cache TTL must not slide');
 console.log('PASS three-attempt recovery reuses one research response without extending its verification TTL');
}
for(const [status,code,paused] of [[429,'rate_limit_exceeded',false],[429,'insufficient_quota',true],[429,'credit_balance_exhausted',true],[503,'service_unavailable',false]]){
 const h=harness({upstreamError:{status,code}});
 const r=await h.api.runGeneration(id,{...base,request_key:'manual:error-'+code},null);
 assert.equal(r.job.status,'failed');assert.equal(h.requests.length,1);
 assert.equal(Boolean(h.tables.marketing_ai_control[0].blocked_reason),paused);
 console.log('PASS upstream '+code+' circuit breaker and single-call policy');
}
{
 const h=harness({unreadableResponse:true});const r=await h.api.runGeneration(id,{...base,request_key:'manual:unreadable-result'},null);
 assert.equal(r.job.status,'uncertain');assert.equal(r.job.error_code,'UPSTREAM_OUTCOME_UNKNOWN');assert.equal(h.requests.length,1);
 console.log('PASS unreadable successful HTTP response is an uncertain paid outcome, never an automatic retry');
}
{
 const h=harness({...resilientOptions,photoFixture:'ready'});
 const r=await h.api.runGeneration(id,{...resilientInput,request_key:'manual:overlong-credit',mode:'text',visual_source:'none'},null);
 const draft=h.tables.instagram_post_drafts[0];
 draft.caption=String(draft.caption)+'\n'+('Extra context. '.repeat(160)).slice(0,1989-String(draft.caption).length);draft.visual_source='stock';
 const before=h.requests.length;
 const rendered=await h.api.runGeneration(id,{...resilientInput,request_key:'manual:credit-render',revision:draft.revision,
  mode:'image',render_only:true},null);
 assert.equal(rendered.job.error_code,'STOCK_CAPTION_CREDIT_LIMIT',JSON.stringify(rendered));
 assert.equal(h.requests.length,before,'known credit overflow must fail before any paid image call');
 assert.equal(h.stored.length,0,'known credit overflow must fail before uploading rendered cards');
 console.log('PASS caption credit overflow is detected before rendering or image charges');
}
{
 const h=harness({...resilientOptions,photoFixture:'ready',jobAgeMs:100_000,
  photoSettings:{...resilientOptions.photoSettings,carousel_ai_thumbnail_enabled:true}});
 const r=await h.api.runGeneration(id,{...resilientInput,request_key:'manual:time-budget'},null);
 assert.equal(r.job.status,'completed');assert.equal(r.job.stage,'render_review_required',JSON.stringify(r));
 assert.equal(r.job.result_snapshot.render_deferred_reason,'HANDLER_TIME_BUDGET');
 assert.ok(r.job.result_snapshot.carousel_slides.length);assert.ok(r.job.result_snapshot.stock_photo_selections.length);
 assert.equal(h.requests.filter(r=>r.url.endsWith('images/generations')).length,0);
 assert.equal(h.stored.length,0);
 console.log('PASS nearly exhausted handler saves copy and selected photos and defers paid imagery to image-only completion');
}
{
 const p=harness().policy;
 const message={type:'message',content:[{type:'output_text',text:'A verified source.',annotations:[
  {type:'url_citation',url:'https://official.example/source',title:'Source'}]}]};
 const many={status:'completed',output:[...Array.from({length:4},()=>({type:'web_search_call',status:'completed'})),message]};
 assert.equal(p.extractResearchEvidence(many).completed,true);
 assert.equal(p.extractResearchEvidence(many).diagnostics.requested_tool_budget_exceeded,true);
 assert.equal(p.extractResearchEvidence({status:'completed',output:[message]}).completed,false);
 assert.equal(p.extractResearchEvidence({status:'completed',output:[null,{type:'message',content:{}},{type:'message',content:[{type:'output_text',text:'https://fake.example/',annotations:{}}]}]}).completed,false);
 assert.equal(p.extractResearchEvidence({status:'failed',output:many.output}).completed,false);
 assert.equal(p.extractResearchEvidence({status:'completed',output:[{type:'web_search_call',status:'completed'}, {...message,status:'incomplete'}]}).completed,false);
 console.log('PASS research parser handles budgets and malformed shapes while rejecting missing searches and incomplete responses');
}
