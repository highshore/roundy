'use client';

import {useEffect,useState} from 'react';
import {tr,type Locale} from '@/lib/locale';
import {Check,PenLine,RefreshCw,Image as ImageIcon,AlertTriangle} from 'lucide-react';
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
 const brandIndex=draft.content_document?.brand_outro_version===1?slides.length-1:-1;
 const doc=draft.content_document||{},headlines=(Array.isArray(doc.thumbnail_candidates)?doc.thumbnail_candidates:[]) as string[];
 const scores=(Array.isArray(doc.editorial_headline_reviews)?doc.editorial_headline_reviews:[]) as Row[];
 const storyboard=doc.editorial_storyboard_review as Row|null;
 const critic=doc.editorial_critic as Row|null;
 const selectedTopic=doc.editorial_topic_selection?.selected as Row|undefined;
 const topicRatings=(Array.isArray(doc.editorial_topic_reviews)?doc.editorial_topic_reviews:[]) as Row[];
 const topicRating=topicRatings.find(r=>r.angle_key===selectedTopic?.angle_key);
 const language=draft.content_language==='en'?'en':'ko';
 const manualSupported=['stock','pexels'].includes(String(draft.visual_source));
 const chosen=Number(doc.thumbnail_selected_index??0);
 const [editing,setEditing]=useState<number|null>(null);
 const [working,setWorking]=useState(false);
 const [error,setError]=useState('');
 const [fields,setFields]=useState({title:'',body:'',secondary_body:'',highlight:''});
 const [showCaption,setShowCaption]=useState(false);
 useEffect(()=>{setEditing(null);setError('');},[draft.id,draft.revision]);
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
  if(!fields.title.trim()||!fields.body.trim()||!fields.secondary_body.trim()){
   setError(t('Enter both language versions and a headline.','제목과 두 언어의 본문을 모두 입력하세요.'));return;
  }
  if(!window.confirm(t('Create a new unapproved version of this single card? Existing drafts, approved images, scheduled posts and sources stay untouched.',
   '이 카드만 수정한 새 미승인 초안을 만들까요? 기존 초안, 승인 사진, 예약 게시물과 출처는 변경하지 않습니다.')))return;
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
  const score=scores.find(s=>s.index===index);
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
 return <section className="roundy-editorial-studio" aria-label={t('Integrated editorial review','통합 에디토리얼 검수')}>
  <div className="roundy-editorial-head">
   <div><span className="admin-kicker">ROUNDY / EDITORIAL STUDIO</span>
    <h3>{t('Review the story before publishing','발행 전 콘텐츠 편집')}</h3>
    <p>{t('One place for headlines, storyboard, rendered cards and targeted edits. Nothing publishes automatically.',
     '제목, 구성, 실제 렌더링 이미지와 카드별 수정 내용을 한곳에서 검토합니다. 자동으로 게시되지 않습니다.')}</p>
   </div>
   <div className="roundy-editorial-layout-count">{slides.length} <small>{t('carousel cards','장 카드뉴스')}</small></div>
  </div>
  {headlines.length>=3&&<div className="roundy-editorial-section">
   <div className="roundy-editorial-section-title"><h4>{t('Cover headline candidates','표지 제목 후보')}</h4>
    <span>{headlines.length} {t('options','개 후보')}</span></div>
   <p className="admin-help">{t('Scores are editorial heuristics, not reach predictions. Selecting a different headline invalidates the old rendered cover until you re-render it.',
    '점수는 내부 편집 기준이며 조회수 예측이 아닙니다. 제목을 바꾸면 기존 표지는 다시 렌더링하기 전까지 발행할 수 없습니다.')}</p>
   <div className="roundy-editorial-headlines">
    {headlines.map((title,index)=>{
     const selected=index===chosen,review=scores.find(s=>Number(s.index)===index);
     return <article key={index} className={'roundy-editorial-headline '+(selected?'is-selected':'')}>
      <div className="roundy-editorial-preview-type" aria-label={t('Type layout preview, not the rendered photo','타이포 미리보기, 최종 이미지 아님')}>
       <small>ROUNDY / SEOUL</small><strong>{title}</strong>
      </div>
      <div className="roundy-editorial-option-footer">
       <div><strong>{String(index+1).padStart(2,'0')}. {selected?t('Selected','선택됨'):t('Option','후보')}</strong>
        {review&&<small>{t('Editorial score','편집 점수')} {Number(review.score||0)}/100</small>}
       </div>
       <button type="button" className={selected?'admin-primary':'admin-secondary'}
        disabled={disabled||working||selected||review?.fits_canvas===false}
        aria-pressed={selected} onClick={()=>void selectTitle(index)}>
        {selected?<><Check size={14}/>{t('Selected','선택됨')}</>:t('Select','선택')}
       </button>
      </div>
      {!!review?.reasons?.length&&<details className="roundy-editorial-notes"><summary>{t('Score details','점수 근거')}</summary>
       {review.reasons.map((r:string,i:number)=><p key={i}>{r}</p>)}</details>}
     </article>;
    })}
   </div>
   {doc.thumbnail_render_pending&&<div className="roundy-editorial-pending"><p role="alert" className="admin-error">{t('The selected headline must be re-rendered into the cover before publishing.',
    '선택한 제목으로 표지를 다시 렌더링해야 게시할 수 있습니다.')}</p>
    <button type="button" className="admin-primary" disabled={disabled||working} onClick={onRerenderCover}>{t('Re-render selected cover','선택한 표지 다시 렌더링')}</button>
   </div>}
  </div>}
  {doc.editorial_engagement_policy&&<div className="roundy-editorial-section">
   <div className="roundy-editorial-section-title"><h4>{t('Reader engagement quality','독자 몰입도 검수')}</h4>
    <span>{Number(draft.quality_report?.editorial_score??0)}/100 · {draft.quality_report?.status==='passed'?t('Passed','통과'):t('Needs review','검토 필요')}</span></div>
   <p className="admin-help">{critic
    ?t('An independent AI editor scored the generated story. This is a pre-publication editorial screen, not a reach forecast.',
      '원고 작성과 별개인 AI 편집장이 이야기 자체를 검토했습니다. 조회수 예측이 아니라 발행 전 편집 평가입니다.')
    :t('Rule-based editing checks only. This historic or manually edited version has no independent AI review.',
      '규칙 기반 편집 검사 결과입니다. 기존 또는 수동 수정된 원고에는 별도 AI 평가가 없을 수 있습니다.')}</p>
   {selectedTopic&&<p className="admin-help"><strong>{t('Approved topic','선정된 주제')}: </strong>{selectedTopic.headline}
    {topicRating&&<> · {t('Topic editor','주제 평가')} {Number(topicRating.score||0)}/100</>}</p>}
   {critic&&<>
    <div className="roundy-editorial-density">
     {([
      ['hook','Hook','첫 장의 호기심'],
      ['scene','Relatable scene','장면의 공감도'],
      ['originality','Original insight','새로운 관찰'],
      ['progression','Distinct swipes','이야기 전개'],
      ['shareability','Share value','공유 가치']
     ] as const).map(([key,en,ko])=><span key={key}>{t(en,ko)} <strong>{Number(critic.ratings?.[key]||0)}/5</strong></span>)}
    </div>
    <p className="admin-help"><strong>{t('Editor notes','편집장 의견')}: </strong>{String(critic.reason||'')}</p>
    {(doc.editorial_critic_history?.length>1)&&<p className="admin-help">{t('Reviews used','평가 횟수')}: {doc.editorial_critic_history.length} / 2</p>}
   </>}
  </div>}
  <div className="roundy-editorial-section">
   <div className="roundy-editorial-section-title"><h4>{t('Storyboard and information density','슬라이드 구성 및 정보량')}</h4>
    <span>{storyboard?.density?t(String(storyboard.density),String(storyboard.density)==='thin'?'정보 부족':String(storyboard.density)==='dense'?'정보 풍부':'적정 정보량'):t('Saved template','저장된 템플릿')}</span></div>
   <p className="admin-help">{t('The existing fixed/alternating 3/5-slot reservation is never changed after creation. The editor instead checks for filler, compression and distinct takeaways.',
    '기존 3장 또는 5장 예약 순번은 변경하지 않습니다. 카드마다 새로운 정보가 있는지 확인하고 예약된 장수에 맞게 다듬습니다.')}</p>
   {storyboard&&<div className="roundy-editorial-density">
    <span>{t('Reserved','예약')} <strong>{storyboard.reserved_count}</strong></span>
    <span>{t('Content-length suggestion','정보량 기준 제안')} <strong>{storyboard.suggested_count}</strong></span>
    <span>{t('Distinct detail cards reviewed','검토한 본문 카드')} <strong>{storyboard.measured_cards}</strong></span>
   </div>}
   {!!storyboard?.issues?.length&&<div className="roundy-editorial-warnings" role="status"><AlertTriangle size={16}/>
    <div>{storyboard.issues.map((issue:string,i:number)=><p key={i}>{issue}</p>)}</div></div>}
  </div>
  <div className="roundy-editorial-section">
   <div className="roundy-editorial-section-title"><h4>{t('Card-by-card preview and edits','카드별 미리보기 및 수정')}</h4><span>{slides.length} {t('cards','장')}</span></div>
   {!manualSupported&&<p className="admin-help">{t('Direct text-only edits require an archived approved photo source. These cards can still be reviewed; use the upload workflow for unarchived artwork.','텍스트 직접 수정에는 보존된 승인 사진 원본이 필요합니다. 원본이 없는 완성 이미지에서는 업로드 방식으로 새 버전을 제작하세요.')}</p>}
   <div className="roundy-editorial-cards">{slides.map((slide:Row,index:number)=>{
    const current=editing===index,visual=Array.isArray(draft.images)?draft.images[index]:'';
    const brandSlide=index===brandIndex;
    const unarchivedAi=doc?.photo_sourcing?.ai_image_slot===index&&(index>0||!doc.regeneration_ai_cover_path);
    const primary=text(language==='en'?slide.body_en||slide.body:slide.body_ko||slide.body);
    return <article className={'roundy-editorial-card '+(current?'is-editing':'')} key={index}>
     <div className="roundy-editorial-card-media">
      {visual?<img src={visual} alt={t('Actual saved card ','저장된 카드 이미지 ')+(index+1)}/>:<div className="roundy-editorial-card-placeholder"><small>ROUNDY / {String(slide.role||'').toUpperCase()}</small><strong>{slide.title}</strong><p>{primary}</p></div>}
      <span className="roundy-editorial-card-index">{String(index+1).padStart(2,'0')}</span>
     </div>
     <div className="roundy-editorial-card-info">
      <small>{String(slide.role||'').replaceAll('_',' ').toUpperCase()}</small>
      <strong>{slide.title}</strong><p>{primary}</p>
      {!!slide.source_ids?.length&&<small>{t('Source references retained','출처 ID 유지')}: {slide.source_ids.join(', ')}</small>}
      {unarchivedAi&&<small>{t('An AI image without an archived source must be replaced through the reviewed photo workflow before text editing.','원본이 보관되지 않은 AI 이미지는 승인 사진으로 교체한 뒤 문구를 수정할 수 있습니다.')}</small>}
      <div className="roundy-editorial-card-buttons">
       <button type="button" className="admin-secondary" disabled={disabled||working||!manualSupported||unarchivedAi||brandSlide} onClick={()=>current?setEditing(null):startEdit(index)}><PenLine size={13}/>{current?t('Cancel','취소'):t('Edit text','텍스트 수정')}</button>
       <button type="button" className="admin-secondary" disabled={disabled||working||unarchivedAi||brandSlide} onClick={()=>onRequestAiEdit(index)}><RefreshCw size={13}/>{t('AI rewrite','AI 재작성')}</button>
       {!brandSlide&&index<slides.length-1&&<button type="button" className="admin-secondary" disabled={disabled||working} onClick={onRequestPhotoEdit}><ImageIcon size={13}/>{t('Photos','이미지')}</button>}
      </div>
     </div>
     {current&&<div className="roundy-editorial-manual">
      <strong>{t('Edit card ','카드 수정 ')}{index+1}</strong>
      <label>{t('Headline','제목')}<input value={fields.title} maxLength={72} onChange={e=>setFields(v=>({...v,title:e.target.value}))}/></label>
      <label>{language==='en'?t('English body','영문 본문'):t('Korean body','국문 본문')}
       <textarea value={fields.body} rows={3} maxLength={260} onChange={e=>setFields(v=>({...v,body:e.target.value}))}/></label>
      <label>{language==='en'?t('Korean translation','한국어 번역'):t('English translation','영어 번역')}
       <textarea value={fields.secondary_body} rows={3} maxLength={260} onChange={e=>setFields(v=>({...v,secondary_body:e.target.value}))}/></label>
      <label>{t('Optional highlighted phrase','강조 문구 (선택)')}<input value={fields.highlight} maxLength={80} onChange={e=>setFields(v=>({...v,highlight:e.target.value}))}/></label>
      <p className="admin-help">{t('Only this card changes. The original keeps its images and references; the new version is unpublished and must pass all quality and photo-rights checks.',
       '이 카드만 새 미승인 버전으로 수정됩니다. 기존 이미지와 출처는 원본에 그대로 유지되며 품질 검사와 사진 권한 검사를 다시 통과해야 합니다.')}</p>
      <button type="button" className="admin-primary" disabled={disabled||working} onClick={()=>void editOne()}>{working?t('Saving…','저장 중…'):t('Save as new draft','새 초안으로 저장')}</button>
     </div>}
    </article>;
   })}</div>
  </div>
  <div className="roundy-editorial-section">
   <button type="button" className="admin-secondary" aria-expanded={showCaption} onClick={()=>setShowCaption(v=>!v)}>{showCaption?t('Hide caption preview','캡션 미리보기 닫기'):t('Preview complete Instagram caption','Instagram 캡션 전체 미리보기')}</button>
   {showCaption&&<p className="roundy-editorial-caption">{text(draft.caption)}</p>}
  </div>
  {error&&<p role="alert" className="admin-error">{error}</p>}
 </section>;
}
