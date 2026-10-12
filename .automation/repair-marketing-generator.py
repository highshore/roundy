from pathlib import Path
import re, json
p=Path('src/components/admin-marketing.tsx'); s=p.read_text()
def replace(old,new):
 global s
 assert s.count(old)==1, f'Expected exactly one target: {old[:100]} (found {s.count(old)})'
 s=s.replace(old,new)
replace("import {CONTENT_PROFILES,postType} from '@/lib/marketing-content-policy';", "import {generatorSelection,generatorMediaPlan,savedDraftMediaPlan,savedRenderContent} from '@/lib/marketing-generator-ui';")
start=s.index(' function selectDraft('); end=s.index('\n async function load(',start)
s=s[:start]+" function selectDraft(next:Row|null){setPreflightState(null);setRegenerationFocus(null);setDraft(next?structuredClone(next):null);setDirty(false);}\n // New-content inputs intentionally do not follow the selected existing draft."+s[end:]
replace("const [basis,setBasis]=useState('prelaunch')", "const [basis,setBasis]=useState('growth_carousel')")
replace(" const [generationFilter,setGenerationFilter]", " const [generatorOpen,setGeneratorOpen]=useState(false);\n const [generationFilter,setGenerationFilter]")
replace('<details className="marketing-generator-card" open={!draft||undefined}>', '<details className="marketing-generator-card" open={generatorOpen||!draft} onToggle={e=>setGeneratorOpen(e.currentTarget.open)}>')
start=s.index('     <div className="admin-two"><label><span>{t(\'Content basis\''); end=s.index('\n',start)
s=s[:start]+'''     <div className="admin-two"><label><span>{t('Content topic','콘텐츠 주제')}</span><select name="new_content_type" value={basis==='growth_carousel'?topic:basis} disabled={busy||!!running} onChange={e=>{const next=generatorSelection(e.currentTarget.value);if(!next)return;setBasis(next.basis);if(next.topic)setTopic(next.topic);}}><optgroup label={t('Editorial card news','카드뉴스')}>{topics.map((key,index)=><option key={key} value={key}>{t(key.replaceAll('_',' '),topicKo[index])}</option>)}</optgroup><optgroup label={t('Roundy promotion','라운디 홍보')}><option value="prelaunch">{t('Pre-launch','오픈 전 홍보')}</option><option value="live_event">{t('Live event','정식 이벤트')}</option></optgroup></select></label><label><span>{t('Images','이미지 방식')}</span><select name="new_visual_source" value={manualVisualSource} disabled={busy||!!running} onChange={e=>setManualVisualSource(e.currentTarget.value as 'stock'|'uploaded'|'none')}><option value="stock">{t('AI cover + reviewed photos','AI 표지 + 검수된 실사')}</option><option value="uploaded">{t('Use my images','내 이미지 사용')}</option><option value="none">{t('Write copy first','원고부터 작성')}</option></select></label></div>'''+s[end:]
s,n=re.subn(r"^     \{basis==='growth_carousel'\?<label><span>\{t\('Topic','주제'\).*?\n",'',s,flags=re.M); assert n==1,n
s,n=re.subn(r"^     \{basis==='growth_carousel'&&<p className=\"admin-help\">\{CONTENT_PROFILES.*?\n",'',s,flags=re.M); assert n==1,n
start=s.index(' const selectedStoryCount=');end=s.index('\n const workflowText=',start)
s=s[:start]+" const newMediaPlan=generatorMediaPlan(settings,basis,storyCardCount,aiImageSlot);\n const selectedStoryCount=newMediaPlan.storyCount,newBranded=newMediaPlan.brand,plannedPhotoCount=newMediaPlan.realPhotos;"+s[end:]
replace("{settings?.carousel_mode==='fixed'&&Number(storyCardCount||settings?.carousel_default_slides)===5&&Number(settings?.carousel_min_real_photos_5??3)<=3", "{newMediaPlan.aiAllowed")
replace("<p className=\"admin-help\">{t('Story cards','본문 카드')} {selectedStoryCount}", "<p className=\"admin-help\" hidden={!newMediaPlan.known}>{t('Story cards','본문 카드')} {selectedStoryCount}")
replace("       {newMediaPlan.aiAllowed", "       {!newMediaPlan.known&&<p className=\"admin-help\">{t('The alternating schedule determines 3 or 5 story cards. Exact photo counts appear after generation.','교대 발행 순서에 따라 스토리 3장 또는 5장으로 결정됩니다. 생성 후 정확한 사진 장수를 표시합니다.')}</p>}\n       {newMediaPlan.aiAllowed")
# Rendering derives immutable content fields from the saved draft, never the new-post form.
replace("  const research=basis==='growth_carousel'", "  const contentInput=renderOnly?savedRenderContent(draft!):{content_mode:basis,topic_type:basis==='growth_carousel'?topic:undefined,language:contentLanguage,event_id:basis==='live_event'?eventId:undefined,event_campaign_stage:basis==='live_event'?eventCampaignStage:undefined,instruction:direction.trim(),editorial_lane:editorialLane};\n  const research=contentInput.content_mode==='growth_carousel'")
replace("['book_insight','trend_research','dating_myth','seoul_trend'].includes(topic),requestedMode", "['book_insight','trend_research','dating_myth','seoul_trend'].includes(contentInput.topic_type||''),requestedMode")
replace("  const selectedEvent=(data.live_events||[]).find((item:Row)=>String(item.id)===eventId),eventHasEnoughPhotos=basis==='live_event'", "  const selectedEvent=(data.live_events||[]).find((item:Row)=>String(item.id)===String(contentInput.event_id||'')),eventHasEnoughPhotos=contentInput.content_mode==='live_event'")
replace("  const message=managed", "  const media=renderOnly?savedDraftMediaPlan(draft!):newMediaPlan;\n  const photoCountText='known' in media&&!media.known?t('the required','필요한'):String(media.realPhotos);\n  const message=managed")
start=s.index('  const message=managed'); end=s.index("   :['pexels','stock'].includes(source)",start)
s=s[:start]+"  const message=managed\n   ?t('Prepare this content with '+photoCountText+' reviewed real photos'+(useAiCover?' and one AI image':'')+'? Reserved budget '+cost+'. Existing drafts stay unchanged; publishing requires final approval.',\n      '검수된 실사 '+photoCountText+'장'+(useAiCover?'과 AI 이미지 1장':'')+'으로 준비할까요? 예약액 '+cost+'. 기존 초안은 보존하며, 게시는 최종 승인 후에만 진행합니다.')\n"+s[end:]
replace("   const payload={request_key:'manual:'+crypto.randomUUID(),revision:renderOnly?draft!.revision:1,mode:today?'both':requestedMode,content_mode:basis,language:today?undefined:contentLanguage,visual_mode:'cards',visual_source:source,", "   const payload={request_key:'manual:'+crypto.randomUUID(),revision:renderOnly?draft!.revision:1,mode:today?'both':requestedMode,...contentInput,language:today?undefined:contentInput.language,visual_mode:'cards',visual_source:source,")
replace("...(basis==='growth_carousel'?{topic_type:topic}:{}),...(basis==='live_event'?{event_id:eventId,event_campaign_stage:eventCampaignStage}:{}),instruction:direction.trim(),editorial_lane:editorialLane,", "")
replace("   setDirection('');", "   if(!renderOnly){setDirection('');setGeneratorOpen(false);}")
# Keep optional diagnostics available while showing only actual blockers by default.
replace("     {preflightChecks.map((check:Row)=>{", "     {preflightChecks.filter((check:Row)=>!check.passed).map((check:Row)=>{")
needle="     <p className=\"admin-help\">{t('Only the seven checks plus the existing editorial quality review can authorize publishing."
start=s.index(needle); end=s.index('\n',start)
s=s[:start]+'''     {!!preflightChecks.some((check:Row)=>check.passed)&&<details><summary>{t('Passed checks','통과한 검사')} ({preflightChecks.filter((check:Row)=>check.passed).length})</summary>{preflightChecks.filter((check:Row)=>check.passed).map((check:Row)=><p className="admin-help" key={check.id}>{locale==='ko'?check.label:localizedCheck[String(check.id)]||check.label}</p>)}</details>'''+s[end:]
replace("{draft.status==='needs_approval'&&<button type=\"button\" className=\"admin-secondary\" disabled={busy||!!running||dirty} onClick={()=>void work(async()=>{const r=await request('/quality/recheck'", "{draft.status==='needs_approval'&&!preflightReady&&<button type=\"button\" className=\"admin-secondary\" disabled={busy||!!running||dirty} onClick={()=>void work(async()=>{const r=await request('/quality/recheck'")
replace("No editable drafts yet. Generate content, then add a completed result from Generation history.", "No editable drafts yet. Generate content above; the new draft opens here automatically.")
replace("아직 편집 가능한 초안이 없습니다. 콘텐츠를 생성한 뒤 생성 기록의 완료 결과를 초안으로 가져오세요.", "아직 편집 가능한 초안이 없습니다. 위에서 콘텐츠를 생성하면 새 초안이 여기에 자동으로 열립니다.")
p.write_text(s)
package=Path('package.json'); data=json.loads(package.read_text());data['scripts']['test:marketing-generator-ui']='node scripts/test-marketing-generator-interactions.mjs';data['scripts']['test']+=' && npm run test:marketing-generator-ui';package.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print('Applied bounded generator/state/confirmation/UI repair.')
