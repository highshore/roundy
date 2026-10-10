'use client';
import {useEffect,useState} from 'react';
import {ChevronLeft,ChevronRight,Image as ImageIcon,Maximize2,Ruler} from 'lucide-react';
import {tr,type Locale} from '@/lib/locale';
type Row=Record<string,any>;
export function MarketingMobilePreview({draft,locale}:{draft:Row;locale:Locale}){
 const t=(en:string,ko:string)=>tr(locale,en,ko);
 const images=Array.isArray(draft.images)?draft.images.filter((x:unknown)=>typeof x==='string'&&x):[];
 const slides=Array.isArray(draft.carousel_slides)?draft.carousel_slides:[];
 const total=Math.max(images.length,slides.length);
 const [index,setIndex]=useState(0),[guides,setGuides]=useState(false);
 useEffect(()=>setIndex(0),[draft.id,draft.revision]);
 const active=Math.min(index,Math.max(0,total-1));
 const shownImage=images[active]||null,slide=slides[active]||{};
 const title=String(slide.title||''),text=String((draft.content_language==='en'?slide.body_en:slide.body_ko)||slide.body||'');
 const canNavigate=total>1;
 const magazine=draft.content_document?.design_preset==='roundy_magazine_editorial_v2';
 const role=String(slide.role||'').replaceAll('_',' ');
 const closingLabel=slide.role==='editorial_closing'?String(slide.closing_type||'summary').replaceAll('_',' '):'';
 return <aside className="marketing-mobile-preview" aria-label={t('Mobile card preview','모바일 카드뉴스 미리보기')}>
  <div className="marketing-mobile-preview-head">
   <div><p className="admin-kicker">{magazine?'MAGAZINE EDITORIAL / 4:5':'MOBILE PREVIEW'}</p><strong>{t('How your cards look on a phone','모바일 화면 미리보기')}</strong></div>
   <button type="button" className={'marketing-preview-toggle '+(guides?'active':'')}
    aria-pressed={guides} onClick={()=>setGuides(v=>!v)}>
    <Ruler size={15}/>{t('Safe margins','안전 여백')}</button>
  </div>
  <div className="marketing-phone-shell">
   <div className="marketing-phone-top"><div className="marketing-phone-avatar">r</div>
    <div><strong>roundy.meet</strong><small>Instagram · Carousel</small></div>
    <Maximize2 size={15} color="#a1a29c" aria-hidden="true"/>
   </div>
   <div className="marketing-phone-image" role="region" aria-live="polite"
    aria-label={t('Card','카드')+' '+(total?active+1:0)+' / '+total}>
    {shownImage?<img src={shownImage} alt={t('Generated carousel card ','렌더링된 카드 ')+(active+1)}/>
     :slides.length?<div className="marketing-phone-unrendered">
       <span>{t('Text layout preview (not rendered)','문구 미리보기 (미렌더링)')}</span>
       <strong>{title||t('No headline','제목 없음')}</strong><p>{text}</p>
      </div>:<div className="marketing-phone-empty"><ImageIcon size={26}/>
       {t('Generate cards to preview here.','카드 생성 후 여기에 표시됩니다.')}</div>}
    {guides&&<div className="marketing-phone-safe-guide" aria-label={t('80px design safe area','디자인 안전 여백 80px')}/>}
    {!magazine&&total>0&&<span className="marketing-phone-counter">{active+1} / {total}</span>}
   </div>
   <div className="marketing-phone-bottom">
    <div className="marketing-phone-dots" aria-hidden="true">
     {Array.from({length:Math.min(total,10)},(_,i)=>
      <span key={i} className={active===i?'active':''}/>)}
    </div>
    <p><strong>roundy.meet</strong> {String(draft.caption||'').split('\n').find(Boolean)||t('Your upcoming Roundy post','곧 발행할 Roundy 콘텐츠')}</p>
   </div>
  </div>
  <div className="marketing-phone-controls">
   <button className="admin-secondary" type="button" disabled={!canNavigate||active===0}
    onClick={()=>setIndex(v=>Math.max(0,v-1))} aria-label={t('Previous card','이전 카드')}>
    <ChevronLeft size={16}/></button>
   <div aria-live="polite">{magazine&&<span>{role.toUpperCase()}{closingLabel?' / '+closingLabel.toUpperCase():''} — </span>}{t('Card','카드')} <strong>{total?active+1:0}</strong> / {total}</div>
   <button className="admin-secondary" type="button" disabled={!canNavigate||active===total-1}
    onClick={()=>setIndex(v=>Math.min(total-1,v+1))} aria-label={t('Next card','다음 카드')}>
    <ChevronRight size={16}/></button>
  </div>
  {total>0&&<div className="marketing-phone-filmstrip" role="group" aria-label={t('Choose a card','카드 선택')}>
   {Array.from({length:total},(_,i)=>
    <button key={i} type="button" aria-pressed={active===i}
     aria-label={t('Card ','카드 ')+(i+1)}
     onClick={()=>setIndex(i)}>
     {images[i]?<img src={images[i]} loading="lazy" alt=""/>:<span>{i+1}</span>}
    </button>)}
  </div>}
  <p className="marketing-workspace-footnote">{t(
   'Actual generated 4:5 images are displayed at mobile scale. The safe-zone guide reflects the 80px template margin; it is not added to published images.',
   '실제 생성한 4:5 이미지를 모바일 크기로 보여줍니다. 안전 여백 안내선은 템플릿의 80px 기준이며 게시 이미지에는 포함되지 않습니다.')}</p>
 </aside>;
}
