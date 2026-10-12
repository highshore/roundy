'use client';
import {AdminMarketingCardRewrite} from './admin-marketing-card-rewrite';
import {MarketingWorkflowNav,MarketingWorkflowSteps,MarketingProductionMetrics} from './marketing-workflow-nav';
import {editorialState,EDITORIAL_STATE_LABELS,hasEditorialCopy,visibleEditorialDrafts,type EditorialState} from '@/lib/marketing-workflow';
import {canOfferSavedCtaRecovery} from '@/lib/marketing-output-recovery';
import { useEffect, useRef, useState } from 'react';
import { Heading } from './heading';
import { tr, type Locale } from '@/lib/locale';
import { uploadFile, uploadMarketingFile } from '@/lib/uploads';
import { OrderedImages } from './ordered-images';
import {AdminMarketingGrowth} from './admin-marketing-growth';
import {AdminMarketingReels} from './admin-marketing-reels';
import {AdminMarketingStories} from './admin-marketing-stories';
import {AdminMarketingOverview} from './admin-marketing-overview';
import {AdminMarketingAssets} from './admin-marketing-assets';
import {AdminMarketingQueue} from './admin-marketing-queue';
import {AdminMarketingSettings} from './admin-marketing-settings';
import {MarketingMobilePreview} from './marketing-mobile-preview';
import {AdminMarketingRegeneration} from './admin-marketing-regeneration';
import {AdminMarketingEditorialStudio} from './admin-marketing-editorial-studio';
import {LayoutDashboard,FileText,Images,CalendarDays,History,Film,Compass,Settings2,Link2,BarChart3,BookOpen,RefreshCw,ArrowLeft,ZoomIn,X} from 'lucide-react';
import './admin-marketing-workspace.css';
import {generatorSelection,generatorMediaPlan,savedDraftMediaPlan,savedRenderContent} from '@/lib/marketing-generator-ui';
import {EDITORIAL_SETTINGS_DEFAULTS} from '@/lib/marketing-editorial-settings';
import {factPackReady,groupTrendsByUsage} from '@/lib/marketing-trend-guide';
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
export function AdminMarketing({locale}:{locale:Locale}){
 const t=(en:string,ko:string)=>tr(locale,en,ko);
 const [data,setData]=useState<Row>({drafts:[],runs:[],templates:[]});
 const [feedAttempts,setFeedAttempts]=useState<Record<string,Row>>({});
 const [draft,setDraft]=useState<Row|null>(null),[settings,setSettings]=useState<Row|null>(null),[generation,setGeneration]=useState<Row|null>(null);
 const [channel,setChannel]=useState<'instagram'|'koreapas'>('instagram'),[requestBusy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [basis,setBasis]=useState('growth_carousel'),[manualVisualSource,setManualVisualSource]=useState<'auto_ai'|'uploaded'|'none'|'pexels'|'stock'>('stock'),[topic,setTopic]=useState('conversation_prompt'),[contentLanguage,setContentLanguage]=useState<'ko'|'en'>('ko'),[direction,setDirection]=useState(''),[editorialLane,setEditorialLane]=useState('auto'),[storyCardCount,setStoryCardCount]=useState<3|5|0>(0),[captionDirty,setDirty]=useState(false);
 const [eventId,setEventId]=useState(''),[eventCampaignStage,setEventCampaignStage]=useState('auto');
 const [template,setTemplate]=useState<Row>(blank());
 const [stockPhotos,setStockPhotos]=useState<Row[]>([]),[stockReview,setStockReview]=useState<Row|null>(null);
 const [aiImageSlot,setAiImageSlot]=useState<number|null>(0);
 const [approvedPickerSlot,setApprovedPickerSlot]=useState<number|null>(null);
 const [approvedPool,setApprovedPool]=useState<Row[]>([]),[approvedSearch,setApprovedSearch]=useState('');
 const [approvedPreviewAsset,setApprovedPreviewAsset]=useState<Row|null>(null);
 const [preflightState,setPreflightState]=useState<Row|null>(null),[preflightSerial,setPreflightSerial]=useState(0);
 const [uploadedImages,setUploadedImages]=useState<Row[]>([]),[uploadAssetType,setUploadAssetType]=useState<'photo'|'completed_card'>('photo');
 const [pendingMarketingImages,setPendingMarketingImages]=useState<PendingMarketingImage[]>([]),[pendingAssetType,setPendingAssetType]=useState<'photo'|'completed_card'>('photo');
 const [resultPreview,setResultPreview]=useState<Row|null>(null);
 const [regenerationSourceId,setRegenerationSourceId]=useState<string|null>(null);
 const [regenerationFocus,setRegenerationFocus]=useState<{index:number;nonce:number}|null>(null);
 const [activeTab,setActiveTab]=useState<'overview'|'draft'|'assets'|'queue'|'growth'|'reels'|'stories'|'generation'|'trend'|'publishing'|'automation'|'connection'>('draft');
 const [generatorOpen,setGeneratorOpen]=useState(false);
 const [editorBusy,setEditorBusy]=useState(false),[advancedRegenOpen,setAdvancedRegenOpen]=useState(false);
 const [editorDirty,setEditorDirty]=useState(false);
 const busy=requestBusy||editorBusy,dirty=captionDirty||editorDirty;
 useEffect(()=>{if(regenerationFocus)setAdvancedRegenOpen(true);},[regenerationFocus]);
 const [generationFilter,setGenerationFilter]=useState<'all'|'completed'|'failed'|'running'|'review'>('all');
 const [trendLanguage,setTrendLanguage]=useState<'ko'|'en'>('ko');
 const [trendUsageView,setTrendUsageView]=useState<'unused'|'used'>('unused');
 const [generationVisible,setGenerationVisible]=useState(20),[publishVisible,setPublishVisible]=useState(20);
 const inFlight=useRef(false),mounted=useRef(true),stockPreferredSet=useRef(false);
 function selectDraft(next:Row|null){setEditorDirty(false);setPreflightState(null);setRegenerationFocus(null);setDraft(next?structuredClone(next):null);setDirty(false);}
 // New-content inputs intentionally do not follow the selected existing draft.
 async function load(preferredId?:string){
  const r=await request();if(!r.ok)throw new Error(r.data.error||'Could not load marketing');if(!mounted.current)return;
  setData(r.data);setSettings(r.data.settings);setGeneration(r.data.generation);
  if(!stockPreferredSet.current){stockPreferredSet.current=true;setManualVisualSource('stock');}if(!eventId&&r.data.live_events?.[0]?.id)setEventId(String(r.data.live_events[0].id));const rows=visibleEditorialDrafts(r.data.drafts||[]);
  selectDraft(rows.find((x:Row)=>x.id===preferredId)||rows.find((x:Row)=>x.status==='needs_approval')||rows[0]||null);
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
 useEffect(()=>{
  if(!draft?.id||draft.generation_source!=='manual'||draft.draft_role!=='candidate'){setUploadedImages([]);return;}
  let cancelled=false;request('/uploads?draft_id='+encodeURIComponent(draft.id),undefined,'GET').then(r=>{if(!cancelled&&r.ok)setUploadedImages(r.data.images||[]);}).catch(()=>{});
  return()=>{cancelled=true;};
 },[draft?.id,draft?.generation_source,draft?.draft_role]);
 useEffect(()=>{
  if(!draft?.id||!['pexels','stock'].includes(String(draft.visual_source))){setStockPhotos([]);setStockReview(null);return;}
  let cancelled=false;
  request('/photos?draft_id='+encodeURIComponent(draft.id),undefined,'GET')
   .then(r=>{if(!cancelled&&r.ok){setStockPhotos(r.data.photos||[]);setStockReview(r.data);}})
   .catch(()=>{if(!cancelled){setStockPhotos([]);setStockReview(null);}});
  return()=>{cancelled=true;};
 },[draft?.id,draft?.visual_source,draft?.revision]);
 useEffect(()=>{
  if(channel!=='instagram'||!draft?.id){setPreflightState(null);return;}
  let cancelled=false;
  request('/quality/preflight?draft_id='+encodeURIComponent(draft.id),undefined,'GET')
   .then(r=>{if(cancelled)return;
    if(r.ok&&r.data?.draft_id===draft.id)setPreflightState(r.data);
    else setPreflightState(null);
   }).catch(()=>{if(!cancelled)setPreflightState(null);});
  return()=>{cancelled=true;};
 },[channel,draft?.id,draft?.revision,preflightSerial]);
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
  if(/품질|quality|중복|카드|캡션|문구/i.test(message+' '+code))return {title:t('Copy quality issue','문구 품질 실패'),cause:t('The draft did not pass editorial rules.','문구가 편집 품질 기준을 통과하지 못했습니다.'),action:t('Formatting is fixed locally first, then copy gets one bounded repair pass.','형식은 서버가 먼저 보정하고 문구는 최대 1회만 자동 수정합니다.')};
  if(/image|photo|render|CARD_RENDER/i.test(message+' '+code))return {title:t('Image issue','이미지 생성 실패'),cause:t('The image generation or card rendering step stopped.','사진 생성 또는 카드 렌더링 단계에서 중지됐습니다.'),action:t('Saved copy is preserved so image work can be retried separately.','문구는 보존되므로 이미지만 별도로 다시 만들 수 있습니다.')};
  if(/BUDGET|LIMIT|COOLDOWN|PAUSED/i.test(message+' '+code))return {title:t('Usage limit','사용량/비용 제한'),cause:t('A marketing AI safety limit blocked the request.','마케팅 AI 안전 한도 때문에 요청이 중지됐습니다.'),action:t('Check the budget/limit panel before retrying.','재시도 전에 상단의 비용 및 사용량 상태를 확인하세요.')};
  return {title:t('System/API issue','시스템/API 오류'),cause:t('The provider or application could not complete this step safely.','외부 API 또는 시스템 단계가 안전하게 완료되지 않았습니다.'),action:t('Unknown external outcomes are never retried automatically.','외부 처리 결과가 불명확한 경우 자동 재시도하지 않습니다.')};
 }
 function clearPendingMarketingImages(){
  setPendingMarketingImages(current=>{for(const item of current)URL.revokeObjectURL(item.preview);return [];});
 }
 async function addPendingMarketingImages(files:File[]){
  if(!files.length)return;
  if(files.length+pendingMarketingImages.length>6)throw new Error('MAXIMUM_6_MARKETING_IMAGES');
  const next:PendingMarketingImage[]=[];
  for(const file of files){
   if(!file.size||file.size>10*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Use JPEG, PNG or WebP, max 10 MB.');
   const bitmap=await createImageBitmap(file),width=bitmap.width,height=bitmap.height;bitmap.close();
   if(!width||!height)throw new Error('INVALID_IMAGE_FILE');
   if(pendingAssetType==='completed_card'&&Math.abs(width/height-.8)>.035)throw new Error('COMPLETED_CARD_MUST_BE_4_5');
   next.push({id:crypto.randomUUID(),file,preview:URL.createObjectURL(file),asset_type:pendingAssetType,width,height});
  }
  setPendingMarketingImages(current=>[...current,...next]);
 }
 function removePendingMarketingImage(id:string){
  setPendingMarketingImages(current=>{const target=current.find(item=>item.id===id);if(target)URL.revokeObjectURL(target.preview);return current.filter(item=>item.id!==id);});
 }
 function movePendingMarketingImage(index:number,delta:number){
  setPendingMarketingImages(current=>{const to=index+delta;if(to<0||to>=current.length)return current;const next=[...current];next.splice(to,0,next.splice(index,1)[0]);return next;});
 }
 function updatePendingMarketingImageType(id:string,assetType:'photo'|'completed_card'){
  setPendingMarketingImages(current=>current.map(item=>{
   if(item.id!==id)return item;
   if(assetType==='completed_card'&&Math.abs(item.width/item.height-.8)>.035){setError(friendlyError('COMPLETED_CARD_MUST_BE_4_5'));return item;}
   return {...item,asset_type:assetType};
  }));
 }
 async function uploadPendingImagesToDraft(targetDraft:Row,items:PendingMarketingImage[]){
  for(let i=0;i<items.length;i++){
   const item=items[i],storagePath=await uploadMarketingFile(item.file,targetDraft.id);
   const registered=await request('/uploads/register',{draft_id:targetDraft.id,storage_path:storagePath,asset_type:item.asset_type,role:i===0?'cover':'flexible'});
   if(!registered.ok)throw new Error(registered.data.error||'Upload failed');
  }
  const rendered=await request('/draft/'+targetDraft.id+'/render-uploaded',{revision:targetDraft.revision,request_key:'upload-render:'+crypto.randomUUID()});
  if(!rendered.ok||rendered.data.error)throw new Error(rendered.data.error||'Render failed');
  return rendered.data.draft||targetDraft;
 }
 async function work(fn:()=>Promise<void>){if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError(friendlyError(e instanceof Error?e.message:'Request failed'));}finally{inFlight.current=false;if(mounted.current)setBusy(false);}}
 async function mutate(path:string,body:Row,method='POST'){
  const r=await request(path,body,method);
  if(r.data.draft)selectDraft(r.data.draft);
  if(r.data.checks&&r.data.draft)setPreflightState({draft_id:r.data.draft.id,
   revision:r.data.draft.revision,preflight:{status:'rejected',checks:r.data.checks,issues:r.data.issues||[]},
   quality_report:r.data.quality_report});
  if(!r.ok||r.data.error)throw new Error(r.data.error||'Request failed');
  return r.data;
 }
 async function upgradeLegacyDraftToMagazine(){
  if(!draft||draft.status!=='needs_approval'||draft.content_document?.design_preset==='roundy_magazine_editorial_v2')return;
  if(dirty&&!window.confirm(t('Discard unsaved changes before converting this draft?','매거진 전환 전 저장하지 않은 수정사항을 버릴까요?')))return;
  if(!window.confirm(t('Regenerate the copy and visuals of this UNPUBLISHED draft as Magazine Editorial v2? This uses a new paid AI copy generation, keeps published posts unchanged, and requires fresh licensing/photo approval. Your existing draft copy and images will be replaced only after generation succeeds.','이 미발행 초안을 Magazine Editorial v2로 다시 생성할까요? AI 문구 생성 비용이 발생하며, 기존 게시물은 변경되지 않습니다. 새 사진은 저작권 승인 후 사용합니다. 생성 성공 시 이 초안의 기존 문구와 이미지만 교체됩니다.')))return;
  await work(async()=>{
   const mode=String(draft.draft_kind)==='growth_carousel'?'growth_carousel':String(draft.content_mode||'prelaunch');
   const cover=String(draft.content_document?.slides?.[0]?.title||draft.carousel_slides?.[0]?.title||'');
   const payload={request_key:'magazine-upgrade:'+crypto.randomUUID(),revision:draft.revision,
    mode:'both',content_mode:mode,visual_mode:'cards',visual_source:'stock',
    language:draft.content_language==='en'?'en':'ko',
    ...(mode==='growth_carousel'?{topic_type:draft.growth_topic_type||'conversation_prompt'}:{}),
    ...(mode==='live_event'?{event_id:draft.event_id,event_campaign_stage:draft.event_campaign_stage||'launch'}:{}),
    instruction:cover?'Rebuild the existing story about '+cover+'. Stay grounded in verified sources. Editorial closing, never a feed CTA.':'Rebuild the existing story with verified evidence and an editorial closing. No feed CTA.',
    confirm_photo:false,render_only:false};
   const result=await request('/draft/'+draft.id+'/regenerate',payload);
   if(!result.ok||result.data.error||['failed','uncertain'].includes(result.data.job?.status))throw new Error(result.data.job?.error_message||result.data.error||'MAGAZINE_UPGRADE_FAILED');
   if(result.data.job?.status==='running'){setNotice(t('The request already exists in Generation history. No duplicate AI call was sent.','동일한 요청이 생성 기록에 있습니다. AI 중복 호출은 발생하지 않았습니다.'));return;}
   await load(draft.id);
   if(result.data.draft)selectDraft(result.data.draft);
   await refreshStock(draft.id);
   setActiveTab('draft');
   setNotice(t('Magazine v2 saved to this draft. Review all newly sourced photos and run all seven checks before approval.','이 초안이 Magazine v2로 갱신되었습니다. 신규 사진을 승인하고 발행 전 7개 검증을 다시 실행하세요.'));
  });
 }
 async function generate(today=false,renderOnly=false){
  if(renderOnly&&!draft)return;
  if(renderOnly&&dirty&&!window.confirm(t('Discard unsaved edits before rendering?','저장하지 않은 수정을 버리고 이미지를 다시 렌더할까요?')))return;
  const source=today?'stock':renderOnly?(draft?.visual_source||'auto_ai'):manualVisualSource;
  if(!today&&!renderOnly&&source==='uploaded'&&!pendingMarketingImages.length){setError(t('Add at least one image before generating with uploads.','직접 업로드 방식은 이미지를 1장 이상 추가한 뒤 생성하세요.'));return;}
  if(!today&&!renderOnly&&basis==='live_event'&&!eventId){setError(t('Choose the live event to promote.','홍보할 정식 이벤트를 선택하세요.'));return;}
  const contentInput=renderOnly?savedRenderContent(draft!):{content_mode:basis,topic_type:basis==='growth_carousel'?topic:undefined,language:contentLanguage,event_id:basis==='live_event'?eventId:undefined,event_campaign_stage:basis==='live_event'?eventCampaignStage:undefined,instruction:direction.trim(),editorial_lane:editorialLane};
  const research=contentInput.content_mode==='growth_carousel'&&['book_insight','trend_research','dating_myth','seoul_trend'].includes(contentInput.topic_type||''),requestedMode=renderOnly?'image':(['auto_ai','pexels','stock'].includes(source)?'both':'text');
  const selectedEvent=(data.live_events||[]).find((item:Row)=>String(item.id)===String(contentInput.event_id||'')),eventHasEnoughPhotos=contentInput.content_mode==='live_event'&&Array.isArray(selectedEvent?.images)&&selectedEvent.images.length>=3;
  const managed=Number.isInteger(settings?.carousel_min_real_photos_5)&&Number.isInteger(settings?.carousel_min_real_photos_3)&&['auto_ai','pexels','stock'].includes(source);
  const savedAi=renderOnly?draft?.content_document?.photo_sourcing:null;
  const useAiCover=renderOnly
   ?(savedAi?.ai_image_slot===undefined?savedAi?.ai_thumbnail_enabled===true:savedAi?.ai_image_slot!==null)
   :managed&&settings?.carousel_mode==='fixed'&&Number(storyCardCount||settings?.carousel_default_slides)===5&&newMediaPlan.aiSlot!==null;
  const cost=managed?(useAiCover?(renderOnly?'$0.15':'$0.20'):renderOnly?'$0':research?'$0.05':'$0.02')
    :['pexels','stock'].includes(source)?(renderOnly?'$0':research?'$0.05':'$0.02')
    :renderOnly?(source==='uploaded'?'$0':eventHasEnoughPhotos?'$0':'$0.15')
    :source==='auto_ai'?(eventHasEnoughPhotos?'$0.02':'$0.20'):research?'$0.05':'$0.02';
  const media=renderOnly?savedDraftMediaPlan(draft!):newMediaPlan;
  const photoCountText='known' in media&&!media.known?t('the required','필요한'):String(media.realPhotos);
  const message=managed
   ?t('Prepare this content with '+photoCountText+' reviewed real photos'+(useAiCover?' and one AI image':'')+'? Reserved budget '+cost+'. Existing drafts stay unchanged; publishing requires final approval.',
      '검수된 실사 '+photoCountText+'장'+(useAiCover?'과 AI 이미지 1장':'')+'으로 준비할까요? 예약액 '+cost+'. 기존 초안은 보존하며, 게시는 최종 승인 후에만 진행합니다.')
   :['pexels','stock'].includes(source)
    ?t('Generate copy and find licensed photos for human review? Reserve '+cost+'.','문구와 라이선스 확인 사진을 검수용으로 준비할까요? 예약액 '+cost+'.')
    :source==='auto_ai'
    ?t('Generate AI images with the legacy visual mode? This reserves '+cost+'.','기존 AI 이미지 모드로 만들까요? 예약액 '+cost+'.')
    :source==='uploaded'
    ?t('Generate copy for manual image upload? Only copy/research cost is reserved; image AI will not run.','직접 업로드용 문구를 생성할까요? 문구/검색 비용만 예약되며 이미지 AI는 호출하지 않습니다.')
    :t('Generate copy only? Images can be added later.','문구만 생성할까요? 이미지는 나중에 추가할 수 있습니다.');
  if(!window.confirm(message))return;
  await work(async()=>{
   const payload={request_key:'manual:'+crypto.randomUUID(),revision:renderOnly?draft!.revision:1,mode:today?'both':requestedMode,...contentInput,language:today?undefined:contentInput.language,visual_mode:'cards',visual_source:source,
    ...(!renderOnly&&!today&&managed&&settings?.carousel_mode==='fixed'&&Number(storyCardCount||settings?.carousel_default_slides)===5?{ai_image_slot:newMediaPlan.aiSlot}:!renderOnly&&!today&&managed&&storyCardCount===3?{ai_image_slot:null}:{}),...(!renderOnly&&!today&&basis==='growth_carousel'&&storyCardCount?{story_card_count:storyCardCount}:{}),confirm_photo:false,render_only:renderOnly};
   const path=renderOnly?'/draft/'+draft!.id+'/regenerate':'/draft/generate';
   const r=await request(path,payload);
   if(!r.ok||r.data.error)throw new Error(r.data.error||'Generation failed');
   if(r.data.job?.status==='running'){setNotice(t('This request already exists. Check Generation history; it was not billed again.','이미 접수된 요청입니다. 생성 기록을 확인하세요. 추가 호출하지 않았습니다.'));return;}
   if(['failed','uncertain'].includes(r.data.job?.status))throw new Error(r.data.job?.error_message||'Previous attempt stopped; no retry was sent.');
   const actuallyPexels=['pexels','stock'].includes(r.data.draft?.visual_source);
   if(!today&&!renderOnly){
    const jobId=String(r.data.job?.id||'');if(!jobId)throw new Error('RESULT_SNAPSHOT_UNAVAILABLE');
    const imported=await request('/generation/jobs/'+jobId+'/import',{confirm_import:true});
    if(!imported.ok||imported.data.error||!imported.data.draft)throw new Error(imported.data.error||'Import failed');
    const candidate=imported.data.draft as Row;
    if(source==='uploaded'&&!r.data.review_required){
     try{await uploadPendingImagesToDraft(candidate,[...pendingMarketingImages]);}
     finally{clearPendingMarketingImages();}
    }
    await load(candidate.id);setActiveTab('draft');
    if(['pexels','stock'].includes(candidate.visual_source))await refreshStock(candidate.id);
    setNotice(r.data.review_required?t('Copy saved for editing. Sources and final publishing checks still apply.','원고를 편집 가능한 상태로 저장했습니다. 출처와 최종 발행 검사는 유지됩니다.'):source==='none'?t('Copy saved. Review the text, then add images.','원고가 저장되었습니다. 문장을 확인한 뒤 이미지를 추가하세요.'):['pexels','stock'].includes(candidate.visual_source)
     ?t('Copy saved. licensed photos remain under review until the minimum count is approved; no AI filler was created.','문구 저장 완료. 최소 실제 사진 개수 확보 및 승인 전까지 검수 대기하며 부족한 사진을 AI로 대체하지 않습니다.')
     :t('Copy, uploaded images, and final cards are ready in Drafts. No image AI was used.','문구 생성, 이미지 업로드, 카드 렌더링까지 완료했습니다. 이미지 AI는 사용하지 않았습니다.'));
   }else{
    await load(renderOnly?draft?.id:undefined);
    if(renderOnly&&r.data.draft)selectDraft(r.data.draft);
    else setActiveTab('generation');
    setNotice(renderOnly?t('Fresh visuals generated and cards rendered from the current draft.','현재 초안에 맞는 새 이미지를 생성하고 카드를 다시 렌더했습니다.'):t('Generation complete. Open the result in Generation history and choose Add to Drafts.','생성이 완료됐습니다. 생성 기록에서 결과를 확인한 뒤 초안으로 가져오세요.'));
   }
   if(!renderOnly){setDirection('');setGeneratorOpen(false);}
  });
 }
 function retryCost(job:Row){return job.operation==='render'?0:job.operation==='photo'?0.15:job.operation==='copy_photo'?0.20:job.operation==='research'?0.05:0.02;}
 async function retryJob(job:Row,selectedTopicKey?:string){
  if(!job.request_payload)throw new Error('RETRY_PAYLOAD_UNAVAILABLE');
  const savedRecovery=canOfferSavedCtaRecovery(job),cost=savedRecovery?0.15:retryCost(job),photo=['photo','copy_photo'].includes(job.operation)||savedRecovery,budget=cost.toFixed(2)+' USD';
  const confirmMessage=selectedTopicKey?t('Use this saved topic without planning it again? Copy generation still uses the displayed budget and must pass review.','저장된 이 주제를 사용해 이어서 작성할까요? 주제 기획은 다시 호출하지 않으며 원고 생성에는 표시된 예산과 품질 검사가 적용됩니다.'):savedRecovery?t('Recover the saved copy and generate a fresh three-image visual set? This reserves '+budget+' and does not publish automatically.','저장된 문구는 재사용하고 새 이미지 3장을 생성할까요? 앱 예산 '+budget+'를 예약하며 자동 게시되지는 않습니다.'):t(
   'Retry this failed generation with the same saved settings? This starts one generation attempt (research uses up to three targeted searches and one writing request, plus at most one copy-only repair when quality checks fail) and reserves '+budget+'. It will not publish automatically.',
   '이 실패 작업을 저장된 동일 설정으로 재시도할까요? 생성 시도 1회를 시작합니다. 검색형은 목적별 검색 최대 3회와 문구 작성 1회, 품질 문제 시 문구 수정 최대 1회까지 사용하며, 앱 예산 '+budget+'를 예약합니다. 자동 게시되지는 않습니다.'
  );
  if(!window.confirm(confirmMessage))return;
  await work(async()=>{
   const r=await request('/generation/jobs/'+job.id+'/retry',{confirm_retry:true,confirm_paid_photo:photo,recover_saved_result:savedRecovery,...(selectedTopicKey?{selected_topic_key:selectedTopicKey}:{})});
   await load();
   if(!r.ok||r.data.error)throw new Error(r.data.error||'Retry failed');
   if(['failed','uncertain'].includes(r.data.job?.status))throw new Error(r.data.job?.error_message||'Retry stopped');
   setActiveTab('generation');
   setNotice(savedRecovery?t('Saved copy recovered with a fresh visual set. Review it, then add it to Drafts.','저장된 문구를 복구하고 새 이미지 세트를 생성했습니다. 결과를 검토한 뒤 초안으로 가져오세요.'):t('Retry complete. Open the result and choose Add to Drafts.','재시도가 완료됐습니다. 결과를 확인한 뒤 초안으로 가져오세요.'));
  });
 }
 function openThreadResult(thread:Row){
  const attempts=[...(thread.attempts||[])].reverse();
  const attempt=attempts.find((a:Row)=>a.result_snapshot);
  if(!attempt){setError(friendlyError('RESULT_SNAPSHOT_UNAVAILABLE'));return;}
  setResultPreview({thread,attempt,snapshot:attempt.result_snapshot});
 }
 async function refreshUploads(draftId:string){
  const r=await request('/uploads?draft_id='+encodeURIComponent(draftId),undefined,'GET');if(!r.ok)throw new Error(r.data.error||'Could not load uploads');setUploadedImages(r.data.images||[]);
 }
 async function uploadMarketingImages(files:File[]){
  if(!draft||draft.generation_source!=='manual')throw new Error('UPLOAD_VISUALS_MANUAL_ONLY');
  if(files.length+uploadedImages.length>6)throw new Error('MAXIMUM_6_MARKETING_IMAGES');
  for(let i=0;i<files.length;i++){
   const file=files[i],storagePath=await uploadMarketingFile(file,draft.id);
   const r=await request('/uploads/register',{draft_id:draft.id,storage_path:storagePath,asset_type:uploadAssetType,role:uploadedImages.length===0&&i===0?'cover':'flexible'});if(!r.ok)throw new Error(r.data.error||'Upload failed');
  }
  await refreshUploads(draft.id);
 }
 async function updateUpload(id:string,patch:Row){
  const r=await request('/uploads/'+id,patch,'PATCH');if(!r.ok)throw new Error(r.data.error||'Could not update image');setUploadedImages(r.data.images||[]);
 }
 async function deleteUpload(id:string){
  const r=await request('/uploads/'+id,{},'DELETE');if(!r.ok)throw new Error(r.data.error||'Could not delete image');setUploadedImages(r.data.images||[]);
 }
 async function moveUpload(index:number,delta:number){
  if(!draft)return;const to=index+delta;if(to<0||to>=uploadedImages.length)return;const next=[...uploadedImages];next.splice(to,0,next.splice(index,1)[0]);
  const r=await request('/uploads/order',{draft_id:draft.id,ids:next.map(x=>x.id)},'PATCH');if(!r.ok)throw new Error(r.data.error||'Could not reorder images');setUploadedImages(r.data.images||[]);
 }
 async function renderUploaded(){
  if(!draft)return;const r=await request('/draft/'+draft.id+'/render-uploaded',{revision:draft.revision,request_key:'upload-render:'+crypto.randomUUID()});if(!r.ok||r.data.error)throw new Error(r.data.error||'Render failed');await load(draft.id);await refreshUploads(draft.id);
 }
 async function refreshStock(draftId:string){
  const r=await request('/photos?draft_id='+encodeURIComponent(draftId),undefined,'GET');
  if(!r.ok||r.data.error)throw new Error(r.data.error||'Could not load licensed photos');
  setStockPhotos(r.data.photos||[]);setStockReview(r.data);setPreflightSerial(v=>v+1);
 }
 async function reviewStock(photo:Row,status:'approved'|'rejected'){
  if(!draft)return;
  if(!window.confirm(status==='approved'
   ?t('Have you reviewed the license, subjects, trademarks and whether the photo implies endorsement?','이 사진의 라이선스와 인물, 상표, 후원 또는 참가 암시 여부를 검토했나요?')
   :t('Reject this photograph from the image library?','이 사진을 거절하고 사진 라이브러리에서 사용하지 않을까요?')))return;
  const r=await request('/photos/'+photo.asset_id+'/review',{
   status,confirm_rights_reviewed:true,note:'Human review of source, subjects, trademarks and commercial use'
  });
  if(!r.ok||r.data.error)throw new Error(r.data.error||'Stock photo review failed');
  await refreshStock(draft.id);
 }
 async function discoverStock(){
  if(!draft)return;
  const r=await request('/draft/'+draft.id+'/refresh-stock',{revision:draft.revision});
  if(!r.ok||r.data.error)throw new Error(r.data.error||'Stock photo discovery failed');
  await refreshStock(draft.id);
 }
 async function renderStock(){
  if(!draft)return;
  const r=await request('/draft/'+draft.id+'/render-stock',{revision:draft.revision});
  if(!r.ok||r.data.error)throw new Error(r.data.error||'Stock photo rendering failed');
  await load(draft.id);
  await refreshStock(draft.id);
 }
 async function showApprovedPhotoPicker(slot:number){
  if(!draft)return;
  await work(async()=>{
   const r=await request('/photos/assets?status=approved',undefined,'GET');
   if(!r.ok||r.data.error)throw new Error(r.data.error||'Could not load approved images');
   setApprovedPool((r.data.assets||[]).filter((item:Row)=>item.review_status==='approved'));
   setApprovedSearch('');
   setApprovedPreviewAsset(null);
   setApprovedPickerSlot(slot);
  });
 }
 async function applyApprovedPhoto(assetId:string){
  if(!draft||approvedPickerSlot===null)return;
  const target=draft;
  const replaceRendered=Array.isArray(target.images)&&target.images.length>0;
  if(replaceRendered&&!window.confirm(t('Replace this card photo? Existing rendered cards will be cleared and must be rendered again. Scheduled and published posts are unchanged.',
   '이 카드의 사진을 교체하면 기존 렌더링 결과가 지워지고 다시 렌더링해야 합니다. 이미 예약 또는 게시된 콘텐츠는 변경되지 않습니다.')))return;
  await work(async()=>{
   await mutate('/draft/'+target.id+'/assign-stock',{
    revision:target.revision,slot:approvedPickerSlot,asset_id:assetId,confirm_replace:replaceRendered
   });
   setApprovedPreviewAsset(null);setApprovedPickerSlot(null);
   await load(target.id);await refreshStock(target.id);
   setNotice(t('Approved image assigned to this card. Render again before publishing.',
    '선택한 승인 사진을 이 카드에 지정했습니다. 게시 전에 이미지를 다시 렌더링하세요.'));
  });
 }
 async function changeAiCardSlot(next:number|null){
  if(!draft)return;
  const target=draft;
  const replaceRendered=Array.isArray(target.images)&&target.images.length>0;
  if(replaceRendered&&!window.confirm(t('Changing the AI card clears the previous rendered images. Continue?',
   'AI 이미지 카드 위치를 바꾸면 기존 렌더링 결과가 지워집니다. 계속할까요?')))return;
  await work(async()=>{
   await mutate('/draft/'+target.id+'/image-layout',{
    revision:target.revision,ai_image_slot:next,confirm_replace:replaceRendered
   });
   await load(target.id);await refreshStock(target.id);
   setNotice(t('Image layout saved. Review assignments and render again.',
    '카드별 이미지 배치를 저장했습니다. 승인 사진 위치를 확인한 뒤 다시 렌더링하세요.'));
  });
 }
 async function importResultToDraft(){
  if(!resultPreview?.attempt?.id)return;
  if(!window.confirm(t('Create a new independent draft from this saved generation result? This does not publish it.','이 저장된 생성 결과로 독립적인 새 초안을 만들까요? 게시되지는 않습니다.')))return;
  await work(async()=>{
   const r=await request('/generation/jobs/'+resultPreview.attempt.id+'/import',{confirm_import:true});
   if(!r.ok||r.data.error)throw new Error(r.data.error||'Import failed');
   if(r.data.draft)selectDraft(r.data.draft);
   await load(r.data.draft?.id);
   setResultPreview(null);setActiveTab('draft');
   setNotice(t('Generated result added to Drafts.','생성 결과를 독립 초안으로 추가했습니다.'));
  });
 }
  const running=(generation?.jobs||[]).find((j:Row)=>j.status==='running'&&Date.now()-Date.parse(j.created_at)<300000),blocked=Boolean(generation?.control?.blocked_reason||generation?.control?.enabled===false);
 function stage(s:string){const labels:Record<string,string>={reserved:t('Reserved; duplicate checks passed','예산 예약 및 중복 검사 완료'),planning_topics:t('Checking five topic ideas','주제 후보 5개 검토 중'),topic_selected:t('Strong topic selected','주제 선정 완료'),topics_discarded:t('Weak topics discarded','저품질 주제 폐기'),writing:t('Writing copy','문구 작성 중'),writing_fallback:t('Writing safe fallback','안전한 대체 콘텐츠 작성 중'),repairing_copy:t('Repairing copy once','문구 1회 수정 중'),researching:t('Researching sources','출처 조사 중'),saving_copy:t('Saving copy','문구 저장 중'),generating_visual_set:t('Generating 3 fresh visuals','새 이미지 3장 생성 중'),saving_visual_set:t('Saving fresh visuals','새 이미지 세트 저장 중'),saving_images:t('Saving images','이미지 저장 중'),complete:t('Complete','완료'),stopped:t('Stopped','중지')};return labels[s]||s.replace('rendering_','카드 생성 ').replace('_of_',' / ');}
 function changeDraft(key:string,value:string){setDraft(d=>d?{...d,[key]:value}:d);setDirty(true);}
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
 const tabItems=[
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
 const editableDrafts=visibleEditorialDrafts(data.drafts||[]);
 const newMediaPlan=generatorMediaPlan(settings,basis,storyCardCount,aiImageSlot);
 const selectedStoryCount=newMediaPlan.storyCount,newBranded=newMediaPlan.brand,plannedPhotoCount=newMediaPlan.realPhotos;
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
 const isMagazine=draft?.content_document?.design_preset==='roundy_magazine_editorial_v2';
 const selectedAiSlot: number|null=draft?.content_document?.photo_sourcing?.ai_image_slot===undefined
  ?(draft?.content_document?.photo_sourcing?.ai_thumbnail_enabled===true?0:null)
  :draft.content_document.photo_sourcing.ai_image_slot;
 const draftMediaPlan=savedDraftMediaPlan(draft);
 const realPhotoSlots=draftMediaPlan.realSlots;
 const filteredApprovedPool=approvedPool.filter((photo:Row)=>{
  const q=approvedSearch.trim().toLowerCase();
  return !q||[photo.photographer,photo.provider,photo.topic_key,photo.search_query,photo.provider_photo_id]
   .some(value=>String(value||'').toLowerCase().includes(q));
 });
 const currentPreflight=draft&&preflightState?.draft_id===draft.id&&preflightState?.revision===draft.revision?preflightState:null;
 const preflightChecks=Array.isArray(currentPreflight?.preflight?.checks)?currentPreflight.preflight.checks as Row[]:[];
 const preflightReady=currentPreflight?.preflight?.status==='passed'&&currentPreflight?.quality_report?.status==='passed';
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

 const localizedCheck:Record<string,string>={
  slide_count:'Slide count / images',real_photos:'Minimum authentic photos',
  photo_sources:'Photo sources / license',photo_approval:'Admin photo approval',
  answer_first:'Answer-First cover',final_cta:'Final CTA (legacy)',editorial_closing:'Editorial Closing / no CTA',mobile_render:'Mobile readability / margins'
 };
 function renderCardPhotoEditor(index:number){
  if(!draft)return null;
  const assigned=stockPhotos.find(photo=>Number(photo.slot)===index),ai=index===selectedAiSlot;
  const locked=busy||!!running||dirty||draft.status!=='needs_approval';
  return <div className="marketing-inline-photo" data-photo-slot={index}>
   <strong>{t('Card image','카드 이미지')} {index+1}</strong>
   {ai?<><p>{t('This card uses an AI image. Other story cards keep their reviewed real photos.','이 카드는 AI 이미지를 사용합니다. 다른 본문 카드의 승인된 실사는 유지됩니다.')}</p><button type="button" className="admin-secondary" disabled={locked} onClick={()=>void changeAiCardSlot(null)}>{t('Use a real photo instead','실사로 바꾸기')}</button></>:<>
    {assigned&&<div className="marketing-inline-photo-source">{assigned.preview_url&&<img src={assigned.preview_url} alt={t('Original photo for this card','이 카드의 사진 원본')}/>}<div><p>{assigned.review_status==='approved'?t('Approved photo','승인된 사진'):t('Photo review required','사진 검수 필요')}</p><small>{assigned.photographer} / {assigned.provider}</small><p>{assigned.source_url&&<a href={assigned.source_url} target="_blank" rel="noopener noreferrer">{t('Original','원본')}</a>} {assigned.license_url&&<a href={assigned.license_url} target="_blank" rel="noopener noreferrer">{t('License','라이선스')}</a>}</p></div></div>}
    {!assigned&&<p>{t('Choose a photo for this card.','이 카드에 사용할 사진을 선택하세요.')}</p>}
    <button type="button" className="admin-secondary" disabled={locked} onClick={()=>void showApprovedPhotoPicker(index)}>{assigned?t('Replace with approved photo','승인된 사진으로 교체'):t('Choose approved photo','승인 사진 선택')}</button>
    {assigned?.review_status==='pending'&&<button type="button" className="admin-secondary" disabled={locked} onClick={()=>void work(()=>reviewStock(assigned,'approved'))}>{t('Review & approve','검수 후 승인')}</button>}
   </>}
   <details><summary>{t('Image layout options','이미지 구성 옵션')}</summary><label>{t('AI image placement','AI 이미지 위치')}<select value={selectedAiSlot===null?'none':String(selectedAiSlot)} disabled={locked} onChange={e=>void changeAiCardSlot(e.target.value==='none'?null:Number(e.target.value))}><option value="none">{t('All real photos','모두 실사')}</option>{draftMediaPlan.aiChoices.map(slot=><option key={slot} value={slot}>{t('AI card','AI 카드')} {slot+1}</option>)}{selectedAiSlot!==null&&!draftMediaPlan.aiChoices.includes(selectedAiSlot)&&<option value={selectedAiSlot} disabled>{t('Saved AI card','저장된 AI 카드')} {selectedAiSlot+1}</option>}</select></label></details>
  </div>;
 }
 function renderMediaActions(){
  if(!draft)return null;
  const incomplete=!draft.images?.length||draft.images.length!==draft.carousel_slides?.length||draft.images.some((image:unknown)=>!image);
  if(!incomplete)return null;
  return <div id="roundy-marketing-photo-editor" className="marketing-inline-media-actions">
   <p role="status">{t('Real photos approved','실사 승인')} {stockReview?.approved??0}/{stockReview?.minimum??draftMediaPlan.realPhotos} — {stockReview?.ready?t('Ready to render','이미지 완성 준비됨'):t('Select Image on each card to assign or review photos.','각 카드의 이미지 변경에서 사진을 지정하고 검수하세요.')}</p>
   {!stockReview?.ready&&<button type="button" className="admin-secondary" disabled={busy||!!running||dirty} onClick={()=>void work(discoverStock)}>{t('Find missing photos','빠진 사진 검색')}</button>}
   <button type="button" className="admin-primary" disabled={busy||!!running||dirty||stockReview?.ready!==true} onClick={()=>void work(renderStock)}>{t('Finish card images','카드 이미지 완성')}</button>
  </div>;
 }
 if(loading)return <p role="status">{t('Loading marketing workspace…','마케팅 정보를 불러오는 중입니다…')}</p>;
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
     disabled={busy} onClick={()=>void work(()=>channel==='instagram'&&activeTab==='trend'?loadTrend():load(draft?.id))}>
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
   <span>{error||notice}</span>
   <button type="button" aria-label={t('Dismiss message','메시지 닫기')} onClick={()=>{setError('');setNotice('');}}>×</button>
  </div>}
  {channel==='instagram'&&<MarketingWorkflowNav locale={locale} activeTab={activeTab} items={tabItems} onNavigate={setActiveTab}/>}
  {channel==='instagram'&&activeTab==='overview'&&
   <><MarketingProductionMetrics metrics={generation?.workflow_metrics||null} locale={locale}/><AdminMarketingOverview locale={locale} drafts={data.drafts||[]} runs={data.runs||[]} settings={settings}
    onNavigate={tab=>setActiveTab(tab)}/></>}
  {channel==='instagram'&&activeTab==='assets'&&
   <AdminMarketingAssets locale={locale} onOpenDraft={id=>{
    const related=(data.drafts||[]).find((item:Row)=>item.id===id);
    if(related){selectDraft(related);setActiveTab('draft');}
    else {setActiveTab('publishing');setNotice(t(
     'This photo is linked to an earlier or already scheduled draft. Check publication history.',
     '해당 사진은 이전 초안 또는 발행 예약 콘텐츠에 연결되어 있습니다. 게시 기록을 확인하세요.'));}
   }}/>}
  {channel==='instagram'&&activeTab==='queue'&&
   <AdminMarketingQueue locale={locale} runs={data.runs||[]} onNavigate={tab=>setActiveTab(tab)}/>}
  {channel==='instagram'&&activeTab==='growth'&&<AdminMarketingGrowth locale={locale}/>}
  {channel==='instagram'&&activeTab==='reels'&&<AdminMarketingReels locale={locale}/>}
  {channel==='instagram'&&activeTab==='stories'&&<AdminMarketingStories locale={locale}/>}
  {channel==='instagram'&&activeTab==='draft'&&<>
   <details className="marketing-setup"><summary>{t('API cost and connection status','API 비용 및 연결 상태')}</summary><p className="admin-help">{t('App reservations and provider credits are separate. A remaining app budget does not prove the API account has credits.','앱 예약액과 외부 API 크레딧은 별개입니다. 앱 예산이 남아 있어도 API 계정의 크레딧 부족으로 중단될 수 있습니다.')}</p><p>{t('Reserved today','오늘 예약액')} ${Number(generation?.usage?.daily_reserved_usd||0).toFixed(2)} / ${Number(generation?.usage?.daily_budget_usd??5).toFixed(2)}. {t('This month','이번 달')} ${Number(generation?.usage?.monthly_reserved_usd||0).toFixed(2)} / ${Number(generation?.usage?.monthly_budget_usd??20).toFixed(2)}. {t('Paid generation attempts','오늘 유료 생성 시도')} {generation?.usage?.daily_attempts||0}. {t('Safety-counted jobs','안전 카운트')} {generation?.usage?.daily_calls||0}/{generation?.usage?.daily_call_limit??10}.</p><p className="admin-help">{t('No automatic paid retries or fallback. With Pexels configured, automatic posts use 2–3 rights-reviewed photographs and wait for approval of new images. Without Pexels, the existing AI visual flow remains. Overall daily/monthly AI budgets and generation limits remain the safety controls. External account spending is separate.','유료 API 자동 재시도나 자동 대체는 없습니다. Pexels 설정 시 자동 콘텐츠에 검수된 사진 2~3장을 사용하며 신규 사진은 승인을 기다립니다. Pexels 미설정 시 기존 AI 이미지 흐름을 유지합니다. 전체 일/월 AI 예산과 생성 횟수 한도가 비용 안전장치로 적용됩니다. 다른 서비스의 API 사용액은 이 한도에 포함되지 않습니다.')}</p>{generation?.usage?.daily_budget_override_expires_at&&<p className="admin-help">{t('Temporary daily limit is active until midnight KST. It will automatically fall back to the normal $5.00 limit.','오늘만 임시 한도가 적용 중입니다. KST 자정이 지나면 기본 $5.00 한도로 자동 복귀합니다.')}</p>}
    {!generation?.provider?.configured&&<p className="admin-error">{t('OPENAI_API_KEY is missing from this deployment. Configure Vercel Production and redeploy.','이 배포에 OPENAI_API_KEY가 없습니다. Vercel Production 설정 후 재배포가 필요합니다.')}</p>}
    {generation?.control?.blocked_reason&&<p className="admin-error" role="alert">{generation.control.blocked_reason}</p>}
    <button type="button" className="admin-secondary" onClick={()=>void (async()=>{try{const enable=blocked;if(enable&&!window.confirm(t('Resume after checking API configuration? Budgets are not reset and failed jobs are not retried.','API 설정을 확인했나요? 사용 한도를 초기화하거나 실패 작업을 재시도하지 않고 AI를 재개합니다.')))return;const r=await request('/generation/control',{enabled:enable,confirm_resume:enable},'PUT');if(!r.ok)throw new Error(r.data.error);setGeneration(r.data);}catch(e){setError(e instanceof Error?e.message:'Could not update AI control');}})()}>{blocked?t('Resume after checking configuration','설정 확인 후 AI 재개'):t('Pause paid AI','유료 AI 일시 중지')}</button>
   </details>
   {running&&<div className="generation-progress active" role="status" aria-live="polite"><strong>{stage(running.stage)}</strong><p>{t('You may leave this page. Returning only reads the existing job, never restarts it.','페이지를 나가도 이미 접수된 작업은 서버에서 처리합니다. 다시 접속해도 같은 작업을 새로 시작하지 않습니다.')}</p></div>}
   <details className="marketing-generator-card" open={generatorOpen||!draft} onToggle={e=>setGeneratorOpen(e.currentTarget.open)}><summary>{t("Create a new post","새 콘텐츠 만들기")}</summary>
    <div className="admin-section-title"><div><p className="admin-kicker">{t('Create','생성')}</p><Heading level={2}>{t('New content','새 콘텐츠 생성')}</Heading></div></div>
    <div className="admin-form">
     <div className="admin-two"><label><span>{t('Content topic','콘텐츠 주제')}</span><select name="new_content_type" value={basis==='growth_carousel'?topic:basis} disabled={busy||!!running} onChange={e=>{const next=generatorSelection(e.currentTarget.value);if(!next)return;setBasis(next.basis);if(next.topic)setTopic(next.topic);}}><optgroup label={t('Editorial card news','카드뉴스')}>{topics.map((key,index)=><option key={key} value={key}>{t(key.replaceAll('_',' '),topicKo[index])}</option>)}</optgroup><optgroup label={t('Roundy promotion','라운디 홍보')}><option value="prelaunch">{t('Pre-launch','오픈 전 홍보')}</option><option value="live_event">{t('Live event','정식 이벤트')}</option></optgroup></select></label><label><span>{t('Images','이미지 방식')}</span><select name="new_visual_source" value={manualVisualSource} disabled={busy||!!running} onChange={e=>setManualVisualSource(e.currentTarget.value as 'stock'|'uploaded'|'none')}><option value="stock">{t('AI cover + reviewed photos','AI 표지 + 검수된 실사')}</option><option value="uploaded">{t('Use my images','내 이미지 사용')}</option><option value="none">{t('Write copy first','원고부터 작성')}</option></select></label></div>
     <label><span>{t('Cover / headline language','표지 / 제목 언어')}</span><select value={contentLanguage} onChange={e=>setContentLanguage(e.target.value as 'ko'|'en')}><option value="ko">{t('Korean post','한국어 콘텐츠')}</option><option value="en">{t('English post','영어 콘텐츠')}</option></select></label>
     {basis==='live_event'?<div className="admin-two"><label><span>{t('Event to promote','홍보할 이벤트')}</span><select value={eventId} onChange={e=>setEventId(e.target.value)}><option value="">{t('Choose an event','이벤트 선택')}</option>{(data.live_events||[]).map((event:Row)=><option key={event.id} value={event.id}>{event.title_ko||event.title} · {new Date(event.starts_at).toLocaleDateString(locale,{timeZone:'Asia/Seoul'})}</option>)}</select></label><label><span>{t('Campaign stage','홍보 단계')}</span><select value={eventCampaignStage} onChange={e=>setEventCampaignStage(e.target.value)}><option value="auto">{t('Auto from event status','이벤트 상태로 자동 추천')}</option><option value="launch">{t('Launch','오픈')}</option><option value="experience">{t('Experience','참가 경험')}</option><option value="venue">{t('Venue','장소')}</option><option value="participants">{t('Participants','참가자 구성')}</option><option value="momentum">{t('Momentum / offer','모멘텀 / 혜택')}</option><option value="imminent">{t('Imminent','임박')}</option><option value="last_call">{t('Last call','라스트콜')}</option></select></label></div>:null}
     {basis==='growth_carousel'&&<label><span>{t('Story length before generation','원고 작성 전 장수 선택')}</span><select value={storyCardCount} disabled={settings?.carousel_mode==='alternating'} onChange={e=>setStoryCardCount(Number(e.target.value) as 0|3|5)}><option value={0}>{t('Use current schedule','현재 발행 설정 따르기')}</option><option value={3}>{t('Short: 3 story cards','짧은 소재: 본문 3장')}{settings?.carousel_brand_outro_enabled?' + 1 Roundy':''}</option><option value={5}>{t('In-depth: 5 story cards','자료가 충분한 소재: 본문 5장')}{settings?.carousel_brand_outro_enabled?' + 1 Roundy':''}</option></select><small>{t('Choose before writing. Existing drafts and alternating reservations keep their original size.','작성 전에 선택합니다. 기존 초안과 교대 발행 예약의 장수는 유지됩니다.')}</small></label>}
     {manualVisualSource==='stock'?<div className="marketing-mix-options">
       <strong>{t('Mix images per card','카드별 이미지 구성')}</strong>
       <p className="admin-help" hidden={!newMediaPlan.known}>{t('Story cards','본문 카드')} {selectedStoryCount}{newBranded?t(' + one standalone Roundy card',' + 독립 라운디 소개 1장'):''}. {t('Real photos needed','필요한 실사')} {Math.max(0,plannedPhotoCount)}{t('. Each story card has its own image.','. 모든 본문 카드에는 이미지가 한 장씩 들어갑니다.')}</p>
       {!newMediaPlan.known&&<p className="admin-help">{t('The alternating schedule determines 3 or 5 story cards. Exact photo counts appear after generation.','교대 발행 순서에 따라 스토리 3장 또는 5장으로 결정됩니다. 생성 후 정확한 사진 장수를 표시합니다.')}</p>}
       {newMediaPlan.aiAllowed
        ?<div className="marketing-image-choice-grid" role="group" aria-label={t('Choose AI image card','AI 이미지 카드 선택')}>
          {(newBranded?[0]:[0,1,2,3]).map(slot=><button key={slot} type="button"
           aria-pressed={newMediaPlan.aiSlot===slot} onClick={()=>setAiImageSlot(slot)}
           className={newMediaPlan.aiSlot===slot?'selected':''}>
           <small>{String(slot+1).padStart(2,'0')}</small>
           <strong>{slot===0?t('Cover','표지'):slot===1?t('Context','배경'):t('Insight','인사이트')+' '+(slot-1)}</strong>
           <span>{newMediaPlan.aiSlot===slot?'AI':t('Real photo','실사')}</span>
          </button>)}
         <button type="button" className={newMediaPlan.aiSlot===null?'selected':''} aria-pressed={newMediaPlan.aiSlot===null} onClick={()=>setAiImageSlot(null)}>{t('All real photos','모두 실사')}</button></div>
        :<p className="admin-help">{t('The selected 3/5-card schedule or photo minimum does not allow an AI image slot. All required visuals must be real photos.','현재 3/5장 발행 설정 또는 실사 최소 기준에서는 AI 이미지 위치를 미리 지정할 수 없습니다. 필요한 이미지에는 실사를 사용합니다.')}</p>}
       <p className="admin-help">{t('The optional AI cover is generated only after all required real photos are approved. Approved images can be reused deliberately.','선택한 AI 표지는 필요한 실사 사진을 모두 승인한 뒤 생성됩니다. 승인된 사진을 직접 골라 재사용할 수 있습니다.')}</p>
      </div>:manualVisualSource==='uploaded'?<div className="marketing-setup">
      <strong>{t('Add images now','이미지 바로 추가')}</strong>
      <p className="admin-help">{t('Select 1–6 images here. When you generate, Roundy will create the copy, create a Draft, upload these files, and render the final cards automatically. Image AI is not called.','여기서 이미지를 1–6장 선택하세요. 콘텐츠 생성 시 문구 생성 → 초안 생성 → 이미지 업로드 → 최종 카드 렌더까지 자동으로 이어집니다. 이미지 AI는 호출하지 않습니다.')}</p>
      <div className="admin-two"><label><span>{t('New files are','새 파일 유형')}</span><select value={pendingAssetType} onChange={e=>setPendingAssetType(e.target.value as 'photo'|'completed_card')}><option value="photo">{t('Photo source','사진 소스')}</option><option value="completed_card">{t('Completed 4:5 card','완성 4:5 카드')}</option></select></label><label><span>{t('Choose images','이미지 선택')}</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy||!!running} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';void work(()=>addPendingMarketingImages(files));}}/></label></div>
      <div className="marketing-draft-inbox">{pendingMarketingImages.map((item,index)=><article className="marketing-draft-card" key={item.id}><img src={item.preview} alt={item.file.name}/><div className="marketing-draft-copy"><strong>{index+1}. {item.file.name}</strong><small>{Math.round(item.file.size/1024)} KB · {item.width}×{item.height}</small><select value={item.asset_type} onChange={e=>updatePendingMarketingImageType(item.id,e.target.value as 'photo'|'completed_card')}><option value="photo">{t('Photo source','사진 소스')}</option><option value="completed_card">{t('Completed 4:5 card','완성 4:5 카드')}</option></select></div><div className="admin-form-actions"><button type="button" className="admin-secondary" disabled={busy||index===0} onClick={()=>movePendingMarketingImage(index,-1)}>↑</button><button type="button" className="admin-secondary" disabled={busy||index===pendingMarketingImages.length-1} onClick={()=>movePendingMarketingImage(index,1)}>↓</button><button type="button" className="admin-secondary" disabled={busy} onClick={()=>removePendingMarketingImage(item.id)}>{t('Remove','제거')}</button></div></article>)}</div>
      {!pendingMarketingImages.length&&<p className="admin-help">{t('No images selected yet. JPEG, PNG or WebP, max 10 MB each.','아직 선택한 이미지가 없습니다. JPEG, PNG, WebP, 장당 최대 10MB입니다.')}</p>}
     </div>:<p className="admin-help">{t('Copy only: no images are generated. You can add visuals later.','문구만: 이미지를 생성하지 않습니다. 나중에 비주얼을 추가할 수 있습니다.')}</p>}
     {basis==='growth_carousel'&&<label><span>{t('Reader-first content direction','독자 중심 콘텐츠 방향')}</span>
      <select value={editorialLane} onChange={e=>setEditorialLane(e.target.value)}>
       <option value="auto">{t('Automatic editorial choice','자동 기획')}</option>
       <option value="seoul">{t('Dates & Seoul discoveries','데이트 및 서울의 발견')}</option>
       <option value="relationship">{t('Dating & relationships','연애와 인간관계')}</option>
       <option value="social">{t('Practical social skills','실용적인 소셜 팁')}</option>
       <option value="brand">{t('Roundy & meeting culture','Roundy와 만남 문화')}</option>
      </select>
      <small>{t('Guides the angle; the selected content category, source evidence and manual approval still apply.','접근 방식만 지정하며 선택된 주제 유형, 출처 검증과 수동 승인은 그대로 유지됩니다.')}</small>
     </label>}
     <label><span>{t('Creative direction','커스텀 지시문')}</span><textarea value={direction} maxLength={500} rows={4} onChange={e=>setDirection(e.target.value)}/><small>{direction.length}/500</small></label>
     <p className="admin-help">{t('Roundy logo, coral accents and typography are composed server-side for photo-source cards. Completed 4:5 cards are used without additional design overlays.','사진 소스 카드는 Roundy 로고, 코랄 강조와 타이포를 서버에서 합성합니다. 완성된 4:5 카드는 추가 디자인 합성 없이 그대로 사용합니다.')}</p>
     {basis==='growth_carousel'&&['book_insight','trend_research','dating_myth'].includes(topic)&&<p className="admin-help">{t('High-context research may use up to three targeted searches before one structured writing request. Missing evidence triggers one safe fallback when possible.','고품질 검색으로 목적별 검색을 최대 3회 사용한 뒤 구조화된 문구를 작성합니다. 근거가 부족하면 가능한 경우 안전한 비연구 콘텐츠로 1회 전환합니다.')}</p>}
     <p className="admin-help">{t('Caption order: Korean → English → sources → tagline and 5 relevant tags. Tags are selected for topic relevance; live search volume is not measured.','캡션 순서: 국문 → 영어 → 출처 → 태그라인과 관련 태그 5개. 태그는 주제 관련성으로 선별하며 실시간 검색량 순위는 아닙니다.')}</p>
     <button type="button" className="admin-primary" disabled={busy||!!running||blocked||(manualVisualSource==='uploaded'&&!pendingMarketingImages.length)} onClick={()=>void generate(false)}>{manualVisualSource==='uploaded'?t('Generate with my images','내 이미지로 콘텐츠 생성'):t('Generate content','콘텐츠 생성')}</button>
    </div>
   </details>
   <div className="admin-section-title"><div><p className="admin-kicker">{t('Working inbox','작업함')}</p><Heading level={2}>{t('Drafts','초안')}</Heading><p>{t('Only editable drafts appear here. Scheduled and published posts move to Publishing history.','편집 가능한 초안만 표시됩니다. 예약 또는 게시된 콘텐츠는 게시 기록으로 이동합니다.')}</p></div><button type="button" className="admin-secondary" onClick={()=>setActiveTab('generation')}>{t('Add from generated results','생성 결과에서 가져오기')}</button></div>
   <div className="marketing-draft-inbox">{editableDrafts.length?editableDrafts.map((item:Row)=>{const publication=publicationInfo(item);return <article className={'marketing-draft-card '+(draft?.id===item.id?'selected':'')} key={item.id}>{item.images?.[0]?<img src={item.images[0]} alt="" />:<span className="marketing-draft-thumb placeholder"/>}<div className="marketing-draft-copy"><strong>{contentTitle(item)}</strong><p>{contentLabel(item)} · {item.content_language==='en'?'EN':'KO'} · {workflowText(item)}</p><small><span className={'marketing-status-pill '+publication.status}>{publication.label}</span> · {new Date(item.imported_at||item.updated_at).toLocaleString(locale,{timeZone:'Asia/Seoul'})}</small></div><button type="button" className={draft?.id===item.id?'admin-primary':'admin-secondary'} disabled={busy||!!running} onClick={()=>{if(dirty&&!window.confirm(t('Discard unsaved changes?','저장하지 않은 수정을 버릴까요?')))return;selectDraft(item);}}>{draft?.id===item.id?t('Editing','편집 중'):t('Edit','편집')}</button></article>}):<div className="admin-empty"><p>{t('No editable drafts yet. Generate content above; the new draft opens here automatically.','아직 편집 가능한 초안이 없습니다. 위에서 콘텐츠를 생성하면 새 초안이 여기에 자동으로 열립니다.')}</p><button type="button" className="admin-secondary" onClick={()=>setActiveTab('generation')}>{t('Open Generation history','생성 기록 열기')}</button></div>}</div>
   {!draft?<p className="admin-empty">{t('Select a working draft above to edit it.','위 작업함에서 편집할 초안을 선택하세요.')}</p>:<div className={isMagazine?"marketing-layout marketing-layout-unified":"marketing-layout"}><div className="admin-form marketing-editor"><MarketingWorkflowSteps draft={currentPreflight?{...draft,quality_report:currentPreflight.quality_report}:draft} locale={locale}/><details className="marketing-editor-meta"><summary>{t("Draft details","초안 정보")}</summary><p>{draft.generation_reason}</p><p>{draft.draft_date} / v{draft.revision} / {draft.status} / {draft.content_language==='en'?t('English content','영어 콘텐츠'):t('Korean content','한국어 콘텐츠')}</p><p>{t('Recommended window','추천 게시 시간')}: {draft.window_start_kst?.slice(0,5)}–{draft.window_end_kst?.slice(0,5)} KST</p></details>
    {!isMagazine&&draft.content_document?.answer_first===true&&Array.isArray(draft.content_document?.thumbnail_candidates)&&
     <div className="marketing-setup marketing-copy-options">
      <div className="marketing-copy-options-head"><span className="admin-kicker">COPY OPTIONS / 03</span>
       <strong>{t('Choose from three headline copy options','썸네일 카피 후보 3개 중 선택')}</strong>
      </div>
      <p className="admin-help">{t(isMagazine?'Choose an answer-first cover headline. Cover → Context → Insights → Editorial Closing.':'Choose one of three evidence-aware result headlines.',isMagazine?'핵심 결론형 표지를 선택하세요. 표지 → 배경 → 인사이트 → 에디토리얼 마무리.':'핵심 결론을 담은 표지 문구를 선택하세요.')}</p>
      <div className="marketing-copy-options-grid">
       {(draft.content_document.thumbnail_candidates as string[]).map((title:string,index:number)=>{
        const selected=Number(draft.content_document.thumbnail_selected_index??0)===index;
        return <article className={'marketing-copy-option '+(selected?'selected':'')} key={index}>
         <div className="marketing-copy-option-number">{String(index+1).padStart(2,'0')}</div>
         <div className="marketing-draft-copy"><strong>{title}</strong><small>{selected?t('Selected headline','선택된 썸네일 카피'):t('Alternative headline','다른 썸네일 카피')}</small></div>
         <button type="button" className={selected?'admin-primary':'admin-secondary'} aria-pressed={selected}
          disabled={busy||!!running||dirty||draft.status!=='needs_approval'||selected}
          onClick={()=>void work(async()=>{
           const response=await mutate('/draft/'+draft.id+'/thumbnail',{revision:draft.revision,index},'PATCH');
           await load(draft.id);
           setNotice(response.rerender_required?t('Headline selected. Re-render the cover before publishing.','썸네일 문구를 선택했습니다. 게시 전에 기존 이미지를 다시 렌더링하세요.'):t('Headline selected. Run the free quality recheck before publishing.','문구 선택을 저장했습니다. 게시 전 무료 품질 검사를 실행하세요.'));
          })}>{selected?t('Selected','선택됨'):t('Choose copy','카피 선택')}</button>
        </article>;
       })}
      </div>
      {draft.content_document.thumbnail_render_pending===true&&
       <div className="admin-form">
        <p className="admin-error" role="alert">{t('The saved images still contain the previous cover copy. Publishing is blocked until the selected headline has been rendered.','저장된 이미지에는 이전 썸네일 문구가 남아 있습니다. 선택한 문구로 다시 렌더링하기 전까지 발행할 수 없습니다.')}</p>
        <button type="button" className="admin-primary" disabled={busy||!!running||dirty} onClick={()=>void generate(false,true)}>
         {t('Re-render with selected headline','선택한 문구로 기존 렌더링 다시 실행')}
        </button>
        <p className="admin-help">{t('Uses the existing image-only regeneration process; AI image costs may apply. No automatic publication.','기존 이미지 재생성 기능을 사용하며 AI 이미지 생성 비용이 발생할 수 있습니다. 자동 발행하지 않습니다.')}</p>
       </div>}
     </div>}
    {isMagazine&&<AdminMarketingEditorialStudio
      draft={draft} locale={locale} disabled={busy||!!running||captionDirty||draft.status!=='needs_approval'}
      onUpdated={changed=>{selectDraft(changed);void load(changed.id).catch(e=>setError(String(e?.message||e)));}}
      onRequestAiEdit={index=>setRegenerationFocus(v=>({index,nonce:(v?.nonce||0)+1}))}
      onRequestPhotoEdit={()=>document.getElementById('roundy-marketing-photo-editor')?.scrollIntoView({behavior:'smooth',block:'start'})}
      onWorkingChange={setEditorBusy} onUnsavedChange={setEditorDirty}
      renderPhotoEditor={['stock','pexels'].includes(String(draft.visual_source))?renderCardPhotoEditor:undefined}
      renderAiEditor={index=><AdminMarketingCardRewrite draft={draft} index={index} locale={locale} disabled={requestBusy||!!running||captionDirty} onWorkingChange={setEditorBusy} onCreated={changed=>{selectDraft(changed);void load(changed.id).catch(e=>setError(String(e?.message||e)));}}/>}
      mediaActions={['stock','pexels'].includes(String(draft.visual_source))?renderMediaActions():null}
      onRerenderCover={()=>void generate(false,true)}/>}
    {!isMagazine&&draft.status==='needs_approval'&&Array.isArray(draft.carousel_slides)&&draft.carousel_slides.length>0&&
     <div className="marketing-setup">
      <strong>MAGAZINE EDITORIAL V2</strong>
      <p className="admin-help">{t('Historical published assets stay untouched. Rebuild ONLY this unpublished draft with CTA-free copy and newly reviewed photo panels. Standard image-only render preserves the original template.','기존 게시물은 보존합니다. 이 미발행 초안만 CTA 없는 매거진 문구와 사진 레이아웃으로 재생성할 수 있습니다. 일반 이미지 재렌더는 원래 버전을 유지합니다.')}</p>
      <button type="button" className="admin-secondary" disabled={busy||!!running||dirty}
       onClick={()=>void upgradeLegacyDraftToMagazine()}>{t('Rebuild this draft as Magazine v2','이 초안을 Magazine v2로 전환해 재생성')}</button>
     </div>}
    {!isMagazine&&['pexels','stock'].includes(String(draft.visual_source))&&<div id="roundy-marketing-photo-editor" className="marketing-setup marketing-card-visual-editor">
      <div className="marketing-visual-editor-header">
       <strong>{t('Image mix and approved photo assignments','이미지 혼합 및 승인 사진 지정')}</strong>
       <p>{t('Assign an approved photo to each real-image card. AI generates only the selected card after all required photos are approved.',
        '실사 카드는 승인 사진을 직접 지정하고, AI 카드는 실사 승인 완료 후에만 생성합니다.')}</p>
      </div>
      <div className="marketing-image-layout-control">
       <label><span>{t('AI image placement','AI 이미지 위치')}</span>
        <select value={selectedAiSlot===null?'none':String(selectedAiSlot)}
         disabled={busy||!!running||dirty||draft.status!=='needs_approval'}
         onChange={e=>{const next=e.target.value==='none'?null:Number(e.target.value);void changeAiCardSlot(next);}}>
         <option value="none">{t('All real photos','모두 실사')}</option>
         {draftMediaPlan.aiChoices.map(slot=>
          <option value={slot} key={slot}>{t('Card','카드')} {slot+1} — {slot===0?t('Cover','표지'):slot===1?t('Context','배경'):t('Insight','인사이트')}</option>)}
         {selectedAiSlot!==null&&!draftMediaPlan.aiChoices.includes(selectedAiSlot)&&<option value={selectedAiSlot} disabled>{t('Saved AI card','저장된 AI 카드')} {selectedAiSlot+1}</option>}
        </select>
       </label>
       <small>{t('Required real photos','필요한 실사')}: {draftMediaPlan.realPhotos}{draftMediaPlan.brand?t('. The final Roundy introduction is a separate card.','. 마지막 라운디 소개는 독립 카드입니다.'):t('. This saved legacy layout is preserved.','. 기존 저장 형식을 유지합니다.')}</small>
      </div>
      <div className="marketing-photo-slot-grid">
       {(draft.carousel_slides||[]).slice(0,-1).map((slide:Row,index:number)=>{
        const ai=index===selectedAiSlot;
        const real=realPhotoSlots.includes(index);
        if(!ai&&!real)return null;
        const assigned=stockPhotos.find((photo:Row)=>Number(photo.slot)===index);
        const status=assigned?.review_status||'missing';
        return <article className="marketing-photo-slot" key={index}>
         <div className="marketing-photo-slot-media">
          {real&&assigned?.preview_url?<img src={assigned.preview_url} alt={t('Assigned photo','지정된 실사')}/>:<span>{ai?'AI':t('Photo','실사')}</span>}
         </div>
         <div className="marketing-photo-slot-info">
          <div className="marketing-photo-slot-title">
           <small>{t('Card','카드')} {index+1} / {String(slide.role||'').replaceAll('_',' ').toUpperCase()}</small>
           <strong>{String(slide.title||'').slice(0,70)}</strong>
          </div>
          <p>{ai?t('AI image, generated after real-photo approval','필요한 실사 승인 후 AI 생성'):
           status==='approved'?t('Approved photo selected','승인된 실사 지정됨'):
           status==='pending'?t('New photo: rights review needed','신규 사진: 저작권 검수 필요'):
           t('No photo assigned yet','아직 지정된 사진 없음')}</p>
          {real&&<div className="marketing-photo-slot-actions">
            <button type="button" className="admin-secondary" disabled={busy||!!running||dirty||draft.status!=='needs_approval'}
             onClick={()=>void showApprovedPhotoPicker(index)}>
             {t('Choose approved photo','승인 사진 선택')}
            </button>
            {status==='pending'&&assigned&&<button type="button" className="admin-secondary" disabled={busy||!!running}
              onClick={()=>void work(()=>reviewStock(assigned,'approved'))}>{t('Review & approve','검수 후 승인')}</button>}
          </div>}
          {real&&assigned&&<small className="marketing-photo-slot-credit">
            {assigned.photographer} / {assigned.provider}
            {assigned.source_url&&<> · <a href={assigned.source_url} target="_blank" rel="noopener noreferrer">{t('Original','원본')}</a></>}
            {assigned.license_url&&<> · <a href={assigned.license_url} target="_blank" rel="noopener noreferrer">{t('License','라이선스')}</a></>}
          </small>}
         </div>
        </article>;
       })}
      </div>
      <div className="marketing-photo-editor-footer">
       <p role="status">{t('Real photos approved','실사 승인')} {stockReview?.approved??stockPhotos.filter((p:Row)=>p.review_status==='approved').length}/{stockReview?.minimum??draft.content_document?.photo_sourcing?.min_real_photos??3}
        {' — '}{stockReview?.ready?t('Ready to render','렌더링 준비됨'):t('Needs assignments or review','사진 지정 및 검수 필요')}</p>
       {stockReview?.configured===false&&<p className="admin-error">{t('Some providers require API keys. Approved library photos remain selectable.','일부 소스에는 API 키가 필요하지만 이미 승인된 사진은 선택할 수 있습니다.')}</p>}
       <div className="admin-form-actions marketing-photo-render-actions">
        <button type="button" className="admin-secondary" disabled={busy||!!running||!!draft.images?.length}
          onClick={()=>void work(discoverStock)}>{t('Find photos for missing slots','빈 슬롯 사진 검색')}</button>
        <button type="button" className="admin-primary" disabled={busy||!!running||dirty||stockReview?.ready!==true||!!draft.images?.length}
          onClick={()=>void work(renderStock)}>{selectedAiSlot===null?t('Render reviewed photos','승인 실사로 렌더링'):t('Render real photos + one AI card','실사 + AI 카드 렌더링')}</button>
       </div>
       {!!draft.images?.length&&<p className="admin-help">{t('Cards are already rendered. Changing any photo or AI slot will clear the rendered set and require a fresh render.',
        '이미 렌더링된 카드입니다. 이미지 배치를 변경하면 기존 결과는 무효화되며 다시 렌더링해야 합니다.')}</p>}
      </div>
     </div>}
     {!['pexels','stock'].includes(String(draft.visual_source))&&draft.generation_source==='manual'&&draft.draft_role==='candidate'&&<div id="roundy-marketing-photo-editor" className="marketing-setup">
     <strong>{t('Manual images','직접 이미지')}</strong>
     <p className="admin-help">{t('Upload 1–6 JPEG, PNG or WebP files (max 10 MB each). Photo source adds Roundy typography; completed card is used as-is. Uploaded rendering makes no image-AI request.','JPEG, PNG, WebP 이미지를 1–6장 업로드할 수 있습니다(장당 최대 10MB). 사진 소스는 Roundy 타이포를 합성하고, 완성 카드는 그대로 사용합니다. 업로드 렌더에서는 이미지 AI를 호출하지 않습니다.')}</p>
     <div className="admin-two"><label><span>{t('Upload type','업로드 유형')}</span><select value={uploadAssetType} onChange={e=>setUploadAssetType(e.target.value as 'photo'|'completed_card')}><option value="photo">{t('Photo source','사진 소스')}</option><option value="completed_card">{t('Completed 4:5 card','완성 4:5 카드')}</option></select></label><label><span>{t('Add images','이미지 추가')}</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy||!!running} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';void work(()=>uploadMarketingImages(files));}}/></label></div>
     <div className="ordered-image-list">{uploadedImages.map((img:Row,index:number)=><div key={img.id} className="marketing-draft-card">{img.signed_url?<img src={img.signed_url} alt=""/>:<span className="marketing-draft-thumb placeholder"/>}<div className="marketing-draft-copy"><strong>{index+1}. {img.asset_type==='completed_card'?t('Completed card','완성 카드'):t('Photo source','사진 소스')}</strong><select value={img.role} onChange={e=>void work(()=>updateUpload(img.id,{role:e.target.value}))}><option value="cover">{t('Cover','표지')}</option><option value="body">{t('Body','본문')}</option><option value="flexible">{t('Flexible','자동 배치')}</option></select></div><div className="admin-form-actions"><button type="button" className="admin-secondary" disabled={busy||index===0} onClick={()=>void work(()=>moveUpload(index,-1))}>↑</button><button type="button" className="admin-secondary" disabled={busy||index===uploadedImages.length-1} onClick={()=>void work(()=>moveUpload(index,1))}>↓</button><button type="button" className="admin-secondary" disabled={busy} onClick={()=>void work(()=>deleteUpload(img.id))}>{t('Delete','삭제')}</button></div></div>)}</div>
     <button type="button" className="admin-primary" disabled={busy||!!running||dirty||uploadedImages.length===0} onClick={()=>void work(renderUploaded)}>{t('Render with uploaded images — $0 image AI','업로드 이미지로 렌더 — 이미지 AI $0')}</button>
    </div>}
    <details className="marketing-editor-advanced" open={advancedRegenOpen} onToggle={e=>setAdvancedRegenOpen(e.currentTarget.open)}><summary>{t('Version history and advanced changes','버전 기록 및 전체 수정')}</summary>
    {advancedRegenOpen&&<AdminMarketingRegeneration sourceId={String(draft.id)} locale={locale} focusSlide={regenerationFocus}
      onCreated={created=>{selectDraft(created);void load(created.id).catch(e=>setError(String(e?.message||e)));setActiveTab('draft');}}/>}</details>
     <details className="marketing-editor-caption"><summary>{t('Edit caption','캡션 수정')}</summary><label><span>{t('Caption','캡션')}</span><textarea rows={10} value={draft.caption||''} maxLength={2000} disabled={busy||!!running||editorDirty||draft.status!=='needs_approval'} onChange={e=>changeDraft('caption',e.target.value)}/></label></details>
    {isMagazine?null:<><label><span>CTA</span><input value={draft.cta||''} maxLength={70} disabled={busy||!!running||draft.status!=='needs_approval'} onChange={e=>changeDraft('cta',e.target.value)}/></label>
    <label><span>{t('Destination','연결 주소')}</span><input value={draft.destination_url||''} disabled={busy||!!running||draft.status!=='needs_approval'} onChange={e=>changeDraft('destination_url',e.target.value)}/></label></>}
    {draft.research_status==='generated_without_sources'&&<p className="admin-error" role="alert">{t('Web Search completed, but OpenAI did not return source metadata. Fact-check this draft manually before publishing.','Web Search는 완료됐지만 OpenAI가 출처 메타데이터를 반환하지 않았습니다. 게시 전에 내용의 사실관계를 직접 확인하세요.')}</p>}
    {!!draft.research_sources?.length&&<div className="growth-sources">{draft.research_sources.map((s:Row)=><a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.publisher||s.title}</a>)}</div>}
    <section className="marketing-publish-review" aria-label={t('Publishing readiness','게시 준비 상태')}>
     <div className="marketing-publish-review-head"><strong>{preflightReady?t('Ready for your final approval','최종 승인 후 게시할 수 있습니다'):currentPreflight?t('Before publishing','게시 전 확인'):t('Checking this version…','현재 버전 확인 중…')}</strong><button type="button" className="admin-secondary" disabled={busy||!!running} onClick={()=>{setPreflightState(null);setPreflightSerial(v=>v+1);}}>{t('Refresh checks','검사 새로고침')}</button></div>
     {currentPreflight&&!preflightReady&&<div className="marketing-quality-status" role="status">{[...new Set([...(currentPreflight.quality_report?.issues||[]),...preflightChecks.filter(check=>!check.passed).flatMap(check=>check.issues?.length?check.issues:[check.detail])].filter(Boolean))].map((issue:any)=><p key={String(issue)}>{String(issue)}</p>)}</div>}
     <details><summary>{t('Automatic checks','자동 검사')} {preflightChecks.filter(check=>check.passed).length}/7</summary>{preflightChecks.map(check=><p key={check.id}>{check.passed?'✓':'✕'} {locale==='ko'?check.label:localizedCheck[String(check.id)]||check.label}</p>)}</details>
    </section>
    {draft.status==='needs_approval'&&<div id="roundy-marketing-approval" className="admin-form-actions"><button type="button" className="admin-secondary" hidden={!captionDirty} disabled={busy||!!running||editorDirty||!captionDirty} onClick={()=>void work(async()=>{await mutate('/draft/'+draft.id,{revision:draft.revision,caption:draft.caption,cta:draft.cta,destination_url:draft.destination_url},'PUT');await load(draft.id);})}>{t('Save edits','수정 저장')}</button><button type="button" className="admin-primary" disabled={busy||!!running||dirty||!preflightReady||!draft.caption?.trim()||!draft.images?.length||instagramNeedsReconnect} onClick={()=>{if(window.confirm(t('Approve this exact revision and schedule it for Instagram?','현재 버전의 문구와 이미지를 승인하고 Instagram 게시를 예약할까요?')))void work(async()=>{const result=await mutate('/draft/'+draft.id+'/approve',{revision:draft.revision});await load(draft.id);
  const when=result.run?.scheduled_for?new Date(result.run.scheduled_for).toLocaleString(locale,{timeZone:'Asia/Seoul'}):'';
  setNotice(t('Approved and reserved for ','승인 완료, 발행 예약: ')+when+' KST');});}}>{t('Approve & schedule','승인 후 예약')}</button><button type="button" className="admin-secondary" disabled={busy||!!running||dirty||!preflightReady||!draft.caption?.trim()||!draft.images?.length||instagramNeedsReconnect} onClick={()=>{if(window.confirm(t('Publish this exact saved revision to @roundy.meet NOW? This bypasses the recommended posting time and cannot be undone here.','현재 저장된 버전을 @roundy.meet에 지금 바로 게시할까요? 추천 게시 시간을 무시하며 여기서 게시를 되돌릴 수 없습니다.')))void work(async()=>{const result=await mutate('/draft/'+draft.id+'/publish-now',{revision:draft.revision});await load(draft.id);setNotice(result.published?t('Published to @roundy.meet.','@roundy.meet에 바로 게시했습니다.'):result.needs_review?t('Publish attempt needs review. Check Instagram before resolving it.','게시 결과 확인이 필요합니다. 처리 전에 Instagram에서 실제 게시 여부를 확인하세요.'):result.deferred?t('Daily Feed limit reached. Reserved for '+String(result.feed_date_kst)+' KST.','Feed 일일 한도를 초과해 '+String(result.feed_date_kst)+' KST로 예약했습니다.'):t('Queued for immediate publishing. Refresh status before trying again.','즉시 게시 큐에 넣었습니다. 다시 누르기 전에 상태를 새로고침하세요.'));});}}>{t('Publish now','바로 게시')}</button><button type="button" className="admin-secondary" disabled={busy||!!running} onClick={()=>{
   const target=draft;
   if(!window.confirm(t('Skip this draft? It will leave the review inbox without publishing. Any unsaved edits will be discarded.','이 초안을 건너뛸까요? 게시되지 않고 승인 대기함에서 제외됩니다. 저장하지 않은 수정사항은 사라집니다.')))return;
   void work(async()=>{
    const title=contentTitle(target),shortId=String(target.id).slice(0,8);
    const remaining=(data.drafts||[]).filter((row:Row)=>row.id!==target.id).length;
    await mutate('/draft/'+target.id+'/skip',{revision:target.revision});
    await load();
    setNotice(t('Skipped: '+title+' (#'+shortId+'). '+remaining+' drafts remain. Similar-looking drafts are separate records.','건너뛰기 완료: '+title+' (#'+shortId+'). 남은 승인 대기 초안 '+remaining+'건. 같은 제목의 콘텐츠도 각각 별도 초안입니다.'));
   });
  }}>{t('Skip','건너뛰기')}</button></div>}
    {draft.status==='needs_approval'&&publishingBlockers.length>0&&<p className="admin-error marketing-publish-blockers" role="status">
     {t('Why publishing is disabled: ','게시할 수 없는 이유: ')+publishingBlockers.join(' / ')}
    </p>}
    <p className="admin-help">{t('Generation never publishes. Copy is saved before images, so an image failure does not lose it.','생성만으로는 게시되지 않습니다. 이미지를 만들기 전에 문구부터 저장하므로 이미지 생성이 실패해도 문구는 남습니다.')}</p>
   </div>{!isMagazine&&<MarketingMobilePreview draft={draft} locale={locale}/>}</div>}
  </>}
  {channel==='instagram'&&activeTab==='generation'&&<section className="marketing-tab-panel">
   <div className="admin-section-title"><div><p className="admin-kicker">{t('Activity','활동')}</p><Heading level={2}>{t('Generation history','생성 기록')}</Heading></div><button type="button" className="admin-secondary" disabled={busy} onClick={()=>void work(()=>load(draft?.id))}>{t('Refresh','새로고침')}</button></div>
   <div className="marketing-filter-chips" role="group" aria-label={t('Generation status filter','생성 상태 필터')}>{([['all',t('All','전체')],['completed',t('Ready','최종 검토 가능')],['review',t('Next step','보완 및 다음 작업')],['failed',t('System issues','시스템 오류')],['running',t('Running','진행 중')]] as const).map(([value,label])=><button type="button" key={value} aria-pressed={generationFilter===value} onClick={()=>{setGenerationFilter(value);setGenerationVisible(20);}}>{label}</button>)}</div>
   <div className="marketing-log-list">{visibleGenerationThreads.length?visibleGenerationThreads.map((thread:Row)=>{
    const latest=thread.latest as Row,root=thread.root as Row,attempts=thread.attempts as Row[],record=contentRecordForAttempts(attempts);
    const canRetry=latest.status==='failed'&&!latest.automatic&&!!latest.request_payload,publication=publicationInfo(record);
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
        {canRetry&&latest.error_code==='TOPIC_CANDIDATES_DISCARDED'&&!candidate.reasons?.some((reason:string)=>/duplicate|중복|유사|invalid/i.test(reason))&&<button type="button" className="admin-secondary" disabled={busy||!!running} onClick={()=>void retryJob(latest,candidate.angle_key)}>{t('Use this topic and continue','이 주제로 이어서 작성')}</button>}
       </li>)}</ol>
      </details>}
      <dl><div><dt>{t('Content workflow ID','콘텐츠 작업 ID')}</dt><dd>{thread.id}</dd></div><div><dt>{t('Steps','작업 단계')}</dt><dd>{thread.stepCount}</dd></div><div><dt>{t('Total reserved','총 예약액')}</dt><dd>{'$'+Number(thread.total_reserved_usd).toFixed(2)}</dd></div></dl>
      {attempts.some((a:Row)=>a.result_snapshot)&&<button type="button" className="admin-primary" onClick={e=>{e.preventDefault();openThreadResult(thread);}}>{t('View result / review notes','결과 및 검토 내용 보기')}</button>}
      {canRetry&&<button type="button" className="admin-secondary" disabled={busy||!!running} onClick={e=>{e.preventDefault();void retryJob(latest);}}>{canOfferSavedCtaRecovery(latest)?t('Recover saved result — no AI charge','저장된 결과로 무료 복구'):t('Retry same settings','같은 설정으로 재시도')}</button>}
      {thread.status==='completed'&&<p className="marketing-thread-success">{t('Ready for final review; publication still requires approval.','최종 검토를 진행할 수 있습니다. 발행에는 별도 승인이 필요합니다.')}</p>}
     </div>
    </details>;
   }):<p className="admin-empty">{t('No content workflows match this filter.','해당 조건의 콘텐츠 작업이 없습니다.')}</p>}</div>
   {filteredGenerationThreads.length>generationVisible&&<button type="button" className="marketing-load-more" onClick={()=>setGenerationVisible(v=>v+20)}>{t('Load 20 more','20개 더 보기')}</button>}
  </section>}
  {channel==='instagram'&&activeTab==='trend'&&<section className="marketing-tab-panel">
   <div className="admin-section-title"><div><p className="admin-kicker">Trend Radar</p><Heading level={2}>{t('Seoul Trend','서울 트렌드')}</Heading><p>{t('Track verified Seoul/Korea 20s–30s culture signals and turn strong trends into date-focused Roundy content.','서울/한국 2030 문화 신호를 검증하고 강한 트렌드를 데이트 중심 Roundy 콘텐츠로 연결합니다.')}</p></div><button type="button" className="admin-secondary trend-refresh-button" disabled={busy} onClick={()=>void work(()=>loadTrend())}>{t('Refresh','새로고침')}</button></div>
    {data.trend?.scans?.[0]&&<p className="trend-scan-summary" role="status">{t('Latest scan','최근 검색')}: {statusText(data.trend.scans[0].status)} · {data.trend.scans[0].candidate_count||0}{t(' verified candidates','건 검증됨')}{data.trend.scans[0].error_message&&<> — {friendlyError(String(data.trend.scans[0].error_message))}</>}</p>}
   {settings&&<div className="marketing-settings-card"><form className="admin-form" onSubmit={e=>{e.preventDefault();void work(async()=>{await mutate('/settings',settings,'PUT');await load(draft?.id);setNotice(t('Seoul Trend settings saved.','서울 트렌드 설정을 저장했습니다.'));});}}>
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
     <button type="button" className="trend-create-button" disabled={busy||!ready} onClick={()=>{if(window.confirm(previouslyUsed?t('This trend was already used. Generate another carousel from the same topic? It may cost money for AI copy and visuals, but will not run a new trend search.','이미 사용한 트렌드입니다. 같은 주제로 콘텐츠를 다시 생성할까요? 문구와 이미지 생성 비용이 발생할 수 있으며 트렌드 검색은 다시 하지 않습니다.'):t('Generate a fact-checked carousel from the stored Fact Pack? No new trend web search; AI copy and visuals may incur generation costs.','저장된 팩트팩으로 '+(trendLanguage==='ko'?'한국어':'영어')+' 캐러셀을 생성할까요? 추가 트렌드 검색은 하지 않지만 문구와 이미지 생성 비용은 발생할 수 있습니다.')))void work(async()=>{const r=await mutate('/trend-radar/generate',{trend_id:item.id,language:trendLanguage,confirm_generate:true});await load(r.draft?.id);setActiveTab('generation');setNotice(t('Trend guide generated. Review sourced details before publishing.','정보형 트렌드 콘텐츠가 생성됐습니다. 게시 전 출처를 검토하세요.'));return r;});}}>{previouslyUsed?t('Recreate guide','가이드 다시 만들기'):t('Create guide','가이드 만들기')}</button>
    </article>})}</div>:<p className="admin-empty">{trendUsageView==='used'?t('No previously used trends yet.','아직 콘텐츠 생성에 사용한 트렌드가 없습니다.'):t('No unused trends are available. Check the used trends archive or wait for new research.','미사용 트렌드가 없습니다. 사용 기록을 확인하거나 새로운 후보를 기다려주세요.')}</p>}
   </div>
  </section>}
  {channel==='instagram'&&activeTab==='automation'&&<section className="marketing-tab-panel marketing-workspace-settings">
   {settings&&<AdminMarketingSettings locale={locale} settings={settings} onChange={setSettings}
    busy={busy} onSave={()=>void work(async()=>{
     const editorial=Object.fromEntries(Object.keys(EDITORIAL_SETTINGS_DEFAULTS).map(key=>
      [key,settings[key]??EDITORIAL_SETTINGS_DEFAULTS[key as keyof typeof EDITORIAL_SETTINGS_DEFAULTS]]));
     await mutate('/settings',editorial,'PATCH');
     await load(draft?.id);
     setNotice(t('Feed & carousel settings saved.','Feed 및 카드뉴스 설정을 저장했습니다.'));
    })}/>}   {settings&&<div className="marketing-settings-card"><div className="admin-section-title"><div><p className="admin-kicker">{t('Schedule','스케줄')}</p><Heading level={2}>{t('Daily generation & campaigns','일일 생성 및 캠페인 설정')}</Heading></div></div><form className="admin-form" onSubmit={e=>{e.preventDefault();void work(async()=>{await mutate('/settings',settings,'PUT');await load(draft?.id);setNotice(t('Automation saved.','자동화 설정을 저장했습니다.'));});}}>
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
     <button type="button" className="admin-secondary" disabled={busy} onClick={()=>void work(async()=>{if(dirty&&!window.confirm(t('Discard unsaved edits to refresh connection status?','연결 상태를 다시 확인하면 저장하지 않은 수정사항은 사라집니다. 계속할까요?')))return;await load(draft?.id);})}>{t('Check Instagram connection again','Instagram 연결 다시 확인')}</button>
     <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer">{t('Open Meta Developer Dashboard','Meta 개발자 대시보드 열기')}</a>
    </div>
    <p className="admin-help">{t('Connection health is read-only. This button never publishes, refreshes, or retries a post. After changing the secret, recheck and separately review failed items in Feed history.','연결 확인은 조회만 수행합니다. 이 버튼은 콘텐츠를 발행하거나 자동으로 재시도하지 않습니다. 토큰 교체 후 다시 확인하고, 과거 실패 항목은 Feed 발행 기록에서 별도로 검토하세요.')}</p>
    <p>{t('Comment/DM webhook verification','댓글 및 DM Webhook 인증')}: {data.webhook?.verified_at||t('Not verified','미인증')}</p>{!data.webhook?.verified_at&&<><label>Callback URL<input readOnly value={data.webhook?.callback_url||''}/></label><label>Verify token<input readOnly value={data.webhook?.verify_token||''}/></label></>}</div>
  </section>}
  {channel==='koreapas'&&<div className="admin-form"><Heading level={2}>{t('Koreapas templates','고파스 템플릿')}</Heading><select value={template.id||''} onChange={e=>setTemplate(structuredClone(data.templates.find((x:Row)=>x.id===e.target.value)||blank()))}><option value="">{t('New template','새 템플릿')}</option>{data.templates.filter((x:Row)=>x.channel==='koreapas').map((x:Row)=><option key={x.id} value={x.id}>{x.name}</option>)}</select>{[['name',t('Template name','템플릿 이름')],['title',t('Post title','제목')],['caption',t('Copy','본문')],['cta','CTA'],['destination_url',t('Destination URL','연결 주소')]].map(([key,label])=><label key={key}><span>{label}</span><textarea value={template[key]} onChange={e=>setTemplate({...template,[key]:e.target.value})}/></label>)}<label>{t('JPEG images','JPEG 이미지')}<input type="file" accept="image/jpeg" multiple disabled={busy} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';void work(async()=>{if(files.length+template.images.length>10)throw new Error('Maximum 10 images');const urls:string[]=[];for(const file of files){if(file.type!=='image/jpeg'||file.size>5*1024*1024)throw new Error('JPEG, max 5 MB');urls.push(await uploadFile(file,'wis-event-images'));}setTemplate({...template,images:[...template.images,...urls]});});}}/></label><OrderedImages images={template.images} onChange={images=>setTemplate({...template,images})} locale={locale} disabled={busy}/><div className="marketing-days">{['일','월','화','수','목','금','토'].map((day,i)=><label key={day}><input type="checkbox" checked={template.days.includes(i)} onChange={e=>setTemplate({...template,days:e.target.checked?[...template.days,i]:template.days.filter((x:number)=>x!==i)})}/>{day}</label>)}</div><input type="time" value={template.time_kst.slice(0,5)} onChange={e=>setTemplate({...template,time_kst:e.target.value})}/><label className="check-row"><input type="checkbox" checked={template.enabled} onChange={e=>setTemplate({...template,enabled:e.target.checked})}/>{t('Enable template schedule','템플릿 자동 게시 활성화')}</label><div className="admin-form-actions"><button type="button" className="admin-primary" disabled={busy} onClick={()=>void work(async()=>{const r=await mutate(template.id?'/'+template.id:'',template,template.id?'PUT':'POST');setTemplate(r.template);await load(draft?.id);})}>{t('Save','저장')}</button><button type="button" className="admin-secondary" disabled={busy||!template.id} onClick={()=>{if(window.confirm(t('Publish the SAVED Koreapas template now?','저장된 고파스 템플릿을 지금 게시할까요?')))void work(async()=>{await mutate('/publish',{template_id:template.id,request_key:crypto.randomUUID()});await load(draft?.id);});}}>{t('Publish saved template','저장된 템플릿 게시')}</button><button type="button" className="admin-secondary" disabled={busy||!template.id} onClick={()=>{if(window.confirm(t('Delete this template?','이 템플릿을 삭제할까요?')))void work(async()=>{await mutate('/'+template.id,{},'DELETE');setTemplate(blank());await load(draft?.id);});}}>{t('Delete','삭제')}</button></div></div>}
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
           await load(draft?.id);
           setNotice(t('Verified no post. Retry scheduled for ','미게시 확인 완료. 재시도 예약: ')+String(result.feed_date_kst)+' KST');
          });
         }}>{t('Verify no post & schedule a retry','미게시 확인 후 재시도 예약')}</button>}
       </>}
       {r.status==='needs_review'&&<div className="admin-form-actions">{[true,false].map(published=><button key={String(published)} type="button" className="admin-secondary" disabled={busy} onClick={()=>{if(window.confirm(t('Confirm you checked the external channel.','외부 채널에서 실제 게시 여부를 확인했나요?')))void work(async()=>{await mutate('/resolve',{run_id:r.id,published});await load(draft?.id);});}}>{published?t('Confirmed published','게시됨 확인'):t('Confirmed not published','게시 안 됨 확인')}</button>)}</div>}
      </div>
    </details>;
   }):<p className="admin-empty">{t('No publishing history yet.','아직 게시 기록이 없습니다.')}</p>}</div>
   {channelRuns.length>publishVisible&&<button type="button" className="marketing-load-more" onClick={()=>setPublishVisible(v=>v+20)}>{t('Load 20 more','20개 더 보기')}</button>}
  </section>}
  {approvedPickerSlot!==null&&<div className="marketing-approved-picker-backdrop" role="presentation"
   onClick={()=>{setApprovedPreviewAsset(null);setApprovedPickerSlot(null);}}>
   <section className="marketing-approved-picker" role="dialog" aria-modal="true"
    aria-label={t('Choose previously approved photo','기존 승인 사진 선택')}
    onClick={e=>e.stopPropagation()}>
    <header>
     <div>
      <small>{t('Approved Photo Library','승인 사진 라이브러리')}</small>
      <strong>{t('Choose image for card ','카드 사진 선택 ')}{approvedPickerSlot+1}</strong>
      <p>{t('Choose from already reviewed photographs. Tap an image to inspect it.',
       '승인된 실사 사진을 선택하세요. 이미지를 누르면 크게 확인할 수 있습니다.')}</p>
     </div>
     <button type="button" className="marketing-approved-picker-close"
      aria-label={t('Close photo library','사진 라이브러리 닫기')}
      onClick={()=>{setApprovedPreviewAsset(null);setApprovedPickerSlot(null);}}>
      <X size={19} aria-hidden="true"/>
     </button>
    </header>
    {approvedPreviewAsset?
     <div className="marketing-approved-picker-detail" data-testid="marketing-approved-photo-detail">
      <button type="button" className="marketing-approved-picker-back" onClick={()=>setApprovedPreviewAsset(null)}>
       <ArrowLeft size={17} aria-hidden="true"/>{t('Back to all approved photos','승인 사진 목록으로')}
      </button>
      <div className="marketing-approved-picker-detail-media">
       {approvedPreviewAsset.preview_url?
        <img src={approvedPreviewAsset.preview_url} alt={String(approvedPreviewAsset.photographer||'Approved photograph')}/>:
        <span>{t('Image preview unavailable','사진 미리보기를 사용할 수 없습니다')}</span>}
      </div>
      <div className="marketing-approved-picker-detail-copy">
       <strong>{t('Photo by ','사진가: ')}{approvedPreviewAsset.photographer||t('Unknown','정보 없음')}</strong>
       <p>{String(approvedPreviewAsset.provider||'').toUpperCase()} · {approvedPreviewAsset.license_name||t('License details','라이선스 정보')}</p>
       <small>{t('Original search context','이미지 검색 키워드')}: {approvedPreviewAsset.search_query||approvedPreviewAsset.topic_key||'—'}</small>
       <div className="marketing-approved-picker-detail-links">
        {approvedPreviewAsset.source_url&&<a href={approvedPreviewAsset.source_url} target="_blank" rel="noopener noreferrer">{t('View original','원본 보기')}</a>}
        {approvedPreviewAsset.license_url&&<a href={approvedPreviewAsset.license_url} target="_blank" rel="noopener noreferrer">{t('View license','라이선스 확인')}</a>}
       </div>
       <button type="button" className="admin-primary"
        disabled={busy||stockPhotos.some((photo:Row)=>photo.asset_id===approvedPreviewAsset.id&&Number(photo.slot)!==approvedPickerSlot)}
        onClick={()=>void applyApprovedPhoto(String(approvedPreviewAsset.id))}>
        {stockPhotos.some((photo:Row)=>photo.asset_id===approvedPreviewAsset.id&&Number(photo.slot)!==approvedPickerSlot)
         ?t('Already used in another card','다른 카드에서 사용 중')
         :t('Use this photo for card ','이 사진을 카드에 사용 ')+(approvedPickerSlot+1)}
       </button>
      </div>
     </div>:
     <>
      <input type="search" value={approvedSearch} onChange={e=>setApprovedSearch(e.target.value)}
       placeholder={t('Search topics, photographers, providers','주제, 사진가, 제공처 검색')}
       aria-label={t('Search approved photos','승인된 사진 검색')}/>
      <p className="marketing-approved-picker-count">
       {t('Approved photos ','승인된 사진 ')}<strong>{filteredApprovedPool.length}</strong> / {approvedPool.length}
       <span>{t('Tap a photo to enlarge','사진을 누르면 크게 볼 수 있습니다')}</span>
      </p>
      <div className="marketing-approved-picker-grid" data-testid="marketing-approved-photo-grid">
       {filteredApprovedPool.map((asset:Row)=>{
        const alreadyHere=stockPhotos.some((photo:Row)=>photo.asset_id===asset.id&&Number(photo.slot)!==approvedPickerSlot);
        return <article key={asset.id} className="marketing-approved-picker-card">
         <button type="button" className="marketing-approved-picker-image" onClick={()=>setApprovedPreviewAsset(asset)}
          aria-label={t('Enlarge photo by ','사진 크게 보기, 사진가 ')+String(asset.photographer||asset.provider||'')}>
          {asset.preview_url?<img loading="lazy" src={asset.preview_url} alt={String(asset.photographer||'Approved photo')}/>:
           <span className="marketing-approved-picker-image-empty">{t('Preview unavailable','미리보기 없음')}</span>}
          <span className="marketing-approved-picker-zoom"><ZoomIn size={13} aria-hidden="true"/>{t('View','크게 보기')}</span>
         </button>
         <div className="marketing-approved-picker-copy">
          <strong title={String(asset.photographer||asset.provider||'')}>{asset.photographer||asset.provider||t('Unknown photographer','사진가 미상')}</strong>
          <small>{String(asset.provider||'').toUpperCase()} · {t('Used in','기존 사용')} {Number(asset.used_by_count)||0}</small>
          <small>{asset.license_name||t('License reviewed','라이선스 검수 완료')}</small>
          <div className="marketing-approved-picker-actions">
           <button type="button" className="admin-primary" disabled={busy||alreadyHere}
            onClick={()=>void applyApprovedPhoto(String(asset.id))}>
            {alreadyHere?t('Used in another card','다른 카드 사용 중'):t('Use photo','이 사진 선택')}
           </button>
          </div>
         </div>
        </article>;
       })}
       {!filteredApprovedPool.length&&<p className="admin-empty">
        {t('No matching approved photo. Clear the search or review new photos.',
         '검색 결과가 없습니다. 검색어를 지우거나 새 사진을 검수하세요.')}
       </p>}
      </div>
     </>}
   </section>
  </div>}
  {regenerationSourceId&&<div className="marketing-version-modal" role="presentation" onClick={()=>setRegenerationSourceId(null)}>
    <div role="dialog" aria-modal="true" aria-label={t('Regenerate previous Instagram post','기존 Instagram 콘텐츠 재생성')} onClick={e=>e.stopPropagation()}>
     <AdminMarketingRegeneration sourceId={regenerationSourceId} locale={locale}
      onClose={()=>setRegenerationSourceId(null)}
      onCreated={created=>{setRegenerationSourceId(null);setActiveTab('draft');selectDraft(created);void load(created.id).catch(e=>setError(String(e?.message||e)));}}/>
    </div>
   </div>}
   {resultPreview&&<div className="marketing-result-backdrop" role="presentation" onClick={()=>setResultPreview(null)}>
   <section className="marketing-result-modal" role="dialog" aria-modal="true" aria-labelledby="marketing-result-title" onClick={e=>e.stopPropagation()}>
    <div className="marketing-result-head"><div><p className="admin-kicker">{t('Saved generation result','저장된 생성 결과')}</p><Heading level={2} id="marketing-result-title">{contentTitle(resultPreview.snapshot||resultPreview.attempt)}</Heading></div><button type="button" className="admin-secondary" onClick={()=>setResultPreview(null)}>{t('Close','닫기')}</button></div>
    <p className="admin-help">{new Date(resultPreview.attempt.created_at).toLocaleString(locale,{timeZone:'Asia/Seoul'})} KST · {t('Attempt','시도')} {resultPreview.attempt.attempt_number}</p>
    {Array.isArray(resultPreview.snapshot.images)&&resultPreview.snapshot.images.length>0&&<div className="marketing-result-images">{resultPreview.snapshot.images.map((url:string,i:number)=><img src={url} alt={t('Generated card ','생성 카드 ')+(i+1)} key={url}/>)}</div>}
    {(resultPreview.attempt.quality_report||resultPreview.snapshot.quality_report)&&<div className="marketing-quality-status"><strong>{t('Quality review','품질 검토')}</strong>{((resultPreview.attempt.quality_report||resultPreview.snapshot.quality_report).issues||[]).map((issue:string)=><p key={issue}>{issue}</p>)}</div>}
    {resultPreview.snapshot.content_document?.book?.title&&<p>{resultPreview.snapshot.content_document.book.title} / {resultPreview.snapshot.content_document.book.author}</p>}
    <div className="marketing-result-copy"><strong>{t('Caption','캡션')}</strong><p>{resultPreview.snapshot.caption||''}</p></div>
    {!!resultPreview.snapshot.research_sources?.length&&<div className="growth-sources">{resultPreview.snapshot.research_sources.map((s:Row)=><a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.publisher||s.title||s.url}</a>)}</div>}
    {resultPreview.attempt.status==='completed'&&<button type="button" className="admin-secondary" disabled={busy} onClick={()=>{if(window.confirm(t('Reject this result for quality and enable rework in the same thread?','이 결과를 품질 불합격 처리하고 같은 스레드에서 재작업할까요?')))void work(async()=>{const r=await request('/generation/jobs/'+resultPreview.attempt.id+'/reject',{confirm_reject:true});if(!r.ok)throw new Error(r.data.error);setResultPreview(null);await load(draft?.id);setActiveTab('generation');});}}>{t('Reject quality / request rework','품질 불합격 및 재작업 요청')}</button>}
    <div className="admin-form-actions"><button type="button" className="admin-primary" disabled={busy||resultPreview.attempt.status!=='completed'||!hasEditorialCopy(resultPreview.attempt)} onClick={()=>void importResultToDraft()}>{t('Open saved copy — no AI charge','저장된 원고 편집 — AI 비용 없음')}</button><button type="button" className="admin-secondary" onClick={()=>setResultPreview(null)}>{t('Close','닫기')}</button></div>
   </section>
  </div>}
 </section>;
}
