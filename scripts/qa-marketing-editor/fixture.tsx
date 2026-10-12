// @ts-nocheck
// Synthetic development fixture only. All HTTP is mocked; never a production route.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {AdminMarketing} from '../../src/components/admin-marketing';
const ko=new URLSearchParams(location.search).get('lang')!=='en';
const roles=['cover','context','insight','insight','editorial_closing','brand_outro'];
const svg=(i:number)=>'data:image/svg+xml;base64,'+btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><rect width="1080" height="1350" fill="#fffdf8"/><rect x="80" y="80" width="920" height="700" rx="24" fill="#ddd9cd"/><circle cx="400" cy="410" r="160" fill="#babdac"/><circle cx="700" cy="490" r="120" fill="#cfc7b3"/><text x="90" y="900" font-size="48" fill="#282825">CARD ${i+1} / ROUNDY</text><text x="90" y="1000" font-size="30" fill="#77776d">Synthetic QA fixture - not published</text></svg>`);
const slides=roles.map((role,i)=>({role,title:i===0?(ko?'“역시 T네” 대신 뭐라고 하지?':'What to say instead of Typical T?'):role==='brand_outro'?'Roundy':(ko?'구체적인 대화의 다음 장면':'The next moment in conversation'),body:ko?'지금은 해결책보다 내 얘길 잠깐 들어줬으면 해.':'Could you listen before offering advice?',body_ko:'지금은 해결책보다 내 얘길 잠깐 들어줬으면 해.',body_en:'Could you listen before offering advice?',secondary_body:ko?'Could you listen before offering advice?':'지금은 해결책보다 내 얘길 잠깐 들어줬으면 해.',highlight:'',source_ids:[],options:[],closing_type:i===4?'insight':i===5?'brand_outro':'none'}));
let draft:any={id:'11111111-1111-4111-8111-111111111111',revision:7,draft_role:'candidate',status:'needs_approval',imported_at:'2026-10-12T14:26:58Z',updated_at:'2026-10-12T15:11:40Z',generation_source:'manual',draft_kind:'growth_carousel',content_mode:'prelaunch',growth_topic_type:'mbti',content_language:ko?'ko':'en',visual_source:'stock',draft_date:'2026-10-12',caption:ko?'테스트용 캡션. 실제 게시물이 아닙니다.':'Synthetic QA caption, not a published post.',cta:'',destination_url:'https://roundy.team',images:slides.map((_,i)=>svg(i)),carousel_slides:slides,quality_report:{status:'rejected',issues:['Stale five-card validation']},quality_revision:7,content_document:{design_preset:'roundy_magazine_editorial_v2',slides,brand_outro_version:1,carousel_template:{version:1,mode:'fixed',slide_count:5},answer_first:true,editorial_review_required:false,source_review_required:false,photo_sourcing:{version:2,slide_count:6,min_real_photos:4,ai_image_slot:0,ai_thumbnail_enabled:true,requested_ai_thumbnail:true},regeneration_ai_cover_path:'fixture-ai.jpg',thumbnail_candidates:[slides[0].title,'A concrete alternative title','A different scene'],thumbnail_selected_index:0}};
const settings={carousel_mode:'fixed',carousel_default_slides:5,carousel_min_real_photos_5:3,carousel_min_real_photos_3:2,carousel_brand_outro_enabled:true};
const generation={jobs:[],provider:{configured:true},control:{enabled:true},usage:{daily_call_limit:50}};
const checks=['slide_count','real_photos','photo_sources','photo_approval','answer_first','editorial_closing','mobile_render'].map(id=>({id,passed:true,label:id,issues:[]}));
const photos=[1,2,3,4].map(slot=>({slot,asset_id:'44444444-4444-4444-8444-44444444444'+slot,review_status:'approved',storage_path:'fixture/'+slot+'.jpg',preview_url:svg(slot),photographer:'Fixture photographer',provider:'pexels',source_url:'https://example.invalid/fixture',license_url:'https://example.invalid/license'}));
(window as any).apiCalls=[];(window as any).blockChecks=false;(window as any).staleChecks=false;(window as any).delaySave=false;
window.fetch=async(url:any,init:any={})=>{
 const route=String(url).replace('/api/admin/marketing',''),body=init.body?JSON.parse(init.body):null,method=init.method||'GET';(window as any).apiCalls.push({route,body,method});let data:any={};
 if(route==='')data={drafts:[draft],runs:[],templates:[],settings,generation,connection:{instagram_status:'valid'},live_events:[]};
 else if(route==='/generation')data=generation;
 else if(route.startsWith('/quality/preflight?'))data={draft_id:draft.id,revision:(window as any).staleChecks?draft.revision-1:draft.revision,preflight:{status:(window as any).blockChecks?'rejected':'passed',checks:(window as any).blockChecks?checks.map((c,i)=>i===4?{...c,passed:false,issues:['Current check failed']}:c):checks},quality_report:{status:(window as any).blockChecks?'rejected':'passed',issues:(window as any).blockChecks?['Current check failed']:[]}};
 else if(route.startsWith('/photos?'))data={photos,ready:true,approved:4,minimum:4};
 else if(route==='/photos/assets?status=approved')data={assets:photos.map(p=>({...p,id:p.asset_id}))};
 else if(route.startsWith('/uploads?'))data={images:[]};
 else if(route.endsWith('/versions/manual')){if((window as any).delaySave)await new Promise(r=>setTimeout(r,700));draft={...draft,revision:draft.revision+1,carousel_slides:draft.carousel_slides.map((s:any,i:number)=>i===body.index?{...s,...body}:s)};data={draft};}
 else if(route.endsWith('/versions')&&method==='POST'){draft={...draft,revision:draft.revision+1};data={draft};}
 else if(route.endsWith('/versions'))data={versions:[{...draft,version:1}]};
 else throw new Error('Unexpected fixture route '+route);
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
};
createRoot(document.getElementById('root')!).render(<main className="admin-main"><AdminMarketing locale={ko?'ko':'en'}/></main>);
