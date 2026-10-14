'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {tr,type Locale} from '@/lib/locale';
import {CONTENT_STAGES,CONTENT_STAGE_LABELS,CONTENT_STATUS_LABELS,CONTENT_ACTION_LABELS,type ContentStage,type ContentStatus} from '@/lib/marketing-content-state';
import {SERIES_CONTENT,EDITORIAL_SERIES,seriesForTopic} from '@/lib/marketing-editor-first';
import './admin-marketing-content-library.css';
type Row=Record<string,any>;
const BASE='/api/admin/marketing/contents';
const PENDING_KEY='roundy:central-content:pending-create';
async function api(path='',body?:unknown){
 const r=await fetch(BASE+path,{method:body===undefined?'GET':'POST',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(body===undefined?25000:40000)});
 const data=await r.json();if(!r.ok)throw new Error(data.error||'CONTENT_REQUEST_FAILED');return data;
}
export function AdminMarketingContentLibrary({locale,events=[],savedDrafts=[]}:{locale:Locale;events?:Row[];savedDrafts?:Row[];}){
 const t=(en:string,ko:string)=>tr(locale,en,ko);
 const [rows,setRows]=useState<Row[]>([]),[selected,setSelected]=useState(''),[detail,setDetail]=useState<Row|null>(null);
 const [enabled,setEnabled]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [composer,setComposer]=useState(false),[subject,setSubject]=useState(''),[topic,setTopic]=useState('conversation_prompt'),[language,setLanguage]=useState('ko'),[count,setCount]=useState(3),[ai,setAi]=useState(false);
 const [kind,setKind]=useState('growth_carousel'),[eventId,setEventId]=useState('');
 const [edits,setEdits]=useState<Record<number,Row>>({}),[caption,setCaption]=useState(''),[captionKo,setCaptionKo]=useState(''),[captionEn,setCaptionEn]=useState(''),[dirty,setDirty]=useState(false),[note,setNote]=useState(''),[refinedSubject,setRefinedSubject]=useState('');
 const [pickerSlot,setPickerSlot]=useState<number|null>(null),[pool,setPool]=useState<Row[]>([]),[nextCursor,setNextCursor]=useState<string|null>(null);
 const selectedRef=useRef(''),mounted=useRef(true),polling=useRef(false),mutation=useRef(false),pendingCreate=useRef<Row|null>(null),editVersion=useRef('');
 const refresh=useCallback(async(prefer?:string,append=false)=>{
  const r=await api(append&&nextCursor?'?before='+encodeURIComponent(nextCursor):'');
  if(!mounted.current)return;
  setEnabled(r.enabled);setRows(old=>append?[...old,...r.contents]:r.contents);setNextCursor(r.next_cursor);
  const target=prefer||selectedRef.current||r.contents[0]?.id||'';
  if(target){
   selectedRef.current=target;setSelected(target);
   const d=await api('/'+target);
   if(mounted.current&&selectedRef.current===target)setDetail(old=>old&&old.content.id===d.content.id&&old.content.state_version>d.content.state_version?old:d);
  }else setDetail(null);
 },[nextCursor]);
 useEffect(()=>{mounted.current=true;try{const stored=sessionStorage.getItem(PENDING_KEY);if(stored){const value=JSON.parse(stored);if(typeof value.request_key==='string'&&value.request_key.startsWith('manual:')){pendingCreate.current=value;setComposer(true);setSubject(value.instruction||'');setNotice(t('A previous request needs confirmation. Retry the same request without creating a duplicate.','이전 요청 결과를 확인해야 합니다. 같은 요청으로 재확인하면 콘텐츠가 중복 생성되지 않습니다.'));}}}catch{}refresh().catch(e=>setError(e.message)).finally(()=>setLoading(false));return()=>{mounted.current=false;};},[]);
 useEffect(()=>{
  const current=detail?.content;const key=current?.id+':'+current?.version+':'+Boolean(detail?.draft?.carousel_slides?.length);
  if(key===editVersion.current)return;editVersion.current=key;
  setEdits({});setCaption(detail?.draft?.caption||'');setCaptionKo(detail?.draft?.content_document?.caption_ko||'');setCaptionEn(detail?.draft?.content_document?.caption_en||'');setDirty(false);setPickerSlot(null);setNote('');setRefinedSubject(current?.request_payload?.instruction||'');
 },[detail?.content?.id,detail?.content?.version,Boolean(detail?.draft?.carousel_slides?.length)]);
 const anyActive=rows.some(row=>['queued','running'].includes(row.status));
 useEffect(()=>{
  if(!anyActive)return;let stopped=false;
  const timer=setInterval(()=>{
   if(stopped||polling.current||mutation.current||document.visibilityState==='hidden')return;
   polling.current=true;refresh().catch(e=>{if(!stopped)setError(e.message);}).finally(()=>{polling.current=false;});
  },5000);
  return()=>{stopped=true;clearInterval(timer);};
 },[anyActive,refresh]);
 async function perform(work:()=>Promise<void>){
  if(mutation.current)return;mutation.current=true;setBusy(true);setError('');setNotice('');
  try{await work();}catch(e){setError(e instanceof Error?e.message:'CONTENT_REQUEST_FAILED');}
  finally{mutation.current=false;if(mounted.current)setBusy(false);}
 }
 async function select(id:string){
  if(mutation.current)return;
  if(dirty&&!window.confirm(t('Discard unsaved changes?','저장하지 않은 수정을 버릴까요?')))return;
  selectedRef.current=id;setSelected(id);setDetail(null);setDirty(false);
  await perform(async()=>{const d=await api('/'+id);if(selectedRef.current===id)setDetail(d);});
 }
 async function create(){
  if(!pendingCreate.current){
   if(kind==='growth_carousel'&&!subject.trim()){setError(t('Enter a specific subject.','구체적인 소재를 입력하세요.'));return;}
   if(kind==='live_event'&&!eventId){setError(t('Choose a live event.','정식 이벤트를 선택하세요.'));return;}
   if(!window.confirm(t('Start the workflow? Copy and the optional AI image incur generation costs. Photos and publication require separate review.','워크플로를 시작할까요? 원고와 선택한 AI 이미지 생성에는 비용이 발생합니다. 사진 검수와 최종 게시 승인은 별도로 진행합니다.')))return;
   pendingCreate.current={request_key:'manual:'+crypto.randomUUID(),revision:1,mode:'both',visual_mode:'cards',visual_source:'stock',
    content_mode:kind,topic_type:kind==='growth_carousel'?topic:undefined,language,story_card_count:count,
    ai_image_slot:count===5&&ai?0:null,instruction:subject.trim(),event_id:kind==='live_event'?eventId:undefined};
   try{sessionStorage.setItem(PENDING_KEY,JSON.stringify(pendingCreate.current));}catch{}
  }
  await perform(async()=>{
   const r=await api('',pendingCreate.current);pendingCreate.current=null;try{sessionStorage.removeItem(PENDING_KEY);}catch{}setComposer(false);setSubject('');
   await refresh(r.content.id);setNotice(t('Content saved. Each server task will continue from its saved result.','콘텐츠를 등록했습니다. 서버가 각 단계의 저장된 결과에서 작업을 이어갑니다.'));
  });
 }
 const c=detail?.content,draft=detail?.draft,slides:Row[]=draft?.carousel_slides||[];
 const editable=!!c&&['blocked','failed'].includes(c.status)&&!['publish','complete'].includes(c.stage)&&slides.length>0;
  const copyNeedsRepair=!!c&&['EDITORIAL_COPY_QUALITY_REJECTED','COPY_REVIEW_REQUIRED'].includes(String(c.error_code||''));
 async function action(name:string,body:Row={}){
  if(!c)return;const cid=c.id;
  await perform(async()=>{await api('/'+cid+'/'+name,{state_version:c.state_version,...body});await refresh(cid);});
 }
 async function resume(step?:string){
  if(!c)return;
  const unknown=c.status==='uncertain';
  if(unknown&&note.trim().length<12){setError(t('Describe how you checked the previous request (12+ characters).','이전 요청 결과를 확인한 내용을 12자 이상 적어주세요.'));return;}
  if(!window.confirm(unknown?t('Have you checked the previous provider result? Repeating this step can incur another charge.','외부 제공처의 이전 요청 결과를 확인했나요? 이 단계를 다시 실행하면 추가 비용이 발생할 수 있습니다.'):t('Continue only this step? A new AI request may incur a cost. Completed earlier steps will not be rerun.','해당 단계만 진행할까요? 필요한 경우 AI 호출 비용이 발생합니다. 완료된 이전 단계는 다시 실행하지 않습니다.')))return;
  await action('resume',{confirm_paid:true,confirm_unknown:unknown,note,step});
 }
 async function save(){
  if(!c||!dirty)return;
  const cid=c.id,document=draft?.content_document||{};
  const payload:Row={state_version:c.state_version,
   edits:Object.entries(edits).map(([index,fields])=>({index:Number(index),...fields})),caption,
   ...(captionKo!==String(document.caption_ko||'')?{caption_ko:captionKo}:{}),
   ...(captionEn!==String(document.caption_en||'')?{caption_en:captionEn}:{})};
  await perform(async()=>{
   await api('/'+cid+'/edit',payload);
   await refresh(cid);
   setNotice(t('Edits saved as a new version. Review any remaining validation issues before continuing.','수정 내용을 새 버전으로 저장했습니다. 계속 진행하기 전 남은 검증 오류를 확인하세요.'));
  });
 }
 function change(index:number,field:string,value:string){
  setEdits(old=>({...old,[index]:{title:slides[index].title,body:slides[index].body,secondary_body:slides[index].secondary_body||'',highlight:slides[index].highlight||'',...old[index],[field]:value}}));setDirty(true);
 }
 async function openPool(slot:number){
  setPickerSlot(slot);await perform(async()=>{
   const r=await fetch('/api/admin/marketing/photos/assets?status=approved',{cache:'no-store'}),data=await r.json();
   if(!r.ok)throw new Error(data.error||'PHOTO_LIBRARY_FAILED');setPool(data.assets||[]);
  });
 }
 const title=(row:Row)=>row.preview?.carousel_slides?.[0]?.title||row.request_payload?.instruction||t('New content','새 콘텐츠');
 return <section className="content-library" aria-label={t('Content workflows','콘텐츠 워크플로')}>
  <header className="content-library-heading"><div><p className="admin-kicker">CONTENT WORKFLOW</p><h2>{t('Content library','콘텐츠 라이브러리')}</h2><p>{t('One content ID. Saved work at every stage.','하나의 콘텐츠 ID로 각 단계의 결과를 이어갑니다.')}</p></div>
   <div className="content-actions"><button type="button" className="admin-secondary" disabled={busy} onClick={()=>void perform(()=>refresh())}>{t('Refresh','새로고침')}</button>
   <button type="button" className="admin-primary" disabled={busy||!enabled} onClick={()=>setComposer(v=>!v)}>{composer?t('Close form','입력 닫기'):t('New content','새 콘텐츠')}</button></div></header>
  {error&&<div className="content-alert" role="alert"><strong>{t('Action not completed','작업을 완료하지 못했습니다')}</strong><p>{error}</p>{pendingCreate.current&&<button type="button" className="admin-secondary" disabled={busy} onClick={()=>void create()}>{t('Check the same request','같은 요청 다시 확인')}</button>}</div>}
  {!!pendingCreate.current&&!error&&<button type="button" className="admin-secondary" disabled={busy} onClick={()=>void create()}>{t('Check the same request','같은 요청 다시 확인')}</button>}
  {notice&&<p role="status" className="content-notice">{notice}</p>}
  {!loading&&!enabled&&<p role="status">{t('New workflow processing is paused. Saved content is preserved.','새 워크플로 처리가 일시 중지되어 있습니다. 저장된 콘텐츠는 유지됩니다.')}</p>}
  {composer&&<form className="content-composer" onSubmit={e=>{e.preventDefault();void create();}}>
   <fieldset disabled={busy||!!pendingCreate.current}>
    <div className="content-form-grid">
     <label>{t('Content kind','콘텐츠 종류')}<select value={kind} onChange={e=>setKind(e.target.value)}><option value="growth_carousel">{t('Editorial carousel','에디토리얼 카드뉴스')}</option><option value="prelaunch">{t('Roundy introduction','라운디 소개')}</option><option value="live_event">{t('Live event','정식 이벤트')}</option></select></label>
     {kind==='growth_carousel'&&<label>{t('Series','시리즈')}<select value={seriesForTopic(topic)} onChange={e=>setTopic(e.target.value==='different_words'?'conversation_prompt':e.target.value==='before_you_go'?'seoul_dating':'dating_archetype')}>{EDITORIAL_SERIES.map(series=><option value={series} key={series}>{t(SERIES_CONTENT[series].title[0],SERIES_CONTENT[series].title[1])}</option>)}</select></label>}
     <label>{t('Language','기본 언어')}<select value={language} onChange={e=>setLanguage(e.target.value)}><option value="ko">한국어</option><option value="en">English</option></select></label>
     <label>{t('Story cards','본문 카드 수')}<select value={count} onChange={e=>{setCount(Number(e.target.value));if(e.target.value==='3')setAi(false);}}><option value={3}>3 + 1 {t('brand card','브랜드 카드')}</option><option value={5}>5 + 1 {t('brand card','브랜드 카드')}</option></select></label>
    </div>
    {kind==='live_event'&&<label>{t('Event','이벤트')}<select value={eventId} onChange={e=>setEventId(e.target.value)}><option value="">{t('Choose an event','이벤트 선택')}</option>{events.map(e=><option key={e.id} value={e.id}>{e.title_ko||e.title}</option>)}</select></label>}
    <label>{t('Specific subject and references','구체적인 소재와 참고 자료')}<textarea value={subject} onChange={e=>setSubject(e.target.value)} maxLength={500} rows={3} required={kind==='growth_carousel'} placeholder={t('Describe the specific scene or comparison. Add reference URLs when needed.','어떤 장면이나 차이를 보여줄지 적어주세요. 필요한 경우 참고 URL을 함께 입력하세요.')}/></label>
    {kind==='growth_carousel'&&<details><summary>{t('Research and topic options','자료 조사와 세부 주제')}</summary><label>{t('Topic','주제')}<select value={topic} onChange={e=>setTopic(e.target.value)}>{[['conversation_prompt','Conversation','대화'],['dating_archetype','Observation','관계 관찰'],['seoul_dating','Verified places','장소 비교'],['dating_myth','Dating belief','연애 통념'],['trend_research','Research finding','연구'],['book_insight','Verified book','책'],['korea_life','Korea life','한국 생활'],['mbti','MBTI','MBTI'],['meme_remix','Meme remix','밈 재해석'],['mini_quiz','Mini quiz','미니 퀴즈']].map(([v,en,ko])=><option value={v} key={v}>{t(en,ko)}</option>)}</select></label></details>}
    {count===5&&<label className="content-checkbox"><input type="checkbox" checked={ai} onChange={e=>setAi(e.target.checked)}/>{t('Use one AI cover after photo approval. All other story cards use real photos.','사진 승인 후 AI 커버 1장을 사용합니다. 다른 본문 카드에는 실사를 사용합니다.')}</label>}
    <p className="admin-help">{t('AI copy incurs usage charges. No automatic rewrite, approval or publication.','AI 원고 생성에는 사용 비용이 발생합니다. 자동 재작성, 승인 또는 게시는 하지 않습니다.')}</p>
    <button type="submit" className="admin-primary" disabled={!enabled}>{t('Start content workflow','콘텐츠 제작 시작')}</button>
   </fieldset></form>}
  {savedDrafts.some(d=>d.status==='needs_approval'&&d.content_document?.brand_outro_version===1)&&<details><summary>{t('Move an existing draft into this workflow','기존 초안을 이 워크플로로 연결')}</summary><p>{t('Keeps the existing ID and saved copy. Photos and rendering will be checked again; optional AI images may incur a cost. Scheduled and published posts cannot be moved.','기존 ID와 원고를 유지한 채 사진과 렌더링을 다시 확인합니다. 선택형 AI 이미지에는 비용이 발생할 수 있습니다. 예약되거나 게시된 글은 변경하지 않습니다.')}</p>
   {savedDrafts.filter(d=>d.status==='needs_approval'&&d.content_document?.brand_outro_version===1&&d.visual_source==='stock').slice(0,20).map(d=><button type="button" className="admin-secondary" key={d.id} disabled={busy||!enabled} onClick={()=>{if(window.confirm(t('Move this saved draft without rewriting its copy? Existing photos are rechecked before rendering.','이 초안의 원고를 다시 쓰지 않고 중앙 워크플로로 연결할까요? 사진 검수 이후 이미지를 다시 제작합니다.')))void perform(async()=>{const result=await api('/adopt',{draft_id:d.id,revision:d.revision,confirm_adopt:true});await refresh(result.content.id);});}}>{d.carousel_slides?.[0]?.title||d.id.slice(0,8)}</button>)}</details>}
  {loading?<p role="status">{t('Loading content…','콘텐츠를 불러오는 중입니다…')}</p>:<div className="content-workbench">
   <aside className="content-index" aria-label={t('Content list','콘텐츠 목록')}>{rows.length?rows.map(row=><button type="button" className={'content-index-item '+(row.id===selected?'selected':'')} key={row.id} onClick={()=>void select(row.id)} aria-current={row.id===selected?'true':undefined}>
    <strong>{title(row)}</strong><span>{t(...CONTENT_STAGE_LABELS[row.stage as ContentStage])} / {t(...CONTENT_STATUS_LABELS[row.status as ContentStatus])}</span><small>{row.request_payload?.language?.toUpperCase()} / v{row.version} / {row.id.slice(0,8)}</small>
   </button>):<p>{t('Create the first content above.','새 콘텐츠를 만들어 시작하세요.')}</p>}
   {nextCursor&&<button type="button" className="admin-secondary" disabled={busy} onClick={()=>void perform(()=>refresh(undefined,true))}>{t('Load more','더 보기')}</button>}</aside>
   <div className="content-detail">{c?<>
    <header><h3>{draft?.carousel_slides?.[0]?.title||c.request_payload.instruction||t('New content','새 콘텐츠')}</h3><p className="content-identity">ID {c.id} / v{c.version}</p></header>
    <ol className="content-stages">{CONTENT_STAGES.filter(s=>s!=='complete').map(stage=><li key={stage} aria-current={c.stage===stage?'step':undefined}>{t(...CONTENT_STAGE_LABELS[stage])}</li>)}</ol>
    <section className="content-current-state" role="status"><strong>{t(...CONTENT_STATUS_LABELS[c.status as ContentStatus])}</strong><p>{c.required_action&&CONTENT_ACTION_LABELS[c.required_action]?t(...CONTENT_ACTION_LABELS[c.required_action]):t(...CONTENT_STAGE_LABELS[c.stage as ContentStage])}</p>
     {['queued','running'].includes(c.status)&&<p>{t('This task is stored on the server. You can leave this page and return later.','작업이 서버에 저장되어 있습니다. 페이지를 나갔다 돌아와도 진행 상태를 확인할 수 있습니다.')}</p>}
     {c.error_code&&<details open={copyNeedsRepair}><summary>{t('Error details','오류 상세')}</summary><code>{c.error_code}</code><p className="content-error-message">{c.error_message}</p></details>}
      {copyNeedsRepair&&<p className="content-repair-hint">{t('Review both caption languages, each story card translation and the length of text in the cards. Edit the saved copy below and save; this does not trigger a new paid AI request.','한국어 및 영어 캡션, 각 카드의 번역, 카드 본문 길이를 확인하세요. 아래에서 직접 수정 후 저장하면 AI를 다시 호출하지 않습니다.')}</p>}
    </section>
    {['blocked','failed'].includes(c.status)&&!['publish','complete'].includes(c.stage)&&<details><summary>{t('Refine the subject and start a new version','소재를 보완하고 새 버전으로 다시 작성')}</summary>
     <label>{t('Subject and reference notes','소재와 참고 메모')}<textarea value={refinedSubject} onChange={e=>setRefinedSubject(e.target.value)} rows={3} maxLength={500}/></label>
     <button type="button" className="admin-secondary" disabled={busy||dirty||!refinedSubject.trim()} onClick={()=>{if(window.confirm(t('Create a new version from this revised subject? Research and copy will be charged again. Previous versions stay available.','수정한 소재로 새 버전을 만들까요? 자료 조사와 원고 작성 비용이 다시 발생하며 이전 버전은 이력에 보존됩니다.')))void action('refine',{instruction:refinedSubject,confirm_paid:true});}}>{t('Create a new version','새 버전 작성')}</button></details>}
    {c.status==='uncertain'&&c.stage!=='publish'&&<label>{t('Previous request check','이전 요청 결과 확인')}<textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={500} rows={2}/></label>}
    <div className="content-actions">{['blocked','failed','uncertain'].includes(c.status)&&c.stage!=='publish'&&c.required_action!=='final_approval_required'&&!(c.stage==='copy'&&slides.length>0)&&<button type="button" className="admin-primary" disabled={busy||dirty||!enabled} onClick={()=>void resume()}>{c.stage==='media'?t('Continue with reviewed photos','검수한 사진으로 계속'):t('Continue this step','해당 단계 진행')}</button>}
     {c.stage==='review'&&['blocked','failed'].includes(c.status)&&<><button type="button" className="admin-secondary" disabled={busy||dirty} onClick={()=>void resume('media')}>{t('Review photos again','사진 다시 확인')}</button><button type="button" className="admin-secondary" disabled={busy||dirty} onClick={()=>void resume('render')}>{t('Render images again','이미지만 다시 제작')}</button></>}
     {c.required_action==='final_approval_required'&&<button type="button" className="admin-primary" disabled={busy||dirty} onClick={()=>{if(window.confirm(t('Approve this exact version and reserve its Instagram publication?','이 버전의 이미지와 원고를 최종 승인하고 인스타그램 게시를 예약할까요?')))void action('approve',{confirm_publish:true});}}>{t('Approve and schedule','최종 승인 후 게시 예약')}</button>}
    </div>
    {slides.length>0&&<section><div className="content-section-heading"><h4>{t('Saved copy and images','저장된 원고와 이미지')}</h4>{editable&&<button type="button" className="admin-primary content-save-inline" disabled={busy||!dirty} onClick={()=>void save()}>{busy?t('Saving…','저장 중…'):t('Save a new version','새 버전으로 저장')}</button>}</div>
     <div className="content-cards">{slides.map((slide,index)=>{const value=edits[index]||slide;return <article key={index}>{draft.images?.[index]&&<a href={draft.images[index]} target="_blank" rel="noreferrer"><img src={draft.images[index]} alt={slide.title}/></a>}<p className="admin-kicker">{index+1} / {slide.role==='brand_outro'?'ROUNDY':t('STORY','본문')}</p>
      {editable&&slide.role!=='brand_outro'?<><label>{t('Title','제목')}<input value={value.title||''} onChange={e=>change(index,'title',e.target.value)} maxLength={72}/></label><label>{t('Body','본문')}<textarea value={value.body||''} rows={4} maxLength={260} onChange={e=>change(index,'body',e.target.value)}/></label><details open={!String(value.secondary_body||'').trim()}><summary>{t('Translation','번역')} {!String(value.secondary_body||'').trim()&&<span className="content-field-warning">{t('Required','필수')}</span>}</summary><label>{draft.content_language==='en'?t('Korean body','한국어 본문'):t('English body','영어 본문')}<textarea value={value.secondary_body||''} rows={3} maxLength={260} onChange={e=>change(index,'secondary_body',e.target.value)}/></label></details></>:<><strong>{slide.title}</strong><p>{slide.body}</p></>}
     </article>;})}</div>
     <div className="content-caption-editor">
       <h4>{t('Captions in both languages','한국어 및 영어 캡션')}</h4>
       <p className="admin-help">{t('Edit the two caption bodies separately. Roundy account details, hashtags, verified sources and photo credits are managed by the server.','한국어와 영어 캡션 본문을 각각 수정하세요. 계정 정보, 해시태그, 검증된 출처와 사진 크레딧은 서버에서 관리합니다.')}</p>
       <div className="content-caption-grid">
        <label>{t('Korean caption','한국어 캡션')} <small>{captionKo.length}/400</small><textarea value={captionKo} readOnly={!editable} onChange={e=>{setCaptionKo(e.target.value);setDirty(true);}} maxLength={400} rows={5} placeholder={t('Write 2–4 short paragraphs in Korean.','한국어로 짧은 문단 2~4개를 작성하세요.')}/></label>
        <label>{t('English caption','영어 캡션')} <small>{captionEn.length}/520</small><textarea value={captionEn} readOnly={!editable} onChange={e=>{setCaptionEn(e.target.value);setDirty(true);}} maxLength={520} rows={5} placeholder={t('Write 2–4 short paragraphs in English.','영어로 짧은 문단 2~4개를 작성하세요.')}/></label>
       </div>
       <details><summary>{t('Full Instagram caption preview','Instagram 전체 캡션 미리보기')}</summary><pre className="content-caption-preview">{draft.caption||''}</pre></details>
      </div>
    </section>}
    {!!detail.photos?.length&&<section><h4>{t('Photo selection and rights review','사진 선택과 사용 권한 검수')}</h4><div className="content-photos">{detail.photos.map((photo:Row)=><article key={photo.slot}><img src={photo.preview_url||photo.image_url} alt={t('Photo for story card ','본문 카드 사진 ')+(photo.slot+1)}/><strong>{t('Card ','카드 ')}{photo.slot+1}</strong><p>{photo.review_status==='approved'?t('Approved','승인됨'):photo.review_status==='rejected'?t('Rejected','반려됨'):t('Review required','검수 필요')}</p><a href={photo.source_url} target="_blank" rel="noreferrer">{t('Original and rights','원본과 권리 확인')}</a>
     {c.stage==='media'&&c.status==='blocked'&&<div className="content-actions">{photo.review_status!=='approved'&&<button type="button" className="admin-secondary" disabled={busy||dirty} onClick={()=>{if(window.confirm(t('Have you checked this photo, its original source and commercial usage rights?','이 사진의 원본과 상업적 사용 권한, 콘텐츠 적합성을 확인했나요?')))void action('review-photo',{asset_id:photo.asset_id,choice:'approved',confirm_rights_reviewed:true});}}>{t('Approve','승인')}</button>}
     <button type="button" className="admin-secondary" disabled={busy||dirty} onClick={()=>void openPool(photo.slot)}>{t('Replace','교체')}</button></div>}</article>)}</div></section>}
    {pickerSlot!==null&&<section className="content-photo-picker"><div className="content-section-heading"><h4>{t('Approved photo library','승인된 사진 라이브러리')}</h4><button type="button" className="admin-secondary" onClick={()=>setPickerSlot(null)}>{t('Close','닫기')}</button></div><div className="content-photos">{pool.map(photo=><button type="button" key={photo.id} disabled={busy} onClick={()=>void action('assign-photo',{slot:pickerSlot,asset_id:photo.id}).then(()=>setPickerSlot(null))}><img src={photo.preview_url||photo.image_url} alt={photo.photographer||'Photo'}/><span>{t('Use this photo','이 사진 사용')}</span></button>)}</div></section>}
    {!!draft?.research_sources?.length&&<details><summary>{t('Verified research sources','확인한 자료 출처')}</summary>{draft.research_sources.map((s:Row,i:number)=><p key={i}><a href={s.url} target="_blank" rel="noreferrer">{s.title||s.url}</a></p>)}</details>}
    <details><summary>{t('Saved content versions','저장된 콘텐츠 버전')}</summary>{(detail.versions||[]).map((version:Row)=><article className="content-history" key={version.version}><strong>v{version.version}</strong><p>{version.request_payload?.instruction}</p>{version.snapshot?<><p>{version.snapshot.carousel_slides?.[0]?.title}</p><pre style={{whiteSpace:'pre-wrap'}}>{version.snapshot.caption}</pre></>:<p>{t('No completed copy in this version.','이 버전에는 아직 완성된 원고가 없습니다.')}</p>}</article>)}</details>
    {(detail.steps||[]).some((s:Row)=>s.version===c.version&&(s.output?.research_context||s.output?.research_review))&&<details><summary>{t('Saved research','저장된 자료 조사')}</summary>{(detail.steps||[]).filter((s:Row)=>s.version===c.version&&(s.output?.research_context||s.output?.research_review)).map((s:Row)=>{const research=s.output.research_context||s.output.research_review;return <article key={s.id}><p>{research.notes}</p>{(research.sources||[]).map((source:Row,i:number)=><p key={i}><a href={source.url} target="_blank" rel="noreferrer">{source.title||source.url}</a></p>)}</article>;})}</details>}
    <details><summary>{t('Step history and errors','단계별 실행 이력과 오류')}</summary><div className="content-history">{(detail.steps||[]).map((step:Row)=><div key={step.id}><strong>v{step.version} / {t(...CONTENT_STAGE_LABELS[step.step as ContentStage])} / #{step.attempt}</strong><span>{step.status}</span>{step.error_code&&<p><code>{step.error_code}</code> {step.error_message}</p>}</div>)}</div></details>
    {!['running','scheduled','published','uncertain','archived'].includes(c.status)&&<button type="button" className="admin-secondary" disabled={busy||dirty} onClick={()=>{if(window.confirm(t('Archive this content and cancel unstarted tasks?','이 콘텐츠를 보관하고 시작 전 작업을 취소할까요?')))void action('archive',{confirm_archive:true});}}>{t('Archive content','콘텐츠 보관')}</button>}
   {editable&&<div className="content-mobile-save-bar" role="group" aria-label={t('Save manual edits','수동 수정 저장')}>
      <span>{dirty?t('Unsaved changes','저장되지 않은 수정'):t('Saved version','저장된 버전')} v{c.version}</span>
      <button type="button" className="admin-primary" disabled={busy||!dirty} onClick={()=>void save()}>{busy?t('Saving…','저장 중…'):t('Finish editing & save','수정 완료 및 저장')}</button>
     </div>}
   </>:<p>{t('Choose a content to inspect its saved workflow.','콘텐츠를 선택하면 저장된 단계와 결과를 확인할 수 있습니다.')}</p>}</div>
  </div>}
 </section>;
}
