import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function replaceOnce(s,from,to,label){if(!s.includes(from))throw new Error('Missing '+label);return s.replace(from,to);}
function replaceBetween(s,start,end,replacement,label){const a=s.indexOf(start);if(a<0)throw new Error('Missing start '+label);const b=s.indexOf(end,a);if(b<0)throw new Error('Missing end '+label);return s.slice(0,a)+replacement+s.slice(b);}

// 1) Cost-protected generator: Flare + 4:5 photo + hidden daily workspace.
{
 let s=read('src/lib/marketing-generation.ts');
 s=replaceOnce(s,"const COPY_MODEL='gpt-4.1-mini',IMAGE_MODEL='gpt-image-2',MAX_INPUT_BYTES=16000;","const COPY_MODEL='gpt-4.1-mini',IMAGE_MODEL='gpt-image-2.5-flare',MAX_INPUT_BYTES=16000;",'image model');
 s=replaceOnce(s,"db.from('instagram_post_drafts').select('id,content_language,draft_date,caption').order('draft_date',{ascending:false}).limit(30)","db.from('instagram_post_drafts').select('id,content_language,draft_date,caption').eq('draft_role','workspace').order('draft_date',{ascending:false}).limit(30)",'language history workspace');
 s=replaceOnce(s,"size:'1024x1024',quality:'low',output_format:'jpeg',background:'opaque'","size:'1024x1280',quality:'low',output_format:'jpeg',output_compression:85,background:'opaque'",'photo size');
 const today=`export async function todayDraft(){
 const db=createServiceRoleClient(),today=kstDate();
 const existing=checked(await db.from('instagram_post_drafts').select('*').eq('draft_date',today).eq('draft_role','workspace').maybeSingle()).data as Row|null;
 if(existing)return existing;
 const settings=checked(await db.from('marketing_automation_settings').select('*').eq('singleton',true).single()).data as Row,dow=new Date(today+'T12:00:00+09:00').getUTCDay();
 const rec=checked(await db.from('instagram_posting_time_recommendations').select('*').eq('dow',dow).maybeSingle()).data as Row|null,isGrowth=Boolean(settings.growth_carousel_enabled&&settings.growth_days.includes(dow)),topic=topics[Math.floor(Date.parse(today+'T00:00:00Z')/86400000)%topics.length],language=await nextContentLanguage(db);
 const base={draft_date:today,draft_role:'workspace',status:'needs_approval',content_language:language,content_mode:settings.content_mode,draft_kind:isGrowth?'growth_carousel':'brand',growth_topic_type:isGrowth?topic:null,content_pillar:'concept',caption:'',cta:'Follow @roundy.meet',destination_url:'https://roundy.team',images:[],carousel_slides:[],research_sources:[],research_status:isGrowth?'pending':'not_required',generation_reason:'Hidden generation workspace. Results are imported into independent drafts.',recommended_time_kst:rec?.recommended_time_kst||'21:00',window_start_kst:rec?.window_start_kst||'20:30',window_end_kst:rec?.window_end_kst||'21:30',scheduled_for:today+'T'+String(rec?.recommended_time_kst||'21:00').slice(0,5)+':00+09:00',revision:1};
 const inserted=await db.from('instagram_post_drafts').insert(base).select('id').maybeSingle();
 if(inserted.error&&String((inserted.error as any).code||'')!=='23505')throw inserted.error;
 const id=inserted.data?.id||checked(await db.from('instagram_post_drafts').select('id').eq('draft_date',today).eq('draft_role','workspace').single()).data!.id;
 return readDraft(db,id);
}
`;
 s=replaceBetween(s,'export async function todayDraft(){','export async function automaticGeneration(){',today,'todayDraft');
 write('src/lib/marketing-generation.ts',s);
}

// 2) Legacy root data only exposes editable candidate drafts; legacy photo path matches Flare defaults.
{
 let s=read('src/lib/marketing-legacy.ts');
 s=replaceOnce(s,"db.from('instagram_post_drafts').select('*').order('draft_date',{ascending:false}).limit(14)","db.from('instagram_post_drafts').select('*').eq('draft_role','candidate').eq('status','needs_approval').order('imported_at',{ascending:false}).order('updated_at',{ascending:false}).limit(100)",'candidate draft query');
 s=s.replaceAll("openai/gpt-image-2'","openai/gpt-image-2.5-flare'");
 s=s.replaceAll("MARKETING_IMAGE_MODEL||'gpt-image-2'","MARKETING_IMAGE_MODEL||'gpt-image-2.5-flare'");
 s=s.replaceAll("size:'1024x1024'","size:'1024x1280'");
 s=s.replaceAll("quality:'medium'","quality:'low'");
 s=s.replaceAll("Create one square 1:1 hyper-realistic Instagram marketing photograph","Create one portrait 4:5 hyper-realistic Instagram marketing photograph");
 s=s.replace("    response_format:'b64_json'\n","    quality:'low',\n    output_format:'jpeg'\n");
 write('src/lib/marketing-legacy.ts',s);
}

