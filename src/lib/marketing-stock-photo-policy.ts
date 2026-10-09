// Pure invariants shared by the Pexels selector and publisher-facing review.
export type ReviewedPhoto={slot:number;review_status:string;storage_path?:string|null};
// Keep the cover available for one optional AI/editorial treatment. The body is
// always anchored in reviewed photography; the final card belongs to the CTA.
export function requiredPhotoSlotsForRoles(roles:string[]):number[]{
 if(roles.length<3||!['cover','hook'].includes(roles[0])||roles[roles.length-1]!=='cta')
  throw new Error('STOCK_PHOTOS_REQUIRE_VALID_CAROUSEL');
 if(roles.length===5)return [1,2,3];
 // The alternating 3-card mode has one substantive body card.
 if(roles.length===3)return [1];
 return Array.from({length:Math.min(3,roles.length-2)},(_,index)=>index+1);
}
export function allSelectedPhotosApproved(roles:string[],photos:ReviewedPhoto[]){
 let slots:number[];
 try{slots=requiredPhotoSlotsForRoles(roles);}catch{return false;}
 return photos.length===slots.length
  &&photos.every((photo,index)=>photo.slot===slots[index]&&photo.review_status==='approved'&&!!photo.storage_path);
}
export function photoCreditCaption(caption:string,photographers:string[],limit=2000){
 const base=caption.replace(/\n\nPhotos: [^\n]+ \/ Pexels$/,'');
 const authors=[...new Set(photographers.map(name=>String(name||'').trim().slice(0,64)).filter(Boolean))];
 if(!authors.length)throw new Error('STOCK_PHOTOGRAPHER_REQUIRED');
 const result=base+'\n\nPhotos: '+authors.join(', ')+' / Pexels';
 if(result.length>limit)throw new Error('STOCK_CAPTION_CREDIT_LIMIT');
 return result;
}
