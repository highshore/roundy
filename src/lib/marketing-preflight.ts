import {answerFirstIssues} from './marketing-answer-first';
import {mobileCarouselFit,savedCarouselPlan,resolveCarouselPlan} from './marketing-carousel-template';
import {requiredPhotoSlotsForRoles,savedPhotoSourcingPolicy} from './marketing-stock-photo-policy';

export type PreflightId='slide_count'|'real_photos'|'photo_sources'|'photo_approval'|'answer_first'|'final_cta'|'mobile_render';
export type PreflightCheck={id:PreflightId;label:string;passed:boolean;detail:string;issues:string[]};
export type PhotoRow=Record<string,unknown>;
export type PreflightReport={
 version:1;status:'passed'|'rejected';revision:number;checked_at:string;slide_count:number;
 min_real_photos:number;photo_manifest:Record<string,unknown>[];checks:PreflightCheck[];issues:string[];
};
const str=(x:unknown)=>typeof x==='string'?x.trim():'';
const numeric=(x:unknown,fallback:number)=>Number.isInteger(x)?Number(x):fallback;
const goodHttps=(x:unknown,host?:string)=>{try{
 const u=new URL(str(x));return u.protocol==='https:'&&!u.username&&!u.password&&(!host||u.hostname===host);
}catch{return false;}};
const validPexels=(p:PhotoRow)=>str(p.provider)==='pexels'
 &&goodHttps(p.source_url,'www.pexels.com')
 &&new URL(str(p.source_url)).pathname.startsWith('/photo/')
 &&goodHttps(p.image_url,'images.pexels.com')
 &&str(p.license_name)==='Pexels License'
 &&str(p.license_url)==='https://www.pexels.com/license/'
 &&goodHttps(p.photographer_url,'www.pexels.com')
 &&str(p.photographer).length>0
 &&!!p.license_checked_at;
