import 'server-only';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {allSelectedPhotosApproved,requiredPhotoSlotsForRoles,savedPhotoSourcingPolicy} from './marketing-stock-photo-policy';
import {licensedImageUrl,validLicensedPhoto,photoRightsIssues,type PhotoProvider,PHOTO_PROVIDERS} from './marketing-photo-rights';
import {searchLicensedPhotos,providerConfigured,trackUnsplashDownload} from './marketing-photo-providers';
import type {createServiceRoleClient} from './supabase/service';

type DB=ReturnType<typeof createServiceRoleClient>;
type Row=Record<string,any>;
type SourcePhoto=Row & {slot:number;asset_id:string;review_status:string;storage_path:string|null;content_sha256:string;photographer:string;provider_photo_id:string;image_url:string};
const PHOTO_COOLDOWN_DAYS=90;
const MAX_IMAGE_BYTES=9*1024*1024;
const MAX_PROVIDER_ATTEMPTS=10;
const ATTEMPTS_PER_PROVIDER=2;

const SEARCHES:Record<string,string[]>={
  prelaunch:['Seoul cafe friends conversation lifestyle','friends meeting cozy restaurant'],
  live_event:['people socializing cafe candid friends','modern warm event venue cafe'],
  mbti:['friends talking cafe candid portrait','people conversation restaurant'],
  dating_archetype:['two adults talking cafe candid','friends conversation city'],
  book_insight:['book and coffee cafe table','person reading cafe interior'],
  trend_research:['friends talking outdoors city','human connection candid cafe'],
  meme_remix:['friends laughing cafe candid','funny friends conversation'],
  dating_myth:['people conversing cafe table','couple conversation lifestyle'],
  conversation_prompt:['people talking coffee table','friends chatting cafe'],
  seoul_dating:['Seoul street cafe autumn','Seoul riverside city lifestyle'],
  seoul_trend:['Seoul city neighborhood culture','Seoul cafes street lifestyle'],
  mini_quiz:['friends having coffee and chatting','casual people talking cafe']
};
const check=<T extends {error:unknown}>(value:T):T=>{if(value.error)throw value.error;return value;};
export function pexelsConfigured(){return providerConfigured('pexels');}
export function photoTopic(draft:Row){
  const topic=draft.draft_kind==='growth_carousel'?String(draft.growth_topic_type||'conversation_prompt'):String(draft.content_mode||'prelaunch');
  return SEARCHES[topic]?topic:'conversation_prompt';
}
export function requiredStockSlots(draft:Row):number[]{
 const slides=Array.isArray(draft.carousel_slides)?draft.carousel_slides:[];
 const policy=savedPhotoSourcingPolicy(draft.content_document?.photo_sourcing);
 return requiredPhotoSlotsForRoles(slides.map((slide:Row)=>String(slide.role||'')),policy);
}
export async function listStockSelections(db:DB,draftId:string):Promise<SourcePhoto[]>{
  const rows=check(await db.from('marketing_draft_photos')
    .select('slot,asset_id,marketing_photo_assets(*)').eq('draft_id',draftId).order('slot')).data||[];
  return rows.map((item:Row)=>({...item.marketing_photo_assets,slot:item.slot,asset_id:item.asset_id})) as SourcePhoto[];
}
export async function importStockSelections(db:DB,draftId:string,photoSelections:unknown){
  if(!Array.isArray(photoSelections)||photoSelections.length>5)throw new Error('STOCK_PHOTO_SNAPSHOT_UNAVAILABLE');
  const rows=photoSelections.map((item:Row)=>({draft_id:draftId,asset_id:String(item?.asset_id||''),slot:Number(item?.slot)}));
  if(rows.some(x=>!Number.isInteger(x.slot)||x.slot<0||x.slot>5||!/^[a-f0-9-]{36}$/i.test(x.asset_id))||new Set(rows.map(x=>x.asset_id)).size!==rows.length)throw new Error('INVALID_STOCK_PHOTO_SNAPSHOT');
  if(!rows.length)return; // A zero-photo review-pending candidate is still importable.
  check(await db.from('marketing_draft_photos').upsert(rows,{onConflict:'draft_id,slot',ignoreDuplicates:true}));
}
export function photoSelectionSnapshot(rows:SourcePhoto[]){
  return rows.map(row=>({asset_id:row.asset_id,slot:row.slot,provider:row.provider,
  provider_photo_id:row.provider_photo_id,source_url:row.source_url,
  license_url:row.license_url,photographer:row.photographer,attribution_required:row.attribution_required,review_status:row.review_status}));
}

