// Provider response fixtures shared by central integration tests. Never executes a live API.
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
