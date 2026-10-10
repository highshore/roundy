'use client';
import {useCallback,useEffect,useState} from 'react';
import {Heading} from './heading';
import {tr,type Locale} from '@/lib/locale';
type Row=Record<string,any>;
const BASE='/api/admin/marketing/stories';
async function storyRequest(path='',body?:unknown){
 const response=await fetch(BASE+path,body===undefined?{cache:'no-store'}:{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
 });
 const payload=await response.json().catch(()=>({error:'STORY_RESPONSE_UNAVAILABLE'}));
 if(!response.ok)throw new Error(payload.error||'STORY_ACTION_FAILED');
 return payload;
}
const labels:Record<string,[string,string]>={
 generating:['Generating','생성 중'],generated:['Generated: review required','생성됨: 검수 필요'],
 approved:['Approved','승인됨'],scheduled:['Scheduled','게시 예약됨'],
 publishing:['Publishing','게시 중'],published:['Published','게시됨'],
 manual_ready:['Manual upload ready','수동 업로드 준비 완료'],
 needs_review:['Publishing outcome uncertain','게시 결과 확인 필요'],
 failed:['Failed','실패'],canceled:['Canceled','취소됨']
};
export function AdminMarketingStories({locale}:{locale:Locale}){
 const t=(en:string,ko:string)=>tr(locale,en,ko);
 const [stories,setStories]=useState<Row[]>([]),[attempts,setAttempts]=useState<Row[]>([]);
 const [capability,setCapability]=useState<Row|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{
  const response=await storyRequest();
  setStories(response.stories||[]);setAttempts(response.attempts||[]);
 },[]);
 useEffect(()=>{let active=true;storyRequest().then(r=>{if(!active)return;
  setStories(r.stories||[]);setAttempts(r.attempts||[]);
 }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Could not load Stories');})
 .finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 async function run(action:()=>Promise<unknown>,message:string){
  if(busy)return;
  setBusy(true);setError('');setNotice('');
  try{await action();await load();setNotice(message);}
  catch(e){setError(e instanceof Error?e.message:'STORY_ACTION_FAILED');await load().catch(()=>{});}
  finally{setBusy(false);}
 }
 const status=(s:string)=>labels[s]?t(...labels[s]):s;
 return <section className="marketing-tab-panel">
  <div className="admin-section-title"><div>
   <p className="admin-kicker">INSTAGRAM STORIES</p>
   <Heading level={2}>{t('Tomorrow’s Feed previews','내일 Feed 미리보기 Stories')}</Heading>
   <p>{t('9:16 JPEG teasers derived from an already approved Feed cover. Stories are separate from the Feed daily limit.',
    '승인된 Feed의 썸네일 일부로 9:16 JPEG 미리보기를 만듭니다. Story는 Feed 일일 발행 제한에 포함되지 않습니다.')}</p>
  </div></div>
  <div className="marketing-setup">
   <strong>{t('Publishing capabilities','Instagram API 게시 지원')}</strong>
   <p className="admin-help">{t(
    'Automatic publishing is only for static JPEG Stories on a verified Instagram Business account with content publishing access. Link stickers, polls, interactive elements and music are not sent through the API; download the image and add those in Instagram.',
    '자동 게시 대상은 게시 권한이 확인된 Instagram Business 계정의 정적 JPEG Story뿐입니다. 링크 스티커, 투표, 인터랙티브 요소, 음악은 API로 전송하지 않으며 이미지를 내려받아 Instagram 앱에서 직접 추가하세요.')}</p>
   <div className="admin-form-actions">
    <button type="button" className="admin-primary" disabled={busy} onClick={()=>void run(
     ()=>storyRequest('/generate',{}),
     t('Scanned approved Feed posts scheduled for tomorrow. Existing previews were not duplicated.',
       '내일 발행 예정인 승인 Feed를 확인했습니다. 기존 미리보기는 중복 생성하지 않았습니다.'))}>
     {t('Generate tomorrow’s previews','내일 Feed 미리보기 생성')}</button>
    <button type="button" className="admin-secondary" disabled={busy} onClick={()=>void run(
     async()=>{const result=await storyRequest('/capability',{});setCapability(result);},
     t('Read-only account capability check finished. No Story was posted.','읽기 전용 계정 확인이 완료됐습니다. Story 게시 요청은 하지 않았습니다.'))}>
     {t('Check Business API eligibility','Business API 지원 여부 확인')}</button>
    <button type="button" className="admin-secondary" disabled={busy} onClick={()=>void run(
     ()=>load(),t('Story records refreshed.','Stories 기록을 새로고침했습니다.'))}>
     {t('Refresh','새로고침')}</button>
   </div>
   {capability&&<p role="status" className={capability.supported?'admin-help':'admin-error'}>
    {capability.supported?t('Verified Business account eligible for static Story API publishing.',
      '정적 Story API 게시가 가능한 Business 계정으로 확인됐습니다.'):
      t('Automatic Story posting unavailable or not verified. Use the downloadable JPEG.',
       'Story 자동 게시가 지원되지 않거나 확인되지 않았습니다. JPEG를 내려받아 수동 업로드하세요.')}
    {' '+String(capability.reason||'')}</p>}
   <p className="admin-help">{t('Automatic preview generation is controlled by Automation → Story previews. Every generated Story still requires explicit admin approval and scheduling.',
    '자동 미리보기 생성은 자동화 → Story 미리보기 설정으로 제어됩니다. 생성된 Story는 각각 관리자 승인과 예약이 필요합니다.')}</p>
  </div>
  {error&&<p role="alert" className="admin-error">{error}</p>}
  {notice&&<p role="status">{notice}</p>}
  {loading?<p role="status">{t('Loading Stories…','Stories 불러오는 중…')}</p>:
   stories.length===0?<p className="admin-empty">{t(
    'No previews yet. An approved Feed post scheduled for tomorrow is required.',
    '아직 미리보기가 없습니다. 내일 발행 예정인 승인 Feed가 필요합니다.')}</p>:
   <div className="marketing-draft-inbox">{stories.map(story=>{
    const attempt=attempts.find(a=>a.story_id===story.id);
    const canApprove=story.status==='generated';
    const canSchedule=story.status==='approved';
    const canManual=['approved','scheduled'].includes(story.status);
    return <article className="marketing-draft-card" key={story.id}>
     {story.image_url?<img src={story.image_url} alt={t('Story teaser preview','Story 미리보기 이미지')}
      style={{width:135,height:240,objectFit:'cover',borderRadius:10}}/>:
      <span className="marketing-draft-thumb placeholder"/>}
     <div className="marketing-draft-copy">
      <strong>{story.teaser_title}</strong>
      <p><span className={'marketing-status-pill '+story.status}>{status(story.status)}</span></p>
      <small>{t('Feed due','Feed 발행')} {story.feed_date_kst} KST |
       {' '}{t('Story preview','Story 미리보기')} {story.preview_date_kst} KST</small>
      {story.scheduled_for&&<small>{t('Story scheduled','Story 예약')}{' '}
       {new Date(story.scheduled_for).toLocaleString(locale,{timeZone:'Asia/Seoul'})} KST</small>}
      {story.error_code&&<p className="admin-error">{story.error_code}: {story.error_message}</p>}
      {attempt&&<small>{t('API attempt','API 시도')} {attempt.state}
       {attempt.external_started_at?t(' (Meta called)',' (Meta 호출됨)'):''}
       {attempt.error_message?' — '+attempt.error_message:''}</small>}
      <div className="admin-form-actions">
       {story.image_path&&<a className="admin-secondary"
        href={BASE+'/'+story.id+'/download'}>{t('Download 1080×1920 JPEG','1080×1920 JPEG 다운로드')}</a>}
       {canApprove&&<button type="button" className="admin-primary" disabled={busy}
        onClick={()=>void run(()=>storyRequest('/'+story.id+'/approve',{}),
         t('Story approved. Scheduling is a separate step.','Story를 승인했습니다. 예약은 별도 단계입니다.'))}>
        {t('Approve Story','Story 승인')}</button>}
       {canSchedule&&<button type="button" className="admin-primary" disabled={busy}
        onClick={()=>void run(()=>storyRequest('/'+story.id+'/schedule',{}),
         t('Story scheduled independently of Feed.','Feed와 별도로 Story 게시를 예약했습니다.'))}>
        {t('Schedule approved Story','승인 Story 예약')}</button>}
       {canManual&&<button type="button" className="admin-secondary" disabled={busy}
        onClick={()=>{if(window.confirm(t('Switch to manual upload? This cancels Story API scheduling.',
         'Story API 예약을 취소하고 수동 업로드로 전환할까요?')))void run(
          ()=>storyRequest('/'+story.id+'/manual',{}),
          t('Download and upload in Instagram.','Instagram 앱에서 내려받은 이미지를 올리세요.'));}}>
        {t('Use manual upload','수동 업로드로 전환')}</button>}
       {story.status==='manual_ready'&&<button type="button" className="admin-secondary" disabled={busy}
        onClick={()=>{if(window.confirm(t('Have you actually uploaded this Story in the Instagram app?',
         '이 Story를 Instagram 앱에서 실제로 업로드했나요?')))void run(
          ()=>storyRequest('/'+story.id+'/confirm-manual',{confirm_manual_upload:true}),
          t('Manual publication recorded.','수동 게시 완료를 기록했습니다.'));}}>
        {t('Confirm manually published','수동 게시 완료 확인')}</button>}
      </div>
     </div>
    </article>;
   })}</div>
  }
 </section>;
}
