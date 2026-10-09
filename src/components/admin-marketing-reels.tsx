'use client';
import {useEffect,useRef,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {Heading} from './heading';
import {tr,type Locale} from '@/lib/locale';
import {createStoryReel,mp4RecorderMime} from '@/lib/marketing-reel-renderer';
import {assertMp4File,REEL_BUCKET,REEL_MAX_BYTES} from '@/lib/marketing-reel-policy';

type Row=Record<string,any>;
type StudioCopy={title:string;hook_text:string;caption:string;language:'ko'|'en';pillar:string;hook_style:string};
const empty=():StudioCopy=>({
 title:'Seoul stories',hook_text:'One small thing about Seoul',caption:'Seoul moments worth sharing. Follow @roundy.meet.',
 language:'en',pillar:'culture',hook_style:'curiosity'
});
const api=async(path='',payload?:unknown,method='POST')=>{
 const r=await fetch('/api/admin/marketing/reels'+path,payload===undefined?
  {cache:'no-store'}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 const data=await r.json().catch(()=>({error:'REEL_INVALID_RESPONSE'}));
 if(!r.ok||data.error)throw new Error(data.error||'REEL_SERVER_ERROR');
 return data;
};
const humanTime=(value:string,locale:string)=>new Date(value).toLocaleString(locale,{timeZone:'Asia/Seoul',hour12:false});
const pillarLabels:Record<string,[string,string]>={
 seoul:['Seoul discoveries','서울 트렌드'],culture:['Korea life','한국 생활'],humor:['Relatable humor','공감형 유머'],
 people:['People and conversation','사람과 대화'],brand:['Roundy updates','라운디 소식']
};
async function videoMetadata(file:File):Promise<{duration_seconds:number;width:number;height:number;file_size:number}>{
 await assertMp4File(file);
 return new Promise((resolve,reject)=>{
  const element=document.createElement('video'),src=URL.createObjectURL(file);
  const clear=()=>{element.removeAttribute('src');element.load();URL.revokeObjectURL(src);};
  element.onloadedmetadata=()=>{
   const duration=Number(element.duration),width=element.videoWidth,height=element.videoHeight;
   clear();
   if(!Number.isFinite(duration)||duration<3||duration>90||width<360||height<640||
    width>1920||height>1920||Math.abs(width/height-9/16)>.045)reject(new Error('REEL_MUST_BE_9_16_AND_3_TO_90_SECONDS'));
   else resolve({duration_seconds:Math.round(duration*100)/100,width,height,file_size:file.size});
  };
  element.onerror=()=>{clear();reject(new Error('REEL_MP4_METADATA_UNAVAILABLE'));};
  element.preload='metadata';element.src=src;
 });
}
export function AdminMarketingReels({locale}:{locale:Locale}){
 const t=(en:string,ko:string)=>tr(locale,en,ko);
 const [rows,setRows]=useState<Row[]>([]),[metrics,setMetrics]=useState<Row|null>(null);
 const [selected,setSelected]=useState<Row|null>(null),[copy,setCopy]=useState<StudioCopy>(empty());
 const [file,setFile]=useState<File|null>(null),[localVideoUrl,setLocalVideoUrl]=useState<string|null>(null);
 const [story,setStory]=useState<[string,string,string]>(['What surprised you about Seoul?','One little detail to notice','Save this idea for the weekend']);
 const [photos,setPhotos]=useState<File[]>([]),[sourceKind,setSourceKind]=useState<'upload'|'storyboard'>('upload');
 const [scheduledAt,setScheduledAt]=useState(''),[rights,setRights]=useState(false);
 const [copyReviewed,setCopyReviewed]=useState(false),[videoReviewed,setVideoReviewed]=useState(false);
 const [busy,setBusy]=useState(false),[progress,setProgress]=useState(0);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
 const urlRef=useRef<string|null>(null);
 const replaceLocalVideo=(next:File|null)=>{
  if(urlRef.current)URL.revokeObjectURL(urlRef.current);
  urlRef.current=next?URL.createObjectURL(next):null;setLocalVideoUrl(urlRef.current);setFile(next);
 };
 useEffect(()=>()=>{if(urlRef.current)URL.revokeObjectURL(urlRef.current);},[]);
 const select=(row:Row|null)=>{
  setSelected(row);setCopy(row?{title:row.title,hook_text:row.hook_text,caption:row.caption,language:row.language,
   pillar:row.pillar,hook_style:row.hook_style}:empty());
  setRights(false);setCopyReviewed(false);setVideoReviewed(false);setScheduledAt('');
  replaceLocalVideo(null);setPhotos([]);setProgress(0);
 };
 const load=async(id?:string)=>{
  const response=await api('',undefined,'GET');
  setRows(response.drafts||[]);setMetrics(response.metrics||null);
  const current=id||selected?.id;
  const match=response.drafts?.find((row:Row)=>row.id===current)||null;
  if(match)select(match);
 };
 useEffect(()=>{let stopped=false;api('',undefined,'GET')
  .then(result=>{if(!stopped){setRows(result.drafts||[]);setMetrics(result.metrics||null);}})
  .catch(e=>{if(!stopped)setError(e instanceof Error?e.message:String(e));})
  .finally(()=>{if(!stopped)setLoading(false);});
  return()=>{stopped=true;};},[]);
 const work=async(callback:()=>Promise<void>)=>{
  if(busy)return;setBusy(true);setError('');setMessage('');
  try{await callback();}catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 };
 const updateCopy=(key:keyof StudioCopy,value:string)=>{setCopy(row=>({...row,[key]:value}));setRights(false);setCopyReviewed(false);setVideoReviewed(false);};
 const save=async()=>{
  if(selected){
   const result=await api('/'+selected.id,{...copy,revision:selected.revision},'PATCH');
   await load(result.draft.id);setMessage(t('Reel copy saved; re-review is required.','문구 저장 완료. 검수를 다시 진행해야 합니다.'));
  }else{
   const result=await api('',copy,'POST');await load(result.draft.id);
   setMessage(t('Draft created. Add a video next.','초안을 생성했습니다. 이제 영상을 추가하세요.'));
  }
 };
 const idea=async()=>{
  const result=await api('/ideas?pillar='+encodeURIComponent(copy.pillar)+'&language='+copy.language,undefined,'GET');
  const item=result.idea as Row;
  setCopy(row=>({...row,title:item.title,hook_text:item.hook_text,caption:item.caption}));
  if(Array.isArray(item.frames)&&item.frames.length>=3)setStory([item.frames[0],item.frames[1],item.frames[2]]);
  setRights(false);setCopyReviewed(false);setVideoReviewed(false);
  setMessage(t('Original editorial outline loaded. Verify details and save.','콘텐츠 기획안을 불러왔습니다. 내용을 확인한 뒤 저장하세요.'));
 };
 const storyboard=async()=>{
  setProgress(0);
  const output=await createStoryReel(story,photos,value=>setProgress(value));
  replaceLocalVideo(output);setSourceKind('storyboard');
  setMessage(t('9:16 MP4 created. Preview it, then upload and review.','9:16 MP4가 생성됐습니다. 미리보기 후 업로드와 검수를 진행하세요.'));
 };
 const upload=async()=>{
  if(!selected)throw new Error('SAVE_REEL_DRAFT_FIRST');
  if(!file)throw new Error('SELECT_MP4_OR_GENERATE_STORYBOARD_FIRST');
  if(file.size>REEL_MAX_BYTES)throw new Error('REEL_MP4_MAXIMUM_40MB');
  const meta=await videoMetadata(file),storage=createClient().storage;
  const key=selected.id+'/'+crypto.randomUUID()+'.mp4';
  const uploaded=await storage.from(REEL_BUCKET).upload(key,file,{contentType:'video/mp4',upsert:false});
  if(uploaded.error)throw uploaded.error;
  const registered=await api('/'+selected.id+'/register',{
   ...meta,storage_path:key,source_kind:sourceKind,revision:selected.revision
  });
  await load(registered.draft.id);
  setMessage(t('MP4 uploaded and verified on the server. Review the preview before approval.','MP4 업로드 및 서버 검증 완료. 게시 승인 전 영상을 확인하세요.'));
 };
 const review=async()=>{
  if(!selected)throw new Error('SAVE_REEL_DRAFT_FIRST');
  const result=await api('/'+selected.id+'/review',{
   revision:selected.revision,confirm_rights:rights,confirm_editorial:copyReviewed,confirm_video_preview:videoReviewed
  });
  await load(result.draft.id);
  setMessage(t('Editorial and usage-rights review recorded. You can now approve publishing.','콘텐츠 및 사용 권한 검수 기록 완료. 게시 승인을 진행할 수 있습니다.'));
 };
 const approve=async()=>{
  if(!selected)throw new Error('SAVE_REEL_DRAFT_FIRST');
  const label=scheduledAt?t('Approve and schedule this Reel?','이 릴스를 예약 게시하도록 승인할까요?'):
   t('Approve this Reel for the next publisher dispatch?','이 릴스를 다음 게시 워커 실행에 게시하도록 승인할까요?');
  if(!window.confirm(label))return;
  const date=scheduledAt?new Date(scheduledAt+(scheduledAt.length===16?':00':'')+'+09:00').toISOString():null;
  const result=await api('/'+selected.id+'/approve',{
   revision:selected.revision,confirm_publish:true,confirm_final_preview:true,scheduled_for:date
  });
  await load(result.queued?.draft?.id||selected.id);
  setMessage(t('Approved and queued. Refresh to track processing; do not submit twice.','승인 후 게시 대기열에 등록했습니다. 진행 상태를 새로고침으로 확인하세요. 중복 등록하지 마세요.'));
 };
 const retry=async()=>{
  if(!selected||!window.confirm(t('Re-open a safely failed Reel for another full review?','게시 시도 전 실패한 릴스를 다시 검수할 수 있도록 열까요?')))return;
  const result=await api('/'+selected.id+'/retry',{confirm_retry:true,revision:selected.revision});
  await load(result.draft.id);
 };
 const resolve=async(published:boolean)=>{
  if(!selected||!window.confirm(t('Did you independently check @roundy.meet for this Reel?','@roundy.meet에서 실제 게시 여부를 확인했나요?')))return;
  const result=await api('/'+selected.id+'/resolve',{confirm_external_check:true,published});
  await load(result.draft?.id||selected.id);
 };
 const statusLabels:Record<string,[string,string]>={
  draft:['Editing','편집 중'],needs_review:['Review required','검수 필요'],queued:['Approved / queued','승인 / 게시 대기'],
  published:['Published','게시 완료'],failed:['Failed','실패'],needs_review_publish:['Check Instagram','인스타 확인 필요'],
  rejected:['Rejected','반려']
 };
 const canEdit=!selected||['draft','needs_review'].includes(selected.status);
 const changed=selected&&(['title','hook_text','caption','language','pillar','hook_style'] as const)
  .some(key=>copy[key]!==selected[key]);
 if(loading)return <section className="marketing-tab-panel marketing-reel-studio"><p role="status">{t('Loading Reel Studio…','릴스 스튜디오를 불러오는 중…')}</p></section>;
 return <section className="marketing-tab-panel">
  <div className="admin-section-title"><div><p className="admin-kicker">ROUNDY REEL STUDIO</p>
   <Heading level={2}>{t('Reels: create, review, publish and learn','릴스 제작, 검수, 게시, 성과 분석')}</Heading>
   <p>{t('Create a 9:16 MP4 from your own photos and text where supported, or upload an edited MP4. Nothing publishes without explicit approval.','지원 브라우저에서는 직접 만든 사진과 문구로 9:16 MP4를 제작하거나 편집한 MP4를 업로드할 수 있습니다. 관리자 승인 전에는 게시되지 않습니다.')}</p>
  </div></div>
  {error&&<p className="admin-error" role="alert">{error}</p>}
  {message&&<p role="status">{message}</p>}
  <div className="admin-form-actions">
   <button type="button" className="admin-primary" disabled={busy} onClick={()=>select(null)}>{t('New Reel','새 릴스')}</button>
   <button type="button" className="admin-secondary" disabled={busy} onClick={()=>void work(()=>load(selected?.id))}>{t('Refresh','새로고침')}</button>
  </div>
  <div className="marketing-settings-card">
   <Heading level={3}>{t('Reel drafts','릴스 작업함')}</Heading>
   <div className="marketing-draft-inbox">{rows.length?rows.map(row=><button type="button" key={row.id}
    className="admin-secondary" aria-pressed={selected?.id===row.id} onClick={()=>select(row)}>
    <strong className="marketing-reel-draft-title">{row.title||t('Untitled Reel','제목 없는 릴스')}</strong>
    <span className="marketing-reel-draft-status">{t(...(statusLabels[row.status]||['Unknown','알 수 없음']))}</span>
   </button>):<p className="admin-help">{t('No Reels yet. Create the first draft below.','아직 릴스가 없습니다. 아래에서 첫 초안을 생성하세요.')}</p>}</div>
  </div>
  <div className="marketing-settings-card">
   <Heading level={3}>{selected?t('Edit Reel','릴스 편집'):t('Create a new Reel','새 릴스 제작')}</Heading>
   {selected&&<p className="admin-help">{t('Status','상태')}: {t(...(statusLabels[selected.status]||['Unknown','알 수 없음']))} · {t('Revision','수정 버전')} {selected.revision}</p>}
   <div className="admin-form">
    <div className="admin-two">
     <label><span>{t('Content pillar','콘텐츠 유형')}</span><select disabled={!canEdit||busy} value={copy.pillar} onChange={e=>updateCopy('pillar',e.target.value)}>
      {Object.entries(pillarLabels).map(([id,names])=><option key={id} value={id}>{t(...names)}</option>)}
     </select></label>
     <label><span>{t('Hook type','첫 2초 훅 전략')}</span><select disabled={!canEdit||busy} value={copy.hook_style} onChange={e=>updateCopy('hook_style',e.target.value)}>
      <option value="curiosity">{t('Curiosity','궁금증 유발')}</option><option value="practical">{t('Practical tip','실용 정보')}</option><option value="humor">{t('Relatable humor','공감형 유머')}</option>
     </select></label>
     <label><span>{t('Language','언어')}</span><select disabled={!canEdit||busy} value={copy.language} onChange={e=>updateCopy('language',e.target.value)}>
      <option value="en">English</option><option value="ko">한국어</option>
     </select></label>
    </div>
    <label><span>{t('Editorial title','콘텐츠 제목')}</span><input disabled={!canEdit||busy} maxLength={100} value={copy.title} onChange={e=>updateCopy('title',e.target.value)}/></label>
    <label><span>{t('First two seconds hook','첫 2초 훅 문구')}</span><input disabled={!canEdit||busy} maxLength={110} value={copy.hook_text} onChange={e=>updateCopy('hook_text',e.target.value)}/></label>
    <label><span>{t('Instagram caption','인스타그램 캡션')}</span><textarea disabled={!canEdit||busy} rows={4} maxLength={2000} value={copy.caption} onChange={e=>updateCopy('caption',e.target.value)}/></label>
    {canEdit&&<div className="admin-form-actions">
     <button type="button" disabled={busy} className="admin-secondary" onClick={()=>void work(idea)}>{t('Suggest an editorial idea (free)','콘텐츠 기획안 추천 (무료)')}</button>
     <button type="button" disabled={busy||Boolean(selected&&!changed)} className="admin-primary" onClick={()=>void work(save)}>{selected?t('Save changes','변경 사항 저장'):t('Create draft','초안 생성')}</button>
    </div>}
    {canEdit&&<div className="marketing-settings-card">
     <Heading level={3}>{t('Create a 9:16 MP4 storyboard','9:16 MP4 스토리보드 제작')}</Heading>
     <p className="admin-help">{t('Three original scenes, three seconds each. Optional licensed photos. This creates a real silent MP4 locally in browsers supporting H.264 MP4 MediaRecorder. If unavailable, upload a finished MP4.','직접 만든 3개 장면을 각 3초씩 구성합니다. 저작권을 확인한 사진을 사용할 수 있습니다. H.264 MP4 녹화를 지원하는 브라우저에서는 실제 무음 MP4를 생성합니다. 미지원 브라우저에서는 완성된 MP4를 업로드하세요.')}</p>
     {story.map((value,i)=><label key={i}><span>{t('Scene','장면')} {i+1}</span>
      <input maxLength={110} disabled={busy} value={value} onChange={e=>setStory(current=>current.map((v,j)=>j===i?e.target.value:v) as [string,string,string])}/>
     </label>)}
     <label className="marketing-reel-picker">
      <span>{t('Optional original/licensed photos (up to three)','선택: 직접 제작하거나 사용 허가를 받은 사진 최대 3장')}</span>
      <span className="marketing-reel-picker-control">
       <b>{t('Choose photos','사진 선택')}</b>
       <small>{photos.length?t('Selected photos: ','선택한 사진: ')+photos.length:t('No photos selected. Text-only storyboard is supported.','사진 없이 문구로만 제작할 수도 있습니다.')}</small>
      </span>
      <input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>setPhotos(Array.from(e.target.files||[]).slice(0,3))}/>
     </label>
     <button type="button" disabled={busy||!mp4RecorderMime()} className="admin-secondary" onClick={()=>void work(storyboard)}>{mp4RecorderMime()?t('Render 9-second MP4','9초 MP4 제작'):t('MP4 encoding unavailable in this browser','이 브라우저는 MP4 제작 미지원')}</button>
     {busy&&progress>0&&progress<100&&<p role="status">{t('Rendering MP4','MP4 렌더링')} {progress}%</p>}
    </div>}
    {canEdit&&<label className="marketing-reel-picker">
     <span>{t('Or upload an edited portrait MP4 (3–90 s, max 40 MB)','또는 편집된 세로형 MP4 업로드 (3~90초, 최대 40MB)')}</span>
     <span className="marketing-reel-picker-control">
      <b>{t('Choose MP4','MP4 선택')}</b>
      <small>{file?file.name:t('No video selected','아직 영상을 선택하지 않았습니다.')}</small>
     </span>
     <input type="file" accept="video/mp4,.mp4" disabled={busy}
      onChange={e=>{const next=e.target.files?.[0]||null;replaceLocalVideo(next);setSourceKind('upload');}}/>
    </label>}
    {localVideoUrl||selected?.preview_url?<div className="marketing-settings-card">
     <strong>{t('Video preview','영상 미리보기')}</strong>
     <video controls playsInline preload="metadata" src={localVideoUrl||selected?.preview_url} style={{display:'block',width:'min(100%,330px)',aspectRatio:'9 / 16',objectFit:'contain',background:'#151515',marginTop:12}}/>
     {selected?.duration_seconds&&!file&&<p className="admin-help">{selected.duration_seconds}s · {selected.width} × {selected.height}</p>}
    </div>:<p className="admin-help">{t('No MP4 attached yet.','MP4 파일이 아직 등록되지 않았습니다.')}</p>}
    {canEdit&&<button type="button" className="admin-primary" disabled={busy||!selected||!file||Boolean(changed)}
     onClick={()=>void work(upload)}>{t('Upload and verify MP4','MP4 업로드 및 검증')}</button>}
    {canEdit&&selected?.video_storage_path&&<div className="marketing-settings-card">
     <Heading level={3}>{t('Human editorial and rights review','관리자 콘텐츠 및 저작권 검수')}</Heading>
     <label className="check-row"><input type="checkbox" checked={rights} onChange={e=>setRights(e.target.checked)}/>{t('I own or have publishing rights for this video, footage, photos and audio.','영상, 사진, 음원의 게시 권한을 보유하거나 적법하게 허락받았습니다.')}</label>
     <label className="check-row"><input type="checkbox" checked={copyReviewed} onChange={e=>setCopyReviewed(e.target.checked)}/>{t('I checked factual claims, captions, language, branding and source accuracy.','사실 관계, 문구, 언어, 브랜딩, 출처를 확인했습니다.')}</label>
     <label className="check-row"><input type="checkbox" checked={videoReviewed} onChange={e=>setVideoReviewed(e.target.checked)}/>{t('I watched the saved MP4 preview and approved its visuals and subtitles.','저장된 MP4 미리보기를 직접 확인하고 영상과 자막을 승인했습니다.')}</label>
     <button type="button" className="admin-primary" disabled={busy||Boolean(changed)||!rights||!copyReviewed||!videoReviewed} onClick={()=>void work(review)}>{t('Record review','검수 완료 기록')}</button>
    </div>}
    {selected?.status==='needs_review'&&selected.rights_attested===true&&!changed&&<div className="marketing-settings-card">
     <Heading level={3}>{t('Approve Reel publishing','릴스 게시 승인')}</Heading>
     <p className="admin-help">{t('Leave the schedule blank for the next publisher dispatch. Any exact time is interpreted as Korea Standard Time. Meta processing may take additional time.','예약을 비우면 다음 게시 워커에서 처리합니다. 예약 날짜와 시각은 한국 시간 기준이며, Meta 영상 처리로 추가 지연될 수 있습니다.')}</p>
     <label><span>{t('Scheduled time (KST, optional)','예약 게시 (KST, 선택)')}</span>
      <input type="datetime-local" value={scheduledAt} onChange={e=>setScheduledAt(e.target.value)}/>
     </label>
     <button type="button" className="admin-primary" disabled={busy} onClick={()=>void work(approve)}>{t('Approve and queue Reel','승인 후 게시 대기열 등록')}</button>
    </div>}
    {selected?.status==='failed'&&<button type="button" className="admin-secondary" disabled={busy} onClick={()=>void work(retry)}>{t('Request safe manual retry','안전한 수동 재시도')}</button>}
    {selected?.status==='needs_review_publish'&&<div className="marketing-settings-card">
     <p className="admin-error">{t('Meta may already have published this Reel. Check @roundy.meet before resolving; never retry automatically.','Meta에 이미 게시됐을 가능성이 있습니다. @roundy.meet를 확인한 뒤에만 상태를 처리하세요. 자동 재시도하지 않습니다.')}</p>
     <div className="admin-form-actions">
      <button type="button" disabled={busy} className="admin-secondary" onClick={()=>void work(()=>resolve(true))}>{t('Verified published','실제 게시됨 확인')}</button>
      <button type="button" disabled={busy} className="admin-secondary" onClick={()=>void work(()=>resolve(false))}>{t('Verified not published','미게시 확인')}</button>
     </div>
    </div>}
   </div>
  </div>
  <section className="marketing-insight-section marketing-reel-analytics" aria-labelledby="reel-analytics-title">
   <header className="marketing-insight-section-head">
    <div>
     <Heading level={3} id="reel-analytics-title">{t('Reel performance','릴스 성과 분석')}</Heading>
     <p>{t('Real Meta insights captured 24 and 72 hours after posting','Meta 게시 후 24시간과 72시간에 수집된 실제 지표')}</p>
    </div>
    <span className="marketing-insight-pill">{metrics?.summary?.learning_ready?t('Learning','성과 반영 중'):t('Experiment','실험 단계')}</span>
   </header>
   <dl className="marketing-insight-kpis">
    <div className="marketing-insight-kpi">
     <dt>{t('Measured Reels','측정 릴스')}</dt>
     <dd>{Number(metrics?.summary?.sample?.posts||0).toLocaleString()}</dd>
     <small>{t('At least 30 reached per Reel','릴스별 도달 30명 이상')}</small>
    </div>
    <div className="marketing-insight-kpi">
     <dt>{t('Cumulative reach','누적 도달')}</dt>
     <dd>{Number(metrics?.summary?.sample?.reach||0).toLocaleString()}</dd>
     <small>{t('For hook experiments','훅 실험 참고 지표')}</small>
    </div>
   </dl>
   <div className="marketing-insight-notice">
    <span className="marketing-insight-notice-dot" aria-hidden="true"/>
    <div>
     <strong>{metrics?.summary?.learning_ready?t('Preliminary leading hook:','초기 우세 훅:')+' '+metrics.summary.recommended_hook:t('More data needed','학습을 위한 데이터가 부족합니다.')}</strong>
     <p>{t('No hook type is selected until the minimum sample and reach thresholds are met.','최소 게시물 수와 도달 기준을 충족할 때까지 훅 유형을 자동으로 선정하지 않습니다.')}</p>
    </div>
   </div>
   <ul className="marketing-reel-hook-list">
    {(metrics?.summary?.hooks||[]).map((row:Row)=><li className="marketing-reel-hook" key={row.hook_style}>
     <div className="marketing-reel-hook-head">
      <strong>{row.hook_style}</strong>
      <span>{Number(row.posts||0)}{t(' posts','건')}</span>
     </div>
     <div className="marketing-reel-hook-meta">
      <span>{t('Reach','도달')} {Number(row.reach||0).toLocaleString()}</span>
      <span>{t('Shares / 100','도달 100명당 공유')} {Number(row.share_rate||0)}</span>
      <span>{t('Saves / 100','도달 100명당 저장')} {Number(row.save_rate||0)}</span>
      {row.watch_rate!=null&&<span>{t('Average watch','평균 시청 비율')} {row.watch_rate}%</span>}
     </div>
    </li>)}
   </ul>
   <p className="marketing-insight-footnote">{t('Reach, views and watch time are not proof of new followers. Some insights depend on your Meta permissions.','조회수, 도달, 시청 시간은 팔로워 획득 지표가 아닙니다. 일부 지표는 Meta 계정 권한에 따라 제공되지 않을 수 있습니다.')}</p>
  </section> </section>;
}
