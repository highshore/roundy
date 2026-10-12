'use client';

import {useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {tr,type Locale} from '@/lib/locale';
import {createTimelineReel} from '@/lib/marketing-reel-timeline-renderer';
import {mp4RecorderMime} from '@/lib/marketing-reel-renderer';
import type {ReelPlan,ReelScene} from '@/lib/marketing-reel-creative';
import './admin-marketing-reel-creative.css';

type Row=Record<string,any>;
type Props={
 locale:Locale;draft:Row|null;pillar:string;language:'ko'|'en';busy:boolean;
 onDraftCreated:(draft:Row)=>void;onVideoReady:(file:File)=>void;
};
const base='/api/admin/marketing/reels';
async function request(path:string,body?:unknown,method='POST'){
 const response=await fetch(base+path,body===undefined?{cache:'no-store'}:{
  method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'
 });
 const value=await response.json().catch(()=>({}));
 if(!response.ok||value.error)throw new Error(String(value.error||'REEL_CREATIVE_REQUEST_FAILED'));
 return value;
}
const formatLabel:Record<string,[string,string]>={
 myth_vs_reality:['Myth vs reality','통념과 현실'],three_quick_tips:['Three quick tips','실전 팁 3가지'],
 awkward_moment_fix:['Awkward moment fix','어색한 순간 바꾸기'],
 what_to_say_instead:['Say this instead','이렇게 말해보세요'],
 relatable_observation:['Relatable observation','현실 공감']
};
const assetExt=(file:File)=>{
 if(file.type==='video/mp4')return 'mp4';
 if(file.type==='image/jpeg')return 'jpg';
 if(file.type==='image/png')return 'png';
 if(file.type==='image/webp')return 'webp';
 throw new Error('REEL_ASSET_FORMAT_NOT_SUPPORTED');
};
export function AdminMarketingReelCreative({locale,draft,pillar,language,busy,onDraftCreated,onVideoReady}:Props){
 const t=(en:string,ko:string)=>tr(locale,en,ko);
 const [ideas,setIdeas]=useState<Row[]>([]),[ideaRun,setIdeaRun]=useState<string|null>(null);
 const [picked,setPicked]=useState<number|null>(null);
 const [assets,setAssets]=useState<Row[]>([]),[existingPhotos,setExistingPhotos]=useState<Row[]>([]);
 const [plan,setPlan]=useState<ReelPlan|null>(null),[dirty,setDirty]=useState(false);
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [progress,setProgress]=useState(0),[previewIndex,setPreviewIndex]=useState(0);
 const [mediaFile,setMediaFile]=useState<File|null>(null);
 const [uploadKind,setUploadKind]=useState<'licensed_video'|'approved_photo'>('licensed_video');
 const [creator,setCreator]=useState(''),[sourceUrl,setSourceUrl]=useState(''),[licenseUrl,setLicenseUrl]=useState(''),
  [licenseNote,setLicenseNote]=useState(''),[owned,setOwned]=useState(false),[rightsConfirmed,setRightsConfirmed]=useState(false);
 const [aiPrompt,setAiPrompt]=useState('');
 const [importId,setImportId]=useState('');
 const [showLibrary,setShowLibrary]=useState(false);
 const canEdit=!draft||['draft','needs_review'].includes(draft.status)&&!draft.marketing_run_id;
 const savedPlan=draft?.creative_plan?.version===1?draft.creative_plan as ReelPlan:null;
 useEffect(()=>{
  setPlan(savedPlan?structuredClone(savedPlan):null);
  setDirty(false);setPreviewIndex(0);setProgress(0);
 },[draft?.id,draft?.revision]);
 const approved=useMemo(()=>assets.filter(a=>a.review_status==='approved'),[assets]);
 const scene=plan?.scenes[previewIndex];
 const sceneMedia=scene?.asset_id?assets.find(a=>a.id===scene.asset_id):null;
 const sourceMap=Object.fromEntries(approved.map(a=>[a.id,{
  kind:a.kind,preview_url:a.preview_url,review_status:'approved' as const
 }]));
 const loadLibrary=async()=>{
  const r=await request('/assets',undefined,'GET');
  setAssets(r.assets||[]);
 };
 useEffect(()=>{void loadLibrary().catch(()=>{});},[]);
 async function act(fn:()=>Promise<void>){
  if(busy||loading)return;
  setLoading(true);setError('');setMessage('');
  try{await fn();}catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{setLoading(false);}
 }
 function updateScene(index:number,patch:Partial<ReelScene>){
  if(!plan||!canEdit)return;
  setPlan({...plan,scenes:plan.scenes.map((s,i)=>i===index?{...s,...patch}:s)});
  setDirty(true);
 }
 function updatePlan(patch:Partial<ReelPlan>){
  if(!plan||!canEdit)return;setPlan({...plan,...patch});setDirty(true);
 }
 async function generateIdeas(){
  if(!window.confirm(t('Generate five AI Reel ideas? One paid model request uses the shared Roundy marketing budget.',
   'AI 릴스 주제 5개를 생성할까요? 유료 모델 1회 호출이며 Roundy 마케팅 공통 예산을 사용합니다.')))return;
  const r=await request('/ai/ideas',{
   request_key:'reel-ideas:'+crypto.randomUUID(),pillar,language,confirm_paid_ai:true
  });
  setIdeas(r.candidates||[]);setIdeaRun(r.run_id||null);setPicked(null);
  setMessage(t('Five candidates reviewed. Select an eligible concept.','주제 후보 5개를 평가했습니다. 기준을 통과한 후보를 선택하세요.'));
 }
 async function loadIdeasHistory(){
  const r=await request('/ai/history',undefined,'GET');
  const found=(r.runs||[]).find((x:Row)=>x.result?.language===language&&x.result?.pillar===pillar);
  if(!found)throw new Error('NO_SAVED_REEL_IDEAS_FOR_LANGUAGE_AND_PILLAR');
  setIdeas(found.result.candidates||[]);setIdeaRun(found.id);setPicked(null);
 }
 async function generateScript(){
  if(!draft||!ideaRun||picked===null)throw new Error('SAVE_DRAFT_AND_SELECT_IDEA_FIRST');
  if(!canEdit)throw new Error('REEL_LOCKED_AFTER_APPROVAL');
  if(!window.confirm(t('Generate a 15–30 second AI Reel script? This creates a NEW unpublished version and uses one paid text-model request.',
    '15~30초 AI 릴스 스크립트를 생성할까요? 새 미발행 버전으로 저장하며 유료 텍스트 모델을 한 번 호출합니다.')))return;
  const r=await request('/'+draft.id+'/ai/script',{
   request_key:'reel-script:'+crypto.randomUUID(),revision:draft.revision,
   ideas_run_id:ideaRun,idea_index:picked,confirm_paid_ai:true
  });
  onDraftCreated(r.draft);setMessage(t('Script saved as a separate draft. Next assign reviewed media and render.',
   '스크립트를 새 초안으로 저장했습니다. 승인 자산을 지정하고 영상을 렌더링하세요.'));
 }
 async function saveStoryboard(){
  if(!draft||!plan||!canEdit||!dirty)throw new Error('REEL_STORYBOARD_NOT_CHANGED');
  if(!window.confirm(t('Save all current scene and script changes as a NEW unpublished version? Existing MP4 and approved versions will remain unchanged.',
   '현재 장면과 스크립트를 새 미발행 버전으로 저장할까요? 기존 MP4와 승인된 버전은 변경되지 않습니다.')))return;
  const r=await request('/'+draft.id+'/storyboard/version',{
   request_key:'storyboard:'+crypto.randomUUID(),revision:draft.revision,
   plan,confirm_version:true
  });
  onDraftCreated(r.draft);
  setMessage(t('Version saved. A fresh MP4 and full review are required.','새 버전 저장 완료. 새 MP4와 전체 검수를 진행해야 합니다.'));
 }
 async function render(){
  if(!plan||!draft||dirty)throw new Error('SAVE_STORYBOARD_VERSION_FIRST');
  if(!mp4RecorderMime())throw new Error('MP4_BROWSER_ENCODER_UNAVAILABLE');
  const missing=plan.scenes.some(s=>s.asset_id&&!approved.some(a=>a.id===s.asset_id));
  if(missing)throw new Error('REEL_APPROVED_ASSETS_ONLY');
  setProgress(0);
  const movie=await createTimelineReel(plan,sourceMap,v=>setProgress(v));
  onVideoReady(movie);
  setMessage(t('Real 9:16 MP4 assembled locally. Preview it, then use the existing upload and rights-review controls below.',
   '실제 9:16 MP4 제작 완료. 영상을 확인한 후 아래 기존 업로드 및 권리 검수 절차를 진행하세요.'));
 }
 async function uploadAsset(){
  if(!mediaFile||!rightsConfirmed||!creator.trim()||!licenseNote.trim())throw new Error('REEL_ASSET_PROVENANCE_REQUIRED');
  if(uploadKind==='licensed_video'&&mediaFile.type!=='video/mp4')throw new Error('REEL_ASSET_MP4_REQUIRED');
  if(uploadKind==='approved_photo'&&!['image/png','image/jpeg','image/webp'].includes(mediaFile.type))
   throw new Error('REEL_ASSET_IMAGE_REQUIRED');
  if(mediaFile.size>40*1024*1024)throw new Error('REEL_ASSET_MAXIMUM_40MB');
  const client=createClient(),session=await client.auth.getUser();
  if(!session.data.user?.id)throw new Error('SIGN_IN_REQUIRED');
  const storagePath=session.data.user.id+'/'+crypto.randomUUID()+'.'+assetExt(mediaFile);
  const saved=await client.storage.from('marketing-reel-assets').upload(storagePath,mediaFile,
   {contentType:mediaFile.type,upsert:false});
  if(saved.error)throw saved.error;
  await request('/assets/register',{
   storage_path:storagePath,content_type:mediaFile.type,kind:uploadKind,creator,
   source_url:sourceUrl,license_url:licenseUrl,license_note:licenseNote,
   original_owned:owned,commercial_use_allowed:true,modifications_allowed:true,rights_attested:true
  });
  await loadLibrary();setMediaFile(null);setRightsConfirmed(false);
  setMessage(t('Asset uploaded as PENDING. Inspect it and explicitly approve rights before use.',
   '자산이 검수 대기로 등록됐습니다. 원본과 사용권을 확인한 뒤 승인해야 사용할 수 있습니다.'));
 }
 async function generateAiImage(){
  if(!window.confirm(t('Generate one original AI image with a paid image-model request? The image remains pending human approval.',
   '유료 이미지 모델로 AI 이미지를 한 장 생성할까요? 생성한 이미지는 관리자 승인 전까지 사용할 수 없습니다.')))return;
  await request('/assets/ai-image',{
   request_key:'reel-image:'+crypto.randomUUID(),prompt:aiPrompt,confirm_paid_ai:true
  });
  await loadLibrary();
  setMessage(t('AI image generated. Review the result before allowing it in a Reel.','AI 이미지 생성 완료. 릴스에서 사용하기 전에 결과를 검수하세요.'));
 }
 async function reviewAsset(asset:Row,status:'approved'|'rejected'){
  if(!window.confirm(t('Confirm the asset source, license, commercial modification rights and preview were reviewed?',
   '원본, 라이선스, 상업적 수정 권한 및 미리보기를 직접 확인했나요?')))return;
  await request('/assets/'+asset.id+'/review',{status,confirm_rights:true});
  await loadLibrary();
  setMessage(t('Asset review recorded. Original media is never overwritten.',
   '자산 검수를 기록했습니다. 기존 원본은 덮어쓰지 않습니다.'));
 }
 async function importPhoto(){
  await request('/assets/import-photo',{photo_id:importId,confirm_import:true});
  await loadLibrary();setImportId('');
  setMessage(t('Previously approved photo imported as an independent archived Reel asset.',
   '기존 승인된 사진을 독립된 릴스 자산으로 보관했습니다.'));
 }
 async function listApprovedPhotos(){
  const r=await fetch('/api/admin/marketing/photos/assets?status=approved',{cache:'no-store'});
  const d=await r.json().catch(()=>({}));if(!r.ok||d.error)throw new Error(d.error||'PHOTO_LIBRARY_UNAVAILABLE');
  setExistingPhotos((d.assets||[]).filter((p:Row)=>p.review_status==='approved'&&p.storage_path));
 }
 function updateScriptHook(value:string){
  if(!plan)return;
  updatePlan({hook_text:value,scenes:plan.scenes.map((scene,i)=>i===0?{...scene,overlay_text:value}:scene)});
 }
 return <section className="roundy-reel-creative" aria-label={t('AI Reel Creative Studio','AI 릴스 크리에이티브 스튜디오')}>
  <div className="roundy-reel-head"><div><p className="admin-kicker">REEL STUDIO / CREATIVE LAB</p>
   <h3>{t('Idea → Script → Scene → Licensed media','아이디어 → 스크립트 → 장면 → 승인 자산')}</h3>
   <p>{t('All creative work remains in drafts. Existing publication approval and Meta retry safety are unchanged.',
    '모든 제작물은 초안으로 저장됩니다. 기존 게시 승인과 Meta 재시도 안전장치는 그대로 유지됩니다.')}</p>
  </div><span>9:16 · 15–30s</span></div>
  {error&&<p role="alert" className="admin-error">{error}</p>}
  {message&&<p role="status" className="admin-help">{message}</p>}
  <div className="roundy-reel-section">
   <div className="roundy-reel-linehead"><h4>{t('1. Explore five AI ideas','1. AI 주제 후보 5개')}</h4>
    <div className="roundy-reel-actions">
     <button type="button" className="admin-primary" disabled={loading||busy||!canEdit} onClick={()=>void act(generateIdeas)}>{t('Generate five ideas','주제 5개 생성')}</button>
     <button type="button" className="admin-secondary" disabled={loading||busy} onClick={()=>void act(loadIdeasHistory)}>{t('Recent ideas','최근 후보 불러오기')}</button>
    </div>
   </div>
   <p className="admin-help">{t('Each option is scored for novelty, practical value and sharing potential. Scores are editorial heuristics, not projected views.',
     '참신성, 실용성, 공유 가치를 평가합니다. 점수는 내부 편집용이며 예상 조회수가 아닙니다.')}</p>
   {!!ideas.length&&<div className="roundy-reel-idea-grid">{ideas.map((idea:Row,i:number)=><article key={i}
    className={'roundy-reel-idea '+(picked===i?'is-picked':'')}>
    <small>{t(...(formatLabel[idea.format_type]||['Editorial','에디토리얼']))} · {Number(idea.score||0)}/100</small>
    <h5>{idea.hook_text}</h5>
    <p>{idea.core_message}</p><small>{t('Why share?','공유할 이유')}: {idea.share_reason}</small>
    {idea.status==='discarded'&&<p className="roundy-reel-warning">{(idea.reasons||[]).join(' / ')}</p>}
    <button type="button" className={picked===i?'admin-primary':'admin-secondary'} disabled={loading||busy||!canEdit||idea.status!=='eligible'}
     onClick={()=>setPicked(i)}>{picked===i?t('Selected','선택됨'):t('Choose idea','아이디어 선택')}</button>
   </article>)}</div>}
   {picked!==null&&<button type="button" className="admin-primary" disabled={!draft||loading||busy||!canEdit||draft.language!==language||draft.pillar!==pillar}
    onClick={()=>void act(generateScript)}>{t('Generate 15–30s script as new version','15~30초 스크립트를 새 버전으로 생성')}</button>}
   {!draft&&<p className="admin-help">{t('Create a Reel draft with the existing form above before generating its script.','스크립트를 생성하려면 위 기존 양식에서 먼저 릴스 초안을 생성하세요.')}</p>}
  </div>
  {plan&&<div className="roundy-reel-section">
   <div className="roundy-reel-linehead"><h4>{t('2. Script and first three seconds','2. 스크립트와 첫 3초')}</h4>
    <span>{t('Hook review','훅 평가')}: {Number(plan.hook_review?.score||0)}/100</span></div>
   <div className="roundy-reel-hook" role="status">
    <strong>{plan.hook_text}</strong><span>{plan.hook_review?.passed?t('Passed','통과'):t('Needs rework','수정 필요')}</span>
    {!!plan.hook_review?.issues?.length&&<small>{plan.hook_review.issues.join(' / ')}</small>}
   </div>
   <div className="roundy-reel-script-grid">
    <label>{t('Reel title','릴스 제목')}<input disabled={!canEdit||loading||busy} value={plan.title} maxLength={100} onChange={e=>updatePlan({title:e.target.value})}/></label>
    <label>{t('0–3 second hook','0~3초 훅')}<input disabled={!canEdit||loading||busy} value={plan.hook_text} maxLength={110} onChange={e=>updateScriptHook(e.target.value)}/></label>
    <label>{t('Caption','캡션')}<textarea rows={3} disabled={!canEdit||loading||busy} value={plan.caption} maxLength={2000} onChange={e=>updatePlan({caption:e.target.value})}/></label>
    <label>{t('Voiceover script (not in silent MP4)','내레이션 스크립트 (무음 MP4에 포함되지 않음)')}
     <textarea rows={4} disabled={!canEdit||loading||busy} value={plan.voiceover_script} maxLength={1800} onChange={e=>updatePlan({voiceover_script:e.target.value})}/></label>
    <label>{t('Share reason','공유 포인트')}<textarea rows={2} disabled={!canEdit||loading||busy} value={plan.share_reason} maxLength={250} onChange={e=>updatePlan({share_reason:e.target.value})}/></label>
    <label>{t('Soft brand ending','마지막 브랜드 연결')}<input disabled={!canEdit||loading||busy} value={plan.cta_soft} maxLength={140} onChange={e=>updatePlan({cta_soft:e.target.value})}/></label>
   </div>
  </div>}
  <div className="roundy-reel-section">
   <div className="roundy-reel-linehead"><h4>{t('3. Licensed media library','3. 사용권 확인 미디어 라이브러리')}</h4>
    <button type="button" className="admin-secondary" onClick={()=>setShowLibrary(v=>!v)}>{showLibrary?t('Hide assets','자산 접기'):t('Manage assets','자산 관리')}</button></div>
   <p className="admin-help">{t('Only human-approved real footage, approved photos or reviewed AI images can appear in the final storyboard. Media stays in private storage.',
    '승인된 실사 영상, 실사 사진, 검수된 AI 이미지만 사용할 수 있습니다. 원본은 비공개 저장소에 보관합니다.')}</p>
   {showLibrary&&<>
    <div className="roundy-reel-asset-form">
     <label>{t('Asset type','자산 종류')}<select value={uploadKind} onChange={e=>setUploadKind(e.target.value as any)} disabled={loading||busy}>
      <option value="licensed_video">{t('Licensed video (MP4)','실사 영상 MP4')}</option><option value="approved_photo">{t('Licensed photo','실사 사진')}</option>
     </select></label>
     <label>{t('Upload source','원본 파일')}<input type="file" accept={uploadKind==='licensed_video'?'video/mp4,.mp4':'image/jpeg,image/png,image/webp'}
      disabled={loading||busy} onChange={e=>setMediaFile(e.target.files?.[0]||null)}/></label>
     <label>{t('Creator / owner','저작자')}<input maxLength={140} value={creator} onChange={e=>setCreator(e.target.value)}/></label>
     <label>{t('Source URL (third-party)','원본 URL (외부 자산)')}<input value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)}/></label>
     <label>{t('License URL (third-party)','라이선스 URL (외부 자산)')}<input value={licenseUrl} onChange={e=>setLicenseUrl(e.target.value)}/></label>
     <label>{t('License evidence','사용 허가 근거')}<textarea rows={2} maxLength={700} value={licenseNote} onChange={e=>setLicenseNote(e.target.value)}/></label>
     <label className="check-row"><input type="checkbox" checked={owned} onChange={e=>setOwned(e.target.checked)}/>{t('I created and own this source material','이 원본을 직접 제작했고 저작권을 보유함')}</label>
     <label className="check-row"><input type="checkbox" checked={rightsConfirmed} onChange={e=>setRightsConfirmed(e.target.checked)}/>{t('Commercial modification and Instagram publishing rights verified','상업적 수정 및 Instagram 게시 권한 확인')}</label>
     <button type="button" className="admin-secondary" disabled={loading||busy||!mediaFile||!rightsConfirmed} onClick={()=>void act(uploadAsset)}>{t('Upload for review','검수용 업로드')}</button>
    </div>
    <div className="roundy-reel-ai-image">
     <label>{t('Original AI image prompt','AI 이미지 설명')}<textarea rows={2} minLength={12} maxLength={350} value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)}/></label>
     <button type="button" className="admin-secondary" disabled={loading||busy||aiPrompt.trim().length<12} onClick={()=>void act(generateAiImage)}>{t('Generate one AI image (paid)','AI 이미지 1장 생성 (유료)')}</button>
    </div>
    <div className="roundy-reel-import">
     <button type="button" className="admin-secondary" disabled={loading||busy} onClick={()=>void act(listApprovedPhotos)}>{t('Browse already approved Roundy photos','기존 승인 Roundy 사진 불러오기')}</button>
     {!!existingPhotos.length&&<><select aria-label={t('Approved existing photo','기존 승인 사진')} value={importId} onChange={e=>setImportId(e.target.value)}>
      <option value="">{t('Select a photo to reuse','재사용할 사진 선택')}</option>
      {existingPhotos.map((p:Row)=><option key={p.id} value={p.id}>{String(p.provider||'Photo')} / {String(p.photographer||'')}</option>)}
     </select><button type="button" className="admin-secondary" disabled={!importId||loading||busy} onClick={()=>void act(importPhoto)}>{t('Import preserved photo','승인 사진 가져오기')}</button></>}
    </div>
    <div className="roundy-reel-asset-grid">{assets.map(a=><article key={a.id}>
     <div className="roundy-reel-asset-preview">{a.preview_url?
      a.kind==='licensed_video'?<video src={a.preview_url} controls playsInline preload="metadata"/>:<img src={a.preview_url} alt={String(a.creator)}/>:null}</div>
     <strong>{a.kind.replaceAll('_',' ')}</strong><small>{a.creator}</small>
     <small>{a.review_status} · {a.license_note}</small>
     {a.source_url&&<a href={a.source_url} target="_blank" rel="noopener noreferrer">{t('Source','원본')}</a>}
     {a.license_url&&<a href={a.license_url} target="_blank" rel="noopener noreferrer">{t('License','라이선스')}</a>}
     {a.review_status==='pending'&&<div className="roundy-reel-actions">
      <button type="button" className="admin-secondary" disabled={loading||busy} onClick={()=>void act(()=>reviewAsset(a,'approved'))}>{t('Approve rights','권한 확인 후 승인')}</button>
      <button type="button" className="admin-secondary" disabled={loading||busy} onClick={()=>void act(()=>reviewAsset(a,'rejected'))}>{t('Reject','거절')}</button>
     </div>}
    </article>)}</div>
   </>}
  </div>
  {plan&&<div className="roundy-reel-section">
   <div className="roundy-reel-linehead"><h4>{t('4. 9:16 scene timeline & preview','4. 9:16 장면 타임라인 및 미리보기')}</h4>
    <span>{plan.scenes.reduce((sum,s)=>sum+s.duration_sec,0)}s · {t(...formatLabel[plan.format_type])}</span></div>
   <div className="roundy-reel-editor">
    <div className="roundy-reel-phone">
     <div className="roundy-reel-phone-media">{sceneMedia?.preview_url?
      sceneMedia.kind==='licensed_video'
       ?<video controls muted playsInline src={sceneMedia.preview_url}/>
       :<img src={sceneMedia.preview_url} alt={sceneMedia.creator||'Reel background'}/>
      :null}</div>
     <div className="roundy-reel-phone-overlay">
      <small>ROUNDY / SEOUL</small><strong>{scene?.overlay_text||''}</strong><small>@roundy.meet</small>
     </div>
     <span className="roundy-reel-phone-index">{previewIndex+1}/{plan.scenes.length}</span>
    </div>
    <div className="roundy-reel-track">
     <div className="roundy-reel-timeline">{plan.scenes.map((s,i)=><button type="button" key={i} aria-pressed={previewIndex===i} className={previewIndex===i?'active':''}
      onClick={()=>setPreviewIndex(i)}><small>{i+1} · {s.role}</small><strong>{s.overlay_text}</strong><small>{s.duration_sec}s</small></button>)}</div>
     {scene&&<div className="roundy-reel-scene-fields">
      <label>{t('On-screen text','영상 자막')}<input value={scene.overlay_text} maxLength={110} disabled={!canEdit||busy||loading}
       onChange={e=>{updateScene(previewIndex,{overlay_text:e.target.value});if(previewIndex===0)updateScriptHook(e.target.value);}}/></label>
      <label>{t('Voiceover line','내레이션 문장')}<textarea rows={2} maxLength={280} value={scene.voiceover_line}
       disabled={!canEdit||busy||loading} onChange={e=>updateScene(previewIndex,{voiceover_line:e.target.value})}/></label>
      <label>{t('Scene duration (s)','장면 길이 (초)')}<input type="number" min={previewIndex===0?3:3} max={previewIndex===0?3:9} value={scene.duration_sec}
       disabled={!canEdit||busy||loading||previewIndex===0} onChange={e=>updateScene(previewIndex,{duration_sec:Number(e.target.value)})}/></label>
      <label>{t('Background (approved media only)','배경 자산 (승인된 자산만)')}
       <select disabled={!canEdit||busy||loading} value={scene.asset_id||''} onChange={e=>updateScene(previewIndex,{asset_id:e.target.value||null})}>
        <option value="">{t('Text-only branded backdrop','브랜드 컬러 배경')}</option>
        {approved.map(a=><option key={a.id} value={a.id}>{a.kind.replaceAll('_',' ')} — {a.creator}</option>)}
       </select>
      </label>
     </div>}
     <div className="roundy-reel-actions">
      <button type="button" className="admin-secondary" disabled={!dirty||!canEdit||busy||loading} onClick={()=>void act(saveStoryboard)}>
       {t('Save edited timeline as new draft','타임라인 변경사항 새 초안으로 저장')}</button>
      <button type="button" className="admin-primary" disabled={dirty||!canEdit||busy||loading||!mp4RecorderMime()}
       onClick={()=>void act(render)}>{mp4RecorderMime()?t('Render 9:16 MP4','9:16 MP4 제작'):t('Upload finished MP4 (browser codec unavailable)','MP4 업로드 필요 (브라우저 인코더 미지원)')}</button>
     </div>
     {loading&&progress>0&&progress<100&&<p role="status">{t('Rendering','렌더링 중')} {progress}%</p>}
     <p className="admin-help">{t('Preview shows the planned text and selected media. The actual generated MP4 is verified after upload. It is silent; record voiceover separately if desired.',
      '현재 화면은 구성 미리보기입니다. 실제 생성 MP4는 업로드 후 서버에서 검증합니다. 결과는 무음이며 내레이션은 별도로 녹음해야 합니다.')}</p>
    </div>
   </div>
  </div>}
 </section>;
}
