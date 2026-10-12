'use client';

import {useEffect,useState} from 'react';
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
};
function text(value:unknown){return typeof value==='string'?value:'';}
export function AdminMarketingEditorialStudio({draft,locale,disabled,onUpdated,onRequestAiEdit,onRequestPhotoEdit,onRerenderCover}:Props){
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
 const busy=disabled||working;
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
 useEffect(()=>{setEditing(null);setError('');setFeedbackNote('');setFocusedIndex(0);},[draft.id]);
 useEffect(()=>{setEditing(null);setError('');setFocusedIndex(index=>Math.min(index,Math.max(0,slides.length-1)));},[draft.revision,slides.length]);
 function startEdit(index:number){
  const slide=slides[index];if(!slide||index===brandIndex||disabled||working)return;
  if(!manualSupported){setError(t('This image source has no reusable verified photo archive. Keep the original and use a new upload/re-render instead.','이 이미지 유형은 검증된 원본을 다시 사용할 수 없습니다. 기존 게시물을 보존하고 새 원본을 업로드해 렌더링하세요.'));return;}
  setEditing(index);setError('');
  setFields({title:text(slide.title),body:text(slide.body),
   secondary_body:text(slide.secondary_body|| (language==='en'?slide.body_ko:slide.body_en)),
   highlight:text(slide.highlight)});
 }
 async function editOne(){
  if(editing===null||working||disabled)return;
  if(!fields.title.trim()||!fields.body.trim()){
   setError(t('Enter the headline and primary-language body. You can update the translation later.','제목과 기본 언어 본문을 입력하세요. 번역은 나중에 갱신할 수 있습니다.'));return;
  }
  setWorking(true);setError('');
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
  finally{setWorking(false);}
 }
 async function selectTitle(index:number){
  if(disabled||working||chosen===index)return;
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
   <div><h3>{t('Preview your cards','카드 미리보기')}</h3>
    <p>{t('Check each card, then edit only what needs changing.','카드를 확인하고 필요한 부분만 수정하세요.')}</p>
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
  {!!doc.manual_render_issue&&<div className="roundy-editorial-pending"><div><strong>{t('Text saved; image needs attention','텍스트는 저장되었고 이미지 확인이 필요합니다')}</strong><p>{t('Check the approved photo source before rendering.','렌더링 전에 승인된 사진 원본을 확인하세요.')}</p></div><button type="button" className="admin-secondary" disabled={busy} onClick={onRequestPhotoEdit}>{t('Check photos','사진 확인')}</button></div>}
  <div className="roundy-editorial-section" data-editorial-preview="true">
   <div className="roundy-editorial-card-navigation" aria-label={t('Choose a card','카드 선택')}>
    {slides.map((_:Row,index:number)=><button key={index} type="button" aria-pressed={focusedIndex===index} aria-label={index===brandIndex?t('Final Roundy card','마지막 라운디 소개 카드'):t('Card ','카드 ')+(index+1)} onClick={()=>{if(editing!==null&&index!==focusedIndex&&!window.confirm(t('Leave this card without saving the current edits?','현재 카드의 저장하지 않은 수정을 닫을까요?')))return;setEditing(null);setFocusedIndex(index);}}>{index===brandIndex?'Roundy':String(index+1).padStart(2,'0')}</button>)}
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
      {manualSupported&&!brandSlide?<button type="button" className="roundy-editorial-card-copy" disabled={busy} onClick={()=>startEdit(index)}>{copy}</button>:<div className="roundy-editorial-card-copy">{copy}</div>}
      {brandSlide?<p className="admin-help">{t('The Roundy introduction stays separate from the story.','라운디 소개는 스토리와 분리된 마지막 카드로 유지됩니다.')}</p>:<>
       {!manualSupported&&<p className="admin-help">{t('Upload an archived photo source to enable direct text edits.','보존된 사진 원본을 업로드하면 텍스트를 직접 수정할 수 있습니다.')}</p>}
       {unarchivedAi&&<p className="admin-help">{t('Text can be saved now. Replace the unarchived image before rendering or publishing.','문구는 지금 저장할 수 있습니다. 원본이 보관되지 않은 이미지는 렌더링 및 게시 전에 교체하세요.')}</p>}
       <div className="roundy-editorial-card-buttons">
        {manualSupported&&<button type="button" className="admin-secondary" disabled={busy} onClick={()=>current?setEditing(null):startEdit(index)}><PenLine size={14} aria-hidden="true"/>{current?t('Cancel','취소'):t('Edit text','텍스트 수정')}</button>}
        <button type="button" className="admin-secondary" disabled={busy||unarchivedAi} onClick={()=>onRequestAiEdit(index)}><RefreshCw size={14} aria-hidden="true"/>{t('AI rewrite','AI 재작성')}</button>
        {index<slides.length-1&&<button type="button" className="admin-secondary" disabled={busy} onClick={onRequestPhotoEdit}><ImageIcon size={14} aria-hidden="true"/>{t('Change image','이미지 변경')}</button>}
       </div>
      </>}
     </div>
     {current&&<div className="roundy-editorial-manual">
      <strong>{t('Edit card ','카드 수정 ')}{index+1}</strong>
      <label>{t('Headline','제목')}<input value={fields.title} maxLength={72} onChange={e=>setFields(v=>({...v,title:e.target.value}))}/></label>
      <label>{language==='en'?t('English body','영문 본문'):t('Korean body','국문 본문')}
       <textarea value={fields.body} rows={3} maxLength={260} onChange={e=>setFields(v=>({...v,body:e.target.value}))}/></label>
      <label>{language==='en'?t('Korean translation (can update later)','한국어 번역 (나중에 갱신 가능)'):t('English translation (can update later)','영어 번역 (나중에 갱신 가능)')}
       <textarea value={fields.secondary_body} rows={3} maxLength={260} onChange={e=>setFields(v=>({...v,secondary_body:e.target.value}))}/></label>
      <label>{t('Highlighted phrase (optional)','강조 문구 (선택)')}<input value={fields.highlight} maxLength={80} onChange={e=>setFields(v=>({...v,highlight:e.target.value}))}/></label>
      <p className="admin-help">{t('Saves a new unpublished version of this card. The original and its sources stay intact; publishing checks still apply.','원본과 출처를 보존하고 이 카드만 새 미게시 버전으로 저장합니다. 게시 전 검사는 그대로 적용됩니다.')}</p>
      <button type="button" className="admin-primary" disabled={busy} onClick={()=>void editOne()}>{working?t('Saving…','저장 중…'):t('Save this card','이 카드 저장')}</button>
     </div>}
    </article>;
   })}</div>
  </div>
  <details className="roundy-editorial-section roundy-editorial-collapsed"><summary>{t('View caption','캡션 보기')}</summary><p className="roundy-editorial-caption">{text(draft.caption)}</p></details>
  {headlines.length>1&&<details className="roundy-editorial-section roundy-editorial-collapsed"><summary>{t('Other cover titles','다른 표지 제목')} <span>{headlines.length}</span></summary>
   <p className="admin-help">{t('Changing the title requires an updated cover image before publishing.','제목을 바꾸면 게시 전에 표지 이미지를 갱신해야 합니다.')}</p>
   <div className="roundy-editorial-headlines">
    {headlines.map((title,index)=>{
     const selected=index===chosen,review=scores.find(s=>Number(s.index)===index);
     return <div key={index} className={'roundy-editorial-headline '+(selected?'is-selected':'')}>
      <strong>{title}</strong>
      <button type="button" className="admin-secondary" disabled={busy||selected||review?.fits_canvas===false} aria-pressed={selected} onClick={()=>void selectTitle(index)}>
       {selected?<><Check size={14} aria-hidden="true"/>{t('Selected','선택됨')}</>:review?.fits_canvas===false?t('Too long','길이 초과'):t('Select','선택')}
      </button>
     </div>;
    })}
   </div>
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
