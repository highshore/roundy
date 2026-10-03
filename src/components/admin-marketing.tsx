'use client';
import { Heading } from '@/components/heading';
import { useEffect, useState } from 'react';
import { Copy, ExternalLink, ImagePlus, Megaphone, Plus, Save, Send, Trash2 } from 'lucide-react';
import { Instagram } from './social-icons';
import { OrderedImages } from './ordered-images';
import { uploadFile } from '@/lib/uploads';
import { tr, type Locale } from '@/lib/locale';
import type { Event } from '@/lib/data';
import { useToast } from './toast';
type Channel='instagram'|'koreapas';
type GrowthTopic='mbti'|'dating_archetype'|'book_insight'|'trend_research'|'meme_remix'|'dating_myth'|'conversation_prompt'|'seoul_dating'|'mini_quiz';
type CarouselSlide={eyebrow:string;title:string;body:string;source_label:string;variant:'hook'|'content'|'source'|'roundy'};
type ResearchSource={title:string;publisher:string;url:string;date:string};
type Template={id?:string;channel:Channel;name:string;title:string;caption:string;cta:string;destination_url:string;images:string[];days:number[];time_kst:string;enabled:boolean};
type Run={id:string;channel:Channel;snapshot:Template;status:string;message:string;external_url?:string;created_at:string};
type AutomationSettings={daily_instagram_enabled:boolean;daily_time_kst:string;draft_generation_time_kst:string;optimization_enabled:boolean;auto_reply_enabled:boolean;content_mode:'prelaunch'|'live_event';growth_carousel_enabled:boolean;growth_posts_per_week:number;growth_days:number[]};
type Draft={id:string;draft_date:string;event_id:string|null;content_mode:'prelaunch'|'live_event';draft_kind:'brand'|'growth_carousel';growth_topic_type:GrowthTopic|null;carousel_slides:CarouselSlide[];research_sources:ResearchSource[];research_status:'not_required'|'pending'|'generated'|'failed';content_pillar:string;caption:string;cta:string;destination_url:string;images:string[];status:string;generation_reason:string;recommended_time_kst:string;window_start_kst:string;window_end_kst:string;scheduled_for:string|null;revision:number;eligible_for_optimization:boolean;last_regeneration_mode?:'text'|'image'|'both'|null;last_regeneration_instruction?:string;regenerated_at?:string|null};
type Recommendation={dow:number;recommended_time_kst:string;window_start_kst:string;window_end_kst:string;sample_size:number;score:number;source:string;rationale:string};
type WebhookSetup={callback_url:string;verify_token:string;verified_at:string|null;last_received_at:string|null};
const defaultAutomation:AutomationSettings={daily_instagram_enabled:true,daily_time_kst:'20:00',draft_generation_time_kst:'10:00',optimization_enabled:true,auto_reply_enabled:true,content_mode:'prelaunch',growth_carousel_enabled:true,growth_posts_per_week:3,growth_days:[0,2,4]};
const blank=(channel:Channel):Template=>({channel,name:'',title:'',caption:'',cta:'Join us',destination_url:'https://roundy.team',images:[],days:[],time_kst:'10:00',enabled:false});
async function request(path='',body?:unknown,method='POST'){const r=await fetch('/api/admin/marketing'+path,body?{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);const d=await r.json();if(!r.ok)throw new Error(d.error||'Request failed');return d;}
async function prepareMarketingPhoto(file:File){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('Use JPEG, PNG or WebP, up to 10 MB.');
 const bitmap=await createImageBitmap(file);const ratio=bitmap.width/bitmap.height;
 if(ratio<.8||ratio>1.91){bitmap.close();throw new Error('Use an image between 4:5 portrait and 1.91:1 landscape. Crop it before uploading.');}
 const canvas=document.createElement('canvas');canvas.width=Math.min(1080,bitmap.width);canvas.height=Math.round(canvas.width/ratio);const context=canvas.getContext('2d');if(!context)throw new Error('Image conversion unavailable');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Image conversion failed')),'image/jpeg',.92));return new File([blob],'marketing.jpg',{type:'image/jpeg'});
}
function wrapCanvasText(ctx:CanvasRenderingContext2D,text:string,maxWidth:number,maxLines:number){
 const words=text.replace(/\s+/g,' ').trim().split(' '),lines:string[]=[];let line='';
 for(const word of words){
  const test=line?line+' '+word:word;
  if(ctx.measureText(test).width<=maxWidth){line=test;continue;}
  if(line)lines.push(line);line=word;
  if(lines.length>=maxLines)break;
 }
 if(lines.length<maxLines&&line)lines.push(line);
 if(lines.length===maxLines&&words.join(' ').length>lines.join(' ').length)lines[maxLines-1]=lines[maxLines-1].replace(/[.,!?]?$/,'')+'…';
 return lines;
}
async function renderCarouselCard(slide:CarouselSlide,index:number,total:number){
 const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Could not render carousel slide.');
 const palette=slide.variant==='hook'?{bg:'#ff6666',fg:'#20211f',muted:'#4f2929'}:slide.variant==='roundy'?{bg:'#20211f',fg:'#fffefa',muted:'#c9c9bf'}:slide.variant==='source'?{bg:'#f3f3ee',fg:'#20211f',muted:'#6b6f65'}:{bg:'#fffefa',fg:'#20211f',muted:'#6b6f65'};
 ctx.fillStyle=palette.bg;ctx.fillRect(0,0,1080,1350);
 ctx.strokeStyle=slide.variant==='roundy'?'#ff6666':'#dedfd7';ctx.lineWidth=2;
 ctx.beginPath();ctx.arc(920,160,92,0,Math.PI*2);ctx.stroke();
 ctx.beginPath();ctx.arc(860,220,46,0,Math.PI*2);ctx.stroke();
 ctx.fillStyle=palette.muted;ctx.font="700 26px 'DM Sans', 'Apple SD Gothic Neo', sans-serif";ctx.fillText(slide.eyebrow||'ROUNDY NOTES',72,96);
 ctx.textAlign='right';ctx.fillText(String(index+1).padStart(2,'0')+' / '+String(total).padStart(2,'0'),1008,96);ctx.textAlign='left';
 ctx.fillStyle=palette.fg;ctx.font="700 76px 'DM Sans', 'Apple SD Gothic Neo', sans-serif";
 let y=270;for(const line of wrapCanvasText(ctx,slide.title,900,4)){ctx.fillText(line,72,y);y+=88;}
 y+=34;ctx.fillStyle=palette.muted;ctx.font="500 38px 'DM Sans', 'Apple SD Gothic Neo', sans-serif";
 for(const line of wrapCanvasText(ctx,slide.body,900,8)){ctx.fillText(line,72,y);y+=54;}
 if(slide.source_label){ctx.fillStyle=palette.muted;ctx.font="600 24px 'DM Sans', 'Apple SD Gothic Neo', sans-serif";const sourceLines=wrapCanvasText(ctx,slide.source_label,900,2);let sy=1205;for(const line of sourceLines){ctx.fillText(line,72,sy);sy+=32;}}
 if(slide.variant==='roundy'){ctx.fillStyle='#ff6666';ctx.fillRect(72,1255,122,8);ctx.fillStyle=palette.fg;ctx.font="700 26px 'DM Sans', sans-serif";ctx.fillText('@roundy.meet',216,1270);}
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Could not export carousel slide.')),'image/jpeg',.92));
 return new File([blob],'roundy-growth-'+String(index+1)+'.jpg',{type:'image/jpeg'});
}
async function uploadCarouselSlides(slides:CarouselSlide[]){
 const urls:string[]=[];
 for(let index=0;index<slides.length;index++)urls.push(await uploadFile(await renderCarouselCard(slides[index],index,slides.length),'wis-event-images'));
 return urls;
}
function runStatusLabel(status:string,locale:Locale){
 const labels:Record<string,[string,string]>={
  queued:['Queued','대기 중'],publishing:['Publishing','게시 중'],sent:['Published','게시 완료'],published:['Published','게시 완료'],
  needs_review:['Needs review','확인 필요'],failed:['Failed','실패'],skipped:['Skipped','건너뜀']
 };
 const label=labels[status]??[status.replaceAll('_',' '),status.replaceAll('_',' ')];
 return tr(locale,label[0],label[1]);
}
export function AdminMarketing({locale}:{locale:Locale}){
 const [channel,setChannel]=useState<Channel>('instagram'),[templates,setTemplates]=useState<Template[]>([]),[runs,setRuns]=useState<Run[]>([]),[form,setForm]=useState<Template>(blank('instagram')),[events,setEvents]=useState<Event[]>([]),[connection,setConnection]=useState<{instagram:boolean;koreapas:boolean;unavailable?:boolean}>({instagram:false,koreapas:false}),[automation,setAutomation]=useState<AutomationSettings>(defaultAutomation),[recommendations,setRecommendations]=useState<Recommendation[]>([]),[draftEdit,setDraftEdit]=useState<Draft|null>(null),[growthTopic,setGrowthTopic]=useState<GrowthTopic>('mbti'),[growthInstruction,setGrowthInstruction]=useState(''),[regenOpen,setRegenOpen]=useState(false),[regenMode,setRegenMode]=useState<'text'|'image'|'both'>('both'),[regenInstruction,setRegenInstruction]=useState(''),[regenContentMode,setRegenContentMode]=useState<'prelaunch'|'live_event'>('prelaunch'),[webhook,setWebhook]=useState<WebhookSetup>({callback_url:'',verify_token:'',verified_at:null,last_received_at:null}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[dirty,setDirty]=useState(false);const {showToast}=useToast();
 function applyData(d:{templates?:Template[];runs?:Run[];connection?:{instagram:boolean;koreapas:boolean;unavailable?:boolean};settings?:AutomationSettings;drafts?:Draft[];recommendations?:Recommendation[];webhook?:WebhookSetup}){
  setTemplates(d.templates??[]);setRuns(d.runs??[]);if(d.connection)setConnection(d.connection);
  if(d.settings)setAutomation({...d.settings,daily_time_kst:d.settings.daily_time_kst.slice(0,5),draft_generation_time_kst:d.settings.draft_generation_time_kst.slice(0,5)});
  const nextDrafts=d.drafts??[];setRecommendations(d.recommendations??[]);
  const editable=nextDrafts.find(item=>item.status==='needs_approval')??nextDrafts[0]??null;setDraftEdit(current=>current?.id===editable?.id?current:editable?structuredClone(editable):null);
  if(editable){setRegenContentMode(editable.content_mode??'prelaunch');if(editable.growth_topic_type)setGrowthTopic(editable.growth_topic_type);}
  if(d.webhook)setWebhook(d.webhook);
 }
 async function load(){const d=await request();applyData(d);}
 useEffect(()=>{let active=true;setBusy(true);Promise.all([request(),fetch('/api/admin/events').then(r=>r.json())]).then(([d,e])=>{if(active){applyData(d);setEvents(e.events??[]);}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[]);
 function update<K extends keyof Template>(key:K,value:Template[K]){setForm(f=>({...f,[key]:value}));setDirty(true);}
 function choose(next:Template){if(dirty&&!window.confirm(tr(locale,'Discard unsaved changes?','저장하지 않은 변경 사항을 버릴까요?')))return;setForm(structuredClone(next));setChannel(next.channel);setDirty(false);setError('');}
 async function work(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'Request failed');}finally{setBusy(false);}}
 async function save(copy=false){await work(async()=>{const payload=copy?{...form,name:form.name+' (copy)',enabled:false}:form;const result=await request(!copy&&form.id?'/'+form.id:'',payload,!copy&&form.id?'PUT':'POST');setForm(result.template);setDirty(false);await load();showToast(tr(locale,'Template saved','템플릿 저장 완료'),'success');});}
 async function saveAutomation(){await work(async()=>{const result=await request('/settings',automation,'PUT');setAutomation({...result.settings,daily_time_kst:result.settings.daily_time_kst.slice(0,5)});showToast(tr(locale,'Automation settings saved','자동화 설정 저장 완료'),'success');});}
 async function saveDraft(){if(!draftEdit)return;await work(async()=>{await request('/draft/'+draftEdit.id,{caption:draftEdit.caption,cta:draftEdit.cta,destination_url:draftEdit.destination_url},'PUT');await load();showToast(tr(locale,'Draft saved','초안 저장 완료'),'success');});}
 async function regenerateDraft(){if(!draftEdit)return;await work(async()=>{await request('/draft/'+draftEdit.id+'/regenerate',{mode:regenMode,instruction:regenInstruction.trim(),content_mode:regenContentMode});setRegenOpen(false);setRegenInstruction('');await load();showToast(tr(locale,'Draft regenerated','초안을 다시 만들었습니다'),'success');});}
 async function approveDraft(){if(!draftEdit)return;await work(async()=>{await request('/draft/'+draftEdit.id+'/approve',{});await load();showToast(tr(locale,'Approved and scheduled','승인 및 예약 완료'),'success');});}
 async function skipDraft(){if(!draftEdit)return;await work(async()=>{await request('/draft/'+draftEdit.id+'/skip',{});await load();});}
 async function generateDraftNow(){await work(async()=>{await request('/draft/generate',{});await load();});}
 async function generateGrowthCarousel(){if(!draftEdit)return;await work(async()=>{const result=await request('/draft/'+draftEdit.id+'/growth-generate',{topic_type:growthTopic,instruction:growthInstruction.trim()});const generated=result.draft as Draft;const urls=await uploadCarouselSlides(generated.carousel_slides??[]);await request('/draft/'+draftEdit.id,{caption:generated.caption,cta:generated.cta,destination_url:generated.destination_url,images:urls},'PUT');setGrowthInstruction('');await load();showToast(tr(locale,'Growth Carousel generated','Growth Carousel 생성 완료'),'success');});}
 return <section className="admin-panel marketing-panel"><div className="admin-heading"><p className="admin-kicker">Roundy Admin</p><Heading level={1}>{tr(locale,'Marketing','마케팅')}</Heading><p>{tr(locale,'One workspace. Two channels. More people around the table.','하나의 공간에서 두 채널을 관리하고, 더 많은 만남을 만드세요.')}</p></div>
 <div className="marketing-channels" aria-label={tr(locale,'Marketing channel','마케팅 채널')}>{(['instagram','koreapas'] as const).map(c=><button key={c} type="button" aria-pressed={channel===c} onClick={()=>choose(templates.find(t=>t.channel===c)??blank(c))}>{c==='instagram'?<Instagram size={24}/>:<Megaphone size={24}/>}<span><strong>{c==='instagram'?'Instagram':'Koreapas'}</strong><small>{c==='instagram'?'@roundy.meet':tr(locale,'Free advertising board','홍보 게시판')}</small></span><span className={'connection-dot '+(connection[c]?'connected':'')}>{connection[c]?tr(locale,'Configured','설정됨'):tr(locale,'Setup needed','연결 필요')}</span></button>)}</div>
 {!connection[channel]&&<details className="marketing-setup" open><summary>{connection.unavailable?tr(locale,'Connection status unavailable','연결 상태 확인 불가'):channel==='instagram'?tr(locale,'Connect @roundy.meet','@roundy.meet 연결하기'):tr(locale,'Connect Koreapas','고려대 고파스 연결하기')}</summary>{channel==='instagram'?<><p>{tr(locale,'Create a Meta developer app and choose Instagram API with Instagram Login. Add roundy.meet as an account/tester and authorize basic access and content publishing.','Meta 개발자 앱에서 Instagram Login API를 선택하고 roundy.meet 계정을 추가한 후 기본 접근 및 콘텐츠 게시 권한을 승인하세요.')}</p><a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer">{tr(locale,'Open Meta app dashboard','Meta 앱 대시보드 열기')} <ExternalLink size={14}/></a><p>{tr(locale,'Your developer stores the Instagram user ID and access token securely on the server. No passwords or tokens belong in a post template.','개발자가 Instagram 사용자 ID와 액세스 토큰을 서버에 안전하게 저장해야 합니다. 템플릿에 비밀번호나 토큰을 입력하지 마세요.')}</p></>:<p>{tr(locale,'Configure the Roundy publisher with your Koreapas account. Use credentials authorized for Roundy; credentials are never copied between projects.','Roundy 전용 발행기에 고파스 계정을 설정하세요. Roundy 전용 계정으로 연결하며 인증 정보는 프로젝트 간 복사되지 않습니다.')}</p>}<p>{tr(locale,'You can prepare and save templates now. Publishing requires a connected account.','지금 템플릿을 작성하고 저장할 수 있습니다. 게시는 계정 연결 후 가능합니다.')}</p></details>}
 {error&&<p role="alert" className="admin-error">{error}</p>}
 {channel==='instagram'&&<>
  <div className="admin-section-title"><Heading level={2}>{tr(locale,'Today’s Instagram draft','오늘의 Instagram 초안')}</Heading><button type="button" className="admin-secondary" disabled={busy} onClick={()=>void generateDraftNow()}>{tr(locale,'Generate now','지금 생성')}</button></div>
  {!draftEdit?<p className="admin-empty">{tr(locale,'Today’s draft will be generated automatically at the configured time.','설정된 시간에 오늘의 초안이 자동 생성됩니다.')}</p>:<div className="marketing-layout">
   <div className="admin-form marketing-editor">
    <div className="draft-status-row"><span className={'admin-status '+(draftEdit.status==='needs_approval'?'needs_review':draftEdit.status)}>{draftEdit.status.replaceAll('_',' ')}</span><span className="content-mode-badge">{draftEdit.content_mode==='prelaunch'?tr(locale,'Pre-launch Promotion','오픈 전 홍보'):tr(locale,'Live Event','정식 이벤트')}</span><strong>{draftEdit.content_pillar}</strong></div>
    <p className="admin-help">{draftEdit.generation_reason}</p>
    <p><strong>{tr(locale,'Recommended window','추천 게시 시간대')}:</strong> {draftEdit.window_start_kst.slice(0,5)}–{draftEdit.window_end_kst.slice(0,5)} KST · {tr(locale,'Target','목표')} {draftEdit.recommended_time_kst.slice(0,5)}</p>
    {draftEdit.scheduled_for&&draftEdit.status!=='needs_approval'&&<p><strong>{tr(locale,'Scheduled','예약')}:</strong> {new Date(draftEdit.scheduled_for).toLocaleString(locale,{timeZone:'Asia/Seoul'})} KST</p>}
    <label><span>{tr(locale,'Caption','캡션')}</span><textarea rows={12} maxLength={2000} value={draftEdit.caption} disabled={draftEdit.status!=='needs_approval'} onChange={e=>setDraftEdit(current=>current?{...current,caption:e.target.value}:current)}/><small>{draftEdit.caption.length} / 2000</small></label>
    <div className="admin-two"><label><span>{tr(locale,'Call to action','참여 안내 문구')}</span><input maxLength={80} value={draftEdit.cta} disabled={draftEdit.status!=='needs_approval'} onChange={e=>setDraftEdit(current=>current?{...current,cta:e.target.value}:current)}/></label><label><span>{tr(locale,'Destination URL','연결 URL')}</span><input type="url" value={draftEdit.destination_url} disabled={draftEdit.status!=='needs_approval'} onChange={e=>setDraftEdit(current=>current?{...current,destination_url:e.target.value}:current)}/></label></div>
    {draftEdit.status==='needs_approval'&&<div className="regeneration-panel">
     <div className="regeneration-head"><div><strong>{tr(locale,'Custom regeneration','커스텀 재생성')}</strong><small>{tr(locale,'Give AI a short creative direction and choose what to replace.','AI에게 원하는 방향을 적고 다시 만들 부분을 선택하세요.')}</small></div><button type="button" className="admin-secondary" onClick={()=>setRegenOpen(value=>!value)}>{regenOpen?tr(locale,'Close','닫기'):tr(locale,'Customize','커스텀')}</button></div>
     {regenOpen&&<div className="regeneration-body">
      <div className="admin-two">
       <label><span>{tr(locale,'Content source','콘텐츠 기준')}</span><select value={regenContentMode} onChange={e=>setRegenContentMode(e.target.value as 'prelaunch'|'live_event')}><option value="prelaunch">{tr(locale,'Pre-launch Promotion','오픈 전 홍보')}</option><option value="live_event">{tr(locale,'Live Event','정식 이벤트')}</option></select></label>
       <label><span>{tr(locale,'Regenerate','재생성 범위')}</span><select value={regenMode} onChange={e=>setRegenMode(e.target.value as 'text'|'image'|'both')}><option value="text">{tr(locale,'Text only','텍스트만')}</option><option value="image">{tr(locale,'Image only','이미지만')}</option><option value="both">{tr(locale,'Text + image','텍스트 + 이미지')}</option></select></label>
      </div>
      {regenContentMode==='prelaunch'&&<p className="prelaunch-note">{tr(locale,'Pre-launch mode ignores all test event dates, prices, venues and seat counts. It focuses on building awareness and attracting early Roundy users.','오픈 전 홍보 모드는 테스트 이벤트의 날짜, 가격, 장소, 좌석 정보를 전부 무시하고 Roundy 인지도와 초기 유저 확보에만 집중합니다.')}</p>}
      <label><span>{tr(locale,'Creative direction','재생성 지시문')}</span><textarea rows={4} maxLength={500} value={regenInstruction} onChange={e=>setRegenInstruction(e.target.value)} placeholder={tr(locale,'e.g. Make the hook shorter, more premium, and emphasize meeting international people in Seoul.','예: 첫 문장을 더 짧고 고급스럽게, 서울에서 외국인을 직접 만나는 느낌을 더 강조해줘.')}/><small>{regenInstruction.length} / 500</small></label>
      <div className="prompt-chips">{[
       [tr(locale,'More premium','더 고급스럽게'),'Make it more premium and editorial.'],
       [tr(locale,'More concise','더 짧게'),'Make the copy shorter and the hook more concise.'],
       [tr(locale,'More Seoul/international','서울·글로벌 강조'),'Emphasize Seoul and the Korean/international social mix.'],
       [tr(locale,'More trust-focused','신뢰 강조'),'Make it more trust-focused and less salesy.'],
       [tr(locale,'More playful','더 가볍게'),'Make it more playful but still tasteful for a dating brand.']
      ].map(([label,prompt])=><button type="button" key={label} onClick={()=>setRegenInstruction(current=>current?current+' '+prompt:prompt)}>{label}</button>)}</div>
      <button type="button" className="admin-primary" disabled={busy} onClick={()=>void regenerateDraft()}>{tr(locale,regenMode==='text'?'Regenerate text':regenMode==='image'?'Regenerate image':'Regenerate text + image',regenMode==='text'?'텍스트 다시 생성':regenMode==='image'?'이미지 다시 생성':'텍스트 + 이미지 다시 생성')}</button>
     </div>}
    </div>}
    {draftEdit.status==='needs_approval'&&<div className="admin-form-actions"><button type="button" className="admin-primary" disabled={busy||!draftEdit.caption.trim()||!draftEdit.images.length} onClick={()=>void approveDraft()}><Send size={16}/>{tr(locale,'Approve & schedule','승인 후 예약')}</button><button type="button" className="admin-secondary" disabled={busy} onClick={()=>void saveDraft()}><Save size={16}/>{tr(locale,'Save edits','수정 저장')}</button><button type="button" className="admin-secondary" disabled={busy} onClick={()=>void skipDraft()}>{tr(locale,'Skip today','오늘 건너뛰기')}</button></div>}
    {!draftEdit.images.length&&draftEdit.status==='needs_approval'&&<p className="admin-help">{tr(locale,'This draft has no image yet. Use Image only or Text + image regeneration before approving it.','아직 이미지가 없습니다. 승인 전에 이미지 다시 생성 또는 텍스트 + 이미지 다시 생성을 사용하세요.')}</p>}
    <p className="admin-help">{tr(locale,'Nothing is published until an admin approves the draft. If approval comes after the recommended window, the post is sent shortly after approval but excluded from timing optimization.','관리자가 초안을 승인하기 전에는 게시되지 않습니다. 추천 시간대를 지난 뒤 승인하면 곧 게시되지만 해당 게시물은 시간 최적화 학습에서 제외됩니다.')}</p>
   </div>
   <aside className="marketing-preview"><p className="admin-kicker">{tr(locale,'DRAFT PREVIEW','초안 미리보기')}</p><div className="marketing-post"><header><Instagram/><strong>roundy.meet</strong></header>{draftEdit.images[0]?<img src={draftEdit.images[0]} alt={tr(locale,'Draft preview','초안 이미지 미리보기')}/>:<div className="marketing-preview-empty"><ImagePlus size={32}/></div>}<div className="marketing-preview-copy"><p>{draftEdit.caption}</p><strong>{draftEdit.cta}</strong></div></div></aside>
  </div>}

  <div className="admin-section-title"><Heading level={2}>{tr(locale,'Posting time optimizer','게시 시간 최적화')}</Heading></div>
  <div className="marketing-history">{recommendations.map(rec=><article key={rec.dow}><div><strong>{tr(locale,['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][rec.dow],['일','월','화','수','목','금','토'][rec.dow])}</strong><span className="admin-status">{rec.source}</span></div><p><strong>{rec.window_start_kst.slice(0,5)}–{rec.window_end_kst.slice(0,5)}</strong> KST · {tr(locale,'center','중심')} {rec.recommended_time_kst.slice(0,5)}</p><small>{tr(locale,'Measured posts','측정 게시물')} {rec.sample_size} · {rec.rationale}</small></article>)}</div>
  <p className="admin-help">{tr(locale,'The optimizer starts from external benchmark times, then gradually gives more weight to Roundy’s own 24h/72h post performance. Shares and saves receive the most weight. For full reach, save and share data, authorize instagram_business_manage_insights in Meta; without it the system falls back to basic likes/comments.','처음에는 외부 benchmark 시간을 사용하고, 24시간/72시간 Roundy 게시물 성과가 쌓일수록 자체 데이터 비중을 높입니다. 공유와 저장에 가장 높은 가중치를 둡니다. Reach, 저장, 공유까지 완전하게 학습하려면 Meta에서 instagram_business_manage_insights 권한을 추가하세요. 권한이 없으면 좋아요/댓글 기본 데이터로 학습합니다.')}</p>

  <div className="admin-section-title"><Heading level={2}>{tr(locale,'Instagram automation','Instagram 자동화')}</Heading></div>
  <form className="admin-form" onSubmit={e=>{e.preventDefault();void saveAutomation();}}>
   <div className="admin-two">
    <label className="check-row"><input type="checkbox" checked={automation.daily_instagram_enabled} onChange={e=>setAutomation(current=>({...current,daily_instagram_enabled:e.target.checked}))}/><span>{tr(locale,'Generate one new Instagram draft every day','매일 Instagram 초안 1개 자동 생성')}</span></label>
    <label><span>{tr(locale,'Draft generation time · KST','초안 생성 시간 · KST')}</span><input type="time" value={automation.draft_generation_time_kst.slice(0,5)} onChange={e=>setAutomation(current=>({...current,draft_generation_time_kst:e.target.value}))} disabled={!automation.daily_instagram_enabled}/></label>
   </div>
   <label><span>{tr(locale,'Daily content mode','매일 생성할 콘텐츠')}</span><select value={automation.content_mode} onChange={e=>setAutomation(current=>({...current,content_mode:e.target.value as 'prelaunch'|'live_event'}))} disabled={!automation.daily_instagram_enabled}><option value="prelaunch">{tr(locale,'Pre-launch Promotion','오픈 전 홍보')}</option><option value="live_event">{tr(locale,'Live Event','정식 이벤트')}</option></select></label>
   {automation.content_mode==='prelaunch'&&<p className="prelaunch-note">{tr(locale,'Recommended while Roundy is pre-launch. Daily drafts will not use the test events currently visible on the website.','현재 Roundy가 오픈 전인 동안 권장되는 모드입니다. 웹사이트에 보이는 테스트 이벤트 정보는 자동 게시물에 사용하지 않습니다.')}</p>}
   <div className="admin-two">
    <label className="check-row"><input type="checkbox" checked={automation.optimization_enabled} onChange={e=>setAutomation(current=>({...current,optimization_enabled:e.target.checked}))}/><span>{tr(locale,'Optimize publish time automatically','게시 시간 자동 최적화')}</span></label>
    <label><span>{tr(locale,'Fallback time · KST','최적화 해제 시 시간 · KST')}</span><input type="time" value={automation.daily_time_kst.slice(0,5)} onChange={e=>setAutomation(current=>({...current,daily_time_kst:e.target.value}))} disabled={automation.optimization_enabled||!automation.daily_instagram_enabled}/></label>
   </div>
   <label className="check-row"><input type="checkbox" checked={automation.auto_reply_enabled} onChange={e=>setAutomation(current=>({...current,auto_reply_enabled:e.target.checked}))}/><span>{tr(locale,'Automatically answer clear Instagram comments and DMs','명확한 Instagram 댓글과 DM 자동 응답')}</span></label>
   <p className="admin-help">{automation.content_mode==='prelaunch'?tr(locale,'Pre-launch drafts rotate across dating-problem, concept, Seoul and trust content without using test event data. Approval is always required.','오픈 전 홍보 초안은 테스트 이벤트 정보를 사용하지 않고 데이팅 문제 공감, 서비스 방식, 서울 만남, 신뢰 콘텐츠를 순환합니다. 게시 전에는 항상 관리자 승인이 필요합니다.'):tr(locale,'Live-event drafts can use the next real event and prioritize urgency close to the event. Approval is always required.','정식 이벤트 모드에서는 실제 다음 이벤트 정보를 사용할 수 있고, 이벤트가 가까우면 마감/이벤트 안내를 우선합니다. 게시 전에는 항상 관리자 승인이 필요합니다.')}</p>
   <div className="admin-form-actions"><button className="admin-primary" disabled={busy}><Save size={16}/>{tr(locale,'Save automation','자동화 저장')}</button></div>
  </form>

  <details className="marketing-setup" open={!webhook.verified_at}>
   <summary>{webhook.verified_at?tr(locale,'Instagram comments & DMs webhook connected','Instagram 댓글 및 DM Webhook 연결됨'):tr(locale,'One-time Meta setup for comments & DMs','댓글 및 DM용 Meta 1회 설정')}</summary>
   {webhook.verified_at?<><p>{tr(locale,'Meta verified the callback. New supported comments and DMs can now enter the Roundy review flow.','Meta에서 Callback을 인증했습니다. 이제 지원되는 댓글과 DM이 Roundy 검토 흐름으로 들어옵니다.')}</p>{webhook.last_received_at&&<p>{tr(locale,'Last webhook received:','마지막 Webhook 수신:')} {new Date(webhook.last_received_at).toLocaleString(locale,{timeZone:'Asia/Seoul'})} KST</p>}</>:<>
    <p>{tr(locale,'In the Meta app for @roundy.meet, authorize instagram_business_manage_comments and instagram_business_manage_messages, then subscribe the Instagram comments and messages webhook fields using the values below.','@roundy.meet Meta 앱에서 instagram_business_manage_comments 및 instagram_business_manage_messages 권한을 승인한 뒤 아래 값으로 Instagram comments, messages Webhook 필드를 구독하세요.')}</p>
    <div className="admin-form">
     <label><span>{tr(locale,'Callback URL','Callback URL')}</span><input readOnly value={webhook.callback_url}/></label>
     <label><span>{tr(locale,'Verify token','Verify token')}</span><input readOnly value={webhook.verify_token}/></label>
    </div>
    <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer">{tr(locale,'Open Meta app dashboard','Meta 앱 대시보드 열기')} <ExternalLink size={14}/></a>
   </>}
  </details>


 </>}

 {channel==='koreapas'&&<> <div className="marketing-layout"><form className="admin-form marketing-editor" onSubmit={e=>{e.preventDefault();void save();}}><div className="marketing-template-picker"><label><span>{tr(locale,'Saved template','저장된 템플릿')}</span><select value={form.id??''} onChange={e=>choose(templates.find(t=>t.id===e.target.value)??blank(channel))}><option value="">{tr(locale,'New template','새 템플릿')}</option>{templates.filter(t=>t.channel===channel).map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label><button type="button" className="admin-secondary" onClick={()=>choose(blank(channel))}><Plus size={16}/>{tr(locale,'New','새로 만들기')}</button></div>
 <label><span>{tr(locale,'Template name','템플릿 이름')}</span><input required maxLength={100} value={form.name} onChange={e=>update('name',e.target.value)} placeholder={tr(locale,'e.g. Weekend mingle','예: 주말 밍글')}/></label>
 <label><span>{tr(locale,'Start from an event (optional)','이벤트에서 가져오기 (선택)')}</span><select value="" onChange={e=>{const event=events.find(item=>item.id===e.target.value);if(event){setForm(f=>({...f,title:event.title,caption:event.description,destination_url:window.location.origin+'/events/'+event.slug}));setDirty(true);}}}><option value="">{tr(locale,'Choose an event','이벤트 선택')}</option>{events.map(event=><option key={event.id} value={event.id}>{event.title}</option>)}</select></label>
 <label><span>{tr(locale,'Post title','게시물 제목')}</span><input required value={form.title} maxLength={120} onChange={e=>update('title',e.target.value)}/></label>
 <label><span>{tr(locale,'Post copy','본문')}</span><textarea aria-label={tr(locale,'Post copy','본문')} rows={7} maxLength={2000} value={form.caption} onChange={e=>update('caption',e.target.value)} placeholder={tr(locale,'Invite people to your next Roundy event…','다음 Roundy 이벤트에 초대해 보세요…')}/><small>{form.caption.length} / 2000</small></label>
 <div className="admin-two"><label><span>{tr(locale,'Call to action','참여 안내 문구')}</span><input maxLength={80} value={form.cta} onChange={e=>update('cta',e.target.value)}/></label><label><span>{tr(locale,'Destination URL','연결 URL')}</span><input type="url" value={form.destination_url} onChange={e=>update('destination_url',e.target.value)}/></label></div>

 <fieldset><legend>{tr(locale,'Post images','게시물 이미지')}</legend><label className="document-upload"><strong><ImagePlus size={18}/> {tr(locale,'Upload images','이미지 업로드')}</strong><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy||form.images.length>=10} onChange={e=>{const files=[...(e.target.files??[])];e.target.value='';void work(async()=>{if(files.length+form.images.length>10)throw new Error('Choose up to 10 images.');const urls:string[]=[];for(const file of files)urls.push(await uploadFile(await prepareMarketingPhoto(file),'wis-event-images'));setForm(f=>({...f,images:[...f.images,...urls]}));setDirty(true);});}}/><small>{tr(locale,'Up to 10 images · 4:5 to 1.91:1 · Saved as JPEG. Carousel images should share the same aspect ratio.','최대 10장 · 4:5 ~ 1.91:1 · JPEG 저장. 여러 장의 비율을 동일하게 맞춰 주세요.')}</small></label><OrderedImages images={form.images} onChange={value=>update('images',value)} locale={locale} disabled={busy}/></fieldset>
 <fieldset className="marketing-schedule"><legend>{tr(locale,'Weekly schedule · KST','주간 일정 · 한국 시간')}</legend><div className="marketing-days">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day,i)=><label key={day}><input type="checkbox" checked={form.days.includes(i)} onChange={e=>update('days',e.target.checked?[...form.days,i]:form.days.filter(d=>d!==i))}/><span>{tr(locale,day,['일','월','화','수','목','금','토'][i])}</span></label>)}</div><label><span>{tr(locale,'Publish time','게시 시간')}</span><input type="time" required value={form.time_kst.slice(0,5)} onChange={e=>update('time_kst',e.target.value)}/></label><label className="check-row"><input type="checkbox" checked={form.enabled&&form.days.length>0} disabled={!connection[channel]||!form.days.length} onChange={e=>update('enabled',e.target.checked)}/><span>{tr(locale,'Enable automatic publishing','자동 게시 활성화')}</span></label><p className="admin-help">{tr(locale,'No selected days means paused. Each template has its own schedule. Recent duplicates are skipped; Koreapas allows one post per 24 hours across templates.','요일을 선택하지 않으면 중지됩니다. 템플릿마다 일정이 따로 적용됩니다. 최근 중복 게시를 건너뛰며 고파스는 전체 템플릿에서 24시간당 1회 게시합니다.')}</p></fieldset>
 <div className="admin-form-actions"><button className="admin-primary" disabled={busy}><Save size={16}/>{tr(locale,'Save template','템플릿 저장')}</button>{form.id&&<button type="button" className="admin-secondary" disabled={busy||!form.name.trim()} onClick={()=>void save(true)}><Copy size={16}/>{tr(locale,'Save as copy','복사본 저장')}</button>}<button type="button" className="admin-secondary" disabled={busy||dirty||!form.id||!connection[channel]} onClick={()=>{if(window.confirm(tr(locale,`Publish this saved post to Koreapas now?`,'저장된 게시물을 지금 게시할까요?')))void work(async()=>{await request('/publish',{template_id:form.id,request_key:crypto.randomUUID()});await load();});}}><Send size={16}/>{tr(locale,'Publish now','지금 게시')}</button>{form.id&&<button type="button" className="admin-secondary" disabled={busy} onClick={()=>{if(window.confirm(tr(locale,'Delete this template and stop its schedule?','템플릿을 삭제하고 일정을 중지할까요?')))void work(async()=>{await request('/'+form.id,{},'DELETE');setForm(blank(channel));setDirty(false);await load();});}}><Trash2 size={16}/>{tr(locale,'Delete','삭제')}</button>}</div></form>
 <aside className="marketing-preview"><p className="admin-kicker">{tr(locale,'POST PREVIEW','게시물 미리보기')}</p><div className="marketing-post"><header><Megaphone/><strong>Roundy · Koreapas</strong></header>{form.images[0]?<img src={form.images[0]} alt={tr(locale,'Post cover preview','게시물 대표 이미지 미리보기')}/>:<div className="marketing-preview-empty"><ImagePlus size={32}/><p>{tr(locale,'Your next gathering starts here.','다음 만남이 여기서 시작됩니다.')}</p></div>}{form.images.length>1&&<small>{form.images.length} {tr(locale,'images · ordered carousel','장 · 순서대로 게시')}</small>}<div className="marketing-preview-copy"><Heading level={3}>{form.title||tr(locale,'Your post title','게시물 제목')}</Heading><p>{form.caption||tr(locale,'Add your invitation to see it here.','초대 문구를 입력하면 여기에 표시됩니다.')}</p><strong>{form.cta}</strong><p>{form.destination_url}</p></div></div><p className="admin-help">{tr(locale,'Preview is illustrative. Final formatting depends on the channel.','미리보기이며 실제 표시 방식은 채널에 따라 다릅니다.')}</p></aside></div>
</>}
 <div className="admin-section-title"><Heading level={2}>{tr(locale,'Publishing history','게시 기록')}</Heading><button type="button" className="admin-secondary" disabled={busy} onClick={()=>void work(load)}>{tr(locale,'Refresh','새로고침')}</button></div><div className="marketing-history">{runs.filter(run=>run.channel===channel).length===0?<p className="admin-empty">{tr(locale,'No posts yet. Saved templates stay private until published.','아직 게시 기록이 없습니다. 템플릿은 게시 전까지 비공개입니다.')}</p>:runs.filter(run=>run.channel===channel).map(run=><article key={run.id}><div><strong>{run.snapshot.name}</strong><span className={'admin-status '+run.status}>{runStatusLabel(run.status,locale)}</span></div><small>{new Date(run.created_at).toLocaleString(locale,{timeZone:'Asia/Seoul'})} KST</small><p>{run.message}</p>{run.external_url&&<a href={run.external_url} target="_blank" rel="noreferrer">{tr(locale,'Open post','게시물 열기')} <ExternalLink size={14}/></a>}{run.status==='needs_review'&&<div className="admin-form-actions">{[true,false].map(published=><button type="button" className="admin-secondary" key={String(published)} onClick={()=>{if(window.confirm(tr(locale,'Confirm you checked the channel. This will unblock its queue.','채널을 확인했나요? 게시 대기열이 재개됩니다.')))void work(async()=>{await request('/resolve',{run_id:run.id,published});await load();});}}>{tr(locale,published?'I found the published post':'No post was published',published?'게시 확인 완료':'게시되지 않음')}</button>)}</div>}</article>)}</div>
 </section>;
}