// 3) New import endpoint: immutable generation result -> independent editable draft.
{
 let s=read('src/lib/marketing.ts');
 const anchor=" if(id==='generation'&&path[1]==='jobs'&&path.length===4&&uuid(path[2])&&path[3]==='restore'&&req.method==='POST'){";
 const insert=` if(id==='generation'&&path[1]==='jobs'&&path.length===4&&uuid(path[2])&&path[3]==='import'&&req.method==='POST'){
  const body=await req.json().catch(()=>({}));
  if(body.confirm_import!==true)return json({error:'IMPORT_CONFIRMATION_REQUIRED'},400);
  try{
   const imported=checked(await service.rpc('create_marketing_candidate_from_generation',{p_job_id:path[2]}));
   if(imported.status!=='needs_approval')return json({error:'RESULT_ALREADY_USED'},409);
   return json({draft:imported});
  }catch(error){
   const message=error instanceof Error?error.message:String((error as {message?:unknown})?.message||'Import failed');
   return json({error:message.slice(0,500)},400);
  }
 }
`;
 if(!s.includes(anchor))throw new Error('Missing import route anchor');
 s=s.replace(anchor,insert+anchor);
 write('src/lib/marketing.ts',s);
}

// 4) Marketing admin: generator is independent, drafts are cards, published/scheduled drafts disappear, result import creates a new draft.
{
 let s=read('src/components/admin-marketing.tsx');
 s=replaceBetween(s,' async function generate(today=false,renderOnly=false){',' function retryCost',` async function generate(today=false,renderOnly=false){
  if(renderOnly&&!draft)return;
  if(renderOnly&&dirty&&!window.confirm(t('Discard unsaved edits before rendering?','저장하지 않은 수정을 버리고 이미지를 다시 렌더할까요?')))return;
  const actualVisual=today||renderOnly||basis==='growth_carousel'||mode==='text'?'cards':visual,photo=actualVisual==='photo';
  const cost=renderOnly?'$0':photo?'$0.05':basis==='growth_carousel'&&['book_insight','trend_research','dating_myth'].includes(topic)?'$0.05':'$0.02';
  const message=photo?t('Generate one Flare AI photo at low quality? No retries. This reserves '+cost+' from the app budget.','Flare AI 사진 1장을 low 품질로 생성할까요? 자동 재시도는 없으며 앱 예산 '+cost+'를 예약합니다.'):t('Generate a new immutable content result with a '+cost+' budget reservation? It will not enter Drafts until you choose Add to Drafts.','앱 예산 '+cost+'를 예약하고 새 생성 결과를 만들까요? 생성 후 직접 초안으로 가져오기 전에는 초안 목록에 들어가지 않습니다.');
  if(!window.confirm(message))return;
  await work(async()=>{
   const payload={request_key:'manual:'+crypto.randomUUID(),revision:renderOnly?draft!.revision:1,mode:renderOnly?'image':today?'both':mode,content_mode:basis,language:today?undefined:contentLanguage,visual_mode:today?'cards':actualVisual,topic_type:topic,instruction:direction.trim(),confirm_photo:photo,render_only:renderOnly};
   const path=renderOnly?'/draft/'+draft!.id+'/regenerate':'/draft/generate';
   const r=await request(path,payload);
   if(!r.ok||r.data.error)throw new Error(r.data.error||'Generation failed');
   if(r.data.job?.status==='running'){setNotice(t('This request already exists. Check Generation history; it was not billed again.','이미 접수된 요청입니다. 생성 기록을 확인하세요. 추가 호출하지 않았습니다.'));return;}
   if(['failed','uncertain'].includes(r.data.job?.status))throw new Error(r.data.job?.error_message||'Previous attempt stopped; no retry was sent.');
   await load(renderOnly?draft?.id:undefined);
   if(renderOnly&&r.data.draft)selectDraft(r.data.draft);
   else setActiveTab('generation');
   setNotice(renderOnly?t('Cards rendered from the current draft.','현재 초안의 카드를 다시 렌더했습니다.'):t('Generation complete. Open the result in Generation history and choose Add to Drafts.','생성이 완료됐습니다. 생성 기록에서 결과를 확인한 뒤 초안으로 가져오세요.'));
   setDirection('');
  });
 }
`,'generate function');
 s=s.replace("   setActiveTab('draft');\n   setNotice(t('Retry complete. The generated result is open in Draft.','재시도가 완료됐습니다. 생성 결과를 초안 탭에 열었습니다.'));","   setActiveTab('generation');\n   setNotice(t('Retry complete. Open the result and choose Add to Drafts.','재시도가 완료됐습니다. 결과를 확인한 뒤 초안으로 가져오세요.'));");
 s=s.replaceAll('restoreResultToDraft','importResultToDraft');
 s=s.replace("Replace the current editable draft with this saved generation result? This does not publish it.","Create a new independent draft from this saved generation result? This does not publish it.");
 s=s.replace("현재 편집 가능한 초안을 이 저장된 생성 결과로 교체할까요? 게시되지는 않습니다.","이 저장된 생성 결과로 독립적인 새 초안을 만들까요? 게시되지는 않습니다.");
 s=s.replace("'/generation/jobs/'+resultPreview.attempt.id+'/restore',{confirm_restore:true}","'/generation/jobs/'+resultPreview.attempt.id+'/import',{confirm_import:true}");
 s=s.replace("throw new Error(r.data.error||'Restore failed')","throw new Error(r.data.error||'Import failed')");
 s=s.replace("Saved generation result restored to Draft.","Generated result added to Drafts.");
 s=s.replace("저장된 생성 결과를 초안으로 불러왔습니다.","생성 결과를 독립 초안으로 추가했습니다.");
 s=s.replace("Load this result into Draft","Add to Drafts");
 s=s.replace("이 결과를 초안으로 불러오기","초안으로 가져오기");
 s=s.replace("onClick={()=>void importResultToDraft()}","onClick={()=>void importResultToDraft()}");
 s=s.replace("researching:t('One web search and copy','웹 검색 최대 1회 및 문구 작성 중')","researching:t('Researching sources','출처 조사 중')");

 const errorAnchor="   RESULT_SNAPSHOT_UNAVAILABLE:['This older completed generation predates result snapshots, so its exact content is no longer available.','이 완료 작업은 결과 보존 기능 도입 이전에 생성되어 정확한 결과를 다시 불러올 수 없습니다.']";
 if(!s.includes(errorAnchor))throw new Error('Missing error map anchor');
 s=s.replace(errorAnchor,errorAnchor+",\n   IMPORT_CONFIRMATION_REQUIRED:['Confirm before adding this generated result to Drafts.','생성 결과를 초안으로 가져오기 전에 확인하세요.'],\n   RESULT_ALREADY_USED:['This generated result has already moved beyond the editable Drafts inbox.','이 생성 결과는 이미 초안으로 사용되어 편집 가능한 초안 목록을 벗어났습니다.']");

 // Move generation controls outside any selected draft.
 const draftHeading=s.indexOf('   <div className="admin-section-title"><Heading level={2}>{t(\'Instagram drafts\',\'Instagram 초안\')}</Heading>');
 if(draftHeading<0)throw new Error('Missing draft heading');
 const generator=`   <section className="marketing-generator-card">
    <div className="admin-section-title"><div><p className="admin-kicker">{t('Create','생성')}</p><Heading level={2}>{t('New content','새 콘텐츠 생성')}</Heading></div></div>
    <div className="admin-form">
     <div className="admin-two"><label><span>{t('Content basis','콘텐츠 기준')}</span><select value={basis} onChange={e=>setBasis(e.target.value)}><option value="prelaunch">{t('Pre-launch','오픈 전 홍보')}</option><option value="live_event">{t('Live event','정식 이벤트')}</option><option value="growth_carousel">Growth Carousel</option></select></label><label><span>{t('Generation scope','생성 범위')}</span><select value={mode} onChange={e=>setMode(e.target.value)}><option value="both">{t('Copy + visuals','문구 + 비주얼')}</option><option value="text">{t('Copy only','문구만')}</option></select></label></div>
     <label><span>{t('Content language','콘텐츠 언어')}</span><select value={contentLanguage} onChange={e=>setContentLanguage(e.target.value as 'ko'|'en')}><option value="ko">{t('Korean post','한국어 콘텐츠')}</option><option value="en">{t('English post','영어 콘텐츠')}</option></select></label>
     {basis==='growth_carousel'?<label><span>{t('Topic','주제')}</span><select value={topic} onChange={e=>setTopic(e.target.value)}>{topics.map((x,i)=><option key={x} value={x}>{t(x.replaceAll('_',' '),topicKo[i])}</option>)}</select></label>:mode!=='text'&&<label><span>{t('Visual method','비주얼 방식')}</span><select value={visual} onChange={e=>setVisual(e.target.value)}><option value="cards">{t('Rendered editorial cards — no image AI charge','에디토리얼 카드 — 이미지 AI 비용 없음')}</option><option value="photo">{t('Flare AI photo — low quality, 4:5','Flare AI 사진 — low 품질, 4:5')}</option></select></label>}
     <label><span>{t('Creative direction','커스텀 지시문')}</span><textarea value={direction} maxLength={500} rows={4} onChange={e=>setDirection(e.target.value)}/><small>{direction.length}/500</small></label>
     {basis==='growth_carousel'&&<p className="admin-help">{CONTENT_PROFILES[postType({content_mode:basis,topic_type:topic})].label}: {CONTENT_PROFILES[postType({content_mode:basis,topic_type:topic})].roles.join(' → ')}</p>}
     {basis==='growth_carousel'&&['book_insight','trend_research','dating_myth'].includes(topic)&&<p className="admin-help">{t('High-context research may use up to two targeted searches before one structured writing request. Missing evidence blocks publication.','고품질 검색으로 목적별 검색을 최대 2회 사용한 뒤 구조화된 문구를 작성합니다. 근거가 부족하면 게시가 차단됩니다.')}</p>}
     <button type="button" className="admin-primary" disabled={busy||!!running||blocked} onClick={()=>void generate(false)}>{t('Generate content','콘텐츠 생성')}</button>
    </div>
   </section>
`;
 s=s.slice(0,draftHeading)+generator+s.slice(draftHeading);

 // Remove old selected-draft generation fieldset.
 const oldStart=s.indexOf("    {draft.status==='needs_approval'&&<fieldset disabled={busy||!!running} className=\"regeneration-panel\">");
 const captionStart=s.indexOf("    <label><span>{t('Caption','캡션')}</span>",oldStart);
 if(oldStart<0||captionStart<0)throw new Error('Missing old generator fieldset');
 s=s.slice(0,oldStart)+s.slice(captionStart);

 // Replace draft heading + select with card inbox.
 const headingStart=s.indexOf('   <div className="admin-section-title"><Heading level={2}>{t(\'Instagram drafts\',\'Instagram 초안\')}</Heading>');
 const editorStart=s.indexOf('   {!draft?',headingStart);
 if(headingStart<0||editorStart<0)throw new Error('Missing draft selector block');
 const inbox=`   <div className="admin-section-title"><div><p className="admin-kicker">{t('Working inbox','작업함')}</p><Heading level={2}>{t('Drafts','초안')}</Heading><p>{t('Only editable drafts appear here. Scheduled and published posts move to Publishing history.','편집 가능한 초안만 표시됩니다. 예약 또는 게시된 콘텐츠는 게시 기록으로 이동합니다.')}</p></div><button type="button" className="admin-secondary" onClick={()=>setActiveTab('generation')}>{t('Add from generated results','생성 결과에서 가져오기')}</button></div>
   <div className="marketing-draft-inbox">{data.drafts.length?data.drafts.map((item:Row)=><article className={'marketing-draft-card '+(draft?.id===item.id?'selected':'')} key={item.id}>{item.images?.[0]?<img src={item.images[0]} alt="" />:<span className="marketing-draft-thumb placeholder"/>}<div className="marketing-draft-copy"><strong>{contentLabel(item)}</strong><p>{item.content_language==='en'?'EN':'KO'} · {item.quality_report?.status==='passed'?t('Ready for review','검토 가능'):t('Needs quality review','품질 검토 필요')}</p><small>{new Date(item.imported_at||item.updated_at).toLocaleString(locale,{timeZone:'Asia/Seoul'})}</small></div><button type="button" className={draft?.id===item.id?'admin-primary':'admin-secondary'} disabled={busy||!!running} onClick={()=>{if(dirty&&!window.confirm(t('Discard unsaved changes?','저장하지 않은 수정을 버릴까요?')))return;selectDraft(item);}}>{draft?.id===item.id?t('Editing','편집 중'):t('Edit','편집')}</button></article>):<div className="admin-empty"><p>{t('No editable drafts yet. Generate content, then add a completed result from Generation history.','아직 편집 가능한 초안이 없습니다. 콘텐츠를 생성한 뒤 생성 기록의 완료 결과를 초안으로 가져오세요.')}</p><button type="button" className="admin-secondary" onClick={()=>setActiveTab('generation')}>{t('Open Generation history','생성 기록 열기')}</button></div>}</div>
`;
 s=s.slice(0,headingStart)+inbox+s.slice(editorStart);
 s=s.replace("{!draft?<p className=\"admin-empty\">{t('Generate the first draft above.','위 버튼으로 첫 초안을 생성하세요.')}</p>:","{!draft?<p className=\"admin-empty\">{t('Select a working draft above to edit it.','위 작업함에서 편집할 초안을 선택하세요.')}</p>:");
 write('src/components/admin-marketing.tsx',s);
}

