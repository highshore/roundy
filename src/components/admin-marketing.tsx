'use client';
import {canOfferSavedCtaRecovery} from '@/lib/marketing-output-recovery';
import { useEffect, useRef, useState } from 'react';
import { Heading } from './heading';
import { tr, type Locale } from '@/lib/locale';
import { uploadFile, uploadMarketingFile } from '@/lib/uploads';
import { OrderedImages } from './ordered-images';
import {AdminMarketingGrowth} from './admin-marketing-growth';
import {AdminMarketingReels} from './admin-marketing-reels';
import {CONTENT_PROFILES,postType} from '@/lib/marketing-content-policy';
import {EDITORIAL_SETTINGS_DEFAULTS} from '@/lib/marketing-editorial-settings';
import {factPackReady,groupTrendsByUsage} from '@/lib/marketing-trend-guide';
type Row=Record<string,any>;
type PendingMarketingImage={id:string;file:File;preview:string;asset_type:'photo'|'completed_card';width:number;height:number};
const BASE='/api/admin/marketing';
const topics=['mbti','dating_archetype','book_insight','trend_research','meme_remix','dating_myth','conversation_prompt','seoul_dating','seoul_trend','korea_life','mini_quiz'];
const topicKo=['MBTI 연애 유형','연애 유형','책 속 공감','최신 연구','밈 재해석','연애 통념','첫 대화 질문','서울 데이팅','서울 트렌드','한국 생활과 문화','미니 퀴즈'];
async function request(path='',body?:unknown,method='POST'){
 let response:Response;
 try{
  response=await fetch(BASE+path,body===undefined?{cache:'no-store',signal:AbortSignal.timeout(25000)}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(245000)});
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
 const [channel,setChannel]=useState<'instagram'|'koreapas'>('instagram'),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [basis,setBasis]=useState('prelaunch'),[manualVisualSource,setManualVisualSource]=useState<'auto_ai'|'uploaded'|'none'|'pexels'>('auto_ai'),[topic,setTopic]=useState('conversation_prompt'),[contentLanguage,setContentLanguage]=useState<'ko'|'en'>('ko'),[direction,setDirection]=useState(''),[dirty,setDirty]=useState(false);
 const [eventId,setEventId]=useState(''),[eventCampaignStage,setEventCampaignStage]=useState('auto');
 const [template,setTemplate]=useState<Row>(blank());
 const [stockPhotos,setStockPhotos]=useState<Row[]>([]),[stockReview,setStockReview]=useState<Row|null>(null);
 const [preflightState,setPreflightState]=useState<Row|null>(null),[preflightSerial,setPreflightSerial]=useState(0);
 const [uploadedImages,setUploadedImages]=useState<Row[]>([]),[uploadAssetType,setUploadAssetType]=useState<'photo'|'completed_card'>('photo');
 const [pendingMarketingImages,setPendingMarketingImages]=useState<PendingMarketingImage[]>([]),[pendingAssetType,setPendingAssetType]=useState<'photo'|'completed_card'>('photo');
 const [resultPreview,setResultPreview]=useState<Row|null>(null);
 const [activeTab,setActiveTab]=useState<'draft'|'growth'|'reels'|'generation'|'trend'|'publishing'|'automation'|'connection'>('draft');
 const [generationFilter,setGenerationFilter]=useState<'all'|'completed'|'failed'|'running'>('all');
 const [trendLanguage,setTrendLanguage]=useState<'ko'|'en'>('ko');
 const [trendUsageView,setTrendUsageView]=useState<'unused'|'used'>('unused');
 const [generationVisible,setGenerationVisible]=useState(20),[publishVisible,setPublishVisible]=useState(20);
 const inFlight=useRef(false),mounted=useRef(true),stockPreferredSet=useRef(false);
 function selectDraft(next:Row|null){setPreflightState(null);setDraft(next?structuredClone(next):null);setDirty(false);if(next){setBasis(next.draft_kind==='growth_carousel'?'growth_carousel':next.content_mode);setTopic(next.growth_topic_type||'conversation_prompt');setContentLanguage(next.content_language==='en'?'en':'ko');if(next.event_id)setEventId(String(next.event_id));if(next.event_campaign_stage)setEventCampaignStage(String(next.event_campaign_stage));}}
 async function load(preferredId?:string){
  const r=await request();if(!r.ok)throw new Error(r.data.error||'Could not load marketing');if(!mounted.current)return;
  setData(r.data);setSettings(r.data.settings);setGeneration(r.data.generation);
  if(!stockPreferredSet.current){stockPreferredSet.current=true;if(r.data.generation?.provider?.pexels_configured)setManualVisualSource('pexels');}if(!eventId&&r.data.live_events?.[0]?.id)setEventId(String(r.data.live_events[0].id));const rows=r.data.drafts||[];
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
  if(!draft?.id||draft.visual_source!=='pexels'){setStockPhotos([]);setStockReview(null);return;}
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
  if(!busy)return;let cancelled=false,attempts=0,failures=0,timer:ReturnType<typeof setTimeout>|undefined;
  async function poll(){if(cancelled||attempts++>=48||failures>=3)return;if(document.visibilityState==='visible')try{const r=await request('/generation');if(r.ok){if(!cancelled)setGeneration(r.data);failures=0;}else failures++;}catch{failures++;}if(!cancelled)timer=setTimeout(poll,5000);}
  timer=setTimeout(poll,2000);return()=>{cancelled=true;if(timer)clearTimeout(timer);};
 },[busy]);
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
  if(/출처|research|source|책 제목|저자/i.test(message+' '+code))return {title:t('Research issue','자료 조사 실패'),cause:t('A reliable source could not be verified.','검증 가능한 출처를 확보하지 못했습니다.'),action:t('The system now falls back once to a safe non-research topic when possible.','가능한 경우 안전한 비연구 콘텐츠로 1회 자동 전환합니다.')};
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
 async function generate(today=false,renderOnly=false){
  if(renderOnly&&!draft)return;
  if(renderOnly&&dirty&&!window.confirm(t('Discard unsaved edits before rendering?','저장하지 않은 수정을 버리고 이미지를 다시 렌더할까요?')))return;
  const source=today?'auto_ai':renderOnly?(draft?.visual_source||'auto_ai'):manualVisualSource;
  if(!today&&!renderOnly&&source==='uploaded'&&!pendingMarketingImages.length){setError(t('Add at least one image before generating with uploads.','직접 업로드 방식은 이미지를 1장 이상 추가한 뒤 생성하세요.'));return;}
  if(!today&&!renderOnly&&basis==='live_event'&&!eventId){setError(t('Choose the live event to promote.','홍보할 정식 이벤트를 선택하세요.'));return;}
  const research=basis==='growth_carousel'&&['book_insight','trend_research','dating_myth','seoul_trend'].includes(topic),requestedMode=renderOnly?'image':(['auto_ai','pexels'].includes(source)?'both':'text');
  const selectedEvent=(data.live_events||[]).find((item:Row)=>String(item.id)===eventId),eventHasEnoughPhotos=basis==='live_event'&&Array.isArray(selectedEvent?.images)&&selectedEvent.images.length>=3;
  const managed=Number.isInteger(settings?.carousel_min_real_photos_5)&&Number.isInteger(settings?.carousel_min_real_photos_3)&&['auto_ai','pexels'].includes(source);
  const useAiCover=renderOnly?draft?.content_document?.photo_sourcing?.ai_thumbnail_enabled===true:managed&&settings?.carousel_ai_thumbnail_enabled===true;
  const cost=managed?(useAiCover?(renderOnly?'$0.15':'$0.20'):renderOnly?'$0':research?'$0.05':'$0.02')
    :source==='pexels'?(renderOnly?'$0':research?'$0.05':'$0.02')
    :renderOnly?(source==='uploaded'?'$0':eventHasEnoughPhotos?'$0':'$0.15')
    :source==='auto_ai'?(eventHasEnoughPhotos?'$0.02':'$0.20'):research?'$0.05':'$0.02';
  const message=managed
   ?t('Source real Pexels photos (5 slides ≥'+Number(settings?.carousel_min_real_photos_5??3)+', 3 slides ≥'+Number(settings?.carousel_min_real_photos_3??2)+') for this carousel? New photos require approval. Missing photos leave the draft on hold, without AI substitutions. '+(useAiCover?'An AI cover can be generated once photos are approved. ':'')+'Reserved budget '+cost+'.',
      '카드뉴스 실제 Pexels 사진 확보(5장 최소 '+Number(settings?.carousel_min_real_photos_5??3)+'장, 3장 최소 '+Number(settings?.carousel_min_real_photos_3??2)+'장)를 시작할까요? 신규 사진은 검수 대상이며 부족할 때 AI로 대체하지 않습니다. '+(useAiCover?'사진 승인 후 AI 표지 1장 생성 가능. ':'')+'예약액 '+cost+'.')
   :source==='pexels'
    ?t('Generate copy and find Pexels photos for human review? Reserve '+cost+'.','문구와 Pexels 사진을 검수용으로 준비할까요? 예약액 '+cost+'.')
    :source==='auto_ai'
    ?t('Generate AI images with the legacy visual mode? This reserves '+cost+'.','기존 AI 이미지 모드로 만들까요? 예약액 '+cost+'.')
    :source==='uploaded'
    ?t('Generate copy for manual image upload? Only copy/research cost is reserved; image AI will not run.','직접 업로드용 문구를 생성할까요? 문구/검색 비용만 예약되며 이미지 AI는 호출하지 않습니다.')
    :t('Generate copy only? Images can be added later.','문구만 생성할까요? 이미지는 나중에 추가할 수 있습니다.');
  if(!window.confirm(message))return;
  await work(async()=>{
   const payload={request_key:'manual:'+crypto.randomUUID(),revision:renderOnly?draft!.revision:1,mode:today?'both':requestedMode,content_mode:basis,language:today?undefined:contentLanguage,visual_mode:'cards',visual_source:source,...(basis==='growth_carousel'?{topic_type:topic}:{}),...(basis==='live_event'?{event_id:eventId,event_campaign_stage:eventCampaignStage}:{}),instruction:direction.trim(),confirm_photo:false,render_only:renderOnly};
   const path=renderOnly?'/draft/'+draft!.id+'/regenerate':'/draft/generate';
   const r=await request(path,payload);
   if(!r.ok||r.data.error)throw new Error(r.data.error||'Generation failed');
   if(r.data.job?.status==='running'){setNotice(t('This request already exists. Check Generation history; it was not billed again.','이미 접수된 요청입니다. 생성 기록을 확인하세요. 추가 호출하지 않았습니다.'));return;}
   if(['failed','uncertain'].includes(r.data.job?.status))throw new Error(r.data.job?.error_message||'Previous attempt stopped; no retry was sent.');
   const actuallyPexels=r.data.draft?.visual_source==='pexels';
   if(!today&&!renderOnly&&(source==='uploaded'||source==='pexels'||actuallyPexels)){
    const jobId=String(r.data.job?.id||'');if(!jobId)throw new Error('RESULT_SNAPSHOT_UNAVAILABLE');
    const imported=await request('/generation/jobs/'+jobId+'/import',{confirm_import:true});
    if(!imported.ok||imported.data.error||!imported.data.draft)throw new Error(imported.data.error||'Import failed');
    const candidate=imported.data.draft as Row;
    if(source==='uploaded'){
     try{await uploadPendingImagesToDraft(candidate,[...pendingMarketingImages]);}
     finally{clearPendingMarketingImages();}
    }
    await load(candidate.id);setActiveTab('draft');
    if(candidate.visual_source==='pexels')await refreshStock(candidate.id);
    setNotice(candidate.visual_source==='pexels'
     ?t('Copy saved. Pexels photos remain under review until the minimum count is approved; no AI filler was created.','문구 저장 완료. 최소 실제 사진 개수 확보 및 승인 전까지 검수 대기하며 부족한 사진을 AI로 대체하지 않습니다.')
     :t('Copy, uploaded images, and final cards are ready in Drafts. No image AI was used.','문구 생성, 이미지 업로드, 카드 렌더링까지 완료했습니다. 이미지 AI는 사용하지 않았습니다.'));
   }else{
    await load(renderOnly?draft?.id:undefined);
    if(renderOnly&&r.data.draft)selectDraft(r.data.draft);
    else setActiveTab('generation');
    setNotice(renderOnly?t('Fresh visuals generated and cards rendered from the current draft.','현재 초안에 맞는 새 이미지를 생성하고 카드를 다시 렌더했습니다.'):t('Generation complete. Open the result in Generation history and choose Add to Drafts.','생성이 완료됐습니다. 생성 기록에서 결과를 확인한 뒤 초안으로 가져오세요.'));
   }
   setDirection('');
  });
 }
 function retryCost(job:Row){return job.operation==='render'?0:job.operation==='photo'?0.15:job.operation==='copy_photo'?0.20:job.operation==='research'?0.05:0.02;}
 async function retryJob(job:Row){
  if(!job.request_payload)throw new Error('RETRY_PAYLOAD_UNAVAILABLE');
  const savedRecovery=canOfferSavedCtaRecovery(job),cost=savedRecovery?0.15:retryCost(job),photo=['photo','copy_photo'].includes(job.operation)||savedRecovery,budget=cost.toFixed(2)+' USD';
  const confirmMessage=savedRecovery?t('Recover the saved copy and generate a fresh three-image visual set? This reserves '+budget+' and does not publish automatically.','저장된 문구는 재사용하고 새 이미지 3장을 생성할까요? 앱 예산 '+budget+'를 예약하며 자동 게시되지는 않습니다.'):t(
   'Retry this failed generation with the same saved settings? This starts one generation attempt (research uses up to three targeted searches and one writing request, plus at most one copy-only repair when quality checks fail) and reserves '+budget+'. It will not publish automatically.',
   '이 실패 작업을 저장된 동일 설정으로 재시도할까요? 생성 시도 1회를 시작합니다. 검색형은 목적별 검색 최대 3회와 문구 작성 1회, 품질 문제 시 문구 수정 최대 1회까지 사용하며, 앱 예산 '+budget+'를 예약합니다. 자동 게시되지는 않습니다.'
  );
  if(!window.confirm(confirmMessage))return;
  await work(async()=>{
   const r=await request('/generation/jobs/'+job.id+'/retry',{confirm_retry:true,confirm_paid_photo:photo,recover_saved_result:savedRecovery});
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
  if(!r.ok||r.data.error)throw new Error(r.data.error||'Could not load Pexels photos');
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
 function stage(s:string){const labels:Record<string,string>={reserved:t('Reserved; duplicate checks passed','예산 예약 및 중복 검사 완료'),writing:t('Writing copy','문구 작성 중'),writing_fallback:t('Writing safe fallback','안전한 대체 콘텐츠 작성 중'),repairing_copy:t('Repairing copy once','문구 1회 수정 중'),researching:t('Researching sources','출처 조사 중'),saving_copy:t('Saving copy','문구 저장 중'),generating_visual_set:t('Generating 3 fresh visuals','새 이미지 3장 생성 중'),saving_visual_set:t('Saving fresh visuals','새 이미지 세트 저장 중'),saving_images:t('Saving images','이미지 저장 중'),complete:t('Complete','완료'),stopped:t('Stopped','중지')};return labels[s]||s.replace('rendering_','카드 생성 ').replace('_of_',' / ');}
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
  const status=latest.quality_report?.status==='rejected'?'failed':latest.status;
  const retryCount=attempts.filter((a:Row)=>Boolean(a.retry_of_job_id)).length,stepCount=Math.max(1,attempts.length-retryCount);
  return {id,attempts,latest,root,status,retryCount,stepCount,total_reserved_usd:attempts.reduce((sum:number,a:Row)=>sum+Number(a.reserved_usd||0),0),created_at:root.created_at,updated_at:latest.updated_at||latest.created_at};
 }).sort((a:Row,b:Row)=>Date.parse(b.updated_at)-Date.parse(a.updated_at));
 const filteredGenerationThreads=generationThreads.filter((thread:Row)=>generationFilter==='all'||thread.status===generationFilter);
 const visibleGenerationThreads=filteredGenerationThreads.slice(0,generationVisible);
 const trendGroups=groupTrendsByUsage((data.trend?.trends||[]) as Row[]);
 const visibleTrendRows=trendUsageView==='used'?trendGroups.used:trendGroups.unused;
 const channelRuns=((data.runs||[]) as Row[]).filter((r:Row)=>r.channel===channel);
 const contentRecords=((data.content_records||[]) as Row[]);
 const visibleRuns=channelRuns.slice(0,publishVisible);
 const tabItems=[
  ['draft',t('Draft','초안')],
  ['growth',t('Growth','성장 분석')],
  ['reels',t('Reel Studio','릴스 스튜디오')],
  ['generation',t('Generation','생성 기록')],
  ['trend',t('Seoul Trend','서울 트렌드')],
  ['publishing',t('Publishing','게시 기록')],
  ['automation',t('Automation','자동화')],
  ['connection',t('Connection','연결')]
 ] as const;
 function statusText(status:string){const labels:Record<string,[string,string]>={completed:['Completed','완료'],failed:['Failed','실패'],running:['Running','진행 중'],uncertain:['Needs review','확인 필요'],sent:['Published','게시됨'],queued:['Scheduled','예약됨'],sending:['Publishing','게시 중'],needs_review:['Needs review','확인 필요'],scheduled:['Scheduled','예약됨']};return labels[status]?t(...labels[status]):status;}
 function operationLabel(row:Row){const labels:Record<string,[string,string]>={copy:['Copy creation','문구 생성'],research:['Research + copy','주제 조사 + 문구 생성'],render:['Card rendering','이미지 카드 렌더'],photo:['Visual generation','이미지 생성 + 렌더'],copy_photo:['Copy + visuals','문구 + 이미지 생성']};return labels[row.operation]?t(...labels[row.operation]):t('Generation step','생성 단계');}
 function contentLabel(row:Row){const request=row.request_payload||{},snapshot=row.result_snapshot||row.snapshot||row||{},growth=request.content_mode==='growth_carousel'||snapshot.draft_kind==='growth_carousel'||row.draft_kind==='growth_carousel',kind=growth?(request.topic_type||snapshot.growth_topic_type||row.growth_topic_type||'growth_carousel'):(request.content_mode||snapshot.content_mode||row.content_mode||snapshot.draft_kind||row.draft_kind||row.operation||'content');const ko:Record<string,string>={prelaunch:'오픈 전 홍보',live_event:'이벤트 모집',book_insight:'책 속 공감',trend_research:'연구로 보는 관계',mbti:'MBTI와 대화',dating_archetype:'대화 스타일',meme_remix:'공감 상황극',dating_myth:'연애 통념 점검',conversation_prompt:'첫 대화 질문',seoul_dating:'서울에서 만나기',seoul_trend:'서울 트렌드',korea_life:'한국 생활',mini_quiz:'대화 미니 퀴즈',growth_carousel:'Growth Carousel',brand:'브랜드 콘텐츠',copy:'일반 콘텐츠',research:'검색 콘텐츠'};return locale==='ko'?(ko[kind]||String(kind).replaceAll('_',' ')):String(kind).replaceAll('_',' ');}
 function compactContentTitle(value:unknown){const clean=typeof value==='string'?value.replace(/\s+/g,' ').replace(/^[#\-–—"'“”‘’\s]+|["'“”‘’\s]+$/g,'').trim():'';return clean.length>64?clean.slice(0,61).trimEnd()+'…':clean;}
 function contentTitle(row:Row){for(const source of [row,row?.result_snapshot,row?.snapshot].filter(Boolean) as Row[]){const doc=source.content_document||{},slides=[...(Array.isArray(doc.slides)?doc.slides:[]),...(Array.isArray(source.carousel_slides)?source.carousel_slides:[])];const slideTitle=slides.map((s:Row)=>compactContentTitle(s?.title)).find(Boolean);if(slideTitle)return slideTitle;const bookTitle=compactContentTitle(doc?.book?.title);if(bookTitle)return bookTitle;const caption=typeof source.caption==='string'?source.caption.split(/\n+/).map((line:string)=>compactContentTitle(line)).find((line:string)=>line&&!line.startsWith('#')):'';if(caption)return caption;}return contentLabel(row);}
 function contentRecordForRun(run:Row){const draftId=String(run?.snapshot?.draft_id||'');return draftId?contentRecords.find((record:Row)=>String(record.id)===draftId)||null:null;}
 function contentRecordForAttempts(attempts:Row[]){const ids=new Set(attempts.map((attempt:Row)=>String(attempt.id)));return contentRecords.find((record:Row)=>ids.has(String(record.source_generation_job_id||'')))||null;}
 function runForContent(record:Row|null){if(!record)return null;const runId=String(record.marketing_run_id||''),draftId=String(record.id||'');return (runId?channelRuns.find((run:Row)=>String(run.id)===runId):null)||channelRuns.find((run:Row)=>String(run.snapshot?.draft_id||'')===draftId)||null;}
 function publicationInfo(record:Row|null,runOverride:Row|null=null){const run=runOverride||runForContent(record),runStatus=String(run?.status||''),draftStatus=String(record?.status||'');if(runStatus==='sent'||draftStatus==='published'||draftStatus==='sent')return {status:'sent',label:t('Published','게시됨')};if(runStatus==='sending')return {status:'sending',label:t('Publishing','게시 중')};if(['queued','scheduled'].includes(runStatus)||draftStatus==='scheduled')return {status:'scheduled',label:t('Scheduled','예약됨')};if(runStatus==='failed'||draftStatus==='failed')return {status:'failed',label:t('Publish failed','게시 실패')};if(runStatus==='needs_review')return {status:'needs_review',label:t('Publish needs review','게시 확인 필요')};if(draftStatus==='needs_approval')return {status:'needs_review',label:t('Awaiting approval','승인 대기')};return {status:'unpublished',label:t('Not published','미게시')};}
 const currentPreflight=draft&&preflightState?.draft_id===draft.id&&preflightState?.revision===draft.revision?preflightState:null;
 const preflightChecks=Array.isArray(currentPreflight?.preflight?.checks)?currentPreflight.preflight.checks as Row[]:[];
 const preflightReady=currentPreflight?.preflight?.status==='passed'&&currentPreflight?.quality_report?.status==='passed';
 const localizedCheck:Record<string,string>={
  slide_count:'Slide count / images',real_photos:'Minimum authentic photos',
  photo_sources:'Photo sources / license',photo_approval:'Admin photo approval',
  answer_first:'Answer-First cover',final_cta:'Final CTA',mobile_render:'Mobile readability / margins'
 };
 if(loading)return <p role="status">{t('Loading marketing workspace…','마케팅 정보를 불러오는 중입니다…')}</p>;
 return <section className="admin-panel marketing-panel">
  <div className="admin-heading"><p className="admin-kicker">ROUNDY ADMIN</p><Heading level={1}>{t('Marketing','마케팅')}</Heading><p>{t('Generate safely. Review once. Publish only after approval.','안전하게 생성하고 검토한 뒤, 승인한 콘텐츠만 게시합니다.')}</p></div>
  <div className="admin-form-actions">{(['instagram','koreapas'] as const).map(c=><button type="button" key={c} className={channel===c?'admin-primary':'admin-secondary'} onClick={()=>setChannel(c)}>{c==='instagram'?'Instagram @roundy.meet':'Koreapas'}</button>)}<button type="button" className="admin-secondary" disabled={busy} onClick={()=>void work(()=>channel==='instagram'&&activeTab==='trend'?loadTrend():load(draft?.id))}>{t('Refresh status','상태 새로고침')}</button></div>
  {error&&<p className="admin-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {channel==='instagram'&&<nav className="marketing-subtabs" aria-label={t('Marketing sections','마케팅 메뉴')} role="tablist">{tabItems.map(([value,label])=><button key={value} type="button" role="tab" aria-selected={activeTab===value} className={activeTab===value?'active':''} onClick={()=>setActiveTab(value)}>{label}{value==='generation'&&generationThreads.some((thread:Row)=>thread.status==='failed')&&<span className="marketing-tab-dot" aria-label={t('Failed generation exists','실패한 생성 있음')}/>}</button>)}</nav>}
  {channel==='instagram'&&activeTab==='growth'&&<AdminMarketingGrowth locale={locale}/>}
  {channel==='instagram'&&activeTab==='reels'&&<AdminMarketingReels locale={locale}/>}
  {channel==='instagram'&&activeTab==='draft'&&<>
   <div className="marketing-setup"><strong>{t('API cost guard','API 비용 안전장치')}</strong><p>{t('Reserved today','오늘 예약액')} ${Number(generation?.usage?.daily_reserved_usd||0).toFixed(2)} / ${Number(generation?.usage?.daily_budget_usd||2).toFixed(2)}. {t('This month','이번 달')} ${Number(generation?.usage?.monthly_reserved_usd||0).toFixed(2)} / ${Number(generation?.usage?.monthly_budget_usd||6).toFixed(2)}. {t('Paid generation attempts','오늘 유료 생성 시도')} {generation?.usage?.daily_attempts||0}. {t('Safety-counted jobs','안전 카운트')} {generation?.usage?.daily_calls||0}/5.</p><p className="admin-help">{t('No automatic paid retries or fallback. With Pexels configured, automatic posts use 2–3 rights-reviewed photographs and wait for approval of new images. Without Pexels, the existing AI visual flow remains. Overall daily/monthly AI budgets and generation limits remain the safety controls. External account spending is separate.','유료 API 자동 재시도나 자동 대체는 없습니다. Pexels 설정 시 자동 콘텐츠에 검수된 사진 2~3장을 사용하며 신규 사진은 승인을 기다립니다. Pexels 미설정 시 기존 AI 이미지 흐름을 유지합니다. 전체 일/월 AI 예산과 생성 횟수 한도가 비용 안전장치로 적용됩니다. 다른 서비스의 API 사용액은 이 한도에 포함되지 않습니다.')}</p>{generation?.usage?.daily_budget_override_expires_at&&<p className="admin-help">{t('Temporary daily limit is active until midnight KST. It will automatically fall back to the normal $2.00 limit.','오늘만 임시 한도가 적용 중입니다. KST 자정이 지나면 기본 $2.00 한도로 자동 복귀합니다.')}</p>}
    {!generation?.provider?.configured&&<p className="admin-error">{t('OPENAI_API_KEY is missing from this deployment. Configure Vercel Production and redeploy.','이 배포에 OPENAI_API_KEY가 없습니다. Vercel Production 설정 후 재배포가 필요합니다.')}</p>}
    {generation?.control?.blocked_reason&&<p className="admin-error" role="alert">{generation.control.blocked_reason}</p>}
    <button type="button" className="admin-secondary" onClick={()=>void (async()=>{try{const enable=blocked;if(enable&&!window.confirm(t('Resume after checking API configuration? Budgets are not reset and failed jobs are not retried.','API 설정을 확인했나요? 사용 한도를 초기화하거나 실패 작업을 재시도하지 않고 AI를 재개합니다.')))return;const r=await request('/generation/control',{enabled:enable,confirm_resume:enable},'PUT');if(!r.ok)throw new Error(r.data.error);setGeneration(r.data);}catch(e){setError(e instanceof Error?e.message:'Could not update AI control');}})()}>{blocked?t('Resume after checking configuration','설정 확인 후 AI 재개'):t('Pause paid AI','유료 AI 일시 중지')}</button>
   </div>
   {running&&<div className="generation-progress active" role="status" aria-live="polite"><strong>{stage(running.stage)}</strong><p>{t('You may leave this page. Returning only reads the existing job, never restarts it.','페이지를 나가도 이미 접수된 작업은 서버에서 처리합니다. 다시 접속해도 같은 작업을 새로 시작하지 않습니다.')}</p></div>}
   <section className="marketing-generator-card">
    <div className="admin-section-title"><div><p className="admin-kicker">{t('Create','생성')}</p><Heading level={2}>{t('New content','새 콘텐츠 생성')}</Heading></div></div>
    <div className="admin-form">
     <div className="admin-two"><label><span>{t('Content basis','콘텐츠 기준')}</span><select value={basis} onChange={e=>setBasis(e.target.value)}><option value="prelaunch">{t('Pre-launch','오픈 전 홍보')}</option><option value="live_event">{t('Live event','정식 이벤트')}</option><option value="growth_carousel">Growth Carousel</option></select></label><label><span>{t('Manual generation method','수동 생성 방식')}</span><select value={manualVisualSource} onChange={e=>setManualVisualSource(e.target.value as 'auto_ai'|'uploaded'|'none'|'pexels')}><option value="pexels">{t('Copy + reviewed Pexels photos','문구 + 검수된 Pexels 사진')}</option><option value="auto_ai">{t('Copy + real-photo-first visuals','문구 + 실제 사진 우선')}</option><option value="uploaded">{t('Copy + my uploads','문구 + 직접 업로드')}</option><option value="none">{t('Copy only','문구만')}</option></select></label></div>
     <label><span>{t('Cover / headline language','표지 / 제목 언어')}</span><select value={contentLanguage} onChange={e=>setContentLanguage(e.target.value as 'ko'|'en')}><option value="ko">{t('Korean post','한국어 콘텐츠')}</option><option value="en">{t('English post','영어 콘텐츠')}</option></select></label>
     {basis==='live_event'?<div className="admin-two"><label><span>{t('Event to promote','홍보할 이벤트')}</span><select value={eventId} onChange={e=>setEventId(e.target.value)}><option value="">{t('Choose an event','이벤트 선택')}</option>{(data.live_events||[]).map((event:Row)=><option key={event.id} value={event.id}>{event.title_ko||event.title} · {new Date(event.starts_at).toLocaleDateString(locale,{timeZone:'Asia/Seoul'})}</option>)}</select></label><label><span>{t('Campaign stage','홍보 단계')}</span><select value={eventCampaignStage} onChange={e=>setEventCampaignStage(e.target.value)}><option value="auto">{t('Auto from event status','이벤트 상태로 자동 추천')}</option><option value="launch">{t('Launch','오픈')}</option><option value="experience">{t('Experience','참가 경험')}</option><option value="venue">{t('Venue','장소')}</option><option value="participants">{t('Participants','참가자 구성')}</option><option value="momentum">{t('Momentum / offer','모멘텀 / 혜택')}</option><option value="imminent">{t('Imminent','임박')}</option><option value="last_call">{t('Last call','라스트콜')}</option></select></label></div>:null}
     {basis==='growth_carousel'?<label><span>{t('Topic','주제')}</span><select value={topic} onChange={e=>setTopic(e.target.value)}>{topics.map((x,i)=><option key={x} value={x}>{t(x.replaceAll('_',' '),topicKo[i])}</option>)}</select></label>:null}
     {['pexels','auto_ai'].includes(manualVisualSource)?<p className="admin-help">{t(
      'Pexels-first: 5-card posts need at least '+Number(settings?.carousel_min_real_photos_5??3)+' real photos; 3-card posts need at least '+Number(settings?.carousel_min_real_photos_3??2)+'. New photos require approval. Approved assets are reusable after the cooldown. '+(settings?.carousel_ai_thumbnail_enabled?'An optional AI cover is generated only AFTER photo approval.':'AI cover is disabled.')+' If too few photos are available, the draft stays in review with no AI replacement.',
      'Pexels 우선: 5장 카드뉴스는 실제 사진 '+Number(settings?.carousel_min_real_photos_5??3)+'장 이상, 3장은 '+Number(settings?.carousel_min_real_photos_3??2)+'장 이상 필요합니다. 신규 사진은 승인 후 사용, 승인 사진은 중복 제한 후 재사용합니다. '+(settings?.carousel_ai_thumbnail_enabled?'사진 승인 후 AI 썸네일 1장을 생성할 수 있습니다.':'AI 썸네일은 꺼져 있습니다.')+' 부족하면 AI로 대체하지 않고 검수 대기합니다.'
     )}</p>:manualVisualSource==='uploaded'?<div className="marketing-setup">
      <strong>{t('Add images now','이미지 바로 추가')}</strong>
      <p className="admin-help">{t('Select 1–6 images here. When you generate, Roundy will create the copy, create a Draft, upload these files, and render the final cards automatically. Image AI is not called.','여기서 이미지를 1–6장 선택하세요. 콘텐츠 생성 시 문구 생성 → 초안 생성 → 이미지 업로드 → 최종 카드 렌더까지 자동으로 이어집니다. 이미지 AI는 호출하지 않습니다.')}</p>
      <div className="admin-two"><label><span>{t('New files are','새 파일 유형')}</span><select value={pendingAssetType} onChange={e=>setPendingAssetType(e.target.value as 'photo'|'completed_card')}><option value="photo">{t('Photo source','사진 소스')}</option><option value="completed_card">{t('Completed 4:5 card','완성 4:5 카드')}</option></select></label><label><span>{t('Choose images','이미지 선택')}</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy||!!running} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';void work(()=>addPendingMarketingImages(files));}}/></label></div>
      <div className="marketing-draft-inbox">{pendingMarketingImages.map((item,index)=><article className="marketing-draft-card" key={item.id}><img src={item.preview} alt={item.file.name}/><div className="marketing-draft-copy"><strong>{index+1}. {item.file.name}</strong><small>{Math.round(item.file.size/1024)} KB · {item.width}×{item.height}</small><select value={item.asset_type} onChange={e=>updatePendingMarketingImageType(item.id,e.target.value as 'photo'|'completed_card')}><option value="photo">{t('Photo source','사진 소스')}</option><option value="completed_card">{t('Completed 4:5 card','완성 4:5 카드')}</option></select></div><div className="admin-form-actions"><button type="button" className="admin-secondary" disabled={busy||index===0} onClick={()=>movePendingMarketingImage(index,-1)}>↑</button><button type="button" className="admin-secondary" disabled={busy||index===pendingMarketingImages.length-1} onClick={()=>movePendingMarketingImage(index,1)}>↓</button><button type="button" className="admin-secondary" disabled={busy} onClick={()=>removePendingMarketingImage(item.id)}>{t('Remove','제거')}</button></div></article>)}</div>
      {!pendingMarketingImages.length&&<p className="admin-help">{t('No images selected yet. JPEG, PNG or WebP, max 10 MB each.','아직 선택한 이미지가 없습니다. JPEG, PNG, WebP, 장당 최대 10MB입니다.')}</p>}
     </div>:<p className="admin-help">{t('Copy only: no images are generated. You can add visuals later.','문구만: 이미지를 생성하지 않습니다. 나중에 비주얼을 추가할 수 있습니다.')}</p>}
     <label><span>{t('Creative direction','커스텀 지시문')}</span><textarea value={direction} maxLength={500} rows={4} onChange={e=>setDirection(e.target.value)}/><small>{direction.length}/500</small></label>
     <p className="admin-help">{t('Roundy logo, coral accents and typography are composed server-side for photo-source cards. Completed 4:5 cards are used without additional design overlays.','사진 소스 카드는 Roundy 로고, 코랄 강조와 타이포를 서버에서 합성합니다. 완성된 4:5 카드는 추가 디자인 합성 없이 그대로 사용합니다.')}</p>
     {basis==='growth_carousel'&&<p className="admin-help">{CONTENT_PROFILES[postType({content_mode:basis,topic_type:topic})].label}: {CONTENT_PROFILES[postType({content_mode:basis,topic_type:topic})].roles.join(' → ')}</p>}
     {basis==='growth_carousel'&&['book_insight','trend_research','dating_myth'].includes(topic)&&<p className="admin-help">{t('High-context research may use up to three targeted searches before one structured writing request. Missing evidence triggers one safe fallback when possible.','고품질 검색으로 목적별 검색을 최대 3회 사용한 뒤 구조화된 문구를 작성합니다. 근거가 부족하면 가능한 경우 안전한 비연구 콘텐츠로 1회 전환합니다.')}</p>}
     <p className="admin-help">{t('Caption order: Korean → English → sources → tagline and 5 relevant tags. Tags are selected for topic relevance; live search volume is not measured.','캡션 순서: 국문 → 영어 → 출처 → 태그라인과 관련 태그 5개. 태그는 주제 관련성으로 선별하며 실시간 검색량 순위는 아닙니다.')}</p>
     <button type="button" className="admin-primary" disabled={busy||!!running||blocked||(manualVisualSource==='uploaded'&&!pendingMarketingImages.length)} onClick={()=>void generate(false)}>{manualVisualSource==='uploaded'?t('Generate with my images','내 이미지로 콘텐츠 생성'):t('Generate content','콘텐츠 생성')}</button>
    </div>
   </section>
   <div className="admin-section-title"><div><p className="admin-kicker">{t('Working inbox','작업함')}</p><Heading level={2}>{t('Drafts','초안')}</Heading><p>{t('Only editable drafts appear here. Scheduled and published posts move to Publishing history.','편집 가능한 초안만 표시됩니다. 예약 또는 게시된 콘텐츠는 게시 기록으로 이동합니다.')}</p></div><button type="button" className="admin-secondary" onClick={()=>setActiveTab('generation')}>{t('Add from generated results','생성 결과에서 가져오기')}</button></div>
   <div className="marketing-draft-inbox">{data.drafts.length?data.drafts.map((item:Row)=>{const publication=publicationInfo(item);return <article className={'marketing-draft-card '+(draft?.id===item.id?'selected':'')} key={item.id}>{item.images?.[0]?<img src={item.images[0]} alt="" />:<span className="marketing-draft-thumb placeholder"/>}<div className="marketing-draft-copy"><strong>{contentTitle(item)}</strong><p>{contentLabel(item)} · {item.content_language==='en'?'EN':'KO'} · {item.quality_report?.status==='passed'?t('Ready for review','검토 가능'):t('Needs quality review','품질 검토 필요')}</p><small><span className={'marketing-status-pill '+publication.status}>{publication.label}</span> · {new Date(item.imported_at||item.updated_at).toLocaleString(locale,{timeZone:'Asia/Seoul'})}</small></div><button type="button" className={draft?.id===item.id?'admin-primary':'admin-secondary'} disabled={busy||!!running} onClick={()=>{if(dirty&&!window.confirm(t('Discard unsaved changes?','저장하지 않은 수정을 버릴까요?')))return;selectDraft(item);}}>{draft?.id===item.id?t('Editing','편집 중'):t('Edit','편집')}</button></article>}):<div className="admin-empty"><p>{t('No editable drafts yet. Generate content, then add a completed result from Generation history.','아직 편집 가능한 초안이 없습니다. 콘텐츠를 생성한 뒤 생성 기록의 완료 결과를 초안으로 가져오세요.')}</p><button type="button" className="admin-secondary" onClick={()=>setActiveTab('generation')}>{t('Open Generation history','생성 기록 열기')}</button></div>}</div>
   {!draft?<p className="admin-empty">{t('Select a working draft above to edit it.','위 작업함에서 편집할 초안을 선택하세요.')}</p>:<div className="marketing-layout"><div className="admin-form marketing-editor"><p>{draft.generation_reason}</p><p>{draft.draft_date} / v{draft.revision} / {draft.status} / {draft.content_language==='en'?t('English content','영어 콘텐츠'):t('Korean content','한국어 콘텐츠')}</p><p>{t('Recommended window','추천 게시 시간')}: {draft.window_start_kst?.slice(0,5)}–{draft.window_end_kst?.slice(0,5)} KST</p>
    {draft.content_document?.answer_first===true&&Array.isArray(draft.content_document?.thumbnail_candidates)&&
     <div className="marketing-setup">
      <strong>{t('Answer-First cover headlines','Answer-First 썸네일 문구')}</strong>
      <p className="admin-help">{t('Choose one of three concrete, evidence-aware result headlines. Result → Context → Detail → Value → CTA.','핵심 결론과 검증된 정보 중심의 썸네일 문구 3개 중 하나를 선택하세요. Result → Context → Detail → Value → CTA.')}</p>
      <div className="marketing-draft-inbox">
       {(draft.content_document.thumbnail_candidates as string[]).map((title:string,index:number)=>{
        const selected=Number(draft.content_document.thumbnail_selected_index??0)===index;
        return <article className="marketing-draft-card" key={index}>
         <div className="marketing-draft-copy"><strong>{index+1}. {title}</strong><small>{selected?t('Selected cover','선택한 썸네일'):t('Alternative','다른 후보')}</small></div>
         <button type="button" className={selected?'admin-primary':'admin-secondary'} aria-pressed={selected}
          disabled={busy||!!running||dirty||draft.status!=='needs_approval'||selected}
          onClick={()=>void work(async()=>{
           const response=await mutate('/draft/'+draft.id+'/thumbnail',{revision:draft.revision,index},'PATCH');
           await load(draft.id);
           setNotice(response.rerender_required?t('Headline selected. Re-render the cover before publishing.','썸네일 문구를 선택했습니다. 게시 전에 기존 이미지를 다시 렌더링하세요.'):t('Headline selected. Run the free quality recheck before publishing.','문구 선택을 저장했습니다. 게시 전 무료 품질 검사를 실행하세요.'));
          })}>{selected?t('Selected','선택됨'):t('Use this headline','이 문구 선택')}</button>
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
    <div className="marketing-setup marketing-preflight-status" role="group" aria-label={t('Seven pre-publication checks','발행 전 자동 검증 7개 항목')}>
     <strong>{t('Pre-publication checks (7)','발행 전 자동 검증 (7개 항목)')} — {preflightReady?t('All passed; human approval still required','모두 통과, 관리자 최종 승인 필요'):t('Publishing blocked until every check passes','검증 완료 전 발행 차단')}</strong>
     {!currentPreflight&&<p className="admin-error" role="status">{t('Checking saved copy, selected photos and render margins. Publishing remains disabled.','저장된 문구와 사진 승인, 렌더링 여백을 확인하고 있습니다. 검증 결과가 나오기 전에는 발행할 수 없습니다.')}</p>}
     {preflightChecks.map((check:Row)=>{
      const label=locale==='ko'?check.label:localizedCheck[String(check.id)]||check.label;
      return <div key={check.id} className="marketing-quality-status">
       <strong>{check.passed?'✓':'✕'} {label}</strong>
       <p className={check.passed?'admin-help':'admin-error'}>{check.passed
        ?t('Verified','검증 통과'):String(check.detail||t('Review required','확인 필요'))}</p>
      </div>;
     })}
     <p className="admin-help">{t('Only the seven checks plus the existing editorial quality review can authorize publishing. Photo approval changes invalidate the previous check.','7개 검증과 기존 문구 품질 검사를 모두 통과해야 승인할 수 있습니다. 사진 승인 상태 변경 시 재검사가 필요합니다.')}</p>
    </div>
    <div className="marketing-quality-status" role="status">
     <strong>{draft.quality_report?.status==='passed'&&preflightReady?t('Copy and preflight checks passed — final human approval required','문구 및 발행 전 검증 통과 — 관리자 최종 승인 필요'):t('Copy or preflight review required — publishing blocked','문구 또는 발행 전 검증 필요 — 게시 차단')}</strong>
     {(draft.quality_report?.issues||[]).map((issue:string)=><p key={issue}>{issue}</p>)}
     {draft.status==='needs_approval'&&<button type="button" className="admin-secondary" disabled={busy||!!running||dirty} onClick={()=>void work(async()=>{const r=await request('/quality/recheck',{draft_id:draft.id,revision:draft.revision});if(!r.ok)throw new Error(r.data.error);selectDraft(r.data.draft);setNotice(t('Quality check finished. No AI request was made.','품질 검사를 마쳤습니다. AI를 호출하지 않았습니다.'));})}>{t('Recheck saved edits — no AI charge','저장한 내용 품질 검사 — AI 비용 없음')}</button>}
    </div>
    {draft.visual_source==='pexels'&&<div className="marketing-setup">
      <strong>{t('Pexels photo rights review','Pexels 사진 저작권 검수')}</strong>
      <p className="admin-help">{t('Review Pexels license, original source, photographer, depicted people and trademarks. Existing card typography overlays the approved photos.','Pexels 라이선스, 원본 출처, 사진가, 인물 및 상표를 검수하세요. 기존 카드 디자인에서 승인 사진 위에 텍스트를 오버레이합니다.')}</p>
      <p className="admin-help" role="status">{t('Approved real photos','승인된 실제 사진')} {stockReview?.approved??stockPhotos.filter((p:Row)=>p.review_status==='approved').length}/{stockReview?.minimum??draft.content_document?.photo_sourcing?.min_real_photos??3} — {stockReview?.ready?t('Ready for rendering','렌더링 준비 완료'):t('Awaiting human review or more photos','관리자 검수 또는 추가 사진 대기')}</p>
      {stockReview?.configured===false&&<p className="admin-error" role="alert">{t('Pexels API is not configured. Already approved photos may be reused; no AI replacement is made.','Pexels API 키가 없어 신규 사진 검색은 불가능합니다. 기존 승인 사진만 재사용할 수 있으며 AI로 대체하지 않습니다.')}</p>}
      <div className="marketing-draft-inbox">{stockPhotos.length?stockPhotos.map((photo:Row)=><article className="marketing-draft-card" key={photo.asset_id}>
       <img src={photo.preview_url} alt={t('Pexels photo candidate','Pexels 사진 후보')}/>
       <div className="marketing-draft-copy">
        <strong>{t('Card','카드')} {Number(photo.slot)+1} · {photo.review_status==='approved'?t('Approved','승인됨'):photo.review_status==='rejected'?t('Rejected','거절됨'):t('Pending rights review','저작권 검수 대기')}</strong>
        <small><a href={photo.source_url} target="_blank" rel="noopener noreferrer">Photo by {photo.photographer} on Pexels</a> · <a href={photo.license_url} target="_blank" rel="noopener noreferrer">{t('License','라이선스')}</a> · <a href={photo.image_url} target="_blank" rel="noopener noreferrer">{t('Original','원본')}</a></small>
       </div>
       {photo.review_status==='pending'&&<div className="admin-form-actions"><button type="button" className="admin-primary" disabled={busy||!!running} onClick={()=>void work(()=>reviewStock(photo,'approved'))}>{t('Approve photo','사진 승인')}</button><button type="button" className="admin-secondary" disabled={busy||!!running} onClick={()=>void work(()=>reviewStock(photo,'rejected'))}>{t('Reject','거절')}</button></div>}
      </article>):<p className="admin-empty">{t('No stock photos selected. Search for Pexels candidates.','선정된 사진이 없습니다. Pexels 사진 후보를 검색하세요.')}</p>}</div>
      {draft.status==='needs_approval'&&<div className="admin-form-actions">
       <button type="button" className="admin-secondary" disabled={busy||!!running||!!draft.images?.length} onClick={()=>void work(discoverStock)}>{t('Search / replace photos','사진 재검색 / 교체')}</button>
       <button type="button" className="admin-primary" disabled={busy||!!running||dirty||stockReview?.ready!==true||!!draft.images?.length} onClick={()=>void work(renderStock)}>{draft.content_document?.photo_sourcing?.ai_thumbnail_enabled?t('Render approved photos + AI cover','승인 사진과 AI 썸네일 렌더링'):t('Render real photos (no image AI)','실제 사진 렌더링 (이미지 AI 없음)')}</button>
      </div>}
     </div>}
     {draft.visual_source!=='pexels'&&draft.generation_source==='manual'&&draft.draft_role==='candidate'&&<div className="marketing-setup">
     <strong>{t('Manual images','직접 이미지')}</strong>
     <p className="admin-help">{t('Upload 1–6 JPEG, PNG or WebP files (max 10 MB each). Photo source adds Roundy typography; completed card is used as-is. Uploaded rendering makes no image-AI request.','JPEG, PNG, WebP 이미지를 1–6장 업로드할 수 있습니다(장당 최대 10MB). 사진 소스는 Roundy 타이포를 합성하고, 완성 카드는 그대로 사용합니다. 업로드 렌더에서는 이미지 AI를 호출하지 않습니다.')}</p>
     <div className="admin-two"><label><span>{t('Upload type','업로드 유형')}</span><select value={uploadAssetType} onChange={e=>setUploadAssetType(e.target.value as 'photo'|'completed_card')}><option value="photo">{t('Photo source','사진 소스')}</option><option value="completed_card">{t('Completed 4:5 card','완성 4:5 카드')}</option></select></label><label><span>{t('Add images','이미지 추가')}</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy||!!running} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';void work(()=>uploadMarketingImages(files));}}/></label></div>
     <div className="ordered-image-list">{uploadedImages.map((img:Row,index:number)=><div key={img.id} className="marketing-draft-card">{img.signed_url?<img src={img.signed_url} alt=""/>:<span className="marketing-draft-thumb placeholder"/>}<div className="marketing-draft-copy"><strong>{index+1}. {img.asset_type==='completed_card'?t('Completed card','완성 카드'):t('Photo source','사진 소스')}</strong><select value={img.role} onChange={e=>void work(()=>updateUpload(img.id,{role:e.target.value}))}><option value="cover">{t('Cover','표지')}</option><option value="body">{t('Body','본문')}</option><option value="flexible">{t('Flexible','자동 배치')}</option></select></div><div className="admin-form-actions"><button type="button" className="admin-secondary" disabled={busy||index===0} onClick={()=>void work(()=>moveUpload(index,-1))}>↑</button><button type="button" className="admin-secondary" disabled={busy||index===uploadedImages.length-1} onClick={()=>void work(()=>moveUpload(index,1))}>↓</button><button type="button" className="admin-secondary" disabled={busy} onClick={()=>void work(()=>deleteUpload(img.id))}>{t('Delete','삭제')}</button></div></div>)}</div>
     <button type="button" className="admin-primary" disabled={busy||!!running||dirty||uploadedImages.length===0} onClick={()=>void work(renderUploaded)}>{t('Render with uploaded images — $0 image AI','업로드 이미지로 렌더 — 이미지 AI $0')}</button>
    </div>}
    <label><span>{t('Caption','캡션')}</span><textarea rows={10} value={draft.caption||''} maxLength={2000} disabled={busy||!!running||draft.status!=='needs_approval'} onChange={e=>changeDraft('caption',e.target.value)}/></label>
    <label><span>CTA</span><input value={draft.cta||''} maxLength={70} disabled={busy||!!running||draft.status!=='needs_approval'} onChange={e=>changeDraft('cta',e.target.value)}/></label>
    <label><span>{t('Destination','연결 주소')}</span><input value={draft.destination_url||''} disabled={busy||!!running||draft.status!=='needs_approval'} onChange={e=>changeDraft('destination_url',e.target.value)}/></label>
    {draft.research_status==='generated_without_sources'&&<p className="admin-error" role="alert">{t('Web Search completed, but OpenAI did not return source metadata. Fact-check this draft manually before publishing.','Web Search는 완료됐지만 OpenAI가 출처 메타데이터를 반환하지 않았습니다. 게시 전에 내용의 사실관계를 직접 확인하세요.')}</p>}
    {!!draft.research_sources?.length&&<div className="growth-sources">{draft.research_sources.map((s:Row)=><a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.publisher||s.title}</a>)}</div>}
    {draft.status==='needs_approval'&&<div className="admin-form-actions"><button type="button" className="admin-secondary" disabled={busy||!!running||!dirty} onClick={()=>void work(async()=>{await mutate('/draft/'+draft.id,{revision:draft.revision,caption:draft.caption,cta:draft.cta,destination_url:draft.destination_url},'PUT');await load(draft.id);})}>{t('Save edits','수정 저장')}</button><button type="button" className="admin-primary" disabled={busy||!!running||dirty||!preflightReady||!draft.caption?.trim()||!draft.images?.length||draft.quality_report?.status!=='passed'||draft.quality_revision!==draft.revision} onClick={()=>{if(window.confirm(t('Approve this exact revision and schedule it for Instagram?','현재 버전의 문구와 이미지를 승인하고 Instagram 게시를 예약할까요?')))void work(async()=>{const result=await mutate('/draft/'+draft.id+'/approve',{revision:draft.revision});await load(draft.id);
  const when=result.run?.scheduled_for?new Date(result.run.scheduled_for).toLocaleString(locale,{timeZone:'Asia/Seoul'}):'';
  setNotice(t('Approved and reserved for ','승인 완료, 발행 예약: ')+when+' KST');});}}>{t('Approve & schedule','승인 후 예약')}</button><button type="button" className="admin-secondary" disabled={busy||!!running||dirty||!preflightReady||!draft.caption?.trim()||!draft.images?.length||draft.quality_report?.status!=='passed'||draft.quality_revision!==draft.revision} onClick={()=>{if(window.confirm(t('Publish this exact saved revision to @roundy.meet NOW? This bypasses the recommended posting time and cannot be undone here.','현재 저장된 버전을 @roundy.meet에 지금 바로 게시할까요? 추천 게시 시간을 무시하며 여기서 게시를 되돌릴 수 없습니다.')))void work(async()=>{const result=await mutate('/draft/'+draft.id+'/publish-now',{revision:draft.revision});await load(draft.id);setNotice(result.published?t('Published to @roundy.meet.','@roundy.meet에 바로 게시했습니다.'):result.needs_review?t('Publish attempt needs review. Check Instagram before resolving it.','게시 결과 확인이 필요합니다. 처리 전에 Instagram에서 실제 게시 여부를 확인하세요.'):result.deferred?t('Daily Feed limit reached. Reserved for '+String(result.feed_date_kst)+' KST.','Feed 일일 한도를 초과해 '+String(result.feed_date_kst)+' KST로 예약했습니다.'):t('Queued for immediate publishing. Refresh status before trying again.','즉시 게시 큐에 넣었습니다. 다시 누르기 전에 상태를 새로고침하세요.'));});}}>{t('Publish now','바로 게시')}</button><button type="button" className="admin-secondary" disabled={busy||!!running} onClick={()=>void work(async()=>{await mutate('/draft/'+draft.id+'/skip',{});await load();})}>{t('Skip','건너뛰기')}</button></div>}
    <p className="admin-help">{t('Generation never publishes. Copy is saved before images, so an image failure does not lose it.','생성만으로는 게시되지 않습니다. 이미지를 만들기 전에 문구부터 저장하므로 이미지 생성이 실패해도 문구는 남습니다.')}</p>
   </div><aside className="marketing-preview"><strong>{t('Saved preview','저장된 미리보기')}</strong>{draft.images?.length?draft.images.map((url:string,i:number)=><img key={url} src={url} alt={'Roundy card '+(i+1)} style={{width:'100%',height:'auto',marginTop:12}}/>):<p>{t('No saved image. Generate cards or a photo.','저장된 이미지가 없습니다. 카드나 사진을 생성하세요.')}</p>}</aside></div>}
  </>}
  {channel==='instagram'&&activeTab==='generation'&&<section className="marketing-tab-panel">
   <div className="admin-section-title"><div><p className="admin-kicker">{t('Activity','활동')}</p><Heading level={2}>{t('Generation history','생성 기록')}</Heading></div><button type="button" className="admin-secondary" disabled={busy} onClick={()=>void work(()=>load(draft?.id))}>{t('Refresh','새로고침')}</button></div>
   <div className="marketing-filter-chips" role="group" aria-label={t('Generation status filter','생성 상태 필터')}>{([['all',t('All','전체')],['completed',t('Completed','완료')],['failed',t('Failed','실패')],['running',t('Running','진행 중')]] as const).map(([value,label])=><button type="button" key={value} aria-pressed={generationFilter===value} onClick={()=>{setGenerationFilter(value);setGenerationVisible(20);}}>{label}</button>)}</div>
   <div className="marketing-log-list">{visibleGenerationThreads.length?visibleGenerationThreads.map((thread:Row)=>{
    const latest=thread.latest as Row,root=thread.root as Row,attempts=thread.attempts as Row[],record=contentRecordForAttempts(attempts);
    const canRetry=thread.status==='failed'&&!latest.automatic&&!!latest.request_payload,publication=publicationInfo(record);
    const language=(record?.content_language||root.request_payload?.language)==='en'?'EN':(record?.content_language||root.request_payload?.language)==='ko'?'KO':'';
    const titledAttempt=[...attempts].reverse().find((attempt:Row)=>attempt.result_snapshot)||latest;
    return <details className={'marketing-log-row generation-thread '+thread.status} key={thread.id}>
     <summary><div className="marketing-log-main"><span className={'marketing-status-dot '+thread.status}/><div><strong>{contentTitle(record||titledAttempt)}</strong><small>{contentLabel(record||root)}{language?' · '+language:''} · {new Date(root.created_at).toLocaleString(locale,{timeZone:'Asia/Seoul'})} · {thread.stepCount} {t('steps','단계')}{thread.retryCount>0&&<> · {t('Retries','재시도')} {thread.retryCount}</>}</small></div></div><div className="marketing-log-end"><span className={'marketing-status-pill '+publication.status}>{publication.label}</span><span className={'marketing-status-pill '+thread.status}>{statusText(thread.status)}</span><small>{'$'+Number(thread.total_reserved_usd).toFixed(2)}</small></div></summary>
     <div className="marketing-log-detail generation-thread-detail">
      <div className="generation-attempts">{attempts.map((attempt:Row,index:number)=><div className={'generation-attempt '+attempt.status} key={attempt.id}>
       <span className={'marketing-status-dot '+attempt.status}/>
       <div className="generation-attempt-copy"><div><strong>{operationLabel(attempt)}{attempt.retry_of_job_id&&<> · {t('Retry','재시도')} {Number(attempt.attempt_number||index+1)}</>}</strong><span className={'marketing-status-pill '+attempt.status}>{statusText(attempt.status)}</span></div><small>{new Date(attempt.created_at).toLocaleString(locale,{timeZone:'Asia/Seoul'})} · {'$'+Number(attempt.reserved_usd||0).toFixed(2)} · {Number(attempt.input_tokens||0).toLocaleString()} in / {Number(attempt.output_tokens||0).toLocaleString()} out</small>{attempt.error_message&&(()=>{const guide=failureGuide(attempt);return <div className="admin-error"><strong>{guide.title}</strong><p>{guide.cause}</p><p>{guide.action}</p><small>{friendlyError(attempt.error_message)}</small></div>;})()}</div>
      </div>)}</div>
      <dl><div><dt>{t('Content workflow ID','콘텐츠 작업 ID')}</dt><dd>{thread.id}</dd></div><div><dt>{t('Steps','작업 단계')}</dt><dd>{thread.stepCount}</dd></div><div><dt>{t('Total reserved','총 예약액')}</dt><dd>{'$'+Number(thread.total_reserved_usd).toFixed(2)}</dd></div></dl>
      {attempts.some((a:Row)=>a.result_snapshot)&&<button type="button" className="admin-primary" onClick={e=>{e.preventDefault();openThreadResult(thread);}}>{t('View result / review notes','결과 및 검토 내용 보기')}</button>}
      {canRetry&&<button type="button" className="admin-secondary" disabled={busy||!!running} onClick={e=>{e.preventDefault();void retryJob(latest);}}>{canOfferSavedCtaRecovery(latest)?t('Recover saved result — no AI charge','저장된 결과로 무료 복구'):t('Retry same settings','같은 설정으로 재시도')}</button>}
      {thread.status==='completed'&&<p className="marketing-thread-success">{t('This content workflow is complete. Copy, visuals, rendering, and retries stay together as one item.','이 콘텐츠 작업은 완료됐습니다. 문구, 이미지, 렌더, 재시도를 하나의 작업으로 묶어 표시합니다.')}</p>}
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
  {channel==='instagram'&&activeTab==='automation'&&<section className="marketing-tab-panel">   {settings&&<div className="marketing-settings-card"><div className="admin-section-title"><div><p className="admin-kicker">{t('Schedule','스케줄')}</p><Heading level={2}>{t('Automation settings','자동화 설정')}</Heading></div></div><form className="admin-form" onSubmit={e=>{e.preventDefault();void work(async()=>{await mutate('/settings',settings,'PUT');await load(draft?.id);setNotice(t('Automation saved.','자동화 설정을 저장했습니다.'));});}}>
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
   {settings&&<div className="marketing-settings-card">
    <div className="admin-section-title"><div>
     <p className="admin-kicker">{t('Next phase','다음 단계 준비')}</p>
     <Heading level={2}>{t('Feed & carousel preferences','Feed 및 카드뉴스 설정')}</Heading>
     <p>{t('New copy and image template settings apply to newly generated cards. Instagram publishing schedules and existing posts remain unchanged.','신규 카드뉴스에 생성 및 템플릿 설정이 적용됩니다. 기존 게시물과 Instagram 발행 스케줄러는 변경하지 않습니다.')}</p>
    </div></div>
    <form className="admin-form" onSubmit={e=>{e.preventDefault();void work(async()=>{
     const editorial=Object.fromEntries(Object.keys(EDITORIAL_SETTINGS_DEFAULTS).map(key=>[key,settings[key]??EDITORIAL_SETTINGS_DEFAULTS[key as keyof typeof EDITORIAL_SETTINGS_DEFAULTS]]));
     await mutate('/settings',editorial,'PATCH');
     await load(draft?.id);
     setNotice(t('Feed and carousel preferences saved.','Feed 및 카드뉴스 설정을 저장했습니다.'));
    });}}>
     <div className="admin-two">
      <label><span>{t('Maximum automatic Feed posts / day','Feed 일일 자동 발행 최대 횟수')}</span>
       <input type="number" min={1} max={10} step={1} value={settings.feed_daily_max_posts??EDITORIAL_SETTINGS_DEFAULTS.feed_daily_max_posts} onChange={e=>setSettings({...settings,feed_daily_max_posts:Number(e.target.value)})}/></label>
      <label><span>{t('Carousel mode','카드뉴스 모드')}</span>
       <select value={settings.carousel_mode??EDITORIAL_SETTINGS_DEFAULTS.carousel_mode} onChange={e=>setSettings({...settings,carousel_mode:e.target.value})}>
        <option value="fixed">Fixed</option><option value="alternating">Alternating</option>
       </select></label>
     </div>
     <p className="admin-help">{t('Active KST daily limit for scheduled AND Publish-now Feed posts. Extra approved posts remain queued for the next eligible KST day. Reels are separate.','예약 및 바로 게시 Feed 모두 KST 일일 한도를 적용합니다. 초과 콘텐츠는 삭제 없이 다음 발행 가능 날짜에 보관합니다. 릴스는 별도입니다.')}</p>
     <div className="admin-two">
      <label><span>{t('Default carousel slides','기본 카드뉴스 장수')}</span>
       <select value={5} disabled aria-label={t('Fixed five-card baseline','5장 기본 구성')}>
        <option value={5}>{t('5 slides','5장')}</option><option value={3}>{t('3 slides','3장')}</option>
       </select></label>
      <label><span>{t('Minimum real photos in 5 slides','5장 중 실제 사진 최소 개수')}</span>
       <input type="number" min={0} max={5} step={1} value={settings.carousel_min_real_photos_5??EDITORIAL_SETTINGS_DEFAULTS.carousel_min_real_photos_5} onChange={e=>setSettings({...settings,carousel_min_real_photos_5:Number(e.target.value)})}/></label>
     </div>
     <label><span>{t('Minimum real photos in 3 slides','3장 중 실제 사진 최소 개수')}</span>
      <input type="number" min={0} max={3} step={1} value={settings.carousel_min_real_photos_3??EDITORIAL_SETTINGS_DEFAULTS.carousel_min_real_photos_3} onChange={e=>setSettings({...settings,carousel_min_real_photos_3:Number(e.target.value)})}/></label>
     <label className="check-row"><input type="checkbox" checked={settings.carousel_ai_thumbnail_enabled??EDITORIAL_SETTINGS_DEFAULTS.carousel_ai_thumbnail_enabled} onChange={e=>setSettings({...settings,carousel_ai_thumbnail_enabled:e.target.checked})}/>{t('AI-generated thumbnail','AI 썸네일 활성화')}</label>
     <label className="check-row"><input type="checkbox" checked={settings.carousel_answer_first_enabled??EDITORIAL_SETTINGS_DEFAULTS.carousel_answer_first_enabled} onChange={e=>setSettings({...settings,carousel_answer_first_enabled:e.target.checked})}/>{t('Answer-First copywriting','Answer-First 카피라이팅 활성화')}</label>
     <label className="check-row"><input type="checkbox" checked={settings.story_preview_auto_enabled??EDITORIAL_SETTINGS_DEFAULTS.story_preview_auto_enabled} onChange={e=>setSettings({...settings,story_preview_auto_enabled:e.target.checked})}/>{t('Automatically generate Story previews','Story 미리보기 자동 생성')}</label>
     <div className="admin-two">
      <label><span>{t('Carousel title font (px)','카드뉴스 제목 폰트 크기 (px)')}</span>
       <input type="number" min={24} max={160} step={1} value={settings.carousel_title_font_size_px??EDITORIAL_SETTINGS_DEFAULTS.carousel_title_font_size_px} onChange={e=>setSettings({...settings,carousel_title_font_size_px:Number(e.target.value)})}/></label>
      <label><span>{t('Carousel body font (px)','카드뉴스 본문 폰트 크기 (px)')}</span>
       <input type="number" min={16} max={80} step={1} value={settings.carousel_body_font_size_px??EDITORIAL_SETTINGS_DEFAULTS.carousel_body_font_size_px} onChange={e=>setSettings({...settings,carousel_body_font_size_px:Number(e.target.value)})}/></label>
     </div>
     <button className="admin-primary" disabled={busy}>{t('Save Feed & carousel preferences','Feed 및 카드뉴스 설정 저장')}</button>
    </form>
   </div>}
  </section>}
  {channel==='instagram'&&activeTab==='connection'&&<section className="marketing-tab-panel">
   <div className="marketing-settings-card"><div className="admin-section-title"><div><p className="admin-kicker">Instagram</p><Heading level={2}>{t('Connection and webhook','연결 및 Webhook')}</Heading></div></div><p>{data.connection?.instagram?t('Publisher configured','게시 계정 설정됨'):t('Publisher needs setup','게시 계정 연결 확인 필요')}</p><p>{t('Comment/DM webhook verification','댓글 및 DM Webhook 인증')}: {data.webhook?.verified_at||t('Not verified','미인증')}</p>{!data.webhook?.verified_at&&<><label>Callback URL<input readOnly value={data.webhook?.callback_url||''}/></label><label>Verify token<input readOnly value={data.webhook?.verify_token||''}/></label></>}</div>
  </section>}
  {channel==='koreapas'&&<div className="admin-form"><Heading level={2}>{t('Koreapas templates','고파스 템플릿')}</Heading><select value={template.id||''} onChange={e=>setTemplate(structuredClone(data.templates.find((x:Row)=>x.id===e.target.value)||blank()))}><option value="">{t('New template','새 템플릿')}</option>{data.templates.filter((x:Row)=>x.channel==='koreapas').map((x:Row)=><option key={x.id} value={x.id}>{x.name}</option>)}</select>{[['name',t('Template name','템플릿 이름')],['title',t('Post title','제목')],['caption',t('Copy','본문')],['cta','CTA'],['destination_url',t('Destination URL','연결 주소')]].map(([key,label])=><label key={key}><span>{label}</span><textarea value={template[key]} onChange={e=>setTemplate({...template,[key]:e.target.value})}/></label>)}<label>{t('JPEG images','JPEG 이미지')}<input type="file" accept="image/jpeg" multiple disabled={busy} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';void work(async()=>{if(files.length+template.images.length>10)throw new Error('Maximum 10 images');const urls:string[]=[];for(const file of files){if(file.type!=='image/jpeg'||file.size>5*1024*1024)throw new Error('JPEG, max 5 MB');urls.push(await uploadFile(file,'wis-event-images'));}setTemplate({...template,images:[...template.images,...urls]});});}}/></label><OrderedImages images={template.images} onChange={images=>setTemplate({...template,images})} locale={locale} disabled={busy}/><div className="marketing-days">{['일','월','화','수','목','금','토'].map((day,i)=><label key={day}><input type="checkbox" checked={template.days.includes(i)} onChange={e=>setTemplate({...template,days:e.target.checked?[...template.days,i]:template.days.filter((x:number)=>x!==i)})}/>{day}</label>)}</div><input type="time" value={template.time_kst.slice(0,5)} onChange={e=>setTemplate({...template,time_kst:e.target.value})}/><label className="check-row"><input type="checkbox" checked={template.enabled} onChange={e=>setTemplate({...template,enabled:e.target.checked})}/>{t('Enable template schedule','템플릿 자동 게시 활성화')}</label><div className="admin-form-actions"><button type="button" className="admin-primary" disabled={busy} onClick={()=>void work(async()=>{const r=await mutate(template.id?'/'+template.id:'',template,template.id?'PUT':'POST');setTemplate(r.template);await load(draft?.id);})}>{t('Save','저장')}</button><button type="button" className="admin-secondary" disabled={busy||!template.id} onClick={()=>{if(window.confirm(t('Publish the SAVED Koreapas template now?','저장된 고파스 템플릿을 지금 게시할까요?')))void work(async()=>{await mutate('/publish',{template_id:template.id,request_key:crypto.randomUUID()});await load(draft?.id);});}}>{t('Publish saved template','저장된 템플릿 게시')}</button><button type="button" className="admin-secondary" disabled={busy||!template.id} onClick={()=>{if(window.confirm(t('Delete this template?','이 템플릿을 삭제할까요?')))void work(async()=>{await mutate('/'+template.id,{},'DELETE');setTemplate(blank());await load(draft?.id);});}}>{t('Delete','삭제')}</button></div></div>}
  {(channel==='koreapas'||activeTab==='publishing')&&<section className={channel==='instagram'?'marketing-tab-panel':''}>
   <div className="admin-section-title"><div><p className="admin-kicker">{t('Delivery','게시')}</p><Heading level={2}>{t('Publishing history','게시 기록')}</Heading></div></div>
   <div className="marketing-log-list">{visibleRuns.length?visibleRuns.map((r:Row)=>{
    const imageUrl=Array.isArray(r.snapshot?.images)?r.snapshot.images[0]:null,record=contentRecordForRun(r),language=(record?.content_language||r.snapshot?.content_language)==='en'?'EN':(record?.content_language||r.snapshot?.content_language)==='ko'?'KO':channel;
    return <details className={'marketing-log-row publishing '+r.status} key={r.id}>
     <summary>{imageUrl?<img className="marketing-log-thumb" src={imageUrl} alt=""/>:<span className="marketing-log-thumb placeholder"/>}<div className="marketing-log-main"><span className={'marketing-status-dot '+r.status}/><div><strong>{contentTitle(record||r)}</strong><small>{contentLabel(record||r)} · {language} · {new Date(r.created_at||r.scheduled_for).toLocaleString(locale,{timeZone:'Asia/Seoul'})}</small></div></div><div className="marketing-log-end"><span className={'marketing-status-pill '+r.status}>{statusText(r.status)}</span></div></summary>
     <div className="marketing-log-detail"><p>{r.message||t('No additional message.','추가 메시지가 없습니다.')}</p><dl><div><dt>{t('Run ID','게시 ID')}</dt><dd>{r.id}</dd></div>{r.external_id&&<div><dt>Instagram ID</dt><dd>{r.external_id}</dd></div>}</dl>{r.external_url&&<a className="admin-secondary" href={r.external_url} target="_blank" rel="noreferrer">{t('Open published post','게시물 보기')}</a>}{r.status==='needs_review'&&<div className="admin-form-actions">{[true,false].map(published=><button key={String(published)} type="button" className="admin-secondary" disabled={busy} onClick={()=>{if(window.confirm(t('Confirm you checked the external channel.','외부 채널에서 실제 게시 여부를 확인했나요?')))void work(async()=>{await mutate('/resolve',{run_id:r.id,published});await load(draft?.id);});}}>{published?t('Confirmed published','게시됨 확인'):t('Confirmed not published','게시 안 됨 확인')}</button>)}</div>}</div>
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
    {resultPreview.attempt.status==='completed'&&<button type="button" className="admin-secondary" disabled={busy} onClick={()=>{if(window.confirm(t('Reject this result for quality and enable rework in the same thread?','이 결과를 품질 불합격 처리하고 같은 스레드에서 재작업할까요?')))void work(async()=>{const r=await request('/generation/jobs/'+resultPreview.attempt.id+'/reject',{confirm_reject:true});if(!r.ok)throw new Error(r.data.error);setResultPreview(null);await load(draft?.id);setActiveTab('generation');});}}>{t('Reject quality / request rework','품질 불합격 및 재작업 요청')}</button>}
    <div className="admin-form-actions"><button type="button" className="admin-primary" disabled={busy||resultPreview.attempt.status!=='completed'||resultPreview.attempt.quality_report?.status==='rejected'} onClick={()=>void importResultToDraft()}>{t('Add to Drafts','초안으로 가져오기')}</button><button type="button" className="admin-secondary" onClick={()=>setResultPreview(null)}>{t('Close','닫기')}</button></div>
   </section>
  </div>}
 </section>;
}