export function photoReviewManifest(photos:PhotoRow[]):Record<string,unknown>[]{
 return photos.map(photo=>({
  slot:Number(photo.slot),asset_id:str(photo.asset_id),
  source_url:str(photo.source_url),license_url:str(photo.license_url),
  review_status:str(photo.review_status),reviewed_by:str(photo.reviewed_by),
  reviewed:!!photo.reviewed_at,license_checked:!!photo.license_checked_at,
  sha256:str(photo.content_sha256),storage_path:str(photo.storage_path)
 })).sort((a,b)=>Number(a.slot)-Number(b.slot));
}
export function evaluateMarketingPreflight(draft:Record<string,any>,settings:Record<string,any>,photos:PhotoRow[],now=new Date()):PreflightReport{
 const slides=Array.isArray(draft.carousel_slides)?draft.carousel_slides:[],images=Array.isArray(draft.images)?draft.images:[],
  doc=draft.content_document||{},plan=savedCarouselPlan(doc),
  labels:Record<PreflightId,string>={
   slide_count:'카드뉴스 장수 및 이미지 수',
   real_photos:'실제 사진 최소 개수 및 배치',
   photo_sources:'실제 사진 출처와 라이선스',
   photo_approval:'신규 사진 관리자 승인',
   answer_first:'Answer-First 썸네일',
   final_cta:'마지막 카드 CTA',
   mobile_render:'모바일 가독성 및 안전 여백'
  };
 const checks:PreflightCheck[]=[];
 const add=(id:PreflightId,errors:string[],goodDetail:string)=>{
  const unique=[...new Set(errors)];
  checks.push({id,label:labels[id],passed:unique.length===0,detail:unique.length?unique.join(' '):goodDetail,issues:unique});
 };
 // Count and style remain frozen on a generated reservation; never reinterpret an existing
 // alternating draft after a configuration change.
 const intended=plan?.slide_count??(settings?.carousel_mode==='fixed'?5:null);
 const countErr:string[]=[];
 if(!intended)countErr.push('카드 수 예약 정보가 없습니다. Fixed 5장 또는 Alternating 예약 순번으로 재생성하세요.');
 if(intended&&slides.length!==intended)countErr.push('카드뉴스 '+intended+'장이 필요하지만 문구는 '+slides.length+'장입니다.');
 if(intended&&images.length!==intended)countErr.push('완성 이미지 '+intended+'장이 필요하지만 현재 '+images.length+'장입니다.');
 if(intended&&Array.isArray(doc.slides)&&doc.slides.length!==intended)countErr.push('문구 원본과 카드 장수가 일치하지 않습니다.');
 if(plan?.mode==='alternating'&&(!Number.isInteger(plan.reservation_number)||Number(plan.reservation_number)<1||
   (Number(plan.reservation_number)%2===1?3:5)!==plan.slide_count))countErr.push('예약 발행 순번에 배정된 3장/5장 구성이 일치하지 않습니다.');
 add('slide_count',countErr,intended+'장 카드뉴스 및 이미지 개수가 일치합니다.');

 const photoPolicy=savedPhotoSourcingPolicy(doc.photo_sourcing);
 const currentMin=intended===3?numeric(settings?.carousel_min_real_photos_3,2):numeric(settings?.carousel_min_real_photos_5,3);
 const minimum=Math.max(2,currentMin,photoPolicy?.min_real_photos||0);
 const roles=slides.map((s:Record<string,any>)=>str(s?.role));
 let requiredSlots:number[]=[];
 const realIssues:string[]=[];
 if(photos.length!==new Set(photos.map(p=>Number(p.slot))).size)realIssues.push('같은 카드 위치에 중복 사진이 등록되어 있습니다.');
 if(photos.length!==new Set(photos.map(p=>str(p.asset_id))).size)realIssues.push('같은 사진 자산을 카드뉴스 내부에서 중복 사용했습니다.');
 try{requiredSlots=requiredPhotoSlotsForRoles(roles,photoPolicy);}catch{
  realIssues.push('실제 사진 배치 정보가 카드 수와 일치하지 않습니다. 사진을 다시 검색하고 배치하세요.');
 }
 if(minimum>3)realIssues.push('설정한 실제 사진 최소 '+minimum+'장은 현재 3장까지 지원하는 사진 배치 정책을 초과합니다. 설정을 조정하거나 사진 배치 기능을 확장하세요.');
 if(photos.length<minimum)realIssues.push('실제 사진이 '+photos.length+'장입니다. 최소 '+minimum+'장을 확보하세요.');
 if(requiredSlots.length&&photos.some(p=>!requiredSlots.includes(Number(p.slot))))realIssues.push('지정되지 않은 카드 위치에 실제 사진이 배치되어 있습니다.');
 if(photoPolicy?.ai_thumbnail_enabled&&photos.some(p=>Number(p.slot)===0))realIssues.push('AI 썸네일 설정 시 첫 장에는 실제 사진을 중복 배치할 수 없습니다.');
 if(draft.visual_source!=='pexels')realIssues.push('실제 사진 원본 및 승인 기록이 연결되지 않았습니다. 검수된 Pexels 자산을 사용하세요.');
 add('real_photos',realIssues,'실제 사진 '+photos.length+'장으로 최소 '+minimum+'장을 충족했습니다.');

 const sourceIssues:string[]=[];
 if(!photos.length)sourceIssues.push('출처가 확인된 실제 사진이 없습니다.');
 photos.forEach(p=>{
  const slot=Number(p.slot)+1;
  if(!validPexels(p))sourceIssues.push(slot+'장: Pexels 원본 URL, 사진가, 라이선스 또는 확인 일시가 누락되거나 유효하지 않습니다.');
 });
 add('photo_sources',sourceIssues,'모든 실제 사진에 원본 URL, 사진가 및 Pexels 라이선스가 확인되었습니다.');

 const approvalIssues:string[]=[];
 if(!photos.length)approvalIssues.push('관리자 승인을 받은 사진이 없습니다.');
 photos.forEach(p=>{
  const slot=Number(p.slot)+1;
  if(p.review_status!=='approved'||!p.reviewed_at||!str(p.reviewed_by))
   approvalIssues.push(slot+'장: 관리자 승인 상태, 승인자 또는 승인 일시를 확인하세요.');
  if(!str(p.storage_path)||!/^[a-f0-9]{64}$/i.test(str(p.content_sha256)))
   approvalIssues.push(slot+'장: 검수된 원본 이미지 보관 경로 또는 무결성 해시가 없습니다.');
 });
 add('photo_approval',approvalIssues,'모든 사진이 관리자 승인 및 원본 이미지 보관을 완료했습니다.');

 const answerIssues:string[]=[];
 if(settings?.carousel_answer_first_enabled!==false&&doc.answer_first!==true)
  answerIssues.push('Answer-First 메타데이터가 없습니다. 결과형 썸네일을 재생성하세요.');
 if(doc.answer_first===true)for(const issue of answerFirstIssues(doc,draft.content_language==='en'?'en':'ko'))answerIssues.push(issue);
 if(!str(slides[0]?.title))answerIssues.push('썸네일에 구체적인 결과 또는 추천 제목이 필요합니다.');
 if(doc.answer_first===true&&str(doc.slides?.[0]?.title)!==str(slides[0]?.title))
  answerIssues.push('선택한 썸네일 제목과 실제 카드 문구가 다릅니다. 다시 렌더링하세요.');
 add('answer_first',answerIssues,'썸네일은 결론형이며 선택한 문구와 카드가 일치합니다.');

 const ctaIssues:string[]=[],last=slides.at(-1);
 if(last?.role!=='cta')ctaIssues.push('마지막 카드가 CTA 역할이 아닙니다.');
 if(!str(last?.title)||!str(last?.body))ctaIssues.push('마지막 카드에 제목과 자연스러운 행동 안내가 필요합니다.');
 if(!str(draft.cta))ctaIssues.push('저장된 CTA 문구가 비어 있습니다.');
 if(!goodHttps(draft.destination_url))ctaIssues.push('CTA 연결 주소가 유효한 HTTPS 주소가 아닙니다.');
 if(!str(draft.caption).includes('roundy.team')||!str(draft.caption).includes('@roundy.meet'))
  ctaIssues.push('캡션에 Roundy 공식 웹사이트 또는 Instagram 계정이 누락되었습니다.');
 add('final_cta',ctaIssues,'마지막 카드의 안내 문구와 Roundy 연결 정보가 확인되었습니다.');

 const mobileIssues:string[]=[];
 if(!plan)mobileIssues.push('표준 1080×1350 템플릿 정보가 없습니다. 새 템플릿으로 재생성하세요.');
 if(plan&&plan.slide_count!==slides.length)mobileIssues.push('렌더링 템플릿 장수와 실제 카드 수가 다릅니다.');
 if(plan){
  slides.forEach((slide:Record<string,any>,i:number)=>{
   try{
    const fit=mobileCarouselFit(slide,plan,i,draft.content_language==='en'?'en':'ko');
    if(fit.margin<80||fit.contentWidth>920)mobileIssues.push((i+1)+'장: 안전 여백이 80px 미만입니다.');
   }catch(error){
    mobileIssues.push((i+1)+'장: 텍스트가 안전 영역을 초과합니다 ('+(error instanceof Error?error.message:'CAROUSEL_TEXT_OVERFLOW')+'). 문구를 줄이거나 다시 생성하세요.');
   }
  });
 }
 if(doc.thumbnail_render_pending===true)mobileIssues.push('썸네일 문구 변경 후 이미지를 다시 렌더링해야 합니다.');
 if(images.length!==slides.length)mobileIssues.push('렌더링된 카드 수가 부족해 잘림 여부를 검증할 수 없습니다.');
 add('mobile_render',mobileIssues,'1080×1350 해상도, 80px 안전 여백과 카드별 글자 배치 검사를 통과했습니다.');
 const issues=[...new Set(checks.flatMap(c=>c.issues))];
 return {version:1,status:issues.length?'rejected':'passed',revision:Number(draft.revision)||0,
  checked_at:now.toISOString(),slide_count:intended||slides.length,min_real_photos:minimum,
  photo_manifest:photoReviewManifest(photos),checks,issues};
}
export function mergePreflightQuality(copy:Record<string,any>,preflight:PreflightReport,gate=true){
 const sourceIssues=Array.isArray(copy?.issues)?copy.issues.filter((x:unknown):x is string=>typeof x==='string'):[];
 const issues=gate?[...new Set([...sourceIssues,...preflight.issues])]:sourceIssues;
 return {...copy,version:2,status:issues.length?'rejected':'passed',issues,review_required:true,preflight};
}
