'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {ArrowRight,BookOpen,Check,ChevronRight,Compass,ExternalLink,FileText,Images,Lightbulb,Plus,RefreshCw,Search,ShieldCheck,Sparkles,X} from 'lucide-react';
import {tr,type Locale} from '@/lib/locale';
import {Heading} from './heading';
import type {EditorialPillar,EditorialCard} from '@/lib/editorial-studio-policy';
import './admin-editorial-studio.css';
import {AdminEditorialAutopilot,type AutopilotControl,type AutopilotScan} from './admin-editorial-autopilot';
type Source={id:string;pillar:EditorialPillar;source_url:string;title:string;summary:string;creator:string;source_published_at:string|null;rights_status:string;status:string;created_at:string;origin?:'manual'|'automated';editorial_priority?:number|null};
type Idea={id:string;source_id:string;angle:string;hooks:string[];selected_hook:string;storyboard:EditorialCard[];status:string;revision:number;content_id:string|null;updated_at:string;origin?:'manual'|'automated';editorial_review?:'pending'|'approved'|'rejected';editorial_rationale?:string};
type Trend={id:string;title:string;summary:string;url:string};
type PageData={sources:Source[];ideas:Idea[];suggested_seoul_sources:Trend[];autopilot:AutopilotControl;scans:AutopilotScan[]};
type Tab='discover'|'ideas'|'review';
type SourceForm={pillar:EditorialPillar;source_url:string;title:string;summary:string;creator:string;source_published_at:string};
type EditorState={angle:string;hooks:string[];selected_hook:string;storyboard:EditorialCard[]};
const ROOT='/api/admin/marketing/editorial';
const blankForm:SourceForm={pillar:'dating_opinions',source_url:'',title:'',summary:'',creator:'',source_published_at:''};
const compact=(value:string,max:number)=>value.length>max?value.slice(0,max-1)+'…':value;
export function AdminEditorialStudio({locale}:{locale:Locale}){
 const t=(en:string,ko:string)=>tr(locale,en,ko);
 const [data,setData]=useState<PageData|null>(null);
 const [tab,setTab]=useState<Tab>('discover');
 const [pillar,setPillar]=useState<EditorialPillar>('dating_opinions');
 const [form,setForm]=useState<SourceForm>(blankForm);
 const [selected,setSelected]=useState<string>('');
 const [editor,setEditor]=useState<EditorState|null>(null);
 const [busy,setBusy]=useState('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [query,setQuery]=useState('');
 const [language,setLanguage]=useState<'ko'|'en'>('ko');
 const [showImport,setShowImport]=useState(false);
 const [showExcluded,setShowExcluded]=useState(false);
 const load=useCallback(async()=>{
  const response=await fetch(ROOT,{cache:'no-store',credentials:'same-origin'});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'EDITORIAL_LOAD_FAILED');
  setData(result as PageData);
  return result as PageData;
 },[]);
 useEffect(()=>{let active=true;fetch(ROOT,{cache:'no-store',credentials:'same-origin'}).then(async response=>{
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'EDITORIAL_LOAD_FAILED');
  if(active){setData(result as PageData);if((result as PageData).ideas?.some(i=>i.editorial_review==='pending'&&!i.content_id))setTab('ideas');}
 }).catch(e=>{if(active)setError(String(e.message||e));});return()=>{active=false;};},[]);
 const call=async(path:string,method:'POST'|'PATCH',body:unknown)=>{
  const response=await fetch(ROOT+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'EDITORIAL_ACTION_FAILED');
  return result;
 };
 const run=async(key:string,action:()=>Promise<void>)=>{
  setBusy(key);setError('');setNotice('');
  try{await action();}catch(e){setError(String(e instanceof Error?e.message:e));}
  finally{setBusy('');}
 };
 const selectedIdea=data?.ideas.find(x=>x.id===selected)||null;
 const linkedSource=data?.sources.find(x=>x.id===selectedIdea?.source_id)||null;
 const unsaved=Boolean(selectedIdea&&editor&&(editor.angle!==selectedIdea.angle||editor.selected_hook!==selectedIdea.selected_hook||JSON.stringify(editor.hooks)!==JSON.stringify(selectedIdea.hooks)||JSON.stringify(editor.storyboard)!==JSON.stringify(selectedIdea.storyboard)));
 const filtered=(data?.sources||[]).filter(s=>s.pillar===pillar&&s.status===(showExcluded?'excluded':'saved')&&
  (!query.trim()||[s.title,s.creator,s.summary].some(k=>k.toLowerCase().includes(query.trim().toLowerCase()))));
 const ideas=[...(data?.ideas||[])].sort((a,b)=>Number(a.editorial_review!=='pending')-Number(b.editorial_review!=='pending')||Number(Boolean(a.content_id))-Number(Boolean(b.content_id))||b.updated_at.localeCompare(a.updated_at));
 const counts=useMemo(()=>({sources:data?.sources.filter(s=>s.status==='saved').length||0,
  ideas:data?.ideas.filter(i=>i.editorial_review==='pending'&&!i.content_id).length||0,prepared:data?.ideas.filter(i=>i.content_id).length||0}),[data]);
 function openIdea(idea:Idea){
  setSelected(idea.id);setEditor({angle:idea.angle,hooks:[...idea.hooks],selected_hook:idea.selected_hook,
   storyboard:idea.storyboard.map(card=>({...card}))});setTab('ideas');setError('');setNotice('');
 }
 async function createIdea(source:Source){
  await run('idea:'+source.id,async()=>{
   const result=await call('/ideas','POST',{source_id:source.id});
   const next=await load();
   const idea=next.ideas.find(i=>i.id===result.idea.id)||result.idea;
   openIdea(idea);
  });
 }
 async function saveIdea(){
  if(!selectedIdea||!editor)return;
  await run('save',async()=>{
   const result=await call('/ideas/'+selectedIdea.id,'PATCH',{...editor,revision:selectedIdea.revision});
   await load();openIdea(result.idea);setNotice(t('Editorial brief saved.','기획안이 저장되었습니다.'));
  });
 }
 async function suggest(){
  if(!selectedIdea||!editor)return;
  if(unsaved){setError(t('Save your changes before generating hooks.','AI 후크 생성 전 변경 내용을 저장하세요.'));return;}
  await run('suggest',async()=>{
   const result=await call('/ideas/'+selectedIdea.id+'/suggest','POST',{revision:selectedIdea.revision,confirm_paid:true});
   await load();openIdea(result.idea);
   setNotice(t('Three hook options and an editable storyboard are ready.','후크 3개와 편집 가능한 스토리보드를 생성했습니다.'));
  });
 }
 async function handoff(){
  if(!selectedIdea||!editor)return;
  await run('handoff',async()=>{
   const result=await call('/ideas/'+selectedIdea.id+'/handoff','POST',{revision:selectedIdea.revision,language,confirm_editorial_review:true});
   await load();setNotice(t('Carousel production started. Review the resulting unpublished draft in Marketing.','캐러셀 제작을 시작했습니다. 마케팅의 미게시 초안을 검토하세요.')+' ID: '+result.content_id);
  });
 }
 async function rejectIdea(){
  if(!selectedIdea)return;
  await run('reject',async()=>{
   await call('/ideas/'+selectedIdea.id+'/reject','POST',{revision:selectedIdea.revision});
   await load();setSelected('');setEditor(null);
   setNotice(t('Idea rejected. No production was started.','기획안을 제외했습니다. 제작은 시작되지 않았습니다.'));
  });
 }
 async function configureAutopilot(enabled:boolean,hour?:number){
  await run('config',async()=>{
   await call('/autopilot','PATCH',{enabled,...(hour===undefined?{}:{scan_hour_kst:hour})});
   await load();
   setNotice(enabled?t('Automatic discovery enabled.','자동 소재 발견을 켰습니다.'):t('Automatic discovery paused. Saved ideas remain.','자동 소재 발견을 중지했습니다. 기존 기획안은 유지됩니다.'));
  });
 }
 async function scanNow(){
  await run('scan',async()=>{
   const result=await call('/autopilot/scan','POST',{confirm_paid:true});
   await load();setTab('ideas');
   setNotice(t('Discovery complete. New ideas: ','자동 자료 조사 완료. 새 기획안: ')+String(result.candidates?.length||0));
  });
 }
 async function toggleExcluded(source:Source){
  await run('exclude:'+source.id,async()=>{
   const excluded=source.status!=='excluded';
   await call('/sources/'+source.id,'PATCH',{status:excluded?'excluded':'saved'});
   await load();
   setNotice(excluded?t('Source excluded from discovery.','소재를 보관함에서 제외했습니다.'):t('Source restored to discovery.','소재를 복구했습니다.'));
  });
 }
 const formField=(key:keyof SourceForm,value:string)=>setForm(s=>({...s,[key]:value}));
 return <section className="editorial-studio">
  <header className="editorial-hero">
   <div><p className="admin-kicker">{t('ROUNDY / MARKETING','ROUNDY / 마케팅')}</p>
    <Heading level={1}>{t('Editorial Studio','에디토리얼 스튜디오')}</Heading>
    <p>{t('Automated discovery, screening, hooks and storyboards. You review the editorial choice, media rights and final post.','소재 조사, 후보 선별, 후크와 기획안까지 자동으로 준비합니다. 사람은 기획, 이미지 사용권과 최종 게시를 승인합니다.')}</p>
   </div>
   <div className="editorial-hero-actions">
    <button className="editorial-soft-button" type="button" disabled={!!busy} onClick={()=>void run('refresh',async()=>{await load();})}><RefreshCw size={16}/>{t('Refresh','새로고침')}</button>
    <button className="editorial-soft-button" type="button" onClick={()=>{setTab('discover');setShowImport(true);}}><Plus size={16}/>{t('Add source manually','직접 소재 추가')}</button>
   </div>
  </header>
  <AdminEditorialAutopilot locale={locale} control={data?.autopilot} scans={data?.scans} busy={!!busy}
   onControl={(enabled,hour)=>void configureAutopilot(enabled,hour)}
   onScan={()=>void scanNow()}/>
  <div className="editorial-stats">
   <div><span>{t('Saved sources','저장한 출처')}</span><strong>{counts.sources}</strong></div>
   <div><span>{t('Awaiting editorial approval','기획 승인 대기')}</span><strong>{counts.ideas}</strong></div>
   <div><span>{t('Carousels handed off','제작으로 전달')}</span><strong>{counts.prepared}</strong></div>
  </div>
  <nav className="editorial-tabs" aria-label={t('Editorial workflow','에디토리얼 작업 단계')}>
   {([['discover',Search,t('Discovered sources','발견한 소재')],['ideas',Lightbulb,t('Approve editorial ideas','기획안 승인')],['review',ShieldCheck,t('Prepared','제작 전달')]] as const).map(([id,Icon,label])=>
    <button type="button" key={id} aria-current={tab===id?'page':undefined} onClick={()=>setTab(id)}><Icon size={16}/>{label}</button>)}
  </nav>
  {error&&<p className="editorial-alert" role="alert">{error}</p>}
  {notice&&<p className="editorial-notice" role="status">{notice}</p>}
  {!data&&!error&&<p className="admin-empty">{t('Loading the editorial library…','콘텐츠 라이브러리를 불러오는 중입니다…')}</p>}
  {data&&tab==='discover'&&<>
   <div className="editorial-section-head"><div><Heading level={2}>{t('Discover source material','출처 찾아보기')}</Heading><p>{t('Auto-discovered research and optional manual imports. Public content is inspiration, not a media reuse license.','자동으로 발견한 자료와 직접 추가한 자료입니다. 공개된 콘텐츠라도 타인의 미디어를 무단으로 재사용할 수는 없습니다.')}</p></div></div>
   <div className="editorial-filter-row">
    {([['dating_opinions',t('Dating opinions & interviews','연애 의견과 인터뷰')],['seoul_guides',t('Seoul hotspots & guides','서울 핫플과 데이트 가이드')]] as const).map(([id,label])=><button key={id} type="button" aria-pressed={pillar===id} onClick={()=>{setPillar(id);setQuery('');}}>{label}</button>)}
    <input aria-label={t('Search saved sources','저장된 출처 검색')} value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('Filter saved sources','소재 검색')}/>
    <button type="button" aria-pressed={showExcluded} onClick={()=>setShowExcluded(v=>!v)}>{showExcluded?t('Show saved','저장된 소재 보기'):t('Show excluded','제외한 소재 보기')}</button>
   </div>
   {showImport&&<form className="editorial-import" onSubmit={e=>{e.preventDefault();void run('import',async()=>{
     const response=await call('/sources','POST',{...form,source_published_at:form.source_published_at||null});
     await load();setShowImport(false);setForm(blankForm);setPillar(response.source.pillar);
     setNotice(t('Source saved. Select Create idea to build the angle.','출처가 저장되었습니다. 기획 시작을 선택하세요.'));
   });}}>
    <div className="editorial-form-head"><strong>{t('Import public source','공개 출처 가져오기')}</strong><button type="button" onClick={()=>setShowImport(false)} aria-label={t('Close','닫기')}><X size={17}/></button></div>
    <label>{t('Content pillar','콘텐츠 주제')}<select value={form.pillar} onChange={e=>formField('pillar',e.target.value)}><option value="dating_opinions">{t('Dating opinions','연애 의견')}</option><option value="seoul_guides">{t('Seoul guide','서울 가이드')}</option></select></label>
    <label>{t('Source URL','출처 URL')}<input required type="url" maxLength={1800} value={form.source_url} onChange={e=>formField('source_url',e.target.value)} placeholder="https://www.instagram.com/p/..."/></label>
    <div className="editorial-form-grid">
     <label>{t('Original post or article title','원문 제목')}<input required minLength={8} maxLength={160} value={form.title} onChange={e=>formField('title',e.target.value)}/></label>
     <label>{t('Creator or publisher','제작자 / 매체')}<input maxLength={90} value={form.creator} onChange={e=>formField('creator',e.target.value)}/></label>
    </div>
    <label>{t('What makes this source interesting? (20+ characters)','이 소재가 흥미로운 이유 (20자 이상)')}<textarea required minLength={20} maxLength={1300} rows={3} value={form.summary} onChange={e=>formField('summary',e.target.value)}/></label>
    <div className="editorial-form-bottom"><label>{t('Source date (optional)','게시일 (선택)')}<input type="date" value={form.source_published_at} onChange={e=>formField('source_published_at',e.target.value)}/></label>
     <button className="editorial-primary-button" type="submit" disabled={!!busy}>{busy==='import'?t('Saving…','저장 중…'):t('Save source','출처 저장')}<ArrowRight size={16}/></button>
    </div>
    <p className="editorial-fineprint">{t('URL and summary are supplied by an administrator. Performance metrics are not assumed or generated.','URL과 요약은 관리자가 입력합니다. 조회수와 반응 수치는 임의로 추정하지 않습니다.')}</p>
   </form>}
   <div className="editorial-source-grid">
    {filtered.map(source=><article className="editorial-source" key={source.id}>
     <div className="editorial-source-top"><span>{source.pillar==='seoul_guides'?t('SEOUL GUIDE','서울 가이드'):t('DATING / PEOPLE','연애와 사람')}</span><a href={source.source_url} target="_blank" rel="noopener noreferrer" aria-label={t('Open original source','원본 출처 열기')}><ExternalLink size={16}/></a></div>
     <h3>{source.title}</h3><p className="editorial-source-creator">{source.creator||t('Creator not recorded','제작자 미기록')}{source.source_published_at?' / '+source.source_published_at:''}</p>
     <p>{compact(source.summary,200)}</p>
     {source.origin==='automated'&&<div className="editorial-source-verification"><Sparkles size={13}/>{t('Auto discovered · Editorial priority ','자동 발견 · 편집 우선순위 ')}{source.editorial_priority??'—'}{t('/100 (not predicted engagement)','/100 (조회수 예측 아님)')}</div>}
     <div className="editorial-source-footer"><span>{source.rights_status==='inspiration_only'?t('Inspiration only','아이디어 참고 전용'):source.rights_status==='restricted'?t('Restricted','사용 불가'):t('Rights review required','권리 검토 필요')}</span>
      <div className="editorial-source-actions">
       <button type="button" disabled={!!busy} onClick={()=>void toggleExcluded(source)}>{source.status==='excluded'?t('Restore','복구'):t('Exclude','제외')}</button>
       {source.status==='saved'&&<button type="button" disabled={!!busy||source.rights_status==='restricted'} onClick={()=>{const found=data.ideas.find(i=>i.source_id===source.id);if(found)openIdea(found);else void createIdea(source);}}>{data.ideas.some(i=>i.source_id===source.id)?t('Review story','스토리 검토'):t('Develop idea','기획 시작')}<ChevronRight size={15}/></button>}
      </div></div>
    </article>)}
    {!filtered.length&&<div className="editorial-empty"><Compass size={24}/><strong>{t('No sources in this collection yet','이 주제에 저장된 출처가 없습니다.')}</strong><p>{t('Use Add source to save an Instagram post, article or public interview as inspiration.','출처 추가에서 공개 인터뷰, 인스타그램 게시물, 기사 링크를 저장하세요.')}</p></div>}
   </div>
   {pillar==='seoul_guides'&&data.suggested_seoul_sources?.length>0&&<section className="editorial-trends">
    <div className="editorial-section-head"><div><Heading level={3}>{t('From the existing Seoul Trend Radar','기존 서울 트렌드 레이더의 자료')}</Heading><p>{t('Previously saved research leads. Confirm the linked source and current facts before producing a guide.','이전에 수집한 참고 자료입니다. 제작 전 원문과 최신 정보를 확인하세요.')}</p></div></div>
    <div className="editorial-trend-items">{data.suggested_seoul_sources.map(item=><article key={item.id}>
     <span>{item.title}</span><a target="_blank" rel="noopener noreferrer" href={item.url}><ExternalLink size={15}/>{t('Source','원문')}</a>
     <button type="button" onClick={()=>{setForm({pillar:'seoul_guides',title:item.title||'',summary:item.summary||'',source_url:item.url,creator:'',source_published_at:''});setShowImport(true);window.scrollTo({top:0,behavior:'smooth'});}}>{t('Use as source','출처로 가져오기')}<Plus size={14}/></button>
    </article>)}</div>
   </section>}
  </>}
  {data&&tab==='ideas'&&<>
   <div className="editorial-section-head"><div><Heading level={2}>{t('Angles, hooks and storyboard','관점, 후크와 스토리보드')}</Heading><p>{t('The AI prepares proposals; you approve the best editorial angle or reject it. Approval starts the existing unpublished carousel pipeline.','AI가 기획안을 준비하고 사람은 승인 또는 거절합니다. 승인 시 기존 미게시 캐러셀 제작 파이프라인이 시작됩니다.')}</p></div></div>
   <div className="editorial-workbench">
    <aside className="editorial-idea-list" aria-label={t('Editorial ideas','기획안 목록')}>
     {ideas.map(idea=>{const src=data.sources.find(s=>s.id===idea.source_id);return <button className={selected===idea.id?'is-selected':''} key={idea.id} type="button" onClick={()=>openIdea(idea)}>
      <span>{src?.pillar==='seoul_guides'?t('SEOUL','서울'):t('DATING','연애')} / {idea.content_id?t('In production','제작 전달'):idea.editorial_review==='rejected'?t('Rejected','제외됨'):idea.origin==='automated'?t('Auto proposed · needs review','자동 제안 · 승인 대기'):t('Needs review','승인 대기')}</span><strong>{compact(src?.title||idea.angle,95)}</strong><ChevronRight size={15}/></button>})}
     {!ideas.length&&<div className="editorial-empty"><Lightbulb size={22}/><p>{t('Select Develop idea from a saved source.','저장된 출처에서 기획 시작을 선택하세요.')}</p><button type="button" onClick={()=>setTab('discover')}>{t('Go to sources','출처 보러 가기')}<ArrowRight size={15}/></button></div>}
    </aside>
    <div className="editorial-workspace">
     {!selectedIdea||!editor?<div className="editorial-empty"><BookOpen size={28}/><strong>{t('Choose a source-backed idea','출처 기반 기획안을 선택하세요.')}</strong></div>:<>
      <header className="editorial-workspace-head"><div><span className="editorial-overline">{linkedSource?.pillar==='seoul_guides'?t('SEOUL DISCOVERIES','서울 데이트 가이드'):t('DATING OPINIONS','연애 의견')}</span><h3>{linkedSource?.title}</h3>
       {linkedSource&&<a href={linkedSource.source_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14}/>{t('Original material','참고 원문')}</a>}</div>
       <span className="editorial-revision">v{selectedIdea.revision}{selectedIdea.content_id?' / '+t('Handed off','전달 완료'):''}</span></header>
      {selectedIdea.origin==='automated'&&<p className="editorial-autogenerated-note"><Sparkles size={15}/>{t('AI prepared this source-backed hook and storyboard. Verify facts and choose whether the idea deserves production.','AI가 출처 기반으로 후크와 기획안을 만들었습니다. 사실을 검토하고 제작할지 판단하세요.')}</p>}
      {selectedIdea.editorial_review==='rejected'&&<p className="editorial-alert">{t('Rejected. Editing and saving this story will reopen review.','제외한 기획안입니다. 수정 후 저장하면 다시 검토할 수 있습니다.')}</p>}
      {selectedIdea.editorial_rationale&&<p className="editorial-review-reason"><strong>{t('Why it may resonate','독자가 관심을 가질 이유')}</strong>{selectedIdea.editorial_rationale}</p>}
      <label className="editorial-field">{t('The editorial angle','이 소재에서 전달할 관점')}<textarea rows={2} maxLength={200} disabled={!!selectedIdea.content_id} value={editor.angle} onChange={e=>setEditor(s=>s&&({...s,angle:e.target.value}))}/></label>
      <div className="editorial-hook-heading"><div><h4>{t('Three hook candidates','후크 후보 3개')}</h4><p>{t('Pick the opening someone would stop scrolling for.','첫 장에서 스크롤을 멈출 만한 문장을 고르세요.')}</p></div>
       <button type="button" className="editorial-soft-button" disabled={!!busy||!!selectedIdea.content_id||unsaved} onClick={()=>void suggest()}><Sparkles size={15}/>{busy==='suggest'?t('Generating…','생성 중…'):t('AI propose hooks','AI 후크 제안')}</button></div>
      <p className="editorial-fineprint">{t('AI suggestions are optional and explicitly requested. Each request reserves $0.02 of the existing marketing budget; no automatic retries. Save edits first.','AI 제안은 선택 기능입니다. 요청마다 기존 마케팅 예산에서 $0.02를 예약하며 자동 재시도하지 않습니다. 수정 내용은 먼저 저장하세요.')}</p>
      <div className="editorial-hook-list">{editor.hooks.map((hook,index)=><div className="editorial-hook" key={index}>
       <input type="radio" name="chosenHook" aria-label={t('Select hook','후크 선택')+' '+(index+1)} checked={editor.selected_hook===hook} disabled={!!selectedIdea.content_id} onChange={()=>setEditor(s=>s&&({...s,selected_hook:hook}))}/>
       <div><span>{t('Option','후보')} {index+1}</span><input maxLength={110} disabled={!!selectedIdea.content_id} value={hook} onChange={e=>setEditor(s=>{if(!s)return s;const next=[...s.hooks];next[index]=e.target.value;return {...s,hooks:next,selected_hook:s.selected_hook===hook?e.target.value:s.selected_hook};})}/></div>
      </div>)}</div>
      <div className="editorial-story-head"><div><h4>{t('Carousel storyboard','캐러셀 스토리보드')}</h4><p>{t('Each card must add a concrete idea, not repeat the cover.','각 카드는 표지의 반복이 아닌 새로운 정보를 담아야 합니다.')}</p></div>
       <select aria-label={t('Story length','카드 수')} disabled={!!selectedIdea.content_id} value={editor.storyboard.length} onChange={e=>setEditor(s=>{if(!s)return s;const count=Number(e.target.value);return {...s,storyboard:count===5?[...s.storyboard,...Array.from({length:Math.max(0,5-s.storyboard.length)},()=>({title:'',body:''}))].slice(0,5):s.storyboard.slice(0,3)};})}><option value={3}>3 {t('story cards','장')}</option><option value={5}>5 {t('story cards','장')}</option></select>
      </div>
      <div className="editorial-cards">{editor.storyboard.map((card,index)=><div key={index} className="editorial-card-editor"><span>{String(index+1).padStart(2,'0')}</span>
       <input aria-label={t('Card headline','카드 제목')+' '+(index+1)} placeholder={t('Card headline','카드 제목')} maxLength={100} disabled={!!selectedIdea.content_id} value={card.title} onChange={e=>setEditor(s=>s&&({...s,storyboard:s.storyboard.map((v,i)=>i===index?{...v,title:e.target.value}:v)}))}/>
       <textarea aria-label={t('Card content','카드 내용')+' '+(index+1)} placeholder={t('What should the reader learn here?','독자가 이 카드에서 무엇을 얻나요?')} rows={2} maxLength={240} disabled={!!selectedIdea.content_id} value={card.body} onChange={e=>setEditor(s=>s&&({...s,storyboard:s.storyboard.map((v,i)=>i===index?{...v,body:e.target.value}:v)}))}/></div>)}</div>
      <div className="editorial-workspace-actions">
       {selectedIdea.content_id?<Link className="editorial-primary-button" href="/admin/marketing">{t('Open content library','콘텐츠 라이브러리 열기')}<ArrowRight size={16}/></Link>:<>
        <button type="button" className="editorial-soft-button" disabled={!!busy} onClick={()=>void saveIdea()}><Check size={16}/>{busy==='save'?t('Saving…','저장 중…'):t('Save storyboard','기획안 저장')}</button>
        <label>{t('Language','언어')}<select value={language} onChange={e=>setLanguage(e.target.value==='en'?'en':'ko')}><option value="ko">한국어</option><option value="en">English</option></select></label>
        <button type="button" className="editorial-soft-button" disabled={!!busy} onClick={()=>void rejectIdea()}><X size={15}/>{t('Reject idea','기획 제외')}</button>
        <button type="button" className="editorial-primary-button" disabled={!!busy||selectedIdea.status!=='ready'||selectedIdea.editorial_review==='rejected'||unsaved} onClick={()=>void handoff()}>{busy==='handoff'?t('Starting production…','제작 시작 중…'):t('Approve & produce','기획 승인 후 제작')}<ArrowRight size={16}/></button>
       </>}
      </div>
      {unsaved&&<p className="editorial-notice" role="status">{t('Unsaved changes. Save your storyboard to enable production or AI suggestions.','저장되지 않은 변경 사항이 있습니다. 기획안을 저장한 뒤 제작이나 AI 제안을 진행하세요.')}</p>}
      {!selectedIdea.content_id&&<p className="editorial-fineprint">{t('Save your latest edits before creating content. This transfers a brief to the existing reviewed-photo and approval pipeline; it does not publish or schedule anything.','수정 내용을 먼저 저장하세요. 기존 이미지 권리 검수와 승인 파이프라인에 기획안을 전달할 뿐 자동 게시하거나 예약하지 않습니다.')}</p>}
     </>}
    </div>
   </div>
  </>}
  {data&&tab==='review'&&<>
   <div className="editorial-section-head"><div><Heading level={2}>{t('Production handoffs','제작 전달 현황')}</Heading><p>{t('The source studio never publishes automatically. Finish media and final approval in the existing Marketing panel.','이 스튜디오는 자동 게시하지 않습니다. 이미지 제작과 최종 승인은 기존 마케팅 패널에서 진행합니다.')}</p></div></div>
   <div className="editorial-handoff-list">{ideas.filter(i=>!!i.content_id).map(idea=>{const source=data.sources.find(s=>s.id===idea.source_id);return <article key={idea.id}><div><span><Images size={15}/>{source?.pillar==='seoul_guides'?t('Seoul guide','서울 가이드'):t('Dating discussion','연애 의견')}</span><h3>{source?.title}</h3><p>{idea.selected_hook}</p></div><Link href="/admin/marketing">{t('Review in Marketing','마케팅에서 검토')}<ArrowRight size={16}/></Link></article>})}
    {!data.ideas.some(i=>i.content_id)&&<div className="editorial-empty"><FileText size={25}/><strong>{t('No content has been handed off','제작에 전달된 콘텐츠가 없습니다.')}</strong><p>{t('Create a source-backed idea and approve its hook first.','출처 기반 기획안을 만들고 후크를 선택하세요.')}</p></div>}</div>
  </>}
 </section>;
}
