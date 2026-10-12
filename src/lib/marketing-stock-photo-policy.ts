// Pure invariants shared by all licensed-photo providers and publisher-facing review.
import {creditForPhoto,validLicensedPhoto} from './marketing-photo-rights';

export type PhotoSourcingPolicy={
 version:1|2;
 slide_count:3|4|5|6;
 min_real_photos:number;
 ai_thumbnail_enabled:boolean;
 requested_ai_thumbnail:boolean;
 // Version 2: every story card has its own distinct licensed photo, except the
 // single explicitly selected AI slot. The final brand vector is not a stock photo.
 ai_image_slot?:number|null;
};
const branded=(roles:string[])=>[4,6].includes(roles.length)&&roles.at(-1)==='brand_outro';
export function configuredPhotoSourcingPolicy(settings:Record<string,unknown>|null|undefined,roles:string[],aiSlotOverride?:number|null):PhotoSourcingPolicy|null{
 const v2=branded(roles),count=roles.length,storyCount=v2?count-1:count;
 if(storyCount!==3&&storyCount!==5)return null;
 const key=storyCount===5?'carousel_min_real_photos_5':'carousel_min_real_photos_3';
 const requested=settings?.[key];
 if(typeof requested!=='number'||!Number.isInteger(requested)||requested<0||requested>storyCount)return null;
 const minimum=Math.max(2,requested);
 const others=roles.filter((role,index)=>index>0&&role!=='cta'&&role!=='editorial_closing'&&role!=='brand_outro').length;
 const desiredSlot=aiSlotOverride===undefined?(settings?.carousel_ai_thumbnail_enabled===true?0:null):aiSlotOverride;
 const useAi=Number.isInteger(desiredSlot)&&Number(desiredSlot)>=0&&Number(desiredSlot)<storyCount
  &&storyCount===5&&others>=minimum&&(v2?storyCount-1>=minimum:true)
  &&roles[Number(desiredSlot)]!=='cta'&&roles[Number(desiredSlot)]!=='editorial_closing'
  &&roles[Number(desiredSlot)]!=='brand_outro';
 if(aiSlotOverride!==undefined&&aiSlotOverride!==null&&!useAi)throw new Error('AI_IMAGE_SLOT_NOT_AVAILABLE');
 return {
  version:v2?2:1,slide_count:count,
  min_real_photos:v2?storyCount-(useAi?1:0):minimum,
  ai_thumbnail_enabled:useAi&&desiredSlot===0,
  requested_ai_thumbnail:useAi&&desiredSlot===0,ai_image_slot:useAi?Number(desiredSlot):null
 };
}
export function savedPhotoSourcingPolicy(value:unknown):PhotoSourcingPolicy|null{
 if(!value||typeof value!=='object')return null;
 const p=value as Partial<PhotoSourcingPolicy>;
 const v2=p.version===2;
 if((p.version!==1&&!v2)||!Number.isInteger(p.slide_count)
    ||(v2?![4,6].includes(Number(p.slide_count)):![3,5].includes(Number(p.slide_count)))
    ||!Number.isInteger(p.min_real_photos)
    ||Number(p.min_real_photos)<2||Number(p.min_real_photos)>Number(p.slide_count)
    ||typeof p.ai_thumbnail_enabled!=='boolean'||typeof p.requested_ai_thumbnail!=='boolean')return null;
 const maxAiSlot=Number(p.slide_count)-1;
 if(p.ai_image_slot!==undefined&&p.ai_image_slot!==null&&(
   !Number.isInteger(p.ai_image_slot)||Number(p.ai_image_slot)<0||Number(p.ai_image_slot)>=maxAiSlot
   ||(v2?Number(p.slide_count)!==6:Number(p.slide_count)!==5)))return null;
 if(p.ai_image_slot!==undefined&&p.ai_thumbnail_enabled!==(p.ai_image_slot===0))return null;
 if(v2&&Number(p.min_real_photos)!==Number(p.slide_count)-1-(p.ai_image_slot!=null?1:0))return null;
 return p as PhotoSourcingPolicy;
}
export function aiImageSlotForPolicy(policy:PhotoSourcingPolicy|null|undefined):number|null{
 if(!policy)return null;
 return policy.ai_image_slot===undefined?(policy.ai_thumbnail_enabled?0:null):policy.ai_image_slot;
}
export type ReviewedPhoto={slot:number;review_status:string;storage_path?:string|null};
export function requiredPhotoSlotsForRoles(roles:string[],policy?:PhotoSourcingPolicy|null):number[]{
 if(policy?.version===2){
  if(roles.length!==policy.slide_count||!branded(roles))throw new Error('STOCK_PHOTO_POLICY_SLIDE_COUNT_CHANGED');
  const slots=roles.map((role,index)=>({role,index})).filter(x=>x.role!=='brand_outro'&&x.role!=='cta'&&x.index!==aiImageSlotForPolicy(policy)).map(x=>x.index);
  if(slots.length!==policy.min_real_photos)throw new Error('STOCK_PHOTO_ALL_STORY_CARDS_REQUIRED');
  return slots;
 }
 if(policy){
  if(roles.length!==policy.slide_count)throw new Error('STOCK_PHOTO_POLICY_SLIDE_COUNT_CHANGED');
  const eligible=roles.map((role,index)=>({role,index}))
   .filter(row=>row.role!=='cta'&&row.role!=='editorial_closing'&&(aiImageSlotForPolicy(policy)!==row.index)).map(row=>row.index);
  if(eligible.length<2)throw new Error('STOCK_PHOTOS_REQUIRE_TWO_CONTENT_CARDS');
  // Preserve the historic three-photo cap for existing drafts.
  return eligible.slice(0,Math.min(3,policy.min_real_photos));
 }
 const needed=Math.min(3,Math.max(2,roles.length-1));
 const eligible=roles.map((role,index)=>({role,index}))
  .filter(row=>row.role!=='cta'&&row.role!=='editorial_closing'&&row.role!=='brand_outro').map(row=>row.index);
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
