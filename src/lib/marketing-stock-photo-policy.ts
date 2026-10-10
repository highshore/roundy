// Pure invariants shared by all licensed-photo providers and publisher-facing review.

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
 const others=roles.filter((role,index)=>index>0&&role!=='cta').length;
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
  const eligible=roles.map((role,index)=>({role,index})).filter(row=>row.role!=='cta'&&(!policy.ai_thumbnail_enabled||row.index!==0)).map(row=>row.index);
  if(eligible.length<2)throw new Error('STOCK_PHOTOS_REQUIRE_TWO_CONTENT_CARDS');
  // Existing DB review guard supports up to three assigned photos. Never silently
  // relax a higher admin minimum: stockReady below will remain false for >3.
  return eligible.slice(0,Math.min(3,policy.min_real_photos));
 }
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
export function allSelectedPhotosApproved(roles:string[],photos:ReviewedPhoto[],policy?:PhotoSourcingPolicy|null){
 let slots:number[];
 try{slots=requiredPhotoSlotsForRoles(roles,policy);}catch{return false;}
 if(policy&&photos.length<policy.min_real_photos)return false;
 return photos.length===slots.length
  &&photos.every((photo,index)=>photo.slot===slots[index]&&photo.review_status==='approved'&&!!photo.storage_path);
}
// Append required credits to the actual publishing caption, preserving legacy string[] support.
export function photoCreditCaption(caption:string,photos:Array<string|Record<string,any>>,limit=2000){
 const base=caption.replace(/\n\nPhotos: [\s\S]*$/,'');
 const items=[...new Set(photos.map(photo=>{
  if(typeof photo==='string')return photo.trim().slice(0,64);
  const by=String(photo.photographer||'').trim().slice(0,100);
  if(!by)return '';
  if(photo.attribution_required===true){
   const source=String(photo.source_url||'').trim(),license=String(photo.license_url||'').trim();
   const name=String(photo.license_name||'').trim();
   if(!source||!license||!name)throw new Error('STOCK_ATTRIBUTION_EVIDENCE_REQUIRED');
   return by+' / '+name+' / '+license+' / '+source+' (cropped and text overlaid)';
  }
  const provider=String(photo.provider||'pexels').trim().toLowerCase();
  return by+' / '+(provider==='pexels'?'Pexels':provider==='unsplash'?'Unsplash':provider==='pixabay'?'Pixabay':provider==='wikimedia'?'Wikimedia Commons':'Openverse');
 }).filter(Boolean))];
 if(!items.length)throw new Error('STOCK_PHOTOGRAPHER_REQUIRED');
 const legacy=photos.every(p=>typeof p==='string');
 const result=base+'\n\nPhotos: '+(legacy?items.join(', ')+' / Pexels':items.join(' | '));
 if(result.length>limit)throw new Error('STOCK_CAPTION_CREDIT_LIMIT');
 return result;
}