async function usedRecently(db:DB,excludeDraftId:string){
  const from=new Date(Date.now()-PHOTO_COOLDOWN_DAYS*86400000).toISOString();
  const rows=check(await db.from('marketing_draft_photos').select('draft_id,asset_id').neq('draft_id',excludeDraftId).gte('created_at',from).order('created_at',{ascending:false}).limit(5000)).data||[];
  return new Set(rows.map((row:Row)=>row.asset_id));
}
// Search terms combine the content pillar with each unfilled card's own subject.
const partsForPhotoQuery=(draft:Row,slot:number)=>JSON.stringify(draft.carousel_slides?.[slot]||{});
export function photoSearchQuery(draft:Row,topic:string,slot:number,attempt:number){
 const slide=Array.isArray(draft.carousel_slides)?draft.carousel_slides[slot]||{}:{};
 const base=(SEARCHES[topic]||SEARCHES.conversation_prompt)[attempt%2];
 const korean=partsForPhotoQuery(draft,slot);
 const terms=Object.entries({
  '서울숲':'Seoul Forest','한강':'Han River Seoul','성수':'Seongsu Seoul',
  '카페':'cafe','커피':'coffee','음식':'food','데이트':'dating',
  '산책':'walking park','전시':'art exhibition','공원':'park',
  '야경':'night view','맛집':'restaurant','책':'books','여행':'travel'
 }).filter(([word])=>korean.includes(word)).slice(0,3).map(([,english])=>english).join(' ');
 const parts=[slide.title_en,slide.body_en,slide.title,slide.body].filter((x):x is string=>typeof x==='string');
 const english=parts.join(' ').match(/[A-Za-z]{4,}/g)?.filter(x=>!/^(roundy|follow|slide|content|meeting|your|this|that|with|from)$/i.test(x)).slice(0,3).join(' ')||'';
 return (base+(english?' '+english:'')+(terms?' '+terms:'')).slice(0,100);
}
async function logProviderAttempt(db:DB,draftId:string,provider:PhotoProvider,query:string,status:string,code:string,count:number){
 const result=await db.from('marketing_photo_source_attempts').insert({
  draft_id:draftId,provider,search_query:query,status,
  error_code:code.slice(0,90),result_count:Math.max(0,count)
 });
 if(result.error)throw result.error;
}
function rank(photo:Row){
  const aspect=Number(photo.width)/Number(photo.height);
  return Math.max(0,100-100*Math.abs(aspect-0.8)) + Math.min(15,Number(photo.width)/200);
}

