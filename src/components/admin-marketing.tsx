'use client';
import { AdminMarketingContentLibrary } from './admin-marketing-content-library';

import { tr,type Locale } from '@/lib/locale';
import { EDITORIAL_SETTINGS_DEFAULTS } from '@/lib/marketing-editorial-settings';
import { canRetryGenerationJob } from '@/lib/marketing-generation-retry';
import { factPackReady,groupTrendsByUsage } from '@/lib/marketing-trend-guide';
import { EDITORIAL_STATE_LABELS,editorialState,type EditorialState } from '@/lib/marketing-workflow';
import { uploadFile } from '@/lib/uploads';
import { BarChart3,BookOpen,CalendarDays,Compass,FileText,Film,History,Images,LayoutDashboard,Link2,RefreshCw,Settings2 } from 'lucide-react';
import { useEffect,useRef,useState } from 'react';
import { AdminMarketingAssets } from './admin-marketing-assets';
import { AdminMarketingGrowth } from './admin-marketing-growth';
import { AdminMarketingOverview } from './admin-marketing-overview';
import { AdminMarketingQueue } from './admin-marketing-queue';
import { AdminMarketingReels } from './admin-marketing-reels';
import { AdminMarketingSettings } from './admin-marketing-settings';
import { AdminMarketingStories } from './admin-marketing-stories';
import './admin-marketing-workspace.css';
import { Heading } from './heading';
import { MarketingProductionMetrics,MarketingWorkflowNav } from './marketing-workflow-nav';
import { OrderedImages } from './ordered-images';
type Row=Record<string,any>;
type PendingMarketingImage={id:string;file:File;preview:string;asset_type:'photo'|'completed_card';width:number;height:number};
const BASE='/api/admin/marketing';
const topics=['mbti','dating_archetype','book_insight','trend_research','meme_remix','dating_myth','conversation_prompt','seoul_dating','seoul_trend','korea_life','mini_quiz'];
const editorialDirections:Record<string,string>={
 auto:'',
 seoul:'Lead with a relatable shared Seoul outing or first-date dilemma and verify every practical detail. Make the place or exhibition a natural conversation starter; do not invent dates or depict stock as event photography.',
 relationship:'Start with a recognisable dating or friendship friction, reveal one defensible insight, and close with a practical takeaway a friend would want to save.',
 social:'Show one useful social-intelligence micro-skill through an authentic scene and real dialogue. Empathy, humor, reciprocity, courtesy and tone are possible angles; avoid generic advice.',
 brand:'Explain the real face-to-face rotation dating experience and a useful social insight; only verified product details, no hard-sell.'
};
const topicKo=['MBTI 연애 유형','연애 유형','책 속 공감','최신 연구','밈 재해석','연애 통념','첫 대화 질문','서울 데이팅','서울 트렌드','한국 생활과 문화','미니 퀴즈'];
async function request(path='',body?:unknown,method='POST'){
 let response:Response;
 try{
  response=await fetch(BASE+path,body===undefined?{cache:'no-store',signal:AbortSignal.timeout(25000)}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(325000)});
 }catch(error){
  const timedOut=error instanceof Error&&['AbortError','TimeoutError'].includes(error.name);
  // A failed mutation can have an unknown outcome. Never imply a paid operation did not start.
  if(body!==undefined)throw new Error('MARKETING_ACTION_OUTCOME_UNKNOWN');
  throw new Error(timedOut?'MARKETING_REQUEST_TIMEOUT':'MARKETING_NETWORK_ERROR');
 }
 const data=await response.json().catch(()=>({error:'MARKETING_INVALID_SERVER_RESPONSE'}));
 return {ok:response.ok,data};
}
const blank=()=>({channel:'koreapas',name:'',title:'',caption:'',cta:'자세히 보기',destination_url:'https://roundy.team',images:[] as string[],days:[] as number[],time_kst:'10:00',enabled:false});
export function AdminMarketing({locale,initialTab='contents'}:{locale:Locale;initialTab?:'contents'|'draft'}){
 const t=(en:string,ko:string)=>tr(locale,en,ko);
 const [data,setData]=useState<Row>({drafts:[],runs:[],templates:[]});
 const [feedAttempts,setFeedAttempts]=useState<Record<string,Row>>({});
 const [draft,setDraft]=useState<Row|null>(null),[settings,setSettings]=useState<Row|null>(null),[generation,setGeneration]=useState<Row|null>(null);
 const [channel,setChannel]=useState<'instagram'|'koreapas'>('instagram'),[requestBusy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [captionDirty,setDirty]=useState(false);

 const [template,setTemplate]=useState<Row>(blank());

 // These selections stay local until the text draft exists. No background writes or paid requests.

 const [preflightState,setPreflightState]=useState<Row|null>(null);


 const [resultPreview,setResultPreview]=useState<Row|null>(null);
 const [regenerationSourceId,setRegenerationSourceId]=useState<string|null>(null);

 const [activeTab,setActiveTab]=useState<'contents'|'overview'|'draft'|'assets'|'queue'|'growth'|'reels'|'stories'|'generation'|'trend'|'publishing'|'automation'|'connection'>(initialTab==='draft'?'contents':initialTab);

 const [editorBusy,setEditorBusy]=useState(false);
 const [editorDirty,setEditorDirty]=useState(false);
 const busy=requestBusy||editorBusy,dirty=captionDirty||editorDirty;
 const [generationFilter,setGenerationFilter]=useState<'all'|'completed'|'failed'|'running'|'review'>('all');
 const [trendLanguage,setTrendLanguage]=useState<'ko'|'en'>('ko');
 const [trendUsageView,setTrendUsageView]=useState<'unused'|'used'>('unused');
 const [generationVisible,setGenerationVisible]=useState(20),[publishVisible,setPublishVisible]=useState(20);
 const inFlight=useRef(false),mounted=useRef(true);
 async function load(){
  const r=await request();if(!r.ok)throw new Error(r.data.error||'Could not load marketing');if(!mounted.current)return;
  setData(r.data);setSettings(r.data.settings);setGeneration(r.data.generation);
 }
 // Independent, read-only radar loading: a failure in the full marketing overview must not hide saved trends.
 async function loadTrend(){
  const r=await request('/trend-radar',undefined,'GET');
  if(!r.ok)throw new Error(r.data.error||'TREND_RADAR_LOAD_FAILED');
  if(mounted.current)setData(current=>({...current,trend:r.data}));
 }
 useEffect(()=>{
  if(channel!=='instagram'||activeTab!=='trend')return;
  let cancelled=false;
  loadTrend().then(()=>{if(!cancelled)setError('');}).catch(error=>{if(!cancelled)setError(friendlyError(error instanceof Error?error.message:'TREND_RADAR_LOAD_FAILED'));});
  return()=>{cancelled=true;};
 },[activeTab,channel]);
 useEffect(()=>{mounted.current=true;load().catch(e=>{if(mounted.current)setError(e.message);}).finally(()=>{if(mounted.current)setLoading(false);});return()=>{mounted.current=false;};},[]);
 // Bounded READ-ONLY polling: never calls a paid endpoint or starts generation.
 useEffect(()=>{
  if(!busy&&!(generation?.jobs||[]).some((job:Row)=>job.status==='running'&&Date.now()-Date.parse(job.created_at)<300000))return;let cancelled=false,attempts=0,failures=0,timer:ReturnType<typeof setTimeout>|undefined;
  async function poll(){if(cancelled||attempts++>=64||failures>=3)return;if(document.visibilityState==='visible')try{const r=await request('/generation');if(r.ok){if(!cancelled)setGeneration(r.data);failures=0;}else failures++;}catch{failures++;}if(!cancelled)timer=setTimeout(poll,5000);}
  timer=setTimeout(poll,2000);return()=>{cancelled=true;if(timer)clearTimeout(timer);};
 },[busy,(generation?.jobs||[]).filter((job:Row)=>job.status==='running').map((job:Row)=>job.id).join(',')]);
 function friendlyError(message:string){
  const map:Record<string,[string,string]>={
   DUPLICATE_GENERATION_BLOCKED:['A matching generation is already running, completed, or has an unknown outcome. Refresh status before trying again.','같은 생성 작업이 이미 진행 중이거나 완료됐거나 결과 확인이 필요한 상태입니다. 상태를 새로고침한 뒤 확인하세요.'],
   CAROUSEL_FINAL_ORDER_REQUIRES_REGENERATION:['The final Feed position requires a different 3/5-card count. Prepare the required length before approval.','최종 Feed 발행 순서에 필요한 카드 장수가 현재 콘텐츠와 다릅니다. 올바른 3장/5장 형식으로 다시 제작한 뒤 승인하세요.'],
   FEED_RETRY_REQUIRES_CONFIRMED_NO_POST:['Verify Instagram did not publish the post and record your findings before retrying.','재시도 전에 Instagram 미게시 여부를 확인하고 검수 근거를 기록하세요.'],
   CONFIRM_NOT_PUBLISHED_AND_REVIEW_NOTE_REQUIRED:['Verify the post is absent from Instagram and enter at least 12 characters explaining how you checked.','Instagram에서 미게시 상태를 확인하고 확인 방법을 12자 이상 기록하세요.'],
   FEED_RUN_NOT_RETRYABLE:['This run is not eligible for a retry. Check its status and attempt history.','이 게시물은 재시도 대상이 아닙니다. 상태 및 시도 이력을 확인하세요.'],
   GENERATION_COOLDOWN_30_SECONDS:['Please wait 30 seconds before starting another generation.','연속 생성 방지를 위해 30초 후 다시 시도하세요.'],
   PROMPT_SIZE_LIMIT:['The writing request exceeded the editorial prompt size limit, not the daily AI usage budget.','원고 작성에 필요한 입력 크기가 서버 제한을 초과했습니다. 일일 AI 사용량 초과는 아닙니다.'],
   GENERATION_BUDGET_REACHED:['Today’s marketing AI safety budget has been reached.','오늘 마케팅 AI 안전 한도에 도달했습니다.'],
   GENERATION_CALL_LIMIT:['Today’s generation call limit has been reached.','오늘 생성 횟수 안전 한도에 도달했습니다.'],
   TREND_RADAR_BUDGET_REACHED:['The Trend Radar safety budget has been reached.','Trend Radar 안전 예산 한도에 도달했습니다.'],
   TREND_SCAN_ALREADY_RUNNING:['A Trend Radar scan is already running.','Trend Radar 스캔이 이미 진행 중입니다.'],
   TREND_RADAR_PAUSED:['Trend Radar is paused.','Trend Radar가 일시 중지되어 있습니다.'],
   TREND_SCAN_MANUAL_COOLDOWN_10_MINUTES:['Please wait 10 minutes between paid manual scans.','유료 수동 검색은 10분 간격으로만 실행할 수 있습니다.'],
   TREND_RADAR_INCOMPLETE_RESPONSE:['The search returned an incomplete AI response. No automatic retry was made.','AI 응답이 끝까지 완성되지 않아 검색을 중단했습니다. 자동으로 재시도하지 않았습니다.'],
   TREND_RADAR_INVALID_JSON:['The research result was not valid JSON. No automatic retry was made.','검색 결과의 데이터 형식을 해석할 수 없어 중단했습니다. 자동 재시도는 하지 않았습니다.'],
   TREND_RADAR_NO_RESEARCH_EVIDENCE:['The web search returned too little verifiable evidence. No retry was made.','웹 검색에서 확인 가능한 출처를 충분히 확보하지 못했습니다. 자동 재시도는 하지 않았습니다.'],
   TREND_RADAR_NO_VERIFIED_CANDIDATES:['No candidate passed the source and signal checks. The scan was recorded as failed, not completed.','출처와 트렌드 신호를 모두 충족한 후보가 없어 실패로 기록했습니다. 검색을 반복하지는 않습니다.'],
   TREND_RADAR_SEARCH_NOT_COMPLETED:['The web search did not complete. No retry was made.','웹 검색이 정상적으로 완료되지 않았습니다. 자동 재시도는 하지 않았습니다.'],
   TREND_RADAR_OUTCOME_UNKNOWN:['The search outcome is unknown. Check the scan history before starting another paid scan.','검색 결과를 확인할 수 없습니다. 유료 검색을 다시 누르기 전에 실행 기록을 확인하세요.'],
   MARKETING_REQUEST_TIMEOUT:['The request timed out. Try a read-only refresh; no paid scan was started.','마케팅 데이터 조회 시간이 초과됐습니다. 새로고침으로 상태를 확인하세요. 유료 검색은 시작하지 않았습니다.'],
   MARKETING_NETWORK_ERROR:['Could not connect to the marketing server. Check the connection and refresh status.','마케팅 서버와 연결하지 못했습니다. 연결 상태 확인 후 새로고침하세요.'],
   MARKETING_ACTION_OUTCOME_UNKNOWN:['The operation may have started. Check the saved history before retrying; no automatic retry was made.','요청이 서버에서 시작됐을 수 있습니다. 새 유료 요청 전에 저장된 기록을 확인하세요. 자동 재시도는 하지 않았습니다.'],
   MARKETING_INVALID_SERVER_RESPONSE:['The server did not return usable data. Please refresh status.','서버가 정상 데이터를 반환하지 못했습니다. 새로고침으로 상태를 확인하세요.'],
   TREND_RADAR_LOAD_FAILED:['Could not load saved Seoul trends. Please retry a read-only refresh.','저장된 서울 트렌드를 불러오지 못했습니다. 새로고침으로 다시 조회하세요.'],
   TREND_FACT_PACK_NOT_READY:['This trend needs three source-linked facts or its event information has expired. No paid generation was started.','출처가 있는 상세 사실이 3개 이상 필요하거나 행사 정보가 만료되었습니다. 유료 콘텐츠 생성은 시작하지 않았습니다.'],
   TREND_FACT_PACK_MISSING:['The source-linked Fact Pack is missing.','출처 기반 팩트팩이 없습니다.'],
   TREND_FACT_PACK_EXPIRED:['The event dates have passed. Update facts before generating.','행사 일정이 지났습니다. 콘텐츠 생성 전에 정보를 갱신하세요.'],
   TREND_FACT_PACK_INSUFFICIENT:['Not enough verified details for a useful guide.','실용적인 안내를 만들 만큼 검증된 정보가 부족합니다.'],
   GENERATION_ALREADY_RUNNING:['Another generation is still running. Wait for it to finish or refresh status.','다른 생성 작업이 진행 중입니다. 완료될 때까지 기다리거나 상태를 새로고침하세요.'],
   DRAFT_CHANGED_REFRESH_FIRST:['This draft changed. Refresh status before trying again.','초안이 변경됐습니다. 상태를 새로고침한 뒤 다시 시도하세요.'],
   DRAFT_NOT_EDITABLE:['This draft is no longer editable. Refresh status.','이 초안은 더 이상 수정할 수 없습니다. 상태를 새로고침하세요.'],
   MARKETING_PREFLIGHT_FAILED:['Publishing blocked: review the seven checks below and run the free recheck after making corrections.','발행 전 자동 검증에 실패했습니다. 아래 7개 항목의 오류를 수정한 뒤 무료 재검사를 실행하세요.'],
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
   RESULT_SNAPSHOT_UNAVAILABLE:['This older completed generation predates result snapshots, so its exact content is no longer available.','이 완료 작업은 결과 보존 기능 도입 이전에 생성되어 정확한 결과를 다시 불러올 수 없습니다.'],
   IMPORT_CONFIRMATION_REQUIRED:['Confirm before adding this generated result to Drafts.','생성 결과를 초안으로 가져오기 전에 확인하세요.'],
   SAVED_RESULT_RECOVERY_UNAVAILABLE:['This saved result cannot be recovered automatically. No paid retry was started.','이 저장 결과는 자동 복구할 수 없습니다. 유료 재시도는 시작하지 않았습니다.'],
   SAVED_RESULT_RECOVERY_MISMATCH:['The saved result does not match this thread. Refresh before retrying.','저장 결과와 스레드가 일치하지 않습니다. 새로고침 후 확인하세요.'],
   RESULT_ALREADY_USED:['This generated result has already moved beyond the editable Drafts inbox.','이 생성 결과는 이미 초안으로 사용되어 편집 가능한 초안 목록을 벗어났습니다.'],
   INVALID_QUALITY_REPORT:['The generated content passed copy checks, but the saved quality-report schema was out of date. The schema has been aligned; no paid copy retry is required.','생성 문구는 품질 검사를 통과했지만 저장 품질 리포트의 버전이 맞지 않았습니다. 스키마를 통일했으며 유료 문구 재생성은 필요하지 않습니다.']
  };
  return map[message]?t(...map[message]):message;
 }

 function failureGuide(attempt:Row){
  const message=String(attempt.error_message||'');
  const code=String(attempt.error_code||'');
  if(message==='INVALID_QUALITY_REPORT')return {title:t('Quality schema issue','품질 시스템 버전 오류'),cause:t('The generated copy passed its editorial checks, but the app and database used different quality-report versions.','생성 문구는 편집 품질 검사를 통과했지만 앱과 데이터베이스의 품질 리포트 버전이 달랐습니다.'),action:t('The schema is aligned now. Recover the saved result instead of paying for another copy generation.','스키마를 통일했습니다. 문구를 다시 유료 생성하지 말고 저장된 결과를 복구하면 됩니다.')};
  if(attempt.request_payload?.topic_type==='seoul_trend'&&/실제 인용된 연구 출처|RESEARCH.*SOURCE|citation|source/i.test(message+' '+code))
   return {title:t('Seoul Trend research could not be verified','서울 트렌드 출처 검증 실패'),
    cause:t('The research did not return valid citations. This attempt stopped without creating a post.','실제 인용된 출처를 확보하지 못해 콘텐츠를 생성하지 않았습니다.'),
    action:t('This failed attempt will NOT restart automatically. New generations or an explicitly confirmed paid retry can fall back to an evergreen Korea-life carousel instead of inventing a current trend.','이 실패 작업은 자동 재실행하지 않습니다. 새로 생성하거나 유료 재시도를 명시적으로 승인하면, 출처가 없을 때 최신 유행을 지어내지 않고 서울 생활 콘텐츠로 전환합니다.')};
  if(/출처|research|source|책 제목|저자/i.test(message+' '+code))return {title:t('Research issue','자료 조사 실패'),cause:t('A reliable source could not be verified.','검증 가능한 출처를 확보하지 못했습니다.'),action:t('Some research topics can use a source-free fallback during a new generation. A failed run never restarts automatically; review costs before retrying.','새 콘텐츠 생성 시 일부 연구형 주제는 안전한 비연구 콘텐츠로 전환할 수 있습니다. 이미 실패한 작업은 자동으로 재실행하지 않으며 재시도 전 비용을 확인하세요.')};
  if(/EDITORIAL_INDEPENDENT_REVIEW_REJECTED|EDITORIAL_CRITIC_REVIEW_LIMIT|EDITORIAL_TOPIC_REJECTED/.test(message+' '+code))return {
   title:t('Independent editorial review failed','독립 편집 검수 탈락'),
   cause:t('The independent editor found an unconvincing story or disconnected carousel cards, even after the bounded revision. No photos were purchased or post published.','독립 평가에서 카드 간 흐름이나 실제 독자 가치가 부족하다고 판단했습니다. 제한된 재작성 후에도 통과하지 못했으며 사진 생성과 게시로 진행하지 않았습니다.'),
   action:t('Expand the editorial feedback below. A new attempt with the corrected workflow requires explicitly choosing Retry; it is not automatic and may incur AI charges.','아래 검수 의견을 열어 확인하세요. 개선된 생성 방식으로 다시 시도하려면 재시도를 직접 선택해야 하며 AI 비용이 발생할 수 있습니다.')
  };
  if(/PROMPT_SIZE_LIMIT/.test(message+' '+code))return {
   title:t('Editorial input too large','원고 입력 크기 초과'),
   cause:t('The combined editorial instructions, source context and output schema exceeded the server request-size guard. This is not a daily AI spend or call-limit error.','원고 지시문, 출처 자료와 출력 형식 정의가 서버 내부 크기 제한을 넘었습니다. 일일 AI 비용 또는 생성 횟수 초과가 아닙니다.'),
   action:t('The writing request now trims optional context before applying its bounded size guard. Existing failures never restart automatically; retry deliberately after reviewing possible API charges.','선택적 참고 자료를 줄이는 사전 검사가 적용됩니다. 기존 실패 작업은 자동으로 재시도하지 않습니다. 추가 AI 비용을 확인한 뒤 직접 재시도하세요.')
  };
  if(/품질|quality|중복|카드|캡션|문구/i.test(message+' '+code))return {title:t('Copy quality issue','문구 품질 실패'),cause:t('The draft did not pass editorial rules.','문구가 편집 품질 기준을 통과하지 못했습니다.'),action:t('Edit the saved copy in the content library; there is no automatic paid rewrite.','콘텐츠 라이브러리에서 저장된 원고를 수정하세요. 자동 유료 재작성은 없습니다.')};
  if(/image|photo|render|CARD_RENDER/i.test(message+' '+code))return {title:t('Image issue','이미지 생성 실패'),cause:t('The image generation or card rendering step stopped.','사진 생성 또는 카드 렌더링 단계에서 중지됐습니다.'),action:t('Saved copy is preserved so image work can be retried separately.','문구는 보존되므로 이미지만 별도로 다시 만들 수 있습니다.')};
  if(/BUDGET|LIMIT|COOLDOWN|PAUSED/i.test(message+' '+code))return {title:t('Usage limit','사용량/비용 제한'),cause:t('A marketing AI safety limit blocked the request.','마케팅 AI 안전 한도 때문에 요청이 중지됐습니다.'),action:t('Check the budget/limit panel before retrying.','재시도 전에 상단의 비용 및 사용량 상태를 확인하세요.')};
  return {title:t('System/API issue','시스템/API 오류'),cause:t('The provider or application could not complete this step safely.','외부 API 또는 시스템 단계가 안전하게 완료되지 않았습니다.'),action:t('Unknown external outcomes are never retried automatically.','외부 처리 결과가 불명확한 경우 자동 재시도하지 않습니다.')};
 }
 async function work(fn:()=>Promise<void>){if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError(friendlyError(e instanceof Error?e.message:'Request failed'));}finally{inFlight.current=false;if(mounted.current)setBusy(false);}}
 async function mutate(path:string,body:Row,method='POST'){
  const r=await request(path,body,method);

  if(r.data.checks&&r.data.draft)setPreflightState({draft_id:r.data.draft.id,
   revision:r.data.draft.revision,preflight:{status:'rejected',checks:r.data.checks,issues:r.data.issues||[]},
   quality_report:r.data.quality_report});
  if(!r.ok||r.data.error)throw new Error(r.data.error||'Request failed');
  return r.data;
 }
 function openThreadResult(thread:Row){
  const attempts=[...(thread.attempts||[])].reverse();
  const attempt=attempts.find((a:Row)=>a.result_snapshot);
  if(!attempt){setError(friendlyError('RESULT_SNAPSHOT_UNAVAILABLE'));return;}
  setResultPreview({thread,attempt,snapshot:attempt.result_snapshot});
 }

 const allGenerationJobs=((generation?.jobs||[]) as Row[]);
 const threadMap=new Map<string,Row[]>();
 for(const job of [...allGenerationJobs].reverse()){
  const threadId=String(job.content_workflow_id||job.generation_thread_id||job.id);
  const attempts=threadMap.get(threadId)||[];attempts.push(job);threadMap.set(threadId,attempts);
 }
 const generationThreads=[...threadMap.entries()].map(([id,attempts])=>{
  attempts.sort((a:Row,b:Row)=>Date.parse(a.created_at)-Date.parse(b.created_at)||Number(a.attempt_number||0)-Number(b.attempt_number||0));
  const latest=attempts[attempts.length-1],root=attempts[0];
  const state=editorialState(latest);
  const status=state==='running'?'running':state==='system_error'?'failed':['ready','published','scheduled'].includes(state)?'completed':'review';
  const retryCount=attempts.filter((a:Row)=>Boolean(a.retry_of_job_id)).length,stepCount=Math.max(1,attempts.length-retryCount);
  return {id,attempts,latest,root,status,workflow_state:state,retryCount,stepCount,total_reserved_usd:attempts.reduce((sum:number,a:Row)=>sum+Number(a.reserved_usd||0),0),created_at:root.created_at,updated_at:latest.updated_at||latest.created_at};
 }).sort((a:Row,b:Row)=>Date.parse(b.updated_at)-Date.parse(a.updated_at));
 const filteredGenerationThreads=generationThreads.filter((thread:Row)=>generationFilter==='all'||thread.status===generationFilter);
 const visibleGenerationThreads=filteredGenerationThreads.slice(0,generationVisible);
 const trendGroups=groupTrendsByUsage((data.trend?.trends||[]) as Row[]);
 const visibleTrendRows=trendUsageView==='used'?trendGroups.used:trendGroups.unused;
 const channelRuns=((data.runs||[]) as Row[]).filter((r:Row)=>r.channel===channel);
 const contentRecords=((data.content_records||[]) as Row[]);
 const visibleRuns=channelRuns.slice(0,publishVisible);
 const tabItems=[['contents',t('Content library','콘텐츠 라이브러리'),BookOpen],
  ['overview',t('Overview','개요'),LayoutDashboard],
  ['draft',t('Content studio','콘텐츠 작업'),FileText],
  ['assets',t('Photo library','사진 자산'),Images],
  ['queue',t('Publishing schedule','발행 일정'),CalendarDays],
  ['stories',t('Stories','스토리'),BookOpen],
  ['generation',t('Generation history','생성 기록'),History],
  ['reels',t('Reel Studio','릴스 스튜디오'),Film],
  ['growth',t('Growth insights','성장 분석'),BarChart3],
  ['trend',t('Seoul Trend','서울 트렌드'),Compass],
  ['publishing',t('Feed history','Feed 발행 기록'),CalendarDays],
  ['automation',t('Marketing settings','마케팅 설정'),Settings2],
  ['connection',t('Connections','연결'),Link2]
 ] as const;

 const workflowText=(row:Row)=>t(...EDITORIAL_STATE_LABELS[editorialState(row)]);
 function statusText(status:string){const labels:Record<string,[string,string]>={completed:['Completed','완료'],failed:['Failed','실패'],running:['Running','진행 중'],uncertain:['Needs review','확인 필요'],sent:['Published','게시됨'],queued:['Scheduled','예약됨'],sending:['Publishing','게시 중'],needs_review:['Needs review','확인 필요'],scheduled:['Scheduled','예약됨']};return labels[status]?t(...labels[status]):status;}
 function operationLabel(row:Row){const labels:Record<string,[string,string]>={copy:['Copy creation','문구 생성'],research:['Research + copy','주제 조사 + 문구 생성'],render:['Card rendering','이미지 카드 렌더'],photo:['Visual generation','이미지 생성 + 렌더'],copy_photo:['Copy + visuals','문구 + 이미지 생성']};return labels[row.operation]?t(...labels[row.operation]):t('Generation step','생성 단계');}
 function contentLabel(row:Row){const request=row.request_payload||{},snapshot=row.result_snapshot||row.snapshot||row||{},growth=request.content_mode==='growth_carousel'||snapshot.draft_kind==='growth_carousel'||row.draft_kind==='growth_carousel',kind=growth?(request.topic_type||snapshot.growth_topic_type||row.growth_topic_type||'growth_carousel'):(request.content_mode||snapshot.content_mode||row.content_mode||snapshot.draft_kind||row.draft_kind||row.operation||'content');const ko:Record<string,string>={prelaunch:'오픈 전 홍보',live_event:'이벤트 모집',book_insight:'책 속 공감',trend_research:'연구로 보는 관계',mbti:'MBTI와 대화',dating_archetype:'대화 스타일',meme_remix:'공감 상황극',dating_myth:'연애 통념 점검',conversation_prompt:'첫 대화 질문',seoul_dating:'서울에서 만나기',seoul_trend:'서울 트렌드',korea_life:'한국 생활',mini_quiz:'대화 미니 퀴즈',growth_carousel:'Growth Carousel',brand:'브랜드 콘텐츠',copy:'일반 콘텐츠',research:'검색 콘텐츠'};return locale==='ko'?(ko[kind]||String(kind).replaceAll('_',' ')):String(kind).replaceAll('_',' ');}
 function compactContentTitle(value:unknown){const clean=typeof value==='string'?value.replace(/\s+/g,' ').replace(/^[#\-–—"'“”‘’\s]+|["'“”‘’\s]+$/g,'').trim():'';return clean.length>64?clean.slice(0,61).trimEnd()+'…':clean;}
 function contentTitle(row:Row){for(const source of [row,row?.result_snapshot,row?.snapshot].filter(Boolean) as Row[]){const doc=source.content_document||{},slides=[...(Array.isArray(doc.slides)?doc.slides:[]),...(Array.isArray(source.carousel_slides)?source.carousel_slides:[])];const slideTitle=slides.map((s:Row)=>compactContentTitle(s?.title)).find(Boolean);if(slideTitle)return slideTitle;const bookTitle=compactContentTitle(doc?.book?.title);if(bookTitle)return bookTitle;const caption=typeof source.caption==='string'?source.caption.split(/\n+/).map((line:string)=>compactContentTitle(line)).find((line:string)=>line&&!line.startsWith('#')):'';if(caption)return caption;}return contentLabel(row);}
 function contentRecordForRun(run:Row){const draftId=String(run?.snapshot?.draft_id||'');return draftId?contentRecords.find((record:Row)=>String(record.id)===draftId)||null:null;}
 function contentRecordForAttempts(attempts:Row[]){const ids=new Set(attempts.map((attempt:Row)=>String(attempt.id)));return contentRecords.find((record:Row)=>ids.has(String(record.source_generation_job_id||'')))||null;}
 function runForContent(record:Row|null){if(!record)return null;const runId=String(record.marketing_run_id||''),draftId=String(record.id||'');return (runId?channelRuns.find((run:Row)=>String(run.id)===runId):null)||channelRuns.find((run:Row)=>String(run.snapshot?.draft_id||'')===draftId)||null;}
 function publicationInfo(record:Row|null,runOverride:Row|null=null){const run=runOverride||runForContent(record),runStatus=String(run?.status||''),draftStatus=String(record?.status||'');if(runStatus==='sent'||draftStatus==='published'||draftStatus==='sent')return {status:'sent',label:t('Published','게시됨')};if(runStatus==='sending')return {status:'sending',label:t('Publishing','게시 중')};if(['queued','scheduled'].includes(runStatus)||draftStatus==='scheduled')return {status:'scheduled',label:t('Scheduled','예약됨')};if(runStatus==='failed'||draftStatus==='failed')return {status:'failed',label:t('Publish failed','게시 실패')};if(runStatus==='needs_review')return {status:'needs_review',label:t('Publish needs review','게시 확인 필요')};if(draftStatus==='needs_approval')return {status:'needs_review',label:t('Awaiting approval','승인 대기')};return {status:'unpublished',label:t('Not published','미게시')};}

 const instagramStatus=String(data.connection?.instagram_status||
  (data.connection?.unavailable?'verification_unavailable':data.connection?.instagram?'configured_unverified':'not_configured'));
 const instagramNeedsReconnect=['token_invalid','account_mismatch','not_configured'].includes(instagramStatus);
 const instagramStatusLabel=instagramStatus==='valid'?t('Account authentication verified','계정 인증 정상'):
  instagramStatus==='token_invalid'?t('Instagram token invalid or expired (API 190)','Instagram 토큰 만료 또는 무효 (API 190)'):
  instagramStatus==='account_mismatch'?t('Wrong Instagram account or user ID','Instagram 계정 또는 사용자 ID 불일치'):
  instagramStatus==='not_configured'?t('Instagram credentials are missing','Instagram 인증 정보 미설정'):
  instagramStatus==='verification_unavailable'||instagramStatus==='verification_failed'?
   t('Unable to verify Instagram right now','현재 Instagram 연결을 확인할 수 없음'):
   t('Credentials configured but not verified','인증 정보가 설정됐지만 검증되지 않음');
 const publishingBlockers:string[]=[];
 if(instagramNeedsReconnect)publishingBlockers.push(t('Reconnect Instagram before publishing.','Instagram 인증 복구 필요'));
 if(dirty)publishingBlockers.push(t('Save your edits first.','변경한 문구를 먼저 저장하세요'));
 if(draft?.content_document?.thumbnail_render_pending===true)publishingBlockers.push(t('Render the selected cover headline again.','선택한 표지 문구로 이미지를 다시 렌더링하세요'));
 if(draft&&!draft.images?.length)publishingBlockers.push(t('Render approved images first.','사진 승인 후 이미지를 렌더링하세요'));


 if(loading&&activeTab!=='contents')return <p role="status">{t('Loading marketing workspace…','마케팅 정보를 불러오는 중입니다…')}</p>;
 return <section className="admin-panel marketing-panel marketing-workspace">
  <header className="marketing-workspace-header">
   <div className="marketing-workspace-header-title">
    <span className="marketing-workspace-eyebrow">ROUNDY / MARKETING</span>
    <Heading level={1}>{t('Marketing workspace','마케팅 관리')}</Heading>
    <p>{t('Create, review and schedule Feed and Story content in one organized workspace.',
     '콘텐츠 생성부터 검수와 승인, Feed 및 Story 예약 발행까지 한곳에서 관리합니다.')}</p>
   </div>
   <div className="marketing-workspace-header-actions">
    <div className="marketing-workspace-channel" role="group" aria-label={t('Marketing channel','마케팅 채널')}>
     {(['instagram','koreapas'] as const).map(c=><button type="button" key={c}
      aria-pressed={channel===c} disabled={busy} onClick={()=>setChannel(c)}>
      {c==='instagram'?'Instagram':'Koreapas'}</button>)}
    </div>
    <button type="button" className="admin-secondary marketing-workspace-refresh"
     disabled={busy} onClick={()=>void work(()=>channel==='instagram'&&activeTab==='trend'?loadTrend():load())}>
     <RefreshCw size={16}/>{t('Refresh','새로고침')}</button>
   </div>
  </header>
  {error&&<p className="admin-error" role="alert">{error}</p>}
  {notice&&<p role="status" className="marketing-workspace-feedback">{notice}</p>}
  {channel==='instagram'&&instagramNeedsReconnect&&<div className="marketing-setup marketing-auth-warning" role="alert">
   <strong>{instagramStatusLabel}</strong>
   <p>{t('Instagram posting is blocked. Refresh the @roundy.meet access token in Roundy Supabase Edge Function secrets, then verify again. Already approved posts stay in the queue.',
    'Instagram 게시가 차단됐습니다. Roundy Supabase Edge Functions의 인증 토큰을 갱신한 뒤 연결을 다시 확인하세요. 기존 승인 및 예약 게시물은 그대로 유지됩니다.')}</p>
   <button type="button" className="admin-secondary" onClick={()=>setActiveTab('connection')}>{t('View connection settings','연결 관리에서 확인')}</button>
  </div>}
  {(error||notice)&&<div className={'marketing-workspace-toast'+(error?' is-error':'')} data-testid="marketing-action-feedback">
   <span>{error.startsWith('품질 검토 필요:')?t('Editorial review is required. Open the saved copy, fix repeated headlines and edit the story before completing card images.','원고 품질 검토가 필요합니다. 저장된 원고에서 중복 제목과 카드 내용을 수정한 뒤 이미지를 완성하세요.'):error||notice}</span>
   <button type="button" aria-label={t('Dismiss message','메시지 닫기')} onClick={()=>{setError('');setNotice('');}}>×</button>
  </div>}
  {channel==='instagram'&&<MarketingWorkflowNav locale={locale} activeTab={activeTab} items={tabItems} onNavigate={tab=>setActiveTab(tab==='draft'?'contents':tab)}/>}
  {channel==='instagram'&&activeTab==='overview'&&
   <><MarketingProductionMetrics metrics={generation?.workflow_metrics||null} locale={locale}/><AdminMarketingOverview locale={locale} drafts={data.drafts||[]} runs={data.runs||[]} settings={settings}
    onNavigate={tab=>setActiveTab(tab==='draft'?'contents':tab)}/></>}
  {channel==='instagram'&&activeTab==='assets'&&
   <AdminMarketingAssets locale={locale} onOpenDraft={()=>setActiveTab('contents')}/>}
  {channel==='instagram'&&activeTab==='queue'&&
   <AdminMarketingQueue locale={locale} runs={data.runs||[]} onNavigate={tab=>setActiveTab(tab)}/>}
  {channel==='instagram'&&activeTab==='growth'&&<AdminMarketingGrowth locale={locale}/>}
  {channel==='instagram'&&activeTab==='reels'&&<AdminMarketingReels locale={locale}/>}
  {channel==='instagram'&&activeTab==='stories'&&<AdminMarketingStories locale={locale}/>}
  {channel==='instagram'&&activeTab==='contents'&&<AdminMarketingContentLibrary locale={locale} events={data.live_events||[]} savedDrafts={data.drafts||[]}/>}

  {channel==='instagram'&&activeTab==='generation'&&<section className="marketing-tab-panel">
   <div className="admin-section-title"><div><p className="admin-kicker">{t('Activity','활동')}</p><Heading level={2}>{t('Generation history','생성 기록')}</Heading></div><button type="button" className="admin-secondary" disabled={busy} onClick={()=>void work(()=>load())}>{t('Refresh','새로고침')}</button></div>
   <div className="marketing-filter-chips" role="group" aria-label={t('Generation status filter','생성 상태 필터')}>{([['all',t('All','전체')],['completed',t('Ready','최종 검토 가능')],['review',t('Next step','보완 및 다음 작업')],['failed',t('System issues','시스템 오류')],['running',t('Running','진행 중')]] as const).map(([value,label])=><button type="button" key={value} aria-pressed={generationFilter===value} onClick={()=>{setGenerationFilter(value);setGenerationVisible(20);}}>{label}</button>)}</div>
   <div className="marketing-log-list">{visibleGenerationThreads.length?visibleGenerationThreads.map((thread:Row)=>{
    const latest=thread.latest as Row,root=thread.root as Row,attempts=thread.attempts as Row[],record=contentRecordForAttempts(attempts);
    const canRetry=canRetryGenerationJob(latest),publication=publicationInfo(record);
    const language=(record?.content_language||root.request_payload?.language)==='en'?'EN':(record?.content_language||root.request_payload?.language)==='ko'?'KO':'';
    const titledAttempt=[...attempts].reverse().find((attempt:Row)=>attempt.result_snapshot)||latest;
    const topicPlan=[...attempts].reverse().map((attempt:Row)=>attempt.request_payload?.topic_selection||attempt.result_snapshot?.topic_selection||attempt.result_snapshot?.content_document?.editorial_topic_selection).find(Boolean) as Row|undefined;
    return <details className={'marketing-log-row generation-thread '+thread.status} key={thread.id}>
     <summary><div className="marketing-log-main"><span className={'marketing-status-dot '+thread.status}/><div><strong>{contentTitle(record||titledAttempt)}</strong><small>{contentLabel(record||root)}{language?' · '+language:''} · {new Date(root.created_at).toLocaleString(locale,{timeZone:'Asia/Seoul'})} · {thread.stepCount} {t('steps','단계')}{thread.retryCount>0&&<> · {t('Retries','재시도')} {thread.retryCount}</>}</small></div></div><div className="marketing-log-end"><span className={'marketing-status-pill '+publication.status}>{publication.label}</span><span className={'marketing-status-pill '+thread.status}>{t(...EDITORIAL_STATE_LABELS[thread.workflow_state as EditorialState])}</span><small>{'$'+Number(thread.total_reserved_usd).toFixed(2)}</small></div></summary>
     <div className="marketing-log-detail generation-thread-detail">
      <div className="generation-attempts">{attempts.map((attempt:Row,index:number)=><div className={'generation-attempt '+attempt.status} key={attempt.id}>
       <span className={'marketing-status-dot '+attempt.status}/>
       <div className="generation-attempt-copy"><div><strong>{operationLabel(attempt)}{attempt.retry_of_job_id&&<> · {t('Retry','재시도')} {Number(attempt.attempt_number||index+1)}</>}</strong><span className={'marketing-status-pill '+attempt.status}>{workflowText(attempt)}</span></div><small>{new Date(attempt.created_at).toLocaleString(locale,{timeZone:'Asia/Seoul'})} · {'$'+Number(attempt.reserved_usd||0).toFixed(2)} · {Number(attempt.input_tokens||0).toLocaleString()} in / {Number(attempt.output_tokens||0).toLocaleString()} out</small>{attempt.error_message&&(()=>{const guide=failureGuide(attempt);return <div className="admin-error"><strong>{guide.title}</strong><p>{guide.cause}</p><p>{guide.action}</p>{String(attempt.error_message).length>250
         ?<details className="marketing-editorial-error-detail"><summary>{t('Show detailed editor feedback','검수 의견 자세히 보기')}</summary>
           <small style={{overflowWrap:'anywhere',whiteSpace:'pre-wrap'}}>{friendlyError(attempt.error_message)}</small>
          </details>
         :<small>{friendlyError(attempt.error_message)}</small>}</div>;})()}</div>
      </div>)}</div>
      {topicPlan&&<details className="marketing-topic-review"><summary>{t('AI topic planning','AI 주제 기획')} · {Number(topicPlan.candidates?.length||0)} {t('candidates','개 후보')} · {topicPlan.selected?t('Selected','선정됨'):t('All discarded','전체 폐기')}</summary>
       <p>{t('Based on the last 60 days of saved and published Roundy drafts. Editorial scores are internal screening, not predicted reach.','최근 60일 초안 및 생성 기록을 비교합니다. 편집 점수는 내부 검수 기준이며 조회수 예측값이 아닙니다.')}</p>
       <ol>{(Array.isArray(topicPlan.candidates)?topicPlan.candidates:[]).map((candidate:Row,index:number)=><li key={candidate.angle_key||index}>
        <strong>{candidate.headline}</strong><span>{Number(candidate.score||0)}/100 · {candidate.status==='selected'?t('Selected','선정'):candidate.status==='discarded'?t('Discarded','폐기'):t('Eligible','적격')}</span>
        <small>{candidate.reader_payoff}</small>
        {!!candidate.reasons?.length&&<small>{candidate.reasons.join(' / ')}</small>}
       </li>)}</ol>
      </details>}
      <dl><div><dt>{t('Content workflow ID','콘텐츠 작업 ID')}</dt><dd>{thread.id}</dd></div><div><dt>{t('Steps','작업 단계')}</dt><dd>{thread.stepCount}</dd></div><div><dt>{t('Total reserved','총 예약액')}</dt><dd>{'$'+Number(thread.total_reserved_usd).toFixed(2)}</dd></div></dl>
      {attempts.some((a:Row)=>a.result_snapshot)&&<button type="button" className="admin-primary" onClick={e=>{e.preventDefault();openThreadResult(thread);}}>{t('View result / review notes','결과 및 검토 내용 보기')}</button>}
      {thread.status==='completed'&&<p className="marketing-thread-success">{t('Ready for final review; publication still requires approval.','최종 검토를 진행할 수 있습니다. 발행에는 별도 승인이 필요합니다.')}</p>}
     </div>
    </details>;
   }):<p className="admin-empty">{t('No content workflows match this filter.','해당 조건의 콘텐츠 작업이 없습니다.')}</p>}</div>
   {filteredGenerationThreads.length>generationVisible&&<button type="button" className="marketing-load-more" onClick={()=>setGenerationVisible(v=>v+20)}>{t('Load 20 more','20개 더 보기')}</button>}
  </section>}
  {channel==='instagram'&&activeTab==='trend'&&<section className="marketing-tab-panel">
   <div className="admin-section-title"><div><p className="admin-kicker">Trend Radar</p><Heading level={2}>{t('Seoul Trend','서울 트렌드')}</Heading><p>{t('Track verified Seoul/Korea 20s–30s culture signals and turn strong trends into date-focused Roundy content.','서울/한국 2030 문화 신호를 검증하고 강한 트렌드를 데이트 중심 Roundy 콘텐츠로 연결합니다.')}</p></div><button type="button" className="admin-secondary trend-refresh-button" disabled={busy} onClick={()=>void work(()=>loadTrend())}>{t('Refresh','새로고침')}</button></div>
    {data.trend?.scans?.[0]&&<p className="trend-scan-summary" role="status">{t('Latest scan','최근 검색')}: {statusText(data.trend.scans[0].status)} · {data.trend.scans[0].candidate_count||0}{t(' verified candidates','건 검증됨')}{data.trend.scans[0].error_message&&<> — {friendlyError(String(data.trend.scans[0].error_message))}</>}</p>}
   {settings&&<div className="marketing-settings-card"><form className="admin-form" onSubmit={e=>{e.preventDefault();void work(async()=>{await mutate('/settings',settings,'PUT');await load();setNotice(t('Seoul Trend settings saved.','서울 트렌드 설정을 저장했습니다.'));});}}>
    <label className="check-row"><input type="checkbox" checked={settings.trend_radar_enabled??true} onChange={e=>setSettings({...settings,trend_radar_enabled:e.target.checked})}/>{t('Enable Trend Radar','Trend Radar 활성화')}</label>
    <label className="check-row"><input type="checkbox" checked={settings.trend_override_enabled??true} onChange={e=>setSettings({...settings,trend_override_enabled:e.target.checked})}/>{t('Let strong trends replace the daily rotation','강한 트렌드가 일일 순환 콘텐츠를 대체')}</label>
    <label><span>{t('Override score threshold','대체 점수 기준')}</span><input type="number" min={60} max={100} step={1} value={settings.trend_override_score??80} onChange={e=>setSettings({...settings,trend_override_score:Number(e.target.value)})}/></label>
    <p className="admin-help">{t('Radar builds a reusable pool of verified candidates from the previous 7 days. It refreshes weekly; if fewer than 5 usable fresh candidates remain, it can refill at most once every 24 hours. Daily content generation reuses the pool without another trend search.','Radar는 최근 7일 데이터로 출처가 확인된 재사용 후보 풀을 만듭니다. 기본 갱신은 주 1회이며, 사용 가능한 최근 후보가 5개 미만이면 최대 하루 1회 보충 검색합니다. 일일 콘텐츠 생성은 추가 트렌드 검색 없이 이 후보 풀을 재사용합니다.')}</p>
    <p className="admin-help">{t('Current reusable pool','현재 재사용 후보 풀')}: {data.trend?.pool?.available_candidates??0} {t('available','사용 가능')} / {data.trend?.pool?.fresh_candidates??0} {t('fresh candidates from 7 days','최근 7일 후보')}. {t('Automatic refill starts below 5 available candidates.','사용 가능 후보가 5개 미만이면 자동 보충 대상이 됩니다.')}</p>
    <p className="admin-help">{t('Radar budget','Radar 예산')}: ${Number(data.trend?.usage?.daily_reserved_usd||0).toFixed(2)} / ${Number(data.trend?.usage?.daily_budget_usd||.12).toFixed(2)} {t('today','오늘')} · ${Number(data.trend?.usage?.monthly_reserved_usd||0).toFixed(2)} / ${Number(data.trend?.usage?.monthly_budget_usd||4).toFixed(2)} {t('this month','이번 달')}.</p>
    <div className="admin-form-actions"><button className="admin-primary" disabled={busy}>{t('Save Seoul Trend settings','서울 트렌드 설정 저장')}</button><button type="button" className="admin-secondary" disabled={busy} onClick={()=>{if(window.confirm(t('Refresh the weekly trend pool now with one paid scan? It uses the separate Radar safety budget.','지금 유료 스캔 1회로 주간 트렌드 후보 풀을 새로고침할까요? 별도 Radar 안전 예산을 사용합니다.')))void work(async()=>{try{const r=await mutate('/trend-radar/run',{confirm_paid_scan:true});setNotice(t('Trend Radar scan completed.','Trend Radar 스캔을 완료했습니다.'));return r;}finally{await loadTrend().catch(()=>{});}});}}>{t('Refresh trend pool now','트렌드 후보 풀 새로고침')}</button></div>
   </form></div>}
   <div className="marketing-settings-card trend-candidates-card"><div className="admin-section-title"><div><p className="admin-kicker">{t('Candidates','후보')}</p><Heading level={3}>{t('Detected trends','감지된 트렌드')}</Heading><p>{t('Turn a verified trend into a Roundy carousel without searching the web again.','검증된 트렌드를 추가 웹 검색 없이 바로 Roundy 캐러셀로 만듭니다.')}</p></div><div className="trend-language-picker" role="group" aria-label={t('Content language','콘텐츠 언어')}><span>{t('Content language','콘텐츠 언어')}</span><div><button type="button" aria-pressed={trendLanguage==='ko'} onClick={()=>setTrendLanguage('ko')}>한국어</button><button type="button" aria-pressed={trendLanguage==='en'} onClick={()=>setTrendLanguage('en')}>English</button></div></div></div>
    <div className="trend-usage-tabs" role="group" aria-label={t('Trend usage filter','트렌드 사용 여부')}>
     <button type="button" aria-pressed={trendUsageView==='unused'} onClick={()=>setTrendUsageView('unused')}>{t('Not used yet','미사용')} <span>{trendGroups.unused.length}</span></button>
     <button type="button" aria-pressed={trendUsageView==='used'} onClick={()=>setTrendUsageView('used')}>{t('Previously used','사용한 트렌드')} <span>{trendGroups.used.length}</span></button>
    </div>
    <p className="trend-usage-description">{trendUsageView==='unused'?t('Trends without a completed generation record, sorted by relevance.','아직 콘텐츠 생성에 사용하지 않은 후보입니다. 점수가 높은 순서로 표시됩니다.'):t('Previously used topics, newest first. “Used” means generated, not necessarily published.','콘텐츠 생성에 사용했던 주제를 최근 사용 순으로 보여줍니다. 사용 기록과 인스타그램 게시는 구분됩니다.')}</p>
    {!!visibleTrendRows.length?<div className="trend-candidate-list">{visibleTrendRows.map((item:Row)=>{
     const ready=factPackReady(item),facts=Array.isArray(item.fact_pack?.facts)?item.fact_pack.facts as Row[]:[],sourceLinks=Array.isArray(item.source_urls)?item.source_urls as Row[]:[];
     const expires=item.fact_pack?.expires_at?Date.parse(String(item.fact_pack.expires_at)):NaN,expired=Number.isFinite(expires)&&expires<=Date.now();
     const previouslyUsed=!!item.used_at||item.published===true;
     return <article className="trend-candidate-row" key={item.id}><div className="trend-candidate-copy">
      <div className="trend-candidate-title"><strong>{item.display_name}</strong><span className={'trend-lifecycle '+item.status}>{item.status}</span></div>
      <div className="trend-candidate-meta"><span>{item.route_type?.replaceAll('_',' ')}</span><span>{Number(item.trend_score||0).toFixed(0)}/100</span><span>{facts.length} {t('sourced facts','개 출처 기반 사실')}</span>{previouslyUsed&&<span>{item.published?t('Published','게시됨'):item.publication_known===false?t('Generation recorded','생성 기록 있음'):t('Content generated','콘텐츠 생성됨')}</span>}{item.used_at&&<span>{t('Last used','최근 사용')}: {new Date(item.used_at).toLocaleDateString(locale,{timeZone:'Asia/Seoul',year:'numeric',month:'short',day:'numeric'})}</span>}</div>
      <p>{item.content_angle||item.summary}</p>
      {ready?<details className="trend-fact-preview"><summary>{t('View Fact Pack / sources','팩트팩 및 출처 보기')}</summary>
       <div className="trend-fact-list">{facts.map((fact:Row,index:number)=><p key={index}><strong>{String(fact.kind||'').toUpperCase()}</strong> {trendLanguage==='en'?fact.value_en:fact.value_ko} <small>{(fact.source_ids||[]).join(', ')}</small></p>)}</div>
       <div className="trend-fact-sources">{sourceLinks.map((source:Row,index:number)=><a key={index} href={source.url} target="_blank" rel="noreferrer">{'S'+(index+1)}: {source.title||source.url}</a>)}</div>
      </details>:<p className="trend-fact-warning">{expired?t('Expired event — requires refreshed facts','기간이 지난 행사 — 정보 갱신 필요'):t('Missing verified facts — generation disabled','검증된 정보 부족 — 생성 비활성화')}</p>}
     </div>
     <button type="button" className="trend-create-button" disabled={busy||!ready} onClick={()=>{if(window.confirm(previouslyUsed?t('This trend was already used. Generate another carousel from the same topic? It may cost money for AI copy and visuals, but will not run a new trend search.','이미 사용한 트렌드입니다. 같은 주제로 콘텐츠를 다시 생성할까요? 문구와 이미지 생성 비용이 발생할 수 있으며 트렌드 검색은 다시 하지 않습니다.'):t('Generate a fact-checked carousel from the stored Fact Pack? No new trend web search; AI copy and visuals may incur generation costs.','저장된 팩트팩으로 '+(trendLanguage==='ko'?'한국어':'영어')+' 캐러셀을 생성할까요? 추가 트렌드 검색은 하지 않지만 문구와 이미지 생성 비용은 발생할 수 있습니다.')))void work(async()=>{const r=await mutate('/trend-radar/generate',{trend_id:item.id,language:trendLanguage,confirm_generate:true});await load();setActiveTab(r.content?'contents':'generation');setNotice(t('Trend guide generated. Review sourced details before publishing.','정보형 트렌드 콘텐츠가 생성됐습니다. 게시 전 출처를 검토하세요.'));return r;});}}>{previouslyUsed?t('Recreate guide','가이드 다시 만들기'):t('Create guide','가이드 만들기')}</button>
    </article>})}</div>:<p className="admin-empty">{trendUsageView==='used'?t('No previously used trends yet.','아직 콘텐츠 생성에 사용한 트렌드가 없습니다.'):t('No unused trends are available. Check the used trends archive or wait for new research.','미사용 트렌드가 없습니다. 사용 기록을 확인하거나 새로운 후보를 기다려주세요.')}</p>}
   </div>
  </section>}
  {channel==='instagram'&&activeTab==='automation'&&<section className="marketing-tab-panel marketing-workspace-settings">
   {settings&&<AdminMarketingSettings locale={locale} settings={settings} onChange={setSettings}
    busy={busy} onSave={()=>void work(async()=>{
     const editorial=Object.fromEntries(Object.keys(EDITORIAL_SETTINGS_DEFAULTS).map(key=>
      [key,settings[key]??EDITORIAL_SETTINGS_DEFAULTS[key as keyof typeof EDITORIAL_SETTINGS_DEFAULTS]]));
     await mutate('/settings',editorial,'PATCH');
     await load();
     setNotice(t('Feed & carousel settings saved.','Feed 및 카드뉴스 설정을 저장했습니다.'));
    })}/>}   {settings&&<div className="marketing-settings-card"><div className="admin-section-title"><div><p className="admin-kicker">{t('Schedule','스케줄')}</p><Heading level={2}>{t('Daily generation & campaigns','일일 생성 및 캠페인 설정')}</Heading></div></div><form className="admin-form" onSubmit={e=>{e.preventDefault();void work(async()=>{await mutate('/settings',settings,'PUT');await load();setNotice(t('Automation saved.','자동화 설정을 저장했습니다.'));});}}>
    <label className="check-row"><input type="checkbox" checked={settings.daily_instagram_enabled} onChange={e=>setSettings({...settings,daily_instagram_enabled:e.target.checked})}/>{t('One automatic draft per day','매일 완성된 초안 1개 자동 생성')}</label><label>{t('Generation time KST','생성 시간 KST')}<input type="time" value={settings.draft_generation_time_kst.slice(0,5)} onChange={e=>setSettings({...settings,draft_generation_time_kst:e.target.value})}/></label><p className="admin-help">{t('Checked every 15 minutes after this time. One dispatch per date, even on failure.','이 시간 이후 15분 간격으로 확인합니다. 실패해도 해당 날짜에는 자동 호출을 반복하지 않습니다.')}</p>
    <label>{t('Daily basis','일일 콘텐츠 기준')}<select value={settings.content_mode} onChange={e=>setSettings({...settings,content_mode:e.target.value})}><option value="prelaunch">{t('Pre-launch','오픈 전 홍보')}</option><option value="live_event">{t('Live event','정식 이벤트')}</option></select></label>
    <div className="marketing-setup">
     <strong>{t('Live event campaigns','이벤트 홍보 캠페인')}</strong>
     <label className="check-row"><input type="checkbox" checked={settings.event_campaign_enabled??true} onChange={e=>setSettings({...settings,event_campaign_enabled:e.target.checked})}/>{t('Generate event drafts when the lifecycle meaningfully changes','이벤트 상태가 의미 있게 바뀔 때 홍보 초안 자동 생성')}</label>
     <label><span>{t('Maximum automatic posts per event','이벤트당 자동 홍보 최대 개수')}</span><input type="number" min={1} max={5} value={settings.event_campaign_max_posts??5} onChange={e=>setSettings({...settings,event_campaign_max_posts:Number(e.target.value)})}/></label>
     <p className="admin-help">{t('Event drafts use real event photos first, alternate Korean and English, and never publish without approval.','이벤트 홍보는 실제 이벤트 사진을 우선 사용하고 한국어와 영어를 번갈아 생성하며 승인 전에는 게시하지 않습니다.')}</p>
    </div>
    <label className="check-row"><input type="checkbox" checked={settings.growth_mode_enabled===true} onChange={e=>setSettings({...settings,growth_mode_enabled:e.target.checked})}/>{t('Organic growth mode (balanced Seoul, Korea life, humor, people)','오가닉 성장 모드 (서울, 한국 생활, 공감, 사람 중심)')}</label>
    <p className="admin-help">{t('Opt-in. Replaces the daily dating-heavy topic rotation with an evidence-gated growth calendar. The same AI budgets, photo review, quality review and manual publish approval stay in force.','선택형 기능입니다. 기존 소개팅 중심 일일 주제를 검증형 성장 편성으로 바꾸되 AI 예산, 사진 검수, 문구 품질 검사, 관리자 게시 승인은 그대로 유지합니다.')}</p>
    <label className="check-row"><input type="checkbox" checked={settings.growth_carousel_enabled} onChange={e=>setSettings({...settings,growth_carousel_enabled:e.target.checked})}/>Growth Carousel</label>
    <div>
     <span className="admin-field-label">{t('Growth Carousel days','Growth Carousel 요일')}</span>
     <div className="marketing-days" role="group" aria-label={t('Growth Carousel days','Growth Carousel 요일')}>
      {['일','월','화','수','목','금','토'].map((day,i)=>{const active=settings.growth_days.includes(i);return <button key={day} type="button" aria-pressed={active} className={active?'active':''} onClick={()=>{const days=active?settings.growth_days.filter((x:number)=>x!==i):[...settings.growth_days,i].sort((a:number,b:number)=>a-b);setSettings({...settings,growth_days:days,growth_posts_per_week:days.length});}}>{day}</button>;})}
     </div>
     <div className="marketing-day-presets">{[
      [[1,2,3,4,5],t('Weekdays','평일')],
      [[0,6],t('Weekend','주말')],
      [[0,1,2,3,4,5,6],t('Every day','매일')],
      [[],t('Clear','해제')]
     ].map(([days,label]:any)=><button key={label} type="button" onClick={()=>setSettings({...settings,growth_days:days,growth_posts_per_week:days.length})}>{label}</button>)}</div>
    </div>
    <label className="check-row"><input type="checkbox" checked={settings.optimization_enabled} onChange={e=>setSettings({...settings,optimization_enabled:e.target.checked})}/>{t('Optimize posting time','게시 시간 최적화')}</label><label>{t('Fallback posting time KST','기본 게시 시간 KST')}<input type="time" value={settings.daily_time_kst.slice(0,5)} onChange={e=>setSettings({...settings,daily_time_kst:e.target.value})}/></label><label className="check-row"><input type="checkbox" checked={settings.auto_reply_enabled} onChange={e=>setSettings({...settings,auto_reply_enabled:e.target.checked})}/>{t('Existing comments/DM auto-replies','기존 댓글 및 DM 자동 응답')}</label><button disabled={busy} className="admin-primary">{t('Save automation','자동화 저장')}</button>
   </form></div>}

  </section>}
  {channel==='instagram'&&activeTab==='connection'&&<section className="marketing-tab-panel">
   <div className="marketing-settings-card"><div className="admin-section-title"><div><p className="admin-kicker">Instagram</p><Heading level={2}>{t('Connection and webhook','연결 및 Webhook')}</Heading></div></div><p role="status"><strong>{instagramStatusLabel}</strong>{data.connection?.instagram_checked_at?' · '+new Date(data.connection.instagram_checked_at).toLocaleString(locale,{timeZone:'Asia/Seoul'}):''}</p>
    {instagramStatus==='valid'?<p>{t('Meta confirmed the identity of @roundy.meet. Publishing permissions still apply to each post.','Meta에서 @roundy.meet 계정 인증을 확인했습니다. 실제 게시 시에는 콘텐츠 게시 권한도 적용됩니다.')}</p>
    :<p className="admin-error">{instagramStatus==='token_invalid'
     ?t('Meta rejected the current access token (190). Reauthorize @roundy.meet and replace INSTAGRAM_ACCESS_TOKEN in Roundy Supabase Edge Functions → Secrets. Never paste the token into chat.','Meta가 현재 액세스 토큰을 거부했습니다(190). @roundy.meet에서 새로 인증해 Roundy Supabase Edge Functions → Secrets의 INSTAGRAM_ACCESS_TOKEN을 교체하세요. 토큰을 채팅에 붙여넣지 마세요.')
     :instagramStatus==='account_mismatch'
     ?t('The token does not belong to @roundy.meet or INSTAGRAM_USER_ID does not match. Verify both secrets.','토큰 계정이 @roundy.meet이 아니거나 INSTAGRAM_USER_ID가 일치하지 않습니다. 두 설정을 확인하세요.')
     :instagramStatus==='not_configured'
     ?t('Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID in the Roundy Supabase Edge Function secrets.','Roundy Supabase Edge Functions의 Secrets에 INSTAGRAM_ACCESS_TOKEN과 INSTAGRAM_USER_ID를 설정하세요.')
     :t('Could not confirm the current token with Meta. Retry the connection check; do not assume publishing is available.','Meta 인증 상태를 확인하지 못했습니다. 연결을 다시 확인하세요. 게시 가능 상태로 판단하지 마세요.')}</p>}
    <div className="admin-form-actions">
     <button type="button" className="admin-secondary" disabled={busy} onClick={()=>void work(async()=>{if(dirty&&!window.confirm(t('Discard unsaved edits to refresh connection status?','연결 상태를 다시 확인하면 저장하지 않은 수정사항은 사라집니다. 계속할까요?')))return;await load();})}>{t('Check Instagram connection again','Instagram 연결 다시 확인')}</button>
     <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer">{t('Open Meta Developer Dashboard','Meta 개발자 대시보드 열기')}</a>
    </div>
    <p className="admin-help">{t('Connection health is read-only. This button never publishes, refreshes, or retries a post. After changing the secret, recheck and separately review failed items in Feed history.','연결 확인은 조회만 수행합니다. 이 버튼은 콘텐츠를 발행하거나 자동으로 재시도하지 않습니다. 토큰 교체 후 다시 확인하고, 과거 실패 항목은 Feed 발행 기록에서 별도로 검토하세요.')}</p>
    <p>{t('Comment/DM webhook verification','댓글 및 DM Webhook 인증')}: {data.webhook?.verified_at||t('Not verified','미인증')}</p>{!data.webhook?.verified_at&&<><label>Callback URL<input readOnly value={data.webhook?.callback_url||''}/></label><label>Verify token<input readOnly value={data.webhook?.verify_token||''}/></label></>}</div>
  </section>}
  {channel==='koreapas'&&<div className="admin-form"><Heading level={2}>{t('Koreapas templates','고파스 템플릿')}</Heading><select value={template.id||''} onChange={e=>setTemplate(structuredClone(data.templates.find((x:Row)=>x.id===e.target.value)||blank()))}><option value="">{t('New template','새 템플릿')}</option>{data.templates.filter((x:Row)=>x.channel==='koreapas').map((x:Row)=><option key={x.id} value={x.id}>{x.name}</option>)}</select>{[['name',t('Template name','템플릿 이름')],['title',t('Post title','제목')],['caption',t('Copy','본문')],['cta','CTA'],['destination_url',t('Destination URL','연결 주소')]].map(([key,label])=><label key={key}><span>{label}</span><textarea value={template[key]} onChange={e=>setTemplate({...template,[key]:e.target.value})}/></label>)}<label>{t('JPEG images','JPEG 이미지')}<input type="file" accept="image/jpeg" multiple disabled={busy} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';void work(async()=>{if(files.length+template.images.length>10)throw new Error('Maximum 10 images');const urls:string[]=[];for(const file of files){if(file.type!=='image/jpeg'||file.size>5*1024*1024)throw new Error('JPEG, max 5 MB');urls.push(await uploadFile(file,'wis-event-images'));}setTemplate({...template,images:[...template.images,...urls]});});}}/></label><OrderedImages images={template.images} onChange={images=>setTemplate({...template,images})} locale={locale} disabled={busy}/><div className="marketing-days">{['일','월','화','수','목','금','토'].map((day,i)=><label key={day}><input type="checkbox" checked={template.days.includes(i)} onChange={e=>setTemplate({...template,days:e.target.checked?[...template.days,i]:template.days.filter((x:number)=>x!==i)})}/>{day}</label>)}</div><input type="time" value={template.time_kst.slice(0,5)} onChange={e=>setTemplate({...template,time_kst:e.target.value})}/><label className="check-row"><input type="checkbox" checked={template.enabled} onChange={e=>setTemplate({...template,enabled:e.target.checked})}/>{t('Enable template schedule','템플릿 자동 게시 활성화')}</label><div className="admin-form-actions"><button type="button" className="admin-primary" disabled={busy} onClick={()=>void work(async()=>{const r=await mutate(template.id?'/'+template.id:'',template,template.id?'PUT':'POST');setTemplate(r.template);await load();})}>{t('Save','저장')}</button><button type="button" className="admin-secondary" disabled={busy||!template.id} onClick={()=>{if(window.confirm(t('Publish the SAVED Koreapas template now?','저장된 고파스 템플릿을 지금 게시할까요?')))void work(async()=>{await mutate('/publish',{template_id:template.id,request_key:crypto.randomUUID()});await load();});}}>{t('Publish saved template','저장된 템플릿 게시')}</button><button type="button" className="admin-secondary" disabled={busy||!template.id} onClick={()=>{if(window.confirm(t('Delete this template?','이 템플릿을 삭제할까요?')))void work(async()=>{await mutate('/'+template.id,{},'DELETE');setTemplate(blank());await load();});}}>{t('Delete','삭제')}</button></div></div>}
  {(channel==='koreapas'||activeTab==='publishing')&&<section className={channel==='instagram'?'marketing-tab-panel':''}>
   <div className="admin-section-title"><div><p className="admin-kicker">{t('Delivery','게시')}</p><Heading level={2}>{t('Publishing history','게시 기록')}</Heading></div></div>
   <div className="marketing-log-list">{visibleRuns.length?visibleRuns.map((r:Row)=>{
    const imageUrl=Array.isArray(r.snapshot?.images)?r.snapshot.images[0]:null,record=contentRecordForRun(r),language=(record?.content_language||r.snapshot?.content_language)==='en'?'EN':(record?.content_language||r.snapshot?.content_language)==='ko'?'KO':channel;
    return <details className={'marketing-log-row publishing '+r.status} key={r.id}>
     <summary>{imageUrl?<img className="marketing-log-thumb" src={imageUrl} alt=""/>:<span className="marketing-log-thumb placeholder"/>}<div className="marketing-log-main"><span className={'marketing-status-dot '+r.status}/><div><strong>{contentTitle(record||r)}</strong><small>{contentLabel(record||r)} · {language} · {new Date(r.created_at||r.scheduled_for).toLocaleString(locale,{timeZone:'Asia/Seoul'})}</small></div></div><div className="marketing-log-end"><span className={'marketing-status-pill '+r.status}>{statusText(r.status)}</span></div></summary>
      <div className="marketing-log-detail">
       <p>{r.message||t('No additional message.','추가 메시지가 없습니다.')}</p>
       {channel==='instagram'&&r.status==='failed'&&/Instagram API error 190/.test(String(r.message||''))&&
        <p className="admin-error" role="status">
         {t('Meta rejected the old token before any post was sent. Reconnect @roundy.meet under Connections before reviewing a retry. Previously failed posts never retry automatically.',
         'Meta가 게시 전 인증 토큰을 거부했습니다(190). 먼저 연결 메뉴에서 @roundy.meet 인증을 복구하고 재시도를 검토하세요. 실패 게시물은 자동 재시도하지 않습니다.')}
        </p>}
       <dl>
        <div><dt>{t('Run ID','게시 ID')}</dt><dd>{r.id}</dd></div>
        {r.scheduled_for&&<div><dt>{t('Reserved KST time','KST 발행 예정')}</dt><dd>{new Date(r.scheduled_for).toLocaleString(locale,{timeZone:'Asia/Seoul'})} KST</dd></div>}
        {r.snapshot?.feed_sequence&&<div><dt>{t('Feed order','Feed 발행 순번')}</dt><dd>#{r.snapshot.feed_sequence}</dd></div>}
        {r.external_id&&<div><dt>Instagram ID</dt><dd>{r.external_id}</dd></div>}
       </dl>
       {r.external_url&&<a className="admin-secondary" href={r.external_url} target="_blank" rel="noreferrer">{t('Open published post','게시물 보기')}</a>}
       {channel==='instagram'&&r.snapshot?.draft_id&&r.snapshot?.media_kind!=='reel'&&<button
         type="button" className="admin-secondary" disabled={busy}
         onClick={()=>setRegenerationSourceId(String(r.snapshot.draft_id))}>{t('Regenerate as new draft','새 초안으로 복제 및 재생성')}</button>}
       {channel==='instagram'&&r.snapshot?.draft_id&&r.snapshot?.media_kind!=='reel'&&<>
        <button type="button" className="admin-secondary" disabled={busy}
         onClick={()=>void work(async()=>{
          const response=await request('/runs/'+r.id+'/attempts',undefined,'GET');
          if(!response.ok)throw new Error(response.data.error||'Attempt history unavailable');
          setFeedAttempts(prev=>({...prev,[r.id]:response.data}));
         })}>{t('View publication attempt history','발행 시도 이력 보기')}</button>
        {feedAttempts[r.id]&&<div className="marketing-quality-status">
         <strong>{t('Saved Feed attempts','Feed 시도 기록')}</strong>
         {!feedAttempts[r.id].attempts?.length&&<p>{t('No external attempts yet.','외부 발행 시도 기록이 없습니다.')}</p>}
         {(feedAttempts[r.id].attempts||[]).map((a:Row)=><p key={a.id}>
          #{a.attempt_no} — {statusText(a.state)} —
          {' '+new Date(a.started_at).toLocaleString(locale,{timeZone:'Asia/Seoul'})} KST
          {a.error_message?' — '+a.error_message:''}
          {a.external_requested_at?t(' — Meta API attempted',' — Meta API 호출 시도 있음'):''}
         </p>)}
         {(feedAttempts[r.id].reviews||[]).map((review:Row)=><p key={'review-'+review.attempt_no}>
          {t('Admin verified not published, attempt #','관리자 미게시 확인, 시도 #')}{review.attempt_no} — {review.review_note}
         </p>)}
        </div>}
        {['needs_review','failed'].includes(r.status)&&<button type="button" className="admin-secondary" disabled={busy||instagramNeedsReconnect}
         onClick={()=>{
          if(!window.confirm(t('Have you personally checked Instagram and confirmed NO post was published? Never retry an uncertain result before verifying.','Instagram에서 실제로 게시물이 발행되지 않았음을 직접 확인했습니까? 결과가 불확실하면 확인 전 재시도하면 안 됩니다.')))return;
          const note=window.prompt(t('Record how you verified NO post on Instagram (12 characters or more).','Instagram 미게시를 어떻게 확인했는지 12자 이상 기록하세요.'))||'';
          if(!note.trim())return;
          void work(async()=>{
           const result=await mutate('/runs/'+r.id+'/retry',{confirm_no_post:true,note:note.trim()});
           setFeedAttempts(prev=>{const next={...prev};delete next[r.id];return next;});
           await load();
           setNotice(t('Verified no post. Retry scheduled for ','미게시 확인 완료. 재시도 예약: ')+String(result.feed_date_kst)+' KST');
          });
         }}>{t('Verify no post & schedule a retry','미게시 확인 후 재시도 예약')}</button>}
       </>}
       {r.status==='needs_review'&&<div className="admin-form-actions">{[true,false].map(published=><button key={String(published)} type="button" className="admin-secondary" disabled={busy} onClick={()=>{if(window.confirm(t('Confirm you checked the external channel.','외부 채널에서 실제 게시 여부를 확인했나요?')))void work(async()=>{await mutate('/resolve',{run_id:r.id,published});await load();});}}>{published?t('Confirmed published','게시됨 확인'):t('Confirmed not published','게시 안 됨 확인')}</button>)}</div>}
      </div>
    </details>;
   }):<p className="admin-empty">{t('No publishing history yet.','아직 게시 기록이 없습니다.')}</p>}</div>
   {channelRuns.length>publishVisible&&<button type="button" className="marketing-load-more" onClick={()=>setPublishVisible(v=>v+20)}>{t('Load 20 more','20개 더 보기')}</button>}
  </section>}


   {resultPreview&&<div className="marketing-result-backdrop" role="presentation" onClick={()=>setResultPreview(null)}>
   <section className="marketing-result-modal" role="dialog" aria-modal="true" aria-labelledby="marketing-result-title" onClick={e=>e.stopPropagation()}>
    <div className="marketing-result-head"><div><p className="admin-kicker">{t('Saved generation result','저장된 생성 결과')}</p><Heading level={2} id="marketing-result-title">{contentTitle(resultPreview.snapshot||resultPreview.attempt)}</Heading></div><button type="button" className="admin-secondary" onClick={()=>setResultPreview(null)}>{t('Close','닫기')}</button></div>
    <p className="admin-help">{new Date(resultPreview.attempt.created_at).toLocaleString(locale,{timeZone:'Asia/Seoul'})} KST · {t('Attempt','시도')} {resultPreview.attempt.attempt_number}</p>
    {Array.isArray(resultPreview.snapshot.images)&&resultPreview.snapshot.images.length>0&&<div className="marketing-result-images">{resultPreview.snapshot.images.map((url:string,i:number)=><img src={url} alt={t('Generated card ','생성 카드 ')+(i+1)} key={url}/>)}</div>}
    {(resultPreview.attempt.quality_report||resultPreview.snapshot.quality_report)&&<div className="marketing-quality-status"><strong>{t('Quality review','품질 검토')}</strong>{((resultPreview.attempt.quality_report||resultPreview.snapshot.quality_report).issues||[]).map((issue:string)=><p key={issue}>{issue}</p>)}</div>}
    {resultPreview.snapshot.content_document?.book?.title&&<p>{resultPreview.snapshot.content_document.book.title} / {resultPreview.snapshot.content_document.book.author}</p>}
    <div className="marketing-result-copy"><strong>{t('Caption','캡션')}</strong><p>{resultPreview.snapshot.caption||''}</p></div>
    {!!resultPreview.snapshot.research_sources?.length&&<div className="growth-sources">{resultPreview.snapshot.research_sources.map((s:Row)=><a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.publisher||s.title||s.url}</a>)}</div>}
    <div className="admin-form-actions"><button type="button" className="admin-secondary" onClick={()=>setResultPreview(null)}>{t('Close','닫기')}</button></div>
   </section>
  </div>}
 </section>;
}