// 5) Draft inbox + generator styles.
{
 let s=read('src/app/globals.css');
 s+=`
/* Draft inbox / independent generation results (2026-10-05). */
.marketing-generator-card{display:grid;gap:18px;padding:22px;border:1px solid var(--border);border-radius:22px;background:var(--surface)}
.marketing-draft-inbox{display:grid;gap:10px}
.marketing-draft-card{display:grid;grid-template-columns:72px minmax(0,1fr) auto;align-items:center;gap:14px;padding:12px;border:1px solid var(--border);border-radius:18px;background:var(--paper)}
.marketing-draft-card.selected{border-color:var(--ink);box-shadow:0 0 0 1px var(--ink)}
.marketing-draft-card>img,.marketing-draft-thumb{width:72px;height:90px;border-radius:12px;object-fit:cover;background:var(--surface)}
.marketing-draft-copy{display:grid;gap:4px;min-width:0}
.marketing-draft-copy strong{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.marketing-draft-copy p{font-size:12px;color:var(--muted)}
.marketing-draft-copy small{font-size:10px;color:var(--muted)}
@media(max-width:600px){
 .marketing-generator-card{padding:18px}
 .marketing-draft-card{grid-template-columns:54px minmax(0,1fr);gap:10px}
 .marketing-draft-card>img,.marketing-draft-thumb{width:54px;height:68px}
 .marketing-draft-card>button{grid-column:1/-1;width:100%}
}
`;
 write('src/app/globals.css',s);
}

