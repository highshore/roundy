'use client';
import { useEffect, useRef, useState } from 'react';
import { Heading } from './heading';
import { tr, type Locale } from '@/lib/locale';
import { uploadFile } from '@/lib/uploads';
import { OrderedImages } from './ordered-images';
type Row=Record<string,any>;
const BASE='/api/admin/marketing';
const topics=['mbti','dating_archetype','book_insight','trend_research','meme_remix','dating_myth','conversation_prompt','seoul_dating','mini_quiz'];
const topicKo=['MBTI 연애 유형','연애 유형','책 속 공감','최신 연구','밈 재해석','연애 통념','첫 대화 질문','서울 데이팅','미니 퀴즈'];
async function request(path='',body?:unknown,method='POST'){
 const response=await fetch(BASE+path,body===undefined?{cache:'no-store'}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(245000)});
 const data=await response.json().catch(()=>({error:'서버 응답을 확인하지 못했습니다. 새로고침으로 작업 기록부터 확인하세요.'}));return {ok:response.ok,data};
}
const blank=()=>({channel:'koreapas',name:'',title:'',caption:'',cta:'자세히 보기',destination_url:'https://roundy.team',images:[] as string[],days:[] as number[],time_kst:'10:00',enabled:false});
export function AdminMarketing({locale}:{locale:Locale}){
 const t=(en:string,ko:string)=>tr(locale,en,ko);
 const [data,setData]=useState<Row>({drafts:[],runs:[],templates:[]});
 const [draft,setDraft]=useState<Row|null>(null),[settings,setSettings]=useState<Row|null>(null),[generation,setGeneration]=useState<Row|null>(null);
 const [channel,setChannel]=useState<'instagram'|'koreapas'>('instagram'),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [basis,setBasis]=useState('prelaunch'),[mode,setMode]=useState('both'),[visual,setVisual]=useState('cards'),[topic,setTopic]=useState('conversation_prompt'),[contentLanguage,setContentLanguage]=useState<'ko'|'en'>('ko'),[direction,setDirection]=useState(''),[dirty,setDirty]=useState(false);
 const [template,setTemplate]=useState<Row>(blank());
 const [resultPreview,setResultPreview]=useState<Row|null>(null);
 const [activeTab,setActiveTab]=useState<'draft'|'generation'|'publishing'|'automation'|'connection'>('draft');
 const [generationFilter,setGenerationFilter]=useState<'all'|'completed'|'failed'|'running'>('all');
 const [generationVisible,setGenerationVisible]=useState(20),[publishVisible,setPublishVisible]=useState(20);
 const inFlight=useRef(false),mounted=useRef(true);
 function selectDraft(next:Row|null){setDraft(next?structuredClone(next):null);setDirty(false);if(next){setBasis(next.draft_kind==='growth_carousel'?'growth_carousel':next.content_mode);setTopic(next.growth_topic_type||'conversation_prompt');setContentLanguage(next.content_language==='en'?'en':'ko');}}
 async function load(preferredId?:string){
  const r=await request();if(!r.ok)throw new Error(r.data.error||'Could not load marketing');if(!mounted.current)return;
  setData(r.data);setSettings(r.data.settings);setGeneration(r.data.generation);const rows=r.data.drafts||[];
  selectDraft(rows.find((x:Row)=>x.id===preferredId)||rows.find((x:Row)=>x.status==='needs_approval')||rows[0]||null);
 }
 useEffect(()=>{mounted.current=true;load().catch(e=>{if(mounted.current)setError(e.message);}).finally(()=>{if(mounted.current)setLoading(false);});return()=>{mounted.current=false;};},[]);
 // Bounded READ-ONLY polling: never calls a paid endpoint or starts generation.
 useEffect(()=>{
  if(!busy)return;let cancelled=false,attempts=0,failures=0,timer:ReturnType<typeof setTimeout>|undefined;
  async function poll(){if(cancelled||attempts++>=48||failures>=3)return;if(document.visibilityState==='visible')try{const r=await request('/generation');if(r.ok){if(!cancelled)setGeneration(r.data);failures=0;}else failures++;}catch{failures++;}if(!cancelled)timer=setTimeout(poll,5000);}
  timer=setTimeout(poll,2000);return()=>{cancelled=true;if(timer)clearTimeout(timer);};
 },[busy]);
 function friendlyError(message:string){
  const map:Record<string,[string,string]>={
   DUPLICATE_GENERATION_BLOCKED:['A matching generation is already running, completed, or has an unknown outcome. Refresh status before trying again.','같은 생성 작업이 이미 진행 중이거나 완료됐거나 결과 확인이 필요한 상태입니다. 상태를 새로고침한 뒤 확인하세요.'],
   GENERATION_COOLDOWN_30_SECONDS:['Please wait 30 seconds before starting another generation.','연속 생성 방지를 위해 30초 후 다시 시도하세요.'],
   GENERATION_BUDGET_REACHED:['Today’s marketing AI safety budget has been reached.','오늘 마케팅 AI 안전 한도에 도달했습니다.'],
   GENERATION_CALL_LIMIT:['Today’s generation call limit has been reached.','오늘 생성 횟수 안전 한도에 도달했습니다.'],
   GENERATION_ALREADY_RUNNING:['Another generation is still running. Wait for it to finish or refresh status.','다른 생성 작업이 진행 중입니다. 완료될 때까지 기다리거나 상태를 새로고침하세요.'],
   DRAFT_CHANGED_REFRESH_FIRST:['This draft changed. Refresh status before trying again.','초안이 변경됐습니다. 상태를 새로고침한 뒤 다시 시도하세요.'],
   DRAFT_NOT_EDITABLE:['This draft is no longer editable. Refresh status.','이 초안은 더 이상 수정할 수 없습니다. 상태를 새로고침하세요.'],
   INVALID_SLIDE_COUNT:['An older generation returned an unsupported card count. Current versions normalize sensible carousel lengths automatically.','이전 버전에서 카드 수 형식이 맞지 않아 중지된 작업입니다. 현재 버전은 적절한 카드 수를 자동 정리합니다.'],
   RESEARCH_SOURCES_MISSING:['An older research run did not copy sources into its JSON result. Current versions read sources directly from Web Search.','이전 버전에서 검색 출처를 JSON에 복사하지 못해 중지된 작업입니다. 현재 버전은 Web Search 출처를 직접 읽습니다.'],
   RESEARCH_TOOL_SOURCES_MISSING:['Web Search returned no usable source metadata. No automatic retry was sent.','Web Search가 사용 가능한 출처 메타데이터를 반환하지 않아 중지했습니다. 자동 재시도는 하지 않았습니다.'],
   TOO_FEW_GROWTH_SLIDES:['The research result did not contain enough usable carousel cards. No automatic retry was sent.','검색 결과에 사용할 수 있는 캐러셀 카드가 너무 적어 중지했습니다. 자동 재시도는 하지 않았습니다.'],
   AI_RETURNED_INVALID_JSON:['The generated response could not be parsed safely. No automatic retry was sent.','생성 결과를 안전하게 해석할 수 없어 중지했습니다. 자동 재시도는 하지 않았습니다.'],
   RETRY_CONFIRMATION_REQUIRED:['Confirm the retry before starting a new API request.','새 API 요청을 시작하기 전에 재시도를 확인하세요.'],
   RETRY_ONLY_FAILED_MANUAL:['Only failed manual generation jobs can be retried from history.','생성 기록에서는 실패한 수동 작업만 재시도할 수 있습니다.'],
   RETRY_PAYLOAD_UNAVAILABLE:['This older failure does not have enough saved settings to retry exactly.','이전 실패 기록에 동일 설정을 복원할 정보가 부족합니다.'],
   CONFIRM_PAID_PHOTO_FIRST:['Paid photo retry requires explicit confirmation.','유료 사진 재시도는 별도 확인이 필요합니다.'],
   GENERATION_THREAD_NOT_RETRYABLE:['Only the latest failed attempt in this generation thread can be retried. Refresh the history first.','이 생성 스레드의 가장 최근 실패 시도만 재시도할 수 있습니다. 생성 기록을 새로고침하세요.'],
   RESTORE_CONFIRMATION_REQUIRED:['Confirm before replacing the current draft with this saved result.','저장된 결과로 현재 초안을 교체하기 전에 확인하세요.'],
   COMPLETED_GENERATION_REQUIRED:['Only a completed generation result can be restored.','완료된 생성 결과만 초안으로 불러올 수 있습니다.'],
   RESULT_SNAPSHOT_UNAVAILABLE:['This older completed generation predates result snapshots, so its exact content is no longer available.','이 완료 작업은 결과 보존 기능 도입 이전에 생성되어 정확한 결과를 다시 불러올 수 없습니다.']
  };
  return map[message]?t(...map[message]):message;
 }
 async function work(fn:()=>Promise<void>){if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError(friendlyError(e instanceof Error?e.message:'Request failed'));}finally{inFlight.current=false;if(mounted.current)setBusy(false);}}
 async function mutate(path:string,body:Row,method='POST'){const r=await request(path,body,method);if(r.data.draft)selectDraft(r.data.draft);if(!r.ok||r.data.error)throw new Error(r.data.error||'Request failed');return r.data;}
 async function generate(today=false,renderOnly=false){
  if(!today&&!draft)return;if(dirty&&!window.confirm(t('Discard unsaved edits before generating?','저장하지 않은 수정을 버리고 생성할까요?')))return;
  const actualVisual=today||renderOnly||basis==='growth_carousel'||mode==='text'?'cards':visual,photo=actualVisual==='photo';
  const cost=renderOnly||!today&&mode==='image'&&!photo?'$0':photo?(mode==='both'?'$0.07':'$0.05'):'$0.02';
  const message=photo?t('Generate one paid low-quality AI photo? No retries. This reserves '+cost+' from the app budget, not an exact invoice quote.','유료 AI 사진 1장을 저비용 품질로 생성할까요? 자동 재시도는 없습니다. 앱 예산에서 '+cost+'를 보수적으로 차감하며 실제 청구액과는 다릅니다.'):t('Generate with a '+cost+' budget reservation? Existing copy may be replaced. Nothing will be published.','앱 예산 '+cost+'를 예약하고 생성할까요? 기존 문구가 교체될 수 있으며, 인스타그램에는 게시되지 않습니다.');
  if(!window.confirm(message))return;
  await work(async()=>{
   const payload={request_key:'manual:'+crypto.randomUUID(),revision:draft?.revision||1,mode:renderOnly?'image':today?'both':mode,content_mode:basis,language:today?(draft?.content_language||undefined):contentLanguage,visual_mode:today?'cards':actualVisual,topic_type:topic,instruction:direction.trim(),confirm_photo:photo,render_only:renderOnly};
   const r=await request(today?'/draft/generate':'/draft/'+draft!.id+'/regenerate',payload);
   if(r.data.draft)selectDraft(r.data.draft);await load(r.data.draft?.id||draft?.id);
   if(!r.ok||r.data.error)throw new Error(r.data.error||'Generation failed');
   if(r.data.job?.status==='running'){setNotice(t('This request already exists. Check its status; it was not billed again.','이미 접수된 요청입니다. 작업 기록을 확인하세요. 추가 호출하지 않았습니다.'));return;}
   if(['failed','uncertain'].includes(r.data.job?.status))throw new Error(r.data.job.error_message||'Previous attempt stopped; no retry was sent.');
   setNotice(t('Generation complete. Review the result before approving.','생성이 완료됐습니다. 결과를 검토한 뒤 승인하세요.'));setDirection('');
  });
 }
 function retryCost(job:Row){return job.operation==='render'?0:job.operation==='photo'?0.05:job.operation==='copy_photo'?0.07:0.02;}
 async function retryJob(job:Row){
  const sourceDraft=data.drafts.find((d:Row)=>d.id===job.draft_id);
  if(!sourceDraft||sourceDraft.status!=='needs_approval')throw new Error('DRAFT_NOT_EDITABLE');
  if(!job.request_payload)throw new Error('RETRY_PAYLOAD_UNAVAILABLE');
  const cost=retryCost(job),photo=['photo','copy_photo'].includes(job.operation),budget=cost.toFixed(2)+' USD';
  const confirmMessage=t(
   'Retry this failed generation with the same saved settings? This starts one new API request and reserves '+budget+'. It will not publish automatically.',
   '이 실패 작업을 저장된 동일 설정으로 재시도할까요? 새 API 요청 1회를 시작하며 앱 예산 '+budget+'를 예약합니다. 자동 게시되지는 않습니다.'
  );
  if(!window.confirm(confirmMessage))return;
  await work(async()=>{
   const r=await request('/generation/jobs/'+job.id+'/retry',{confirm_retry:true,confirm_paid_photo:photo});
   if(r.data.draft)selectDraft(r.data.draft);
   await load(r.data.draft?.id||job.draft_id);
   if(!r.ok||r.data.error)throw new Error(r.data.error||'Retry failed');
   if(['failed','uncertain'].includes(r.data.job?.status))throw new Error(r.data.job?.error_message||'Retry stopped');
   setActiveTab('draft');
   setNotice(t('Retry complete. The generated result is open in Draft.','재시도가 완료됐습니다. 생성 결과를 초안 탭에 열었습니다.'));
  });
 }
 function openThreadResult(thread:Row){
  const attempts=[...(thread.attempts||[])].reverse();
  const attempt=attempts.find((a:Row)=>a.status==='completed'&&a.result_snapshot);
  if(!attempt){setError(friendlyError('RESULT_SNAPSHOT_UNAVAILABLE'));return;}
  setResultPreview({thread,attempt,snapshot:attempt.result_snapshot});
 }
 async function restoreResultToDraft(){
  if(!resultPreview?.attempt?.id)return;
  if(!window.confirm(t('Replace the current editable draft with this saved generation result? This does not publish it.','현재 편집 가능한 초안을 이 저장된 생성 결과로 교체할까요? 게시되지는 않습니다.')))return;
  await work(async()=>{
   const r=await request('/generation/jobs/'+resultPreview.attempt.id+'/restore',{confirm_restore:true});
   if(!r.ok||r.data.error)throw new Error(r.data.error||'Restore failed');
   if(r.data.draft)selectDraft(r.data.draft);
   await load(r.data.draft?.id);
   setResultPreview(null);setActiveTab('draft');
   setNotice(t('Saved generation result restored to Draft.','저장된 생성 결과를 초안으로 불러왔습니다.'));
  });
 }
  const running=(generation?.jobs||[]).find((j:Row)=>j.status==='running'&&Date.now()-Date.parse(j.created_at)<300000),blocked=Boolean(generation?.control?.blocked_reason||generation?.control?.enabled===false);
 function stage(s:string){const labels:Record<string,string>={reserved:t('Reserved; duplicate checks passed','예산 예약 및 중복 검사 완료'),writing:t('Writing copy','문구 작성 중'),researching:t('One web search and copy','웹 검색 최대 1회 및 문구 작성 중'),saving_copy:t('Saving copy','문구 저장 중'),generating_photo:t('Generating one photo','사진 1장 생성 중'),saving_photo:t('Saving photo','사진 저장 중'),saving_images:t('Saving images','이미지 저장 중'),complete:t('Complete','완료'),stopped:t('Stopped','중지')};return labels[s]||s.replace('rendering_','카드 생성 ').replace('_of_',' / ');}
 function changeDraft(key:string,value:string){setDraft(d=>d?{...d,[key]:value}:d);setDirty(true);}
 const allGenerationJobs=((generation?.jobs||[]) as Row[]);
 const threadMap=new Map<string,Row[]>();
 for(const job of [...allGenerationJobs].reverse()){
  const threadId=String(job.generation_thread_id||job.id);
  const attempts=threadMap.get(threadId)||[];attempts.push(job);threadMap.set(threadId,attempts);
 }
 const generationThreads=[...threadMap.entries()].map(([id,attempts])=>{
  attempts.sort((a:Row,b:Row)=>Number(a.attempt_number||0)-Number(b.attempt_number||0)||Date.parse(a.created_at)-Date.parse(b.created_at));
  const latest=attempts[attempts.length-1],root=attempts[0];
  const status=attempts.some((a:Row)=>a.status==='completed')?'completed':latest.status;
  return {id,attempts,latest,root,status,total_reserved_usd:attempts.reduce((sum:number,a:Row)=>sum+Number(a.reserved_usd||0),0),created_at:root.created_at,updated_at:latest.updated_at||latest.created_at};
 }).sort((a:Row,b:Row)=>Date.parse(b.updated_at)-Date.parse(a.updated_at));
 const filteredGenerationThreads=generationThreads.filter((thread:Row)=>generationFilter==='all'||thread.status===generationFilter);
 const visibleGenerationThreads=filteredGenerationThreads.slice(0,generationVisible);
 const channelRuns=((data.runs||[]) as Row[]).filter((r:Row)=>r.channel===channel);
 const visibleRuns=channelRuns.slice(0,publishVisible);
 const tabItems=[
  ['draft',t('Draft','초안')],
  ['generation',t('Generation','생성 기록')],
  ['publishing',t('Publishing','게시 기록')],
  ['automation',t('Automation','자동화')],
  ['connection',t('Connection','연결')]
 ] as const;
 function statusText(status:string){const labels:Record<string,[string,string]>={completed:['Completed','완료'],failed:['Failed','실패'],running:['Running','진행 중'],uncertain:['Needs review','확인 필요'],sent:['Published','게시됨'],queued:['Scheduled','예약됨'],sending:['Publishing','게시 중'],needs_review:['Needs review','확인 필요'],scheduled:['Scheduled','예약됨']};return labels[status]?t(...labels[status]):status;}
 function contentLabel(row:Row){const kind=row.request_payload?.topic_type||row.snapshot?.growth_topic_type||row.snapshot?.draft_kind||row.operation||'content';const ko:Record<string,string>={book_insight:'책 속 공감',trend_research:'최신 연구',meme_remix:'밈 재해석',growth_carousel:'Growth Carousel',brand:'브랜드 콘텐츠',copy:'일반 콘텐츠',research:'검색 콘텐츠'};return locale==='ko'?(ko[kind]||String(kind).replaceAll('_',' ')):String(kind).replaceAll('_',' ');}
 if(loading)return <p role="status">{t('Loading marketing workspace…','마케팅 정보를 불러오는 중입니다…')}</p>;
 return <section className="admin-panel marketing-panel">
  <div className="admin-heading"><p className="admin-kicker">ROUNDY ADMIN</p><Heading level={1}>{t('Marketing','마케팅')}</Heading><p>{t('Generate safely. Review once. Publish only after approval.','안전하게 생성하고 검토한 뒤, 승인한 콘텐츠만 게시합니다.')}</p></div>
  <div className="admin-form-actions">{(['instagram','koreapas'] as const).map(c=><button type="button" key={c} className={channel===c?'admin-primary':'admin-secondary'} onClick={()=>setChannel(c)}>{c==='instagram'?'Instagram @roundy.meet':'Koreapas'}</button>)}<button type="button" className="admin-secondary" disabled={busy} onClick={()=>void work(()=>load(draft?.id))}>{t('Refresh status','상태 새로고침')}</button></div>
  {error&&<p className="admin-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {channel==='instagram'&&<nav className="marketing-subtabs" aria-label={t('Marketing sections','마케팅 메뉴')} role="tablist">{tabItems.map(([value,label])=><button key={value} type="button" role="tab" aria-selected={activeTab===value} className={activeTab===value?'active':''} onClick={()=>setActiveTab(value)}>{label}{value==='generation'&&generationThreads.some((thread:Row)=>thread.status==='failed')&&<span className="marketing-tab-dot" aria-label={t('Failed generation exists','실패한 생성 있음')}/>}</button>)}</nav>}
  {channel==='instagram'&&activeTab==='draft'&&<>
   <div className="marketing-setup"><strong>{t('API cost guard','API 비용 안전장치')}</strong><p>{t('Reserved today','오늘 예약액')} ${Number(generation?.usage?.daily_reserved_usd||0).toFixed(2)} / $0.25. {t('This month','이번 달')} ${Number(generation?.usage?.monthly_reserved_usd||0).toFixed(2)} / $3.00. {t('API attempts today','오늘 API 요청')} {generation?.usage?.daily_attempts||0}. {t('Safety-counted jobs','안전 카운트')} {generation?.usage?.daily_calls||0}/5.</p><p className="admin-help">{t('No automatic retries or paid-provider fallback. Failed/unknown attempts retain reservations. Automatic posts use cards, not paid photos. Photos: 1/day, 10/month. External account spending is separate.','자동 재시도와 다른 유료 API로의 전환은 없습니다. 실패하거나 응답이 불명확한 작업도 예약액을 유지합니다. 자동 생성은 카드 이미지이며 유료 사진은 하루 1장, 월 10장까지만 가능합니다. 다른 서비스의 API 사용액은 이 한도에 포함되지 않습니다.')}</p>
    {!generation?.provider?.configured&&<p className="admin-error">{t('OPENAI_API_KEY is missing from this deployment. Configure Vercel Production and redeploy.','이 배포에 OPENAI_API_KEY가 없습니다. Vercel Production 설정 후 재배포가 필요합니다.')}</p>}
    {generation?.control?.blocked_reason&&<p className="admin-error" role="alert">{generation.control.blocked_reason}</p>}
    <button type="button" className="admin-secondary" onClick={()=>void (async()=>{try{const enable=blocked;if(enable&&!window.confirm(t('Resume after checking API configuration? Budgets are not reset and failed jobs are not retried.','API 설정을 확인했나요? 사용 한도를 초기화하거나 실패 작업을 재시도하지 않고 AI를 재개합니다.')))return;const r=await request('/generation/control',{enabled:enable,confirm_resume:enable},'PUT');if(!r.ok)throw new Error(r.data.error);setGeneration(r.data);}catch(e){setError(e instanceof Error?e.message:'Could not update AI control');}})()}>{blocked?t('Resume after checking configuration','설정 확인 후 AI 재개'):t('Pause paid AI','유료 AI 일시 중지')}</button>
   </div>
   {running&&<div className="generation-progress active" role="status" aria-live="polite"><strong>{stage(running.stage)}</strong><p>{t('You may leave this page. Returning only reads the existing job, never restarts it.','페이지를 나가도 이미 접수된 작업은 서버에서 처리합니다. 다시 접속해도 같은 작업을 새로 시작하지 않습니다.')}</p></div>}
   <div className="admin-section-title"><Heading level={2}>{t('Instagram drafts','Instagram 초안')}</Heading><button type="button" className="admin-primary" disabled={busy||!!running||blocked} onClick={()=>void generate(true)}>{t('Generate today’s copy + cards','오늘 문구와 카드 생성')}</button></div>
   <label className="admin-form"><span>{t('Choose draft','초안 선택')}</span><select value={draft?.id||''} disabled={busy||!!running} onChange={e=>{if(dirty&&!window.confirm(t('Discard unsaved changes?','저장하지 않은 수정을 버릴까요?')))return;selectDraft(data.drafts.find((d:Row)=>d.id===e.target.value)||null);}}>{data.drafts.map((d:Row)=><option key={d.id} value={d.id}>{d.draft_date} / {d.status} / v{d.revision}</option>)}</select></label>
   {!draft?<p className="admin-empty">{t('Generate the first draft above.','위 버튼으로 첫 초안을 생성하세요.')}</p>:<div className="marketing-layout"><div className="admin-form marketing-editor"><p>{draft.generation_reason}</p><p>{draft.draft_date} / v{draft.revision} / {draft.status} / {draft.content_language==='en'?t('English content','영어 콘텐츠'):t('Korean content','한국어 콘텐츠')}</p><p>{t('Recommended window','추천 게시 시간')}: {draft.window_start_kst?.slice(0,5)}–{draft.window_end_kst?.slice(0,5)} KST</p>
    {draft.status==='needs_approval'&&<fieldset disabled={busy||!!running} className="regeneration-panel"><legend>{t('Custom generation','커스텀 생성')}</legend><div className="admin-two">
     <label><span>{t('Content basis','콘텐츠 기준')}</span><select value={basis} onChange={e=>setBasis(e.target.value)}><option value="prelaunch">{t('Pre-launch','오픈 전 홍보')}</option><option value="live_event">{t('Live event','정식 이벤트')}</option><option value="growth_carousel">Growth Carousel</option></select></label>
     <label><span>{t('Generation scope','생성 범위')}</span><select value={mode} onChange={e=>setMode(e.target.value)}><option value="both">{t('Copy + image','문구 + 이미지')}</option><option value="text">{t('Copy only','문구만')}</option><option value="image">{t('Image only','이미지만')}</option></select></label></div>
     <label><span>{t('Content language','콘텐츠 언어')}</span><select value={contentLanguage} onChange={e=>setContentLanguage(e.target.value as 'ko'|'en')} disabled={mode==='image'}><option value="ko">{t('Korean post','한국어 콘텐츠')}</option><option value="en">{t('English post','영어 콘텐츠')}</option></select></label>
     <p className="admin-help">{t('Automatic posts alternate Korean and English. Each post uses one main language only, while always positioning Roundy as an English-only 1:1 mingle in Seoul.','자동 콘텐츠는 한국어와 영어를 번갈아 생성합니다. 한 게시물은 한 언어를 중심으로 작성하며, Roundy가 서울에서 영어로 진행되는 1:1 밍글이라는 점은 자연스럽게 포함합니다.')}</p>
     {basis==='growth_carousel'?<label><span>{t('Topic','주제')}</span><select value={topic} onChange={e=>setTopic(e.target.value)}>{topics.map((x,i)=><option key={x} value={x}>{t(x.replaceAll('_',' '),topicKo[i])}</option>)}</select></label>:mode!=='text'&&<label><span>{t('Image method','이미지 방식')}</span><select value={visual} onChange={e=>setVisual(e.target.value)}><option value="cards">{t('Rendered cards — no image AI charge','카드 이미지 — 이미지 AI 비용 없음')}</option><option value="photo">{t('AI photo — paid, confirmation required','AI 사진 — 유료, 생성 전 확인')}</option></select></label>}
     <label><span>{t('Creative direction','커스텀 지시문')}</span><textarea value={direction} maxLength={500} rows={4} onChange={e=>setDirection(e.target.value)}/><small>{direction.length}/500</small></label>
     {basis==='growth_carousel'&&['book_insight','trend_research','meme_remix'].includes(topic)&&<p>{t('At most one web search. Unverified claims are rejected, not regenerated.','웹 검색은 최대 1회입니다. 출처 검증에 실패하면 재생성하지 않고 중지합니다.')}</p>}
     <div className="admin-form-actions"><button type="button" className="admin-primary" disabled={blocked&&(mode!=='image'||visual==='photo')} onClick={()=>void generate()}>{t('Generate custom content','커스텀 콘텐츠 생성')}</button><button type="button" className="admin-secondary" disabled={!draft.carousel_slides?.length} onClick={()=>void generate(false,true)}>{t('Render saved cards — no AI call','저장된 문구로 카드 복구 — AI 호출 없음')}</button></div>
    </fieldset>}
    <label><span>{t('Caption','캡션')}</span><textarea rows={10} value={draft.caption||''} maxLength={2000} disabled={busy||!!running||draft.status!=='needs_approval'} onChange={e=>changeDraft('caption',e.target.value)}/></label>
    <label><span>CTA</span><input value={draft.cta||''} maxLength={80} disabled={busy||!!running||draft.status!=='needs_approval'} onChange={e=>changeDraft('cta',e.target.value)}/></label>
    <label><span>{t('Destination','연결 주소')}</span><input value={draft.destination_url||''} disabled={busy||!!running||draft.status!=='needs_approval'} onChange={e=>changeDraft('destination_url',e.target.value)}/></label>
    {draft.research_status==='generated_without_sources'&&<p className="admin-error" role="alert">{t('Web Search completed, but OpenAI did not return source metadata. Fact-check this draft manually before publishing.','Web Search는 완료됐지만 OpenAI가 출처 메타데이터를 반환하지 않았습니다. 게시 전에 내용의 사실관계를 직접 확인하세요.')}</p>}
    {!!draft.research_sources?.length&&<div className="growth-sources">{draft.research_sources.map((s:Row)=><a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.publisher||s.title}</a>)}</div>}
    {draft.status==='needs_approval'&&<div className="admin-form-actions"><button type="button" className="admin-secondary" disabled={busy||!!running||!dirty} onClick={()=>void work(async()=>{await mutate('/draft/'+draft.id,{revision:draft.revision,caption:draft.caption,cta:draft.cta,destination_url:draft.destination_url},'PUT');await load(draft.id);})}>{t('Save edits','수정 저장')}</button><button type="button" className="admin-primary" disabled={busy||!!running||dirty||!draft.caption?.trim()||!draft.images?.length} onClick={()=>{if(window.confirm(t('Approve this exact revision and schedule it for Instagram?','현재 버전의 문구와 이미지를 승인하고 Instagram 게시를 예약할까요?')))void work(async()=>{await mutate('/draft/'+draft.id+'/approve',{revision:draft.revision});await load(draft.id);setNotice(t('Approved and scheduled.','승인 후 게시 예약했습니다.'));});}}>{t('Approve & schedule','승인 후 예약')}</button><button type="button" className="admin-secondary" disabled={busy||!!running||dirty||!draft.caption?.trim()||!draft.images?.length} onClick={()=>{if(window.confirm(t('Publish this exact saved revision to @roundy.meet NOW? This bypasses the recommended posting time and cannot be undone here.','현재 저장된 버전을 @roundy.meet에 지금 바로 게시할까요? 추천 게시 시간을 무시하며 여기서 게시를 되돌릴 수 없습니다.')))void work(async()=>{const result=await mutate('/draft/'+draft.id+'/publish-now',{revision:draft.revision});await load(draft.id);setNotice(result.published?t('Published to @roundy.meet.','@roundy.meet에 바로 게시했습니다.'):result.needs_review?t('Publish attempt needs review. Check Instagram before resolving it.','게시 결과 확인이 필요합니다. 처리 전에 Instagram에서 실제 게시 여부를 확인하세요.'):t('Queued for immediate publishing. Refresh status before trying again.','즉시 게시 큐에 넣었습니다. 다시 누르기 전에 상태를 새로고침하세요.'));});}}>{t('Publish now','바로 게시')}</button><button type="button" className="admin-secondary" disabled={busy||!!running} onClick={()=>void work(async()=>{await mutate('/draft/'+draft.id+'/skip',{});await load();})}>{t('Skip','건너뛰기')}</button></div>}
    <p className="admin-help">{t('Generation never publishes. Copy is saved before images, so an image failure does not lose it.','생성만으로는 게시되지 않습니다. 이미지를 만들기 전에 문구부터 저장하므로 이미지 생성이 실패해도 문구는 남습니다.')}</p>
   </div><aside className="marketing-preview"><strong>{t('Saved preview','저장된 미리보기')}</strong>{draft.images?.length?draft.images.map((url:string,i:number)=><img key={url} src={url} alt={'Roundy card '+(i+1)} style={{width:'100%',height:'auto',marginTop:12}}/>):<p>{t('No saved image. Generate cards or a photo.','저장된 이미지가 없습니다. 카드나 사진을 생성하세요.')}</p>}</aside></div>}
  </>}
  {channel==='instagram'&&activeTab==='generation'&&<section className="marketing-tab-panel">
   <div className="admin-section-title"><div><p className="admin-kicker">{t('Activity','활동')}</p><Heading level={2}>{t('Generation history','생성 기록')}</Heading></div><button type="button" className="admin-secondary" disabled={busy} onClick={()=>void work(()=>load(draft?.id))}>{t('Refresh','새로고침')}</button></div>
   <div className="marketing-filter-chips" role="group" aria-label={t('Generation status filter','생성 상태 필터')}>{([['all',t('All','전체')],['completed',t('Completed','완료')],['failed',t('Failed','실패')],['running',t('Running','진행 중')]] as const).map(([value,label])=><button type="button" key={value} aria-pressed={generationFilter===value} onClick={()=>{setGenerationFilter(value);setGenerationVisible(20);}}>{label}</button>)}</div>
   <div className="marketing-log-list">{visibleGenerationThreads.length?visibleGenerationThreads.map((thread:Row)=>{
    const latest=thread.latest as Row,root=thread.root as Row,attempts=thread.attempts as Row[];
    const sourceDraft=data.drafts.find((d:Row)=>d.id===latest.draft_id);
    const canRetry=thread.status==='failed'&&!latest.automatic&&!!latest.request_payload&&sourceDraft?.status==='needs_approval';
    const language=root.request_payload?.language==='en'?'EN':root.request_payload?.language==='ko'?'KO':'';
    return <details className={'marketing-log-row generation-thread '+thread.status} key={thread.id}>
     <summary><div className="marketing-log-main"><span className={'marketing-status-dot '+thread.status}/><div><strong>{contentLabel(root)}{language?' · '+language:''}</strong><small>{new Date(root.created_at).toLocaleString(locale,{timeZone:'Asia/Seoul'})} · {attempts.length} {t('attempts','회 시도')} · {root.operation}</small></div></div><div className="marketing-log-end"><span className={'marketing-status-pill '+thread.status}>{statusText(thread.status)}</span><small>{'$'+Number(thread.total_reserved_usd).toFixed(2)}</small></div></summary>
     <div className="marketing-log-detail generation-thread-detail">
      <div className="generation-attempts">{attempts.map((attempt:Row,index:number)=><div className={'generation-attempt '+attempt.status} key={attempt.id}>
       <span className={'marketing-status-dot '+attempt.status}/>
       <div className="generation-attempt-copy"><div><strong>{t('Attempt','시도')} {Number(attempt.attempt_number||index+1)}</strong><span className={'marketing-status-pill '+attempt.status}>{statusText(attempt.status)}</span></div><small>{new Date(attempt.created_at).toLocaleString(locale,{timeZone:'Asia/Seoul'})} · {'$'+Number(attempt.reserved_usd||0).toFixed(2)} · {Number(attempt.input_tokens||0).toLocaleString()} in / {Number(attempt.output_tokens||0).toLocaleString()} out</small>{attempt.error_message&&<p className="admin-error">{friendlyError(attempt.error_message)}</p>}</div>
      </div>)}</div>
      <dl><div><dt>{t('Thread ID','스레드 ID')}</dt><dd>{thread.id}</dd></div><div><dt>{t('Attempts','시도 횟수')}</dt><dd>{attempts.length}</dd></div><div><dt>{t('Total reserved','총 예약액')}</dt><dd>{'$'+Number(thread.total_reserved_usd).toFixed(2)}</dd></div></dl>
      {thread.status==='completed'&&<button type="button" className="admin-primary" onClick={e=>{e.preventDefault();openThreadResult(thread);}}>{t('View result','결과 보기')}</button>}
      {canRetry&&<button type="button" className="admin-secondary" disabled={busy||!!running} onClick={e=>{e.preventDefault();void retryJob(latest);}}>{t('Retry same settings','같은 설정으로 재시도')}</button>}
      {thread.status==='completed'&&<p className="marketing-thread-success">{t('This generation thread is complete. Earlier failed attempts are kept only for history.','이 생성 스레드는 완료됐습니다. 이전 실패 시도는 기록용으로만 보존됩니다.')}</p>}
     </div>
    </details>;
   }):<p className="admin-empty">{t('No generation threads match this filter.','해당 조건의 생성 스레드가 없습니다.')}</p>}</div>
   {filteredGenerationThreads.length>generationVisible&&<button type="button" className="marketing-load-more" onClick={()=>setGenerationVisible(v=>v+20)}>{t('Load 20 more','20개 더 보기')}</button>}
  </section>}
  {channel==='instagram'&&activeTab==='automation'&&<section className="marketing-tab-panel">   {settings&&<div className="marketing-settings-card"><div className="admin-section-title"><div><p className="admin-kicker">{t('Schedule','스케줄')}</p><Heading level={2}>{t('Automation settings','자동화 설정')}</Heading></div></div><form className="admin-form" onSubmit={e=>{e.preventDefault();void work(async()=>{await mutate('/settings',settings,'PUT');await load(draft?.id);setNotice(t('Automation saved.','자동화 설정을 저장했습니다.'));});}}>
    <label className="check-row"><input type="checkbox" checked={settings.daily_instagram_enabled} onChange={e=>setSettings({...settings,daily_instagram_enabled:e.target.checked})}/>{t('One automatic draft per day','매일 완성된 초안 1개 자동 생성')}</label><label>{t('Generation time KST','생성 시간 KST')}<input type="time" value={settings.draft_generation_time_kst.slice(0,5)} onChange={e=>setSettings({...settings,draft_generation_time_kst:e.target.value})}/></label><p className="admin-help">{t('Checked every 15 minutes after this time. One dispatch per date, even on failure.','이 시간 이후 15분 간격으로 확인합니다. 실패해도 해당 날짜에는 자동 호출을 반복하지 않습니다.')}</p>
    <label>{t('Daily basis','일일 콘텐츠 기준')}<select value={settings.content_mode} onChange={e=>setSettings({...settings,content_mode:e.target.value})}><option value="prelaunch">{t('Pre-launch','오픈 전 홍보')}</option><option value="live_event">{t('Live event','정식 이벤트')}</option></select></label>
    <label className="check-row"><input type="checkbox" checked={settings.growth_carousel_enabled} onChange={e=>setSettings({...settings,growth_carousel_enabled:e.target.checked})}/>Growth Carousel</label><div className="marketing-days">{['일','월','화','수','목','금','토'].map((day,i)=><label key={day}><input type="checkbox" checked={settings.growth_days.includes(i)} onChange={e=>{const days=e.target.checked?[...settings.growth_days,i]:settings.growth_days.filter((x:number)=>x!==i);setSettings({...settings,growth_days:days,growth_posts_per_week:days.length});}}/>{day}</label>)}</div>
    <label className="check-row"><input type="checkbox" checked={settings.optimization_enabled} onChange={e=>setSettings({...settings,optimization_enabled:e.target.checked})}/>{t('Optimize posting time','게시 시간 최적화')}</label><label>{t('Fallback posting time KST','기본 게시 시간 KST')}<input type="time" value={settings.daily_time_kst.slice(0,5)} onChange={e=>setSettings({...settings,daily_time_kst:e.target.value})}/></label><label className="check-row"><input type="checkbox" checked={settings.auto_reply_enabled} onChange={e=>setSettings({...settings,auto_reply_enabled:e.target.checked})}/>{t('Existing comments/DM auto-replies','기존 댓글 및 DM 자동 응답')}</label><button disabled={busy} className="admin-primary">{t('Save automation','자동화 저장')}</button>
   </form></div>}
  </section>}
  {channel==='instagram'&&activeTab==='connection'&&<section className="marketing-tab-panel">
   <div className="marketing-settings-card"><div className="admin-section-title"><div><p className="admin-kicker">Instagram</p><Heading level={2}>{t('Connection and webhook','연결 및 Webhook')}</Heading></div></div><p>{data.connection?.instagram?t('Publisher configured','게시 계정 설정됨'):t('Publisher needs setup','게시 계정 연결 확인 필요')}</p><p>{t('Comment/DM webhook verification','댓글 및 DM Webhook 인증')}: {data.webhook?.verified_at||t('Not verified','미인증')}</p>{!data.webhook?.verified_at&&<><label>Callback URL<input readOnly value={data.webhook?.callback_url||''}/></label><label>Verify token<input readOnly value={data.webhook?.verify_token||''}/></label></>}</div>
  </section>}
  {channel==='koreapas'&&<div className="admin-form"><Heading level={2}>{t('Koreapas templates','고파스 템플릿')}</Heading><select value={template.id||''} onChange={e=>setTemplate(structuredClone(data.templates.find((x:Row)=>x.id===e.target.value)||blank()))}><option value="">{t('New template','새 템플릿')}</option>{data.templates.filter((x:Row)=>x.channel==='koreapas').map((x:Row)=><option key={x.id} value={x.id}>{x.name}</option>)}</select>{[['name',t('Template name','템플릿 이름')],['title',t('Post title','제목')],['caption',t('Copy','본문')],['cta','CTA'],['destination_url',t('Destination URL','연결 주소')]].map(([key,label])=><label key={key}><span>{label}</span><textarea value={template[key]} onChange={e=>setTemplate({...template,[key]:e.target.value})}/></label>)}<label>{t('JPEG images','JPEG 이미지')}<input type="file" accept="image/jpeg" multiple disabled={busy} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';void work(async()=>{if(files.length+template.images.length>10)throw new Error('Maximum 10 images');const urls:string[]=[];for(const file of files){if(file.type!=='image/jpeg'||file.size>5*1024*1024)throw new Error('JPEG, max 5 MB');urls.push(await uploadFile(file,'wis-event-images'));}setTemplate({...template,images:[...template.images,...urls]});});}}/></label><OrderedImages images={template.images} onChange={images=>setTemplate({...template,images})} locale={locale} disabled={busy}/><div className="marketing-days">{['일','월','화','수','목','금','토'].map((day,i)=><label key={day}><input type="checkbox" checked={template.days.includes(i)} onChange={e=>setTemplate({...template,days:e.target.checked?[...template.days,i]:template.days.filter((x:number)=>x!==i)})}/>{day}</label>)}</div><input type="time" value={template.time_kst.slice(0,5)} onChange={e=>setTemplate({...template,time_kst:e.target.value})}/><label className="check-row"><input type="checkbox" checked={template.enabled} onChange={e=>setTemplate({...template,enabled:e.target.checked})}/>{t('Enable template schedule','템플릿 자동 게시 활성화')}</label><div className="admin-form-actions"><button type="button" className="admin-primary" disabled={busy} onClick={()=>void work(async()=>{const r=await mutate(template.id?'/'+template.id:'',template,template.id?'PUT':'POST');setTemplate(r.template);await load(draft?.id);})}>{t('Save','저장')}</button><button type="button" className="admin-secondary" disabled={busy||!template.id} onClick={()=>{if(window.confirm(t('Publish the SAVED Koreapas template now?','저장된 고파스 템플릿을 지금 게시할까요?')))void work(async()=>{await mutate('/publish',{template_id:template.id,request_key:crypto.randomUUID()});await load(draft?.id);});}}>{t('Publish saved template','저장된 템플릿 게시')}</button><button type="button" className="admin-secondary" disabled={busy||!template.id} onClick={()=>{if(window.confirm(t('Delete this template?','이 템플릿을 삭제할까요?')))void work(async()=>{await mutate('/'+template.id,{},'DELETE');setTemplate(blank());await load(draft?.id);});}}>{t('Delete','삭제')}</button></div></div>}
  {(channel==='koreapas'||activeTab==='publishing')&&<section className={channel==='instagram'?'marketing-tab-panel':''}>
   <div className="admin-section-title"><div><p className="admin-kicker">{t('Delivery','게시')}</p><Heading level={2}>{t('Publishing history','게시 기록')}</Heading></div></div>
   <div className="marketing-log-list">{visibleRuns.length?visibleRuns.map((r:Row)=>{
    const imageUrl=Array.isArray(r.snapshot?.images)?r.snapshot.images[0]:null;
    return <details className={'marketing-log-row publishing '+r.status} key={r.id}>
     <summary>{imageUrl?<img className="marketing-log-thumb" src={imageUrl} alt=""/>:<span className="marketing-log-thumb placeholder"/>}<div className="marketing-log-main"><span className={'marketing-status-dot '+r.status}/><div><strong>{new Date(r.created_at||r.scheduled_for).toLocaleString(locale,{timeZone:'Asia/Seoul'})}</strong><small>{contentLabel(r)} · {r.snapshot?.content_language==='en'?'EN':r.snapshot?.content_language==='ko'?'KO':channel}</small></div></div><div className="marketing-log-end"><span className={'marketing-status-pill '+r.status}>{statusText(r.status)}</span></div></summary>
     <div className="marketing-log-detail"><p>{r.message||t('No additional message.','추가 메시지가 없습니다.')}</p><dl><div><dt>{t('Run ID','게시 ID')}</dt><dd>{r.id}</dd></div>{r.external_id&&<div><dt>Instagram ID</dt><dd>{r.external_id}</dd></div>}</dl>{r.external_url&&<a className="admin-secondary" href={r.external_url} target="_blank" rel="noreferrer">{t('Open published post','게시물 보기')}</a>}{r.status==='needs_review'&&<div className="admin-form-actions">{[true,false].map(published=><button key={String(published)} type="button" className="admin-secondary" disabled={busy} onClick={()=>{if(window.confirm(t('Confirm you checked the external channel.','외부 채널에서 실제 게시 여부를 확인했나요?')))void work(async()=>{await mutate('/resolve',{run_id:r.id,published});await load(draft?.id);});}}>{published?t('Confirmed published','게시됨 확인'):t('Confirmed not published','게시 안 됨 확인')}</button>)}</div>}</div>
    </details>;
   }):<p className="admin-empty">{t('No publishing history yet.','아직 게시 기록이 없습니다.')}</p>}</div>
   {channelRuns.length>publishVisible&&<button type="button" className="marketing-load-more" onClick={()=>setPublishVisible(v=>v+20)}>{t('Load 20 more','20개 더 보기')}</button>}
  </section>}
  {resultPreview&&<div className="marketing-result-backdrop" role="presentation" onClick={()=>setResultPreview(null)}>
   <section className="marketing-result-modal" role="dialog" aria-modal="true" aria-labelledby="marketing-result-title" onClick={e=>e.stopPropagation()}>
    <div className="marketing-result-head"><div><p className="admin-kicker">{t('Saved generation result','저장된 생성 결과')}</p><Heading level={2} id="marketing-result-title">{contentLabel(resultPreview.thread.root||resultPreview.attempt)}</Heading></div><button type="button" className="admin-secondary" onClick={()=>setResultPreview(null)}>{t('Close','닫기')}</button></div>
    <p className="admin-help">{new Date(resultPreview.attempt.created_at).toLocaleString(locale,{timeZone:'Asia/Seoul'})} KST · {t('Attempt','시도')} {resultPreview.attempt.attempt_number}</p>
    {Array.isArray(resultPreview.snapshot.images)&&resultPreview.snapshot.images.length>0&&<div className="marketing-result-images">{resultPreview.snapshot.images.map((url:string,i:number)=><img src={url} alt={t('Generated card ','생성 카드 ')+(i+1)} key={url}/>)}</div>}
    <div className="marketing-result-copy"><strong>{t('Caption','캡션')}</strong><p>{resultPreview.snapshot.caption||''}</p></div>
    {!!resultPreview.snapshot.research_sources?.length&&<div className="growth-sources">{resultPreview.snapshot.research_sources.map((s:Row)=><a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.publisher||s.title||s.url}</a>)}</div>}
    <div className="admin-form-actions"><button type="button" className="admin-primary" disabled={busy} onClick={()=>void restoreResultToDraft()}>{t('Load this result into Draft','이 결과를 초안으로 불러오기')}</button><button type="button" className="admin-secondary" onClick={()=>setResultPreview(null)}>{t('Close','닫기')}</button></div>
   </section>
  </div>}
 </section>;
}