// Only archived and admin-approved images are eligible for rendering. Unreviewed
// images are staged in the same review workflow and never cause an AI fallback.
export async function prepareStockSelections(db:DB,draft:Row,opts:{replace?:boolean}={}):Promise<SourcePhoto[]>{
 const topic=photoTopic(draft),slots=requiredStockSlots(draft);
 const recently=await usedRecently(db,draft.id);
 const selected=await listStockSelections(db,draft.id);
 const picked:Row[]=[];
 // Keep existing assets when resuming the SAME draft after a human approval.
 if(!opts.replace)for(const asset of selected){
  if(picked.length>=slots.length)break;
  if(asset.slot!==slots[picked.length]||asset.review_status==='rejected')continue;
  if(asset.review_status==='approved'&&!asset.storage_path)continue;
  if(!validLicensedPhoto(asset))continue;
  if(picked.some(item=>item.id===asset.asset_id))continue;
  picked.push(asset);
 }
 const previousIds=new Set(selected.map(p=>p.asset_id));
 const existing=check(await db.from('marketing_photo_assets').select('*')
  .eq('topic_key',topic).eq('review_status','approved').order('reviewed_at',{ascending:false}).limit(150)).data||[];
 for(const asset of existing){
  if(picked.length>=slots.length)break;
  if(!asset.storage_path||!validLicensedPhoto(asset)||recently.has(asset.id)||picked.some(item=>item.id===asset.id)
    ||(opts.replace&&previousIds.has(asset.id)))continue;
  picked.push(asset);
 }
 // Bounded provider fallback. Candidates are never used before human approval.
 let attempts=0;
 for(const provider of PHOTO_PROVIDERS){
  if(picked.length>=slots.length||attempts>=MAX_PROVIDER_ATTEMPTS)break;
  for(let attempt=0;attempt<ATTEMPTS_PER_PROVIDER&&picked.length<slots.length&&attempts<MAX_PROVIDER_ATTEMPTS;attempt++){
   const slot=slots[Math.min(picked.length,slots.length-1)];
   const query=photoSearchQuery(draft,topic,slot,attempt);
   if(!providerConfigured(provider)){
    await logProviderAttempt(db,draft.id,provider,query,'skipped','API_KEY_NOT_CONFIGURED',0);
    break;
   }
   attempts++;
   let photos:Row[];
   try{
    const result=await searchLicensedPhotos(provider,query,topic);
    photos=result.photos;
    await logProviderAttempt(db,draft.id,provider,query,photos.length?'found':'empty','',photos.length);
   }catch(error){
    const raw=error instanceof Error?error.message:'PROVIDER_UNKNOWN_FAILURE';
    const reason=/^PHOTO_PROVIDER_(HTTP_\d+|RESPONSE_INVALID)$/.test(raw)?raw:
     (error instanceof Error&&['AbortError','TimeoutError'].includes(error.name))?'PHOTO_PROVIDER_TIMEOUT':'PHOTO_PROVIDER_UNAVAILABLE';
    await logProviderAttempt(db,draft.id,provider,query,'failed',reason,0);
    continue;
   }
   // Store at most 8 candidates per query to prevent review-library flooding.
   const eligible=photos.filter(p=>validLicensedPhoto(p)).sort((a,b)=>{
    const priority=(p:Row)=>/CC0|Public Domain/i.test(String(p.license_name))?1000:0;
    return priority(b)-priority(a)+rank(b)-rank(a);
   }).slice(0,8);
   const ids=eligible.map(p=>String(p.provider_photo_id));
   if(!ids.length)continue;
   const known=check(await db.from('marketing_photo_assets').select('*')
    .eq('provider',provider).in('provider_photo_id',ids)).data||[];
   const existingIds=new Set(known.map((p:Row)=>String(p.provider_photo_id)));
   const newPhotos=eligible.filter(p=>!existingIds.has(String(p.provider_photo_id)));
   if(newPhotos.length)check(await db.from('marketing_photo_assets')
    .upsert(newPhotos,{onConflict:'provider,provider_photo_id',ignoreDuplicates:true}));
   const pool=check(await db.from('marketing_photo_assets').select('*')
    .eq('provider',provider).in('provider_photo_id',ids)).data||[];
   pool.sort((a:Row,b:Row)=>rank(b)-rank(a));
   for(const asset of pool){
    if(picked.length>=slots.length)break;
    if(asset.review_status==='rejected'||!validLicensedPhoto(asset)
      ||recently.has(asset.id)||picked.some(item=>item.id===asset.id)
      ||(opts.replace&&previousIds.has(asset.id)))continue;
    if(asset.review_status==='approved'&&!asset.storage_path)continue;
    picked.push(asset);
   }
  }
 }
 // Do not destroy a previous approved assignment when replacement failed.
 if(!picked.length&&opts.replace&&selected.length)return selected;
 const assignments=picked.map((asset,index)=>({draft_id:draft.id,asset_id:asset.asset_id||asset.id,slot:slots[index]}));
 const unchanged=assignments.length===selected.length&&assignments.every((r,i)=>r.slot===selected[i]?.slot&&r.asset_id===selected[i]?.asset_id);
 if(!unchanged){
  check(await db.from('marketing_draft_photos').delete().eq('draft_id',draft.id));
  if(assignments.length)check(await db.from('marketing_draft_photos').insert(assignments));
 }
 return listStockSelections(db,draft.id);
}
export function stockReady(draft:Row,photos:SourcePhoto[]){
 const slides=Array.isArray(draft.carousel_slides)?draft.carousel_slides:[];
 return allSelectedPhotosApproved(slides.map((slide:Row)=>String(slide.role||'')),photos,savedPhotoSourcingPolicy(draft.content_document?.photo_sourcing));
}
async function getRemotePhoto(asset:Row){
 const provider=String(asset.provider) as PhotoProvider;
 const uri=licensedImageUrl(asset.image_url,provider);
 if(!uri||!validLicensedPhoto(asset))throw new Error('UNTRUSTED_STOCK_IMAGE_URL');
 const response=await fetch(uri,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!response.ok||!/^image\/(jpeg|png|webp)/i.test(response.headers.get('content-type')||''))
  throw new Error('STOCK_IMAGE_FETCH_FAILED');
 if(Number(response.headers.get('content-length')||0)>MAX_IMAGE_BYTES)throw new Error('STOCK_IMAGE_TOO_LARGE');
 const data=Buffer.from(await response.arrayBuffer());
 if(!data.length||data.length>MAX_IMAGE_BYTES)throw new Error('STOCK_IMAGE_TOO_LARGE');
 const meta=await sharp(data).metadata();
 if(!meta.width||!meta.height||meta.width<700||meta.height<650)throw new Error('STOCK_IMAGE_DIMENSIONS_INVALID');
 return sharp(data).rotate().resize(1080,1350,{fit:'cover'})
   .jpeg({quality:88}).toBuffer();
}
async function pixelHash(image:Buffer){
  const data=await sharp(image).resize(9,8,{fit:'fill'}).greyscale().raw().toBuffer();
  let bits=0n;
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)bits=(bits<<1n)|(data[y*9+x]>data[y*9+x+1]?1n:0n);
  return bits.toString(16).padStart(16,'0');
}
function bitDistance(a:string,b:string){
  if(!/^[a-f0-9]{16}$/i.test(a)||!/^[a-f0-9]{16}$/i.test(b))return 65;
  let v=BigInt('0x'+a)^BigInt('0x'+b),count=0;
  while(v){v&=v-1n;count++;}
  return count;
}
export async function reviewStockAsset(db:DB,assetId:string,choice:'approved'|'rejected',actor:string,note:string){
  const asset=check(await db.from('marketing_photo_assets').select('*').eq('id',assetId).single()).data as Row;
  if(asset.review_status===choice)return asset;
  if(choice==='rejected'){
    if(asset.review_status==='approved'){
      const selected=check(await db.from('marketing_draft_photos').select('draft_id').eq('asset_id',asset.id).limit(1000)).data||[];
      if(selected.length){
        const affected=check(await db.from('instagram_post_drafts').select('id,status')
          .in('id',selected.map((x:Row)=>x.draft_id)).in('status',['approved','scheduled','publishing','published'])).data||[];
        if(affected.length)throw new Error('PHOTO_USED_BY_SCHEDULED_OR_PUBLISHED_POST');
      }
    }
    return check(await db.from('marketing_photo_assets').update({
      review_status:'rejected',reviewed_by:actor,reviewed_at:new Date().toISOString(),
      review_note:note.slice(0,500),updated_at:new Date().toISOString()
    }).eq('id',assetId).select('*').single()).data;
  }
  const rightsIssues=photoRightsIssues(asset);
  if(rightsIssues.length)throw new Error('STOCK_LICENSE_SOURCE_INVALID: '+rightsIssues.join(','));
  await trackUnsplashDownload(asset);
  const bytes=await getRemotePhoto(asset);
  const digest=createHash('sha256').update(bytes).digest('hex'),hash=await pixelHash(bytes);
  const approved=check(await db.from('marketing_photo_assets').select('id,content_sha256,perceptual_hash')
    .eq('review_status','approved').neq('id',assetId).limit(1500)).data||[];
  if(approved.some((other:Row)=>other.content_sha256===digest||bitDistance(String(other.perceptual_hash||''),hash)<=5))
    throw new Error('DUPLICATE_OR_NEAR_DUPLICATE_STOCK_PHOTO');
  const storagePath='stock/'+asset.provider+'/'+asset.provider_photo_id+'.jpg';
  check(await db.storage.from('marketing-images').upload(storagePath,bytes,{contentType:'image/jpeg',upsert:true}));
  return check(await db.from('marketing_photo_assets').update({
    review_status:'approved',reviewed_at:new Date().toISOString(),reviewed_by:actor,
    review_note:note.slice(0,500),storage_path:storagePath,
    content_sha256:digest,perceptual_hash:hash,license_checked_at:new Date().toISOString(),
    updated_at:new Date().toISOString()
  }).eq('id',assetId).select('*').single()).data;
}

