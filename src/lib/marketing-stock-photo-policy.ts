// Pure invariants shared by all licensed-photo providers and publisher-facing review.
import {creditForPhoto,validLicensedPhoto} from './marketing-photo-rights';

export type PhotoSourcingPolicy={
 version:1;
 slide_count:3|5;
 min_real_photos:number;
 ai_thumbnail_enabled:boolean;
 requested_ai_thumbnail:boolean;
};
// Read from the phase-1 DB settings. Once saved, a draft retains its own policy snapshot.
export function configuredPhotoSourcingPolicy(settings:Record<string,unknown>|null|undefined,roles:string[]):PhotoSourcingPolicy|null{
 const count=roles.length;
 if(count!==3&&count!==5)return null; // Existing 4/6-card drafts are left intact.
 const key=count===5?'carousel_min_real_photos_5':'carousel_min_real_photos_3';
 const requested=settings?.[key];
 if(typeof requested!=='number'||!Number.isInteger(requested)||requested<0||requested>count)return null;
 // The legacy reviewed-photo publication safety guard requires at least two images.
 const minimum=Math.max(2,requested);
 const others=roles.filter((role,index)=>index>0&&role!=='cta'&&role!=='editorial_closing').length;
 const wantsAi=settings?.carousel_ai_thumbnail_enabled===true;
 const useAi=wantsAi&&count===5&&others>=minimum;
 return {version:1,slide_count:count,min_real_photos:minimum,ai_thumbnail_enabled:useAi,requested_ai_thumbnail:wantsAi};
}
export function savedPhotoSourcingPolicy(value:unknown):PhotoSourcingPolicy|null{
 if(!value||typeof value!=='object')return null;
 const p=value as Partial<PhotoSourcingPolicy>;
 if(p.version!==1||(p.slide_count!==3&&p.slide_count!==5)||!Number.isInteger(p.min_real_photos)
   ||Number(p.min_real_photos)<2||Number(p.min_real_photos)>p.slide_count
   ||typeof p.ai_thumbnail_enabled!=='boolean'||typeof p.requested_ai_thumbnail!=='boolean')return null;
 return p as PhotoSourcingPolicy;
}
export type ReviewedPhoto={slot:number;review_status:string;storage_path?:string|null};
export function requiredPhotoSlotsForRoles(roles:string[],policy?:PhotoSourcingPolicy|null):number[]{
 if(policy){
  if(roles.length!==policy.slide_count)throw new Error('STOCK_PHOTO_POLICY_SLIDE_COUNT_CHANGED');
  const eligible=roles.map((role,index)=>({role,index})).filter(row=>row.role!=='cta'&&row.role!=='editorial_closing'&&(!policy.ai_thumbnail_enabled||row.index!==0)).map(row=>row.index);
  if(eligible.length<2)throw new Error('STOCK_PHOTOS_REQUIRE_TWO_CONTENT_CARDS');
  // Existing DB review guard supports up to three assigned photos. Never silently
  // relax a higher admin minimum: stockReady below will remain false for >3.
  return eligible.slice(0,Math.min(3,policy.min_real_photos));
 }
 const needed=Math.min(3,Math.max(2,roles.length-1));
 const eligible=roles.map((role,index)=>({role,index})).filter(row=>row.role!=='cta'&&row.role!=='editorial_closing').map(row=>row.index);
 if(eligible.length<2)throw new Error('STOCK_PHOTOS_REQUIRE_TWO_CONTENT_CARDS');
 const others=eligible.filter(index=>index!==0),chosen:number[]=eligible.includes(0)?[0]:[];
 while(chosen.length<needed&&others.length){
  const position=chosen.length===1&&others.length>=3?Math.floor(others.length/2):0;
  chosen.push(others.splice(position,1)[0]);
 }
 if(chosen.length<2)throw new Error('STOCK_PHOTOS_REQUIRE_TWO_CONTENT_CARDS');
 return chosen.sort((a,b)=>a-b);
}
export function allSelectedPhotosApproved(roles:string[],photos:ReviewedPhoto[],policy?:PhotoSourcingPolicy|null){
 let slots:number[];
 try{slots=requiredPhotoSlotsForRoles(roles,policy);}catch{return false;}
 if(policy&&photos.length<policy.min_real_photos)return false;
 return photos.length===slots.length
  &&photos.every((photo,index)=>photo.slot===slots[index]&&photo.review_status==='approved'&&!!photo.storage_path);
}
// Every externally sourced photo has a creator, provider and original URL in the
// Instagram caption, even when attribution is not legally required (CC0/PDM).
// The per-card index maps credits back to the rendered photo. If the full credit
// cannot fit the existing caption limit, block generation rather than truncate it.
export function photoCreditCaption(caption:string,photos:Array<string|Record<string,any>>,limit=2000){
 const base=caption.replace(/\n\n(?:Photos:|Photo sources \/ 사진 출처:)[\s\S]*$/,'');
 if(!photos.length)throw new Error('STOCK_PHOTOGRAPHER_REQUIRED');
 const legacy=photos.every(photo=>typeof photo==='string');
 let block:string;
 if(legacy){
  const names=[...new Set(photos.map(photo=>String(photo||'').trim().slice(0,64)).filter(Boolean))];
  if(!names.length)throw new Error('STOCK_PHOTOGRAPHER_REQUIRED');
  block='Photos: '+names.join(', ')+' / Pexels';
 }else{
  const items=photos.map((photo,index)=>{
   if(typeof photo==='string'||!validLicensedPhoto(photo))
    throw new Error('STOCK_PHOTO_CREDIT_SOURCE_REQUIRED');
   const slot=Number.isInteger(photo.slot)&&photo.slot>=0&&photo.slot<=5?photo.slot:index;
   return String(slot+1).padStart(2,'0')+' / '+creditForPhoto(photo);
  });
  block='Photo sources / 사진 출처:\n'+items.join('\n');
 }
 const result=base+'\n\n'+block;
 if(result.length>limit)throw new Error('STOCK_CAPTION_CREDIT_LIMIT');
 return result;
}
