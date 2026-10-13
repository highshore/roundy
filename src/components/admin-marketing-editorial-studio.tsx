'use client';

import {useEffect,useRef,useState,type ReactNode} from 'react';
import {tr,type Locale} from '@/lib/locale';
import {Check,PenLine,RefreshCw,Image as ImageIcon,AlertTriangle} from 'lucide-react';
import {carouselCounts} from '@/lib/marketing-workflow-navigation';
import './admin-marketing-editorial-studio.css';

type Row=Record<string,any>;
const BASE='/api/admin/marketing';
type Props={
 draft:Row;locale:Locale;disabled:boolean;
 onUpdated:(draft:Row)=>void;
 onRequestAiEdit:(index:number)=>void;
 onRequestPhotoEdit:()=>void;
 onRerenderCover:()=>void;
 onWorkingChange?:(working:boolean)=>void;
 onUnsavedChange?:(dirty:boolean)=>void;
 renderPhotoEditor?:(index:number)=>ReactNode;
 renderAiEditor?:(index:number)=>ReactNode;
 mediaActions?:ReactNode;
};
function text(value:unknown){return typeof value==='string'?value:'';}
export function AdminMarketingEditorialStudio({draft,locale,disabled,onUpdated,onRequestAiEdit,onRequestPhotoEdit,onRerenderCover,onWorkingChange,onUnsavedChange,renderPhotoEditor,renderAiEditor,mediaActions}:Props){
 const t=(en:string,ko:string)=>tr(locale,en,ko);
 const slides=(Array.isArray(draft.carousel_slides)?draft.carousel_slides:[]) as Row[];
 const counts=carouselCounts(draft),brandIndex=counts.brand?slides.length-1:-1;
 const doc=draft.content_document||{},headlines=(Array.isArray(doc.thumbnail_candidates)?doc.thumbnail_candidates:[]) as string[];
 const scores=(Array.isArray(doc.editorial_headline_reviews)?doc.editorial_headline_reviews:[]) as Row[];
 const storyboard=doc.editorial_storyboard_review as Row|null;
 const critic=doc.editorial_critic as Row|null;
 const selectedTopic=doc.editorial_topic_selection?.selected as Row|undefined;
 const topicRatings=(Array.isArray(doc.editorial_topic_reviews)?doc.editorial_topic_reviews:[]) as Row[];
 const topicRating=topicRatings.find(r=>r.angle_key===selectedTopic?.angle_key);
 const language=draft.content_language==='en'?'en':'ko';
 const manualSupported=doc.design_preset==='roundy_magazine_editorial_v2';
 const chosen=Number(doc.thumbnail_selected_index??0);
 const [editing,setEditing]=useState<number|null>(null);
 const [working,setWorking]=useState(false);
 const [error,setError]=useState('');
 const [fields,setFields]=useState({title:'',body:'',secondary_body:'',highlight:''});
 const [focusedIndex,setFocusedIndex]=useState(0);
 const [feedbackNote,setFeedbackNote]=useState('');
 const [headlineEditing,setHeadlineEditing]=useState(false);
 const [headlineValues,setHeadlineValues]=useState<string[]>([]);
 const headlineDuplicates=headlines.length>1&&new Set(headlines.map(value=>text(value).normalize('NFKC').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu,''))).size!==headlines.length;
 const headlineDirty=headlineEditing&&headlineValues.some((value,index)=>value!==headlines[index]);
 const busy=disabled||working;
 const lock=useRef(false);
 const [tool,setTool]=useState<'preview'|'text'|'image'|'ai'>('preview');
 const original=editing===null?null:slides[editing];
 const unsaved=(!!original&&(fields.title!==text(original.title)||fields.body!==text(original.body)||fields.secondary_body!==text(original.secondary_body||(language==='en'?original.body_ko:original.body_en))||fields.highlight!==text(original.highlight)))||headlineDirty;
 useEffect(()=>{onUnsavedChange?.(unsaved);return()=>onUnsavedChange?.(false);},[unsaved,onUnsavedChange]);
 useEffect(()=>{onWorkingChange?.(working);return()=>onWorkingChange?.(false);},[working,onWorkingChange]);
 function leaveEditor(){return !unsaved||window.confirm(t('Discard unsaved changes to this card?','이 카드의 저장하지 않은 수정을 버릴까요?'));}
 function selectCard(index:number){if(busy||index===focusedIndex||!leaveEditor())return;setEditing(null);setHeadlineEditing(false);setTool('preview');setFocusedIndex(index);}
 function changeTool(next:'preview'|'text'|'image'|'ai',index:number){if(busy||!leaveEditor())return;setHeadlineEditing(false);setError('');if(next==='text'){startEdit(index);return;}setEditing(null);setTool(tool===next?'preview':next);}
 async function saveFeedback(decision:'approve'|'rework'){
  if(working||disabled)return;
  if(feedbackNote.trim().length<8){setError(t('Explain what works or needs changing (at least 8 characters).','좋은 점 또는 고칠 점을 8자 이상 적어주세요.'));return;}
  setWorking(true);setError('');
  try{
   const response=await fetch(BASE+'/draft/'+draft.id+'/editorial-review',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:draft.revision,decision,note:feedbackNote})});
   const result=await response.json();if(!response.ok||!result.draft)throw new Error(result.error||'EDITORIAL_REVIEW_FAILED');
   setFeedbackNote('');onUpdated(result.draft);
  }catch(error){setError(error instanceof Error?error.message:String(error));}finally{setWorking(false);}
 }
 useEffect(()=>{setEditing(null);setHeadlineEditing(false);setHeadlineValues([]);setTool('preview');setError('');setFeedbackNote('');},[draft.id]);
 useEffect(()=>{setEditing(null);setHeadlineEditing(false);setHeadlineValues([]);setTool('preview');setError('');setFocusedIndex(index=>Math.min(index,Math.max(0,slides.length-1)));},[draft.revision,slides.length]);
 function startEdit(index:number){
  const slide=slides[index];if(!slide||index===brandIndex||disabled||working)return;
  if(!manualSupported){setError(t('This image source has no reusable verified photo archive. Keep the original and use a new upload/re-render instead.','이 이미지 유형은 검증된 원본을 다시 사용할 수 없습니다. 기존 게시물을 보존하고 새 원본을 업로드해 렌더링하세요.'));return;}
  setEditing(index);setTool('text');setError('');
  setFields({title:text(slide.title),body:text(slide.body),
   secondary_body:text(slide.secondary_body|| (language==='en'?slide.body_ko:slide.body_en)),
   highlight:text(slide.highlight)});
 }
 async function editOne(){
  if(editing===null||working||disabled||lock.current)return;
  if(!fields.title.trim()||!fields.body.trim()){
   setError(t('Enter the headline and primary-language body. You can update the translation later.','제목과 기본 언어 본문을 입력하세요. 번역은 나중에 갱신할 수 있습니다.'));return;
  }
  lock.current=true;setWorking(true);setError('');
  try{
   const response=await fetch(BASE+'/draft/'+draft.id+'/versions/manual',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({request_key:'manual:'+crypto.randomUUID(),revision:draft.revision,
     index:editing,...fields})
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok||result.error||!result.draft?.id)throw new Error(String(result.error||'MANUAL_EDIT_FAILED'));
   onUpdated(result.draft);
  }catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{lock.current=false;setWorking(false);}
 }
 async function saveHeadlineOptions(){
  if(disabled||working||lock.current||!headlineEditing)return;
  if(unsaved&&editing!==null){setError(t('Save the current card edit first.','먼저 현재 카드 수정을 저장하세요.'));return;}
  const options=headlineValues.map(value=>value.trim()),cover=slides[0];
  if(!cover||options.length!==headlines.length||!options[chosen]){
   setError(t('Review the headline count and selected title.','표지 문구 개수와 선택된 제목을 확인하세요.'));return;
  }
  const distinct=new Set(options.map(value=>value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'')));
  const max=language==='en'?64:34;
  if(options.some(value=>value.length<6||value.length>max)||distinct.size!==options.length){
   setError(t('All five headlines must be different and fit the cover.','다섯 표지 후보를 서로 다르게 작성하고 길이를 확인하세요.'));return;
  }
  lock.current=true;setWorking(true);setError('');
  try{
   const response=await fetch(BASE+'/draft/'+draft.id+'/versions/manual',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({request_key:'manual:'+crypto.randomUUID(),revision:draft.revision,
     index:0,title:options[chosen],body:text(cover.body),
     secondary_body:text(cover.secondary_body||(language==='en'?cover.body_ko:cover.body_en)),
     highlight:text(cover.highlight),thumbnail_candidates:options})
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok||result.error||!result.draft?.id)throw new Error(String(result.error||'HEADLINE_UPDATE_FAILED'));
   setHeadlineEditing(false);onUpdated(result.draft);
  }catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{lock.current=false;setWorking(false);}
 }
 async function selectTitle(index:number){
  if(disabled||working||chosen===index||headlineDuplicates)return;
  const score=scores.find(s=>Number(s.index)===index);
  if(score?.fits_canvas===false){setError(t('This headline overflows the cover. Choose another.','이 제목은 표지에 맞지 않습니다. 다른 제목을 선택하세요.'));return;}
  setWorking(true);setError('');
  try{
   const response=await fetch(BASE+'/draft/'+draft.id+'/thumbnail',{
    method:'PATCH',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:draft.revision,index})
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok||result.error||!result.draft?.id)throw new Error(String(result.error||'HEADLINE_SELECTION_FAILED'));
   onUpdated(result.draft);
  }catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{setWorking(false);}
 }
 return <section id="roundy-editorial-studio" className="roundy-editorial-studio" aria-label={t('Card preview and editing','카드 미리보기 및 수정')}>
  <div className="roundy-editorial-head">
   <div><h3>{t('Edit cards','카드 편집')}</h3>
    <p>{t('Select a card and edit its text or image here.','카드를 선택하고 같은 자리에서 텍스트나 이미지를 수정하세요.')}</p>
   </div>
   <span className="roundy-editorial-layout-count">{t('Total','총')} {counts.total}{t(' cards','장')}{counts.brand===1&&<small>{counts.stories}{t(' story + 1 Roundy','장 스토리 + 라운디 1장')}</small>}</span>
  </div>
  {error&&<p role="alert" className="admin-error">{error}</p>}
  {/* Keep required rendering outside all optional disclosures, even without headline candidates. */}
  {doc.thumbnail_render_pending&&<section id="roundy-editorial-render-action" className="roundy-editorial-pending" aria-label={t('Cover update required','표지 갱신 필요')}>
   <div><strong>{t('The cover image needs updating','표지 이미지를 갱신해야 합니다')}</strong>
    <p role="status">{t('The saved image still shows the previous headline. Render the selected title before publishing.','저장된 이미지에는 이전 제목이 남아 있습니다. 선택한 제목으로 이미지를 만든 뒤 게시하세요.')}</p></div>
   <button type="button" className="admin-primary" disabled={busy} onClick={onRerenderCover}>{t('Update cover image','표지 이미지 갱신')}</button>
  </section>}
  {!!doc.translation_pending_indices?.length&&<p className="roundy-editorial-translation-notice" role="status">{t('Update translations before publishing: cards ','게시 전 번역 갱신이 필요합니다: ')}{doc.translation_pending_indices.map((i:number)=>i+1).join(', ')}{t('','번 카드')}</p>}
  {!!doc.manual_render_issue&&<div className="roundy-editorial-pending"><div><strong>{t('Text saved; image needs attention','텍스트는 저장되었고 이미지 확인이 필요합니다')}</strong><p>{t('Check the approved photo source before rendering.','렌더링 전에 승인된 사진 원본을 확인하세요.')}</p></div><button type="button" className="admin-secondary" disabled={busy} onClick={()=>renderPhotoEditor?changeTool('image',focusedIndex):onRequestPhotoEdit()}>{t('Check photos','사진 확인')}</button></div>}
  <div className="roundy-editorial-section" data-editorial-preview="true">
   <div className="roundy-editorial-card-navigation" aria-label={t('Choose a card','카드 선택')}>
    {slides.map((_:Row,index:number)=><button key={index} type="button" disabled={busy} aria-pressed={focusedIndex===index} aria-label={index===brandIndex?t('Final Roundy card','마지막 라운디 소개 카드'):t('Card ','카드 ')+(index+1)} onClick={()=>selectCard(index)}>{draft.images?.[index]?<img src={draft.images[index]} alt=""/>:<span className="roundy-editorial-nav-placeholder">{index+1}</span>}<span>{index===brandIndex?'Roundy':String(index+1).padStart(2,'0')}</span></button>)}
   </div>
   <div className="roundy-editorial-cards roundy-editorial-focused">{slides.map((slide:Row,index:number)=>{
    const current=editing===index,visual=Array.isArray(draft.images)?draft.images[index]:'';
    const brandSlide=index===brandIndex;
    const unarchivedAi=doc?.photo_sourcing?.ai_image_slot===index&&(index>0||!doc.regeneration_ai_cover_path);
    const primary=text(language==='en'?slide.body_en||slide.body:slide.body_ko||slide.body);
    const copy=<><strong>{slide.title}</strong><p>{primary}</p></>;
    return <article className={'roundy-editorial-card '+(current?'is-editing':'')} key={index} hidden={focusedIndex!==index}>
     <div className="roundy-editorial-card-media">
      {visual?<img src={visual} alt={t('Saved card image ','저장된 카드 이미지 ')+(index+1)}/>:<div className="roundy-editorial-card-placeholder"><small>{t('Text preview — image not rendered','텍스트 미리보기 — 이미지 미완성')}</small><strong>{slide.title}</strong><p>{primary}</p></div>}
      {index===0&&doc.thumbnail_render_pending&&<span className="roundy-editorial-stale-label">{t('Previous image — update required','이전 이미지 — 갱신 필요')}</span>}
     </div>
     <div className="roundy-editorial-card-info">
      <small>{brandSlide?t('Final card / Roundy','마지막 장 / 라운디 소개'):index===0?t('Cover','표지'):t('Story card ','스토리 카드 ')+(index+1)}</small>
      {brandSlide?<p className="admin-help">{t('This separate Roundy introduction is kept intact.','마지막 라운디 소개 카드는 독립적으로 유지됩니다.')}</p>:<>
       <div className="roundy-editorial-card-buttons" aria-label={t('Card editing tools','카드 수정 도구')}>
        {manualSupported&&<button type="button" aria-pressed={tool==='text'} className="admin-secondary" disabled={busy} onClick={()=>changeTool(current?'preview':'text',index)}><PenLine size={14} aria-hidden="true"/><span>{t('Edit text','텍스트 수정')}</span></button>}
        <button type="button" aria-pressed={tool==='image'} className="admin-secondary" disabled={busy} onClick={()=>renderPhotoEditor?changeTool('image',index):onRequestPhotoEdit()}><ImageIcon size={14} aria-hidden="true"/><span>{t('Change image','이미지 변경')}</span></button>
        <button type="button" aria-pressed={tool==='ai'} className="admin-secondary" disabled={busy||unarchivedAi} onClick={()=>renderAiEditor?changeTool('ai',index):onRequestAiEdit(index)}><RefreshCw size={14} aria-hidden="true"/><span>{t('AI rewrite','AI 재작성')}</span></button>
       </div>
       {tool==='preview'&&<p className="roundy-editorial-tool-hint">{t('The image on the left is the saved card. Choose a tool to change this card.','표시된 이미지는 저장된 카드입니다. 위 버튼으로 이 카드만 수정하세요.')}</p>}
       {focusedIndex===index&&tool==='image'&&renderPhotoEditor?.(index)}
       {focusedIndex===index&&tool==='ai'&&renderAiEditor?.(index)}
       {current&&<div className="roundy-editorial-manual">
        <label>{t('Headline','제목')}<input autoFocus value={fields.title} maxLength={72} disabled={busy} onChange={e=>setFields(v=>({...v,title:e.target.value}))}/></label>
        <label>{language==='en'?t('English body','영문 본문'):t('Korean body','국문 본문')}<textarea value={fields.body} rows={4} maxLength={260} disabled={busy} onChange={e=>setFields(v=>({...v,body:e.target.value}))}/></label>
        <details open={doc.translation_pending_indices?.includes(index)||undefined}><summary>{t('Translation and highlight','번역 및 강조 문구')}</summary>
         <label>{language==='en'?t('Korean translation','한국어 번역'):t('English translation','영어 번역')}<textarea value={fields.secondary_body} rows={3} maxLength={260} disabled={busy} onChange={e=>setFields(v=>({...v,secondary_body:e.target.value}))}/></label>
         <label>{t('Highlighted phrase (optional)','강조 문구 (선택)')}<input value={fields.highlight} maxLength={80} disabled={busy} onChange={e=>setFields(v=>({...v,highlight:e.target.value}))}/></label>
        </details>
        {unarchivedAi&&<p className="admin-help">{t('Text can be saved. An archived source image is needed to render this card.','텍스트는 저장할 수 있습니다. 이미지 완성에는 보관된 원본이 필요합니다.')}</p>}
        <p className="admin-help">{t('Saves and renders only this card in a new draft. The original is preserved.','이 카드만 새 초안으로 저장하고 렌더링합니다. 원본은 보존됩니다.')}</p>
        <div className="roundy-editorial-save-actions"><button type="button" className="admin-primary" disabled={busy||!unsaved} onClick={()=>void editOne()}>{working?t('Saving…','저장 중…'):t('Save this card','이 카드 저장')}</button><button type="button" className="admin-secondary" disabled={busy} onClick={()=>changeTool('preview',index)}>{t('Cancel','취소')}</button></div>
       </div>}
      </>}
     </div>
    </article>;
   })}</div>
  </div>
  {mediaActions}
  {headlines.length>1&&<details className="roundy-editorial-section roundy-editorial-collapsed" open={headlineDuplicates||headlineEditing} data-testid="headline-choice-panel"><summary>{t('Other cover titles','다른 표지 제목')} <span>{headlines.length}</span></summary>
   <p className="admin-help">{t('If you change the selected cover title, its image must be updated before publishing. Editing unused title choices alone keeps the cover image.','현재 선택된 표지 제목을 바꾸면 게시 전 이미지 갱신이 필요합니다. 사용하지 않는 후보만 수정하면 표지 이미지는 유지됩니다.')}</p>
   {headlineDuplicates&&<p className="roundy-editorial-headline-warning" role="status">{t('Duplicate cover titles must be corrected before publishing.','표지 후보 제목이 중복되었습니다. 게시 전에 다섯 후보를 다르게 수정하세요.')}</p>}
   <div className="roundy-editorial-headlines">
    {headlines.map((title,index)=>{
     const selected=index===chosen,review=scores.find(s=>Number(s.index)===index);
     return <div key={index} className={'roundy-editorial-headline '+(selected?'is-selected':'')}>
      <strong>{title}</strong>
      <button type="button" className="admin-secondary" disabled={busy||selected||headlineDuplicates||headlineEditing||review?.fits_canvas===false} aria-pressed={selected} onClick={()=>void selectTitle(index)}>
       {selected?<><Check size={14} aria-hidden="true"/>{t('Selected','선택됨')}</>:headlineDuplicates?t('Fix duplicates','중복 수정 필요'):review?.fits_canvas===false?t('Too long','길이 초과'):t('Select','선택')}
      </button>
     </div>;
    })}
   </div>
   {manualSupported&&<div className="roundy-editorial-headline-tools" data-testid="headline-edit-tools">
    {!headlineEditing
     ?<button type="button" className="admin-secondary" disabled={busy||unsaved} onClick={()=>{setHeadlineValues([...headlines]);setHeadlineEditing(true);setError('');}}>
       {t('Edit all cover title options','표지 제목 후보 전체 수정')}
      </button>
     :<div className="roundy-editorial-headline-form">
       <p className="admin-help">{t('Write five distinct headlines that genuinely fit the same story. Fixing titles does not override independent copy review.','같은 이야기를 설명하는 서로 다른 제목 다섯 개를 작성하세요. 제목 수정만으로 본문 품질 검수가 통과되지는 않습니다.')}</p>
       {headlineValues.map((value,index)=><label key={index}>
        <span>{t('Cover option ','표지 후보 ')}{index+1}{index===chosen?' ('+t('on cover','현재 선택')+')':''}</span>
        <input type="text" value={value} maxLength={language==='en'?64:34} disabled={busy} onChange={event=>setHeadlineValues(current=>current.map((item,i)=>i===index?event.target.value:item))}/>
       </label>)}
       <div className="roundy-editorial-save-actions">
        <button type="button" className="admin-primary" disabled={busy||!headlineDirty} onClick={()=>void saveHeadlineOptions()}>{t('Save headline options','표지 후보 저장')}</button>
        <button type="button" className="admin-secondary" disabled={busy} onClick={()=>{setHeadlineEditing(false);setHeadlineValues([]);setError('');}}>{t('Cancel','취소')}</button>
       </div>
      </div>}
   </div>}
  </details>}
  <details className="roundy-editorial-section roundy-editorial-collapsed roundy-editorial-feedback" open={doc.editorial_review_required===true}>
   <summary>{doc.editorial_review_required?t('Review saved copy','저장된 원고 검토'):t('Style feedback (optional)','문체 피드백 (선택)')}</summary>
   <p className="admin-help">{t('Feedback informs future copy. Accepting copy here does not approve photos, sources or publication. Leave at least 8 characters.','다음 원고에 반영할 의견을 8자 이상 남겨주세요. 여기서 원고를 확인해도 사진이나 출처가 승인되거나 게시되지는 않습니다.')}</p>
   <label className="roundy-editorial-feedback-label">{t('Editorial feedback','편집 의견')}<textarea value={feedbackNote} maxLength={500} placeholder={t('For example: Keep the concrete scene; remove the repeated advice on card 3.','예: 구체적인 장면은 유지하고 3번 카드의 반복되는 조언은 빼기.')} onChange={e=>setFeedbackNote(e.target.value)}/></label>
   <div className="admin-form-actions"><button type="button" className="admin-secondary" disabled={busy} onClick={()=>void saveFeedback('rework')}>{t('Save change requests','수정 의견 저장')}</button><button type="button" className="admin-secondary" disabled={busy||doc.source_review_required} onClick={()=>void saveFeedback('approve')}>{t('Accept copy, not publication','원고만 확인 완료')}</button></div>
  </details>
  {(storyboard||doc.editorial_engagement_policy||selectedTopic)&&<details className="roundy-editorial-section roundy-editorial-collapsed" data-editorial-diagnostics="true"><summary>{t('Editorial evaluation details','편집 평가 상세')}{!!storyboard?.issues?.length&&<span>{storyboard.issues.length}{t(' notes','개 의견')}</span>}</summary>
   <p className="admin-help">{t('Internal editing checks, not a reach forecast. They do not replace publishing checks.','내부 편집 참고 자료이며 조회수 예측이 아닙니다. 게시 전 검사를 대체하지 않습니다.')}</p>
   {selectedTopic&&<p><strong>{t('Topic','주제')}: </strong>{selectedTopic.headline}{topicRating&&<> ({Number(topicRating.score||0)}/100)</>}</p>}
   {critic&&<><div className="roundy-editorial-density">
    {([['hook','Hook','호기심'],['scene','Scene','공감 장면'],['originality','Originality','새로운 관찰'],['progression','Progression','이야기 전개'],['shareability','Share value','공유 가치']] as const).map(([key,en,ko])=><span key={key}>{t(en,ko)} <strong>{Number(critic.ratings?.[key]||0)}/5</strong></span>)}
   </div><p>{String(critic.reason||'')}</p></>}
   {storyboard&&<div className="roundy-editorial-density"><span>{t('Reserved story slots','예약된 스토리 장수')} <strong>{storyboard.reserved_count}</strong></span><span>{t('Suggested length','권장 장수')} <strong>{storyboard.suggested_count}</strong></span></div>}
   {!!storyboard?.issues?.length&&<div className="roundy-editorial-warnings"><AlertTriangle size={16} aria-hidden="true"/><div>{storyboard.issues.map((issue:string,i:number)=><p key={i}>{issue}</p>)}</div></div>}
   {scores.length>0&&<div className="roundy-editorial-score-notes">{scores.map((review,index)=><p key={index}>{t('Title ','제목 ')}{Number(review.index)+1}: {Number(review.score||0)}/100{Array.isArray(review.reasons)&&review.reasons.length?' — '+review.reasons.join(' / '):''}</p>)}</div>}
  </details>}
 </section>;
}