// The renderer uses ONLY the archived bytes which were approved, not hotlinked
// provider URLs that could change after review.
export async function approvedStockCardAssets(db:DB,draft:Row){
  const photos=await listStockSelections(db,draft.id);
  if(!stockReady(draft,photos))throw new Error('STOCK_PHOTOS_NOT_APPROVED');
  const cardPhotos:Record<number,string>={};
  for(const photo of photos){
    if(!validLicensedPhoto(photo))throw new Error('STOCK_LICENSE_REVOKED_OR_INCOMPLETE');
    if(!photo.storage_path)throw new Error('STOCK_PHOTO_ARCHIVE_MISSING');
    const blob=check(await db.storage.from('marketing-images').download(photo.storage_path)).data as Blob;
    const raw=Buffer.from(await blob.arrayBuffer());
    if(!raw.length||raw.length>MAX_IMAGE_BYTES)throw new Error('ARCHIVED_STOCK_IMAGE_INVALID');
    const digest=createHash('sha256').update(raw).digest('hex');
    if(digest!==photo.content_sha256)throw new Error('STOCK_PHOTO_ARCHIVE_CHANGED');
    cardPhotos[photo.slot]='data:image/jpeg;base64,'+raw.toString('base64');
  }
  return {photo:cardPhotos[0]||null,photos:[],cardPhotos,reusePhotos:false};
}
