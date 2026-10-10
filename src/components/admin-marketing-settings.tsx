'use client';
import {CalendarDays,Image as ImageIcon,Layers3,LockKeyhole,Sparkles,Type} from 'lucide-react';
import {tr,type Locale} from '@/lib/locale';
import {EDITORIAL_SETTINGS_DEFAULTS,type MarketingEditorialSettings} from '@/lib/marketing-editorial-settings';

type Row=Record<string,any>;
export function AdminMarketingSettings({locale,settings,onChange,onSave,busy}:{
 locale:Locale;settings:Row;onChange:(next:Row)=>void;onSave:()=>void;busy:boolean
}){
 const t=(en:string,ko:string)=>tr(locale,en,ko);
 const value=<K extends keyof MarketingEditorialSettings,>(key:K)=>settings[key]??EDITORIAL_SETTINGS_DEFAULTS[key];
 const set=(key:keyof MarketingEditorialSettings,next:unknown)=>onChange({...settings,[key]:next});
 const min5=Number(value('carousel_min_real_photos_5')),min3=Number(value('carousel_min_real_photos_3'));
 const photoInvalid=!Number.isInteger(min5)||min5<2||min5>3||min3!==2;
 const label=(title:string,detail:string)=><div className="marketing-settings-field-copy"><strong>{title}</strong><small>{detail}</small></div>;
 return <section className="marketing-workspace-panel marketing-editorial-settings" aria-label={t('Feed and card settings','Feed 및 카드뉴스 설정')}>
  <div className="marketing-workspace-section-head"><div>
   <p className="admin-kicker">FEED / CREATIVE</p>
   <h2>{t('Feed & carousel settings','Feed 및 카드뉴스 설정')}</h2>
   <p>{t('Saved in the existing marketing settings record. Changes apply to new content and the active Feed daily limit.',
    '기존 마케팅 설정 DB에 저장됩니다. 변경 사항은 새 콘텐츠와 활성 Feed 발행 한도에 적용됩니다.')}</p>
  </div></div>
  <form className="marketing-settings-form" onSubmit={e=>{e.preventDefault();onSave();}}>
   <fieldset className="marketing-settings-group">
    <legend><CalendarDays size={18}/>{t('Publication policy','발행 정책')}</legend>
    <div className="marketing-settings-fields">
     <label>{label(t('Feed posts per KST day','KST 일일 Feed 발행 횟수'),
      t('Approved posts beyond this limit stay queued for future dates.',
       '한도를 초과한 승인 게시물은 다음 발행 가능 날짜로 이동합니다.'))}
      <input type="number" min={1} max={10} step={1} value={Number(value('feed_daily_max_posts'))}
       onChange={e=>set('feed_daily_max_posts',Number(e.target.value))}/></label>
     <label>{label(t('Carousel mode','카드뉴스 구성'),
      t('Alternating follows the final approved publication order.','Alternating은 최종 승인 예약 순서대로 3장과 5장을 번갈아 적용합니다.'))}
      <select value={value('carousel_mode')} onChange={e=>set('carousel_mode',e.target.value)}>
       <option value="fixed">Fixed · 5 {t('slides','장')}</option>
       <option value="alternating">Alternating · 3 → 5</option>
      </select></label>
     <label>{label(t('Default card count','기본 카드뉴스 장수'),
      t('Locked by the existing Fixed 5-card and Alternating 3/5 rules.',
       '기존 Fixed 5장 및 Alternating 3/5장 규칙에 따라 자동 결정됩니다.'))}
      <div className="marketing-settings-locked"><span>5 {t('cards','장')}</span><LockKeyhole size={16}/>
       <small>{t('Rule-based','규칙 고정')}</small></div></label>
    </div>
   </fieldset>
   <fieldset className="marketing-settings-group">
    <legend><ImageIcon size={18}/>{t('Real photo policy','실제 사진 기준')}</legend>
    <div className="marketing-settings-fields">
     <label>{label(t('Minimum photos · 5 cards','5장 중 실제 사진 최소 수'),
      t('Current Pexels renderer supports 2–3 reviewed photo slots.','현재 렌더러에서 검수 사진 슬롯 2~3개를 지원합니다.'))}
      <input type="number" min={2} max={3} step={1} value={min5}
       onChange={e=>set('carousel_min_real_photos_5',Number(e.target.value))}/></label>
     <label>{label(t('Minimum photos · 3 cards','3장 중 실제 사진 최소 수'),
      t('Two real photos, with the final card reserved for the CTA.','실제 사진 2장, 마지막 장은 CTA로 구성합니다.'))}
      <input type="number" min={2} max={2} step={1} value={min3}
       onChange={e=>set('carousel_min_real_photos_3',Number(e.target.value))}/></label>
    </div>
    {photoInvalid&&<p className="admin-error" role="alert">{t(
     'Current rendering supports 2–3 photos in a 5-card post and exactly 2 in a 3-card post. Correct the counts before saving.',
     '현재 5장은 실제 사진 2~3개, 3장은 정확히 2개만 지원합니다. 개수를 수정한 후 저장하세요.')}</p>}
   </fieldset>
   <fieldset className="marketing-settings-group">
    <legend><Sparkles size={18}/>{t('Creative automation','카피 및 비주얼 자동화')}</legend>
    <div className="marketing-settings-toggles">
     {([
      ['carousel_ai_thumbnail_enabled',
       t('AI thumbnail','AI 썸네일'),
       t('AI imagery may be used for the cover only, after photo approval.',
        '사진 검수 완료 후 표지에 한해 AI 이미지를 사용할 수 있습니다.')],
      ['carousel_answer_first_enabled',
       'Answer-First',
       t('Lead with the result and choose from three headline candidates.',
        '결론형 카피를 사용하고 표지 문구 후보 3개 중 선택합니다.')],
      ['story_preview_auto_enabled',
       t('Tomorrow Feed → Story preview','다음 날 Feed → Story 미리보기'),
       t('Auto-generate previews; human approval is still required before scheduling.',
        '미리보기만 자동 생성하며 예약 전에는 관리자 승인이 필요합니다.')]
     ] as const).map(([key,name,desc])=><label className="marketing-settings-toggle-row" key={key}>
      <div className="marketing-settings-field-copy"><strong>{name}</strong><small>{desc}</small></div>
      <input type="checkbox" checked={Boolean(value(key))} onChange={e=>set(key,e.target.checked)}
       aria-label={name}/>
      <span className="marketing-settings-switch" aria-hidden="true"/>
     </label>)}
    </div>
   </fieldset>
   <fieldset className="marketing-settings-group">
    <legend><Type size={18}/>{t('Mobile typography','모바일 타이포그래피')}</legend>
    <div className="marketing-settings-fields">
     <label>{label(t('Title size','제목 크기'),
      t('Larger readable headlines, in pixels.','모바일에서 읽기 쉬운 제목 크기, px 단위입니다.'))}
      <div className="marketing-settings-unit-input"><input type="number" min={24} max={160}
       value={Number(value('carousel_title_font_size_px'))} onChange={e=>set('carousel_title_font_size_px',Number(e.target.value))}/>
       <span>px</span></div></label>
     <label>{label(t('Body size','본문 크기'),
      t('Content text, in pixels.','카드 본문 크기, px 단위입니다.'))}
      <div className="marketing-settings-unit-input"><input type="number" min={16} max={80}
       value={Number(value('carousel_body_font_size_px'))} onChange={e=>set('carousel_body_font_size_px',Number(e.target.value))}/>
       <span>px</span></div></label>
    </div>
    <div className="marketing-settings-type-demo">
     <div className="marketing-settings-demo-head"><Layers3 size={15}/>
      {t('Example hierarchy','타이포 위계 예시')}</div>
     <strong style={{fontSize:Math.min(32,Math.max(19,Number(value('carousel_title_font_size_px'))/3))}}>
      {t('Conversation starts here','대화는 여기에서 시작됩니다')}</strong>
     <p style={{fontSize:Math.min(19,Math.max(12,Number(value('carousel_body_font_size_px'))/2.6))}}>
      {t('One clear idea on every card.','한 장에 한 가지 핵심 메시지.')}</p>
    </div>
   </fieldset>
   <div className="marketing-settings-footer">
    <p>{t('Updates this existing DB row only: marketing_automation_settings. No duplicate settings are created.',
     '기존 marketing_automation_settings 레코드만 갱신하며 별도 설정 시스템은 생성하지 않습니다.')}</p>
    <button className="admin-primary" type="submit" disabled={busy||photoInvalid}>
     {t('Save creative settings','설정 저장')}
    </button>
   </div>
  </form>
 </section>;
}