// 6) Regression checks.
{
 let s=read('scripts/test-marketing-generation.mjs');
 const marker="console.log('PASS '+checks+' editorial/runtime assertions; zero live API calls.');";
 if(!s.includes(marker))throw new Error('Missing generation test marker');
 s=s.replace(marker,`const generationSource=fs.readFileSync(new URL('../src/lib/marketing-generation.ts',import.meta.url),'utf8');
check(()=>assert.ok(generationSource.includes("IMAGE_MODEL='gpt-image-2.5-flare'")));
check(()=>assert.ok(generationSource.includes("size:'1024x1280'")));
check(()=>assert.ok(generationSource.includes("draft_role:'workspace'")));
console.log('PASS '+checks+' editorial/runtime assertions; zero live API calls.');`);
 write('scripts/test-marketing-generation.mjs',s);

 const inboxTest=`import assert from 'node:assert/strict';
import fs from 'node:fs';
let checks=0;const check=f=>{f();checks++;};
const legacy=fs.readFileSync(new URL('../src/lib/marketing-legacy.ts',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../src/lib/marketing.ts',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../src/components/admin-marketing.tsx',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20261005070010_marketing_candidate_draft_inbox.sql',import.meta.url),'utf8');
check(()=>assert.ok(legacy.includes(".eq('draft_role','candidate').eq('status','needs_approval')")));
check(()=>assert.ok(api.includes("path[3]==='import'")));
check(()=>assert.ok(ui.includes('marketing-draft-inbox')));
check(()=>assert.ok(ui.includes('Add to Drafts')));
check(()=>assert.ok(!ui.includes("Choose draft")));
check(()=>assert.ok(migration.includes("where draft_role='workspace'")));
check(()=>assert.ok(migration.includes('create_marketing_candidate_from_generation')));
console.log('PASS '+checks+' draft inbox/source contract assertions.');`;
 write('scripts/test-marketing-draft-inbox.mjs',inboxTest);

 let ci=read('.github/workflows/ci.yml');
 if(!ci.includes('node scripts/test-marketing-draft-inbox.mjs'))ci=ci.replace('      - run: node scripts/test-marketing-renderer.mjs','      - run: node scripts/test-marketing-renderer.mjs\n      - run: node scripts/test-marketing-draft-inbox.mjs');
 write('.github/workflows/ci.yml',ci);
}

console.log('draft inbox + Flare patch applied');