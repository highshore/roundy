// Pure invariants shared by the Pexels selector and publisher-facing review.
export type ReviewedPhoto={slot:number;review_status:string;storage_path?:string|null};
export function requiredPhotoSlotsForRoles(roles:string[]):number[]{
 const needed=Math.min(3,Math.max(2,roles.length-1));
 const eligible=roles.map((role,index)=>({role,index})).filter(row=>row.role!=='cta').map(row=>row.index);
 if(eligible.length<2)throw new Error('STOCK_PHOTOS_REQUIRE_TWO_CONTENT_CARDS');
 const others=eligible.filter(index=>index!==0),chosen:number[]=eligible.includes(0)?[0]:[];
 while(chosen.length<needed&&others.length){
  const position=chosen.length===1&&others.length>=3?Math.floor(others.length/2):0;
  chosen.push(others.splice(position,1)[0]);
 }
 if(chosen.length<2)throw new Error('STOCK_PHOTOS_REQUIRE_TWO_CONTENT_CARDS');
 return chosen.sort((a,b)=>a-b);
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
