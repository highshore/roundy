'use client';

import {useEffect,useMemo,useState} from 'react';
import {ArrowLeftRight,RotateCcw,RefreshCw,Images,Type,Image as ImageIcon} from 'lucide-react';
import {tr,type Locale} from '@/lib/locale';
import './admin-marketing-regeneration.css';

type Row=Record<string,any>;
type Mode='text'|'image'|'both'|'render';
type Scope='all'|'slides'|'cover_title'|'body'|'caption';
const BASE='/api/admin/marketing';
const uuid=()=>crypto.randomUUID();
const money=(v:number)=>'$'+v.toFixed(2);
const hasPhotos=(item:Row)=>['stock','pexels'].includes(String(item.visual_source));
function cost(mode:Mode,aiCover:boolean){
 if(mode==='render')return 0;
 if(aiCover&&mode==='both')return .20;
 if(aiCover&&mode==='image')return .15;
 return (mode==='text'||mode==='both')?.02:0;
}
function short(value:unknown,limit=130){
 const text=typeof value==='string'?value.trim():'';
 return text.length>limit?text.slice(0,limit-1)+'…':text;
}
async function api(path:string,body?:unknown){
 const r=await fetch(BASE+path,{method:body?'POST':'GET',
  ...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),
  cache:'no-store',credentials:'same-origin'});
 const v=await r.json().catch(()=>({error:'INVALID_SERVER_RESPONSE'}));
 if(!r.ok||v.error)throw new Error(String(v.error||'Request failed'));
 return v;
}
function firstTitle(d:Row){return short(d.carousel_slides?.[0]?.title||d.caption||'',75);}
export function AdminMarketingRegeneration({sourceId,locale,onCreated,onClose}:{
 sourceId:string;locale:Locale;onCreated:(draft:Row)=>void;onClose?:()=>void
}){
 const t=(en:string,ko:string)=>tr(locale,en,ko);
 const [versions,setVersions]=useState<Row[]>([]);
 const [loading,setLoading]=useState(true),[working,setWorking]=useState(false);
 const [error,setError]=useState(''),[message,setMessage]=useState('');
 const [mode,setMode]=useState<Mode>('text'),[scope,setScope]=useState<Scope>('all');
 const [imageSource,setImageSource]=useState<'online'|'ai'>('online');
 const [indices,setIndices]=useState<number[]>([]),[instruction,setInstruction]=useState('');
 const [compare,setCompare]=useState(false),[comparisonId,setComparisonId]=useState<string>('');
 const [viewId,setViewId]=useState<string>(sourceId);
 useEffect(()=>{setViewId(sourceId);setCompare(false);setMode('text');setScope('all');setImageSource('online');setIndices([]);setInstruction('');},[sourceId]);
 useEffect(()=>{
  let active=true;setLoading(true);setError('');
  api('/draft/'+sourceId+'/versions').then(v=>{
   if(!active)return;
   setVersions(v.versions||[]);
   setComparisonId(current=>current||String((v.versions||[])[0]?.id||''));
  }).catch(e=>{if(active)setError(String(e.message||e));}).finally(()=>{if(active)setLoading(false);});
  return ()=>{active=false;};
 },[sourceId]);
 const source=useMemo(()=>versions.find(x=>x.id===viewId)||versions.find(x=>x.id===sourceId)||versions.at(-1)||null,[versions,viewId,sourceId]);
 const photos=hasPhotos(source||{});
 const missingCount=(source?.images||[]).filter((url:unknown)=>!url).length;
 const slides=(source?.carousel_slides||[]) as Row[];
 const targetIndices=scope==='slides'?indices:scope==='caption'?[]:scope==='cover_title'?[0]:scope==='body'?slides.slice(1).map((_,i)=>i+1):slides.map((_,i)=>i);
 const aiCover=Boolean(source?.content_document?.photo_sourcing?.ai_thumbnail_enabled&&targetIndices.includes(0)&&
   !source?.content_document?.photo_sourcing?.photo_slots?.includes?.(0));
 const estimate=imageSource==='ai'&&['image','both'].includes(mode)?(mode==='both'?.20:.15):cost(mode,false);
 const aiCoverEligible=Boolean(source?.content_document?.photo_sourcing?.ai_thumbnail_enabled===true);
 const before=useMemo(()=>versions.find(x=>x.id===comparisonId)||versions[0]||null,[versions,comparisonId]);
 const actionsDisabled=loading||working||!source||!slides.length;
 function quick(next:Mode,index:number){
  setMode(next);setScope('slides');setIndices([index]);setError('');setMessage('');
  document.getElementById('roundy-regeneration-options-'+sourceId)?.scrollIntoView({behavior:'smooth',block:'nearest'});
 }
 async function refreshHistory(id?:string){
  const data=await api('/draft/'+(id||sourceId)+'/versions');
  setVersions(data.versions||[]);
 }
 async function regenerate(){
  if(!source||working)return;
  if(scope==='slides'&&!indices.length){setError(t('Select at least one slide.','슬라이드를 하나 이상 선택하세요.'));return;}
  const description=(scope==='all'?t('all slides','모든 슬라이드'):scope==='caption'?t('caption only','캡션만'):scope==='cover_title'?t('cover title only','표지 제목만'):scope==='body'?t('body text','본문 텍스트'):t('selected slides','선택한 슬라이드')+' '+indices.map(i=>i+1).join(', '));
  if(!window.confirm(t('Create a separate, unpublished version of','원본을 보존한 새 미발행 버전을 생성합니다. 변경 범위: ')+
    ' '+description+' / '+mode.toUpperCase()+' / '+t('estimated maximum AI reservation','AI 예상 예약 비용')+
    ' '+money(estimate)+'.\n'+t('The original and scheduled/publication snapshots will remain unchanged. New photos require copyright review and publication is blocked until quality checks pass.',
     '원본과 예약 및 게시 기록은 변경되지 않습니다. 신규 사진은 저작권 검수 후 승인이 필요하며, 품질 검사 통과 전 발행할 수 없습니다.')))return;
  setWorking(true);setError('');setMessage('');
  try{
   const result=await api('/draft/'+source.id+'/versions',{
    request_key:'rework:'+uuid(),revision:source.revision,mode,scope,slide_indices:indices,
    instruction,image_source:imageSource,confirm_cost:true
   });
   if(!result?.draft?.id)throw new Error('NEW_VERSION_NOT_SAVED');
   setMessage(t('New unapproved draft saved. Review copy and photos before publishing.',
    '새 미승인 초안으로 저장했습니다. 발행 전에 문구와 사진을 다시 검수하세요.'));
   onCreated(result.draft);
   setViewId(result.draft.id);
   await refreshHistory(result.draft.id);
  }catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{setWorking(false);}
 }
 async function finishRendering(){
  if(!source||working)return;
  setWorking(true);setError('');setMessage('');
  try{
   const result=await api('/draft/'+source.id+'/versions/render',{revision:source.revision});
   if(!result.draft?.id)throw new Error('RENDER_NOT_COMPLETED');
   onCreated(result.draft);setViewId(result.draft.id);
   setMessage(t('Only modified cards were rendered; review the new quality report.',
    '변경된 카드만 재렌더링했습니다. 새로운 품질 검사 결과를 확인하세요.'));
   await refreshHistory(result.draft.id);
  }catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{setWorking(false);}
 }
 async function restore(version:Row){
  if(!source||working)return;
  if(!window.confirm(t('Restore this saved version into a NEW unapproved draft? The current, published and scheduled versions remain unchanged.',
   '선택한 버전을 새로운 미승인 초안으로 복원할까요? 현재 버전과 이미 발행 또는 예약된 콘텐츠는 그대로 보존됩니다.')))return;
  setWorking(true);setError('');setMessage('');
  try{
   const result=await api('/draft/'+source.id+'/versions/restore',{
    revision:source.revision,version_id:version.id,confirm_restore:true
   });
   if(!result.draft?.id)throw new Error('RESTORE_FAILED');
   onCreated(result.draft);
   setViewId(result.draft.id);
   setMessage(t('Restored as a separate draft. Run all publication checks before approval.',
    '이전 버전을 별도 초안으로 복원했습니다. 게시 승인 전 전체 검증을 다시 실행하세요.'));
   await refreshHistory(result.draft.id);
  }catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{setWorking(false);}
 }
 return <section className="marketing-version-studio" aria-label={t('AI partial regeneration','AI 부분 재생성')}>
  <div className="marketing-version-heading">
   <div><small className="admin-kicker">INSTAGRAM / REVISION STUDIO</small>
    <h3>{t('Regenerate a saved post','기존 콘텐츠 재생성')}</h3>
    <p>{t('Edit only what you choose. Each result is a new, unapproved draft.',
      '선택한 부분만 변경하고 새 미승인 초안으로 저장합니다. 원본은 보존됩니다.')}</p></div>
   {onClose&&<button type="button" className="admin-secondary" onClick={onClose}>{t('Close','닫기')}</button>}
  </div>
  {loading?<p role="status">{t('Loading version history…','버전 기록 불러오는 중…')}</p>:!source?
   <p role="alert">{t('No saved draft was found.','저장된 콘텐츠를 찾을 수 없습니다.')}</p>:<>
   <div className="marketing-version-toolbar">
    <button type="button" className="admin-secondary" disabled={actionsDisabled}
     onClick={()=>{setMode('both');setScope('all');setIndices([]);}}>
     <RefreshCw size={15}/>{t('Regenerate all','전체 재생성')}</button>
    <button type="button" className="admin-secondary" disabled={actionsDisabled}
     onClick={()=>{setMode('render');setScope('all');setIndices([]);}}>
     <Images size={15}/>{t('Re-render only','렌더링만 실행')}</button>
    <button type="button" className="admin-secondary" onClick={()=>setCompare(x=>!x)}>
     <ArrowLeftRight size={15}/>{t('Before / after','변경 전후 비교')}</button>
   </div>
   <p className="marketing-version-origin"><strong>{t('Working from','기준 버전')} v{source.version}</strong>
    <span>{firstTitle(source)}</span>
    <span>{source.status==='published'?t('Published original','발행 원본'):source.status==='scheduled'?t('Reserved original','예약 원본'):t('Unpublished source','미게시 기준')}</span></p>
   {Number(source.version)>1&&source.images?.some((url:unknown)=>!url)&&<div className="marketing-version-pending">
    <strong>{t('Changed cards are awaiting approved photos or rendering.',
      '변경된 카드가 사진 검수 또는 재렌더링을 기다리고 있습니다.')}</strong>
    <p>{t('Approve newly sourced photos in the main Draft editor, then finish rendering only the changed slides. Untouched slides and old approvals stay intact.',
     '새로 검색한 사진은 메인 초안 편집기에서 저작권 검수 후 승인하세요. 승인 후 변경한 카드만 렌더링하며, 변경하지 않은 카드와 기존 사진 승인은 보존됩니다.')}</p>
    <button type="button" className="admin-secondary" disabled={working||!source.regeneration_parent_id} onClick={()=>void finishRendering()}>
     <Images size={14}/>{t('Render changed cards after approval ($0 AI)','사진 승인 후 변경 카드만 렌더링 (AI $0)')}</button>
   </div>}
   <div className="marketing-version-slides">
    {slides.map((slide:Row,index:number)=><article className="marketing-version-slide" key={index}>
     {source.images?.[index]?<img src={source.images[index]} alt={t('Existing slide','기존 슬라이드')+' '+(index+1)}/>:<div className="marketing-version-empty-image">{t('Needs rendering','렌더링 필요')}</div>}
     <div className="marketing-version-slide-copy"><small>{String(index+1).padStart(2,'0')} / {String(slide.role||'card').replaceAll('_',' ').toUpperCase()}</small>
      <strong>{short(slide.title,100)}</strong><p>{short(source.content_language==='en'?slide.body_en||slide.body:slide.body_ko||slide.body,160)}</p>
      <div className="marketing-version-card-actions">
       <button type="button" disabled={working} onClick={()=>quick('text',index)}><Type size={14}/>{t('Rewrite text','텍스트 재생성')}</button>
       <button type="button" disabled={working||!photos} onClick={()=>quick('image',index)}><ImageIcon size={14}/>{t('Replace photo','이미지 교체')}</button>
       <button type="button" disabled={working} onClick={()=>quick('both',index)}><RefreshCw size={14}/>{t('Rebuild slide','슬라이드 전체 재생성')}</button>
      </div>
     </div>
    </article>)}
   </div>
   <div id={'roundy-regeneration-options-'+sourceId} className="marketing-version-options">
    <h4>{t('Regeneration options','재생성 옵션')}</h4>
    <div className="marketing-version-fields">
     <label><span>{t('What to regenerate','재생성 유형')}</span><select value={mode} onChange={e=>{
      const next=e.target.value as Mode;setMode(next);
      if((next==='image'||next==='both'||next==='render')&&['cover_title','body','caption'].includes(scope))setScope('all');
     }}>
      <option value="text">{t('Text only','텍스트만')}</option>
      <option value="image">{t('Photos only','이미지만')}</option>
      <option value="both">{t('Text and photos','텍스트 + 이미지')}</option>
      <option value="render">{t('Render again (no AI)','렌더링만 다시 실행')}</option>
     </select></label>
     <label><span>{t('Scope','변경 범위')}</span><select value={scope} onChange={e=>setScope(e.target.value as Scope)}>
      <option value="all">{t('All slides','전체 슬라이드')}</option>
      <option value="slides">{t('Selected slides','선택한 슬라이드')}</option>
      {mode==='text'&&<><option value="cover_title">{t('Cover title only','표지 제목만')}</option><option value="body">{t('Body text only','본문 텍스트만')}</option><option value="caption">{t('Instagram caption only','Instagram 캡션만')}</option></>}
     </select></label>
    </div>
    {(mode==='image'||mode==='both')&&<fieldset className="marketing-version-indices">
     <legend>{t('Image replacement source','이미지 교체 방식')}</legend>
     <label><input type="radio" name={'image-source-'+sourceId} checked={imageSource==='online'} onChange={()=>setImageSource('online')}/>
      {t('Search licensed online photos (Pexels, Wikimedia, Openverse)','온라인 사진 검색 (Pexels, Wikimedia, Openverse)')}</label>
     <label><input type="radio" name={'image-source-'+sourceId} checked={imageSource==='ai'} onChange={()=>setImageSource('ai')}/>
      {t('Generate a new AI image','AI 이미지 새로 생성')}</label>
     {imageSource==='ai'&&!aiCoverEligible&&<p className="admin-error">{t('This post uses a real-photo cover. AI cover generation is unavailable unless its saved photo policy allows an AI thumbnail.','이 콘텐츠는 실사 표지를 사용 중입니다. 저장된 사진 정책에서 AI 썸네일을 허용하지 않아 AI 표지 생성이 제한됩니다.')}</p>}
     {imageSource==='ai'&&<p className="admin-help">{t('AI generation is limited to the cover, to preserve the minimum three real photos in a five-card carousel.','5장 카드뉴스 실제 사진 3장 이상 정책을 유지하기 위해 AI 이미지는 표지에서만 생성합니다.')}</p>}
    </fieldset>}
    {scope==='slides'&&<fieldset className="marketing-version-indices"><legend>{t('Choose slides','수정할 슬라이드 선택')}</legend>
     {slides.map((_:Row,i:number)=><label key={i}><input type="checkbox" checked={indices.includes(i)} disabled={working} onChange={e=>setIndices(current=>e.target.checked?[...current,i].sort((a,b)=>a-b):current.filter(x=>x!==i))}/> {i+1}{t('th card','번 카드')}</label>)}
    </fieldset>}
    <label className="marketing-version-direction"><span>{t('Additional instructions (optional)','추가 지시사항 (선택)')}</span>
     <textarea rows={3} maxLength={500} disabled={working} value={instruction} onChange={e=>setInstruction(e.target.value)}
      placeholder={t('Example: Make the title shorter. Replace the third slide with a licensed Seoul café photo.',
       '예: 제목을 더 짧고 직관적으로. 3번째 카드에 라이선스 확인 서울 카페 사진을 사용해줘.')}/>
     <small>{instruction.length}/500</small></label>
    <div className="marketing-version-cost">
     <div><strong>{t('Changes','변경 대상')}</strong><span>{scope==='caption'?t('Caption only','캡션만'):scope==='cover_title'?t('Cover headline','표지 제목'):scope==='body'?t('Body copy','본문 텍스트'):targetIndices.length+' / '+slides.length+' '+t('slides','개 슬라이드')}</span></div>
     <div><strong>{t('Estimated AI reservation','AI 예상 예약 비용')}</strong><span>{money(estimate)}</span></div>
     <p>{t('Licensed photo lookup and server rendering do not call image AI. New photos require manual rights approval. Published/scheduled snapshots are immutable.',
      '실사 사진 검색과 서버 렌더링은 이미지 AI를 호출하지 않습니다. 신규 사진은 수동 저작권 승인 대상이며 게시 및 예약 기록은 변경되지 않습니다.')}</p>
    </div>
    <button type="button" className="admin-primary" disabled={actionsDisabled||scope==='slides'&&!indices.length||(imageSource==='ai'&&['image','both'].includes(mode)&&(!aiCoverEligible||scope!=='slides'||indices.length!==1||indices[0]!==0))}
     onClick={()=>void regenerate()}>{working?t('Saving new version…','새 버전 저장 중…'):t('Generate and save new version','새 버전 재생성 및 저장')}</button>
   </div>
   <div className="marketing-version-history">
    <div className="marketing-version-section-head"><h4>{t('Version history','버전 기록')}</h4>
     <button type="button" className="admin-secondary" disabled={working} onClick={()=>void refreshHistory().catch(e=>setError(String(e.message||e)))}><RefreshCw size={14}/>{t('Refresh','새로고침')}</button></div>
    {versions.map(v=><div className="marketing-version-record" key={v.id}>
     <div><strong>v{v.version} {v.id===source.id?'— '+t('Current source','선택된 기준'):''}</strong>
      <small>{t(v.mode==='original'?'Original':v.mode==='restore'?'Restored':'Regenerated',v.mode==='original'?'원본':v.mode==='restore'?'복원':'재생성')} / {v.scope||'all'} / {new Date(v.created_at).toLocaleString(locale,{timeZone:'Asia/Seoul'})}</small></div>
     <div className="marketing-version-record-actions">
      <button type="button" className="admin-secondary" disabled={working} onClick={()=>setViewId(v.id)}>{t('Open','열기')}</button>
      <button type="button" className="admin-secondary" disabled={working||v.id===source.id} onClick={()=>{setComparisonId(v.id);setCompare(true);}}>{t('Compare','비교')}</button>
      <button type="button" className="admin-secondary" disabled={working||v.id===source.id} onClick={()=>void restore(v)}><RotateCcw size={13}/>{t('Restore copy','버전 복원')}</button>
     </div>
    </div>)}
   </div>
   {compare&&before&&<div className="marketing-version-comparison">
    <h4>{t('Compare versions','버전 비교')} — v{before.version} → v{source.version}</h4>
    <div className="marketing-version-comparison-pair">
     {[[before,t('Before','변경 전')],[source,t('After','변경 후')]] .map(([v,title]:any)=><article key={title}>
      <strong>{title} / v{v.version}</strong>
      <div className="marketing-version-mini-slides">{(v.carousel_slides||[]).map((slide:Row,i:number)=><div key={i}>
       {v.images?.[i]?<img src={v.images[i]} alt=""/>:<span className="marketing-version-empty-image"/>}
       <span><b>{i+1}. {short(slide.title,70)}</b><small>{short(slide.body,90)}</small></span>
      </div>)}</div>
      <details><summary>{t('Read Instagram caption','Instagram 캡션 보기')}</summary><p className="marketing-version-caption">{v.caption}</p></details>
     </article>)}
    </div>
   </div>}
  </>}
  {error&&<p className="admin-error" role="alert">{error}</p>}
  {message&&<p className="admin-help" role="status">{message}</p>}
 </section>;
}
