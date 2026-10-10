// Shared by discovery, preflight, approval, and publisher; no client credentials.
export type PhotoProvider='pexels'|'unsplash'|'pixabay'|'wikimedia'|'openverse';
export type LicensedPhoto=Record<string,unknown>;
export const PHOTO_PROVIDERS:PhotoProvider[]=['pexels','unsplash','pixabay','wikimedia','openverse'];
export const LICENSE_URLS={
 pexels:'https://www.pexels.com/license/',
 unsplash:'https://unsplash.com/license',
 pixabay:'https://pixabay.com/service/license-summary/',
 cc0:'https://creativecommons.org/publicdomain/zero/1.0/',
 pdm:'https://creativecommons.org/publicdomain/mark/1.0/',
 by:'https://creativecommons.org/licenses/by/4.0/'
} as const;
const s=(value:unknown)=>typeof value==='string'?value.trim():'';
export function secureUrl(value:unknown,hosts:string[]):string|null{
 try{
  const raw=s(value);if(!raw||raw.length>1600)return null;
  const url=new URL(raw);
  return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&hosts.includes(url.hostname.toLowerCase())?url.toString():null;
 }catch{return null;}
}
export function licensedImageUrl(value:unknown,provider:PhotoProvider):string|null{
 const hosts:Record<PhotoProvider,string[]>={
  pexels:['images.pexels.com'],unsplash:['images.unsplash.com'],
  pixabay:['cdn.pixabay.com','pixabay.com'],wikimedia:['upload.wikimedia.org'],openverse:['upload.wikimedia.org']
 };
 const url=secureUrl(value,hosts[provider]);
 if(!url)return null;
 const path=new URL(url).pathname;
 if(provider==='pexels'&&!/^\/photos\/\d+\//.test(path))return null;
 if(provider==='unsplash'&&!path.startsWith('/photo-'))return null;
 if(provider==='pixabay'&&!(path.startsWith('/get/')||path.startsWith('/photo/')||path.startsWith('/images/')))return null;
 if(['wikimedia','openverse'].includes(provider)&&!path.startsWith('/wikipedia/'))return null;
 return url;
}
export function normalizeOpenLicense(name:unknown,url:unknown):{name:string;url:string;attribution:boolean}|null{
 const raw=s(name).toLowerCase(),value=s(url);
 let parsed:URL;
 try{parsed=new URL(value.replace(/^http:/,'https:'));}catch{return null;}
 if(parsed.hostname!=='creativecommons.org'||parsed.protocol!=='https:')return null;
 const path=parsed.pathname.replace(/\/+$/,'')+'/';
 if(path==='/publicdomain/zero/1.0/'&&/cc0|creative commons zero/i.test(raw))
  return {name:'CC0 1.0',url:LICENSE_URLS.cc0,attribution:false};
 if(path==='/publicdomain/mark/1.0/'&&/public.domain|pdm/i.test(raw))
  return {name:'Public Domain Mark 1.0',url:LICENSE_URLS.pdm,attribution:false};
 if(path==='/licenses/by/4.0/'&&/^cc[\s-]*by[\s-]*4\.0$/i.test(s(name)))
  return {name:'CC BY 4.0',url:LICENSE_URLS.by,attribution:true};
 return null; // NC, ND, SA, unknown versions and disputed free-use claims are excluded.
}
export function photoRightsIssues(photo:LicensedPhoto):string[]{
 const p=s(photo.provider) as PhotoProvider,issues:string[]=[];
 if(!PHOTO_PROVIDERS.includes(p))return ['UNSUPPORTED_PHOTO_PROVIDER'];
 const sourceHosts:Record<PhotoProvider,string[]>={
  pexels:['www.pexels.com'],unsplash:['unsplash.com'],pixabay:['pixabay.com'],
  wikimedia:['commons.wikimedia.org'],openverse:['commons.wikimedia.org']
 };
 const source=secureUrl(photo.source_url,sourceHosts[p]);
 if(!source)issues.push('PHOTO_SOURCE_NOT_VERIFIABLE');
 else {
  const path=new URL(source).pathname;
  if(p==='pexels'&&!path.startsWith('/photo/'))issues.push('INVALID_PEXELS_ORIGIN');
  if(p==='unsplash'&&!path.startsWith('/photos/'))issues.push('INVALID_UNSPLASH_ORIGIN');
  if(p==='pixabay'&&!path.startsWith('/photos/'))issues.push('INVALID_PIXABAY_ORIGIN');
  if((p==='wikimedia'||p==='openverse')&&!path.startsWith('/wiki/File:'))issues.push('INVALID_COMMONS_ORIGIN');
 }
 if(!licensedImageUrl(photo.image_url,p))issues.push('UNTRUSTED_PHOTO_IMAGE_URL');
 if(!s(photo.photographer)||!secureUrl(photo.photographer_url,
  ['www.pexels.com','unsplash.com','pixabay.com','commons.wikimedia.org']))issues.push('PHOTO_CREATOR_REQUIRED');
 if(!secureUrl(photo.license_evidence_url,sourceHosts[p])||
  s(photo.license_evidence_url)!==s(photo.source_url))issues.push('LICENSE_ORIGIN_EVIDENCE_MISSING');
 if(!s(photo.license_checked_at))issues.push('LICENSE_CHECK_NOT_RECORDED');
 if(photo.commercial_use_allowed!==true||photo.modifications_allowed!==true)issues.push('COMMERCIAL_EDIT_RIGHTS_UNPROVEN');
 const name=s(photo.license_name),url=s(photo.license_url);
 if(p==='pexels'&&(name!=='Pexels License'||url!==LICENSE_URLS.pexels))issues.push('PEXELS_LICENSE_MISMATCH');
 if(p==='unsplash'&&(name!=='Unsplash License'||url!==LICENSE_URLS.unsplash))issues.push('UNSPLASH_LICENSE_MISMATCH');
 if(p==='pixabay'&&(name!=='Pixabay Content License'||url!==LICENSE_URLS.pixabay))issues.push('PIXABAY_LICENSE_MISMATCH');
 if((p==='wikimedia'||p==='openverse')){
  const license=normalizeOpenLicense(name,url);
  if(!license||license.name!==name||license.url!==url)issues.push('OPEN_LICENSE_MISSING_OR_UNSUPPORTED');
  if(license?.attribution&&photo.attribution_required!==true)issues.push('ATTRIBUTION_FLAG_MISSING');
 }
 if((p==='pexels'||p==='unsplash'||p==='pixabay')&&photo.attribution_required!==false)issues.push('UNEXPECTED_ATTRIBUTION_FLAG');
 return issues;
}
export const validLicensedPhoto=(p:LicensedPhoto)=>photoRightsIssues(p).length===0;
export function creditForPhoto(p:LicensedPhoto){
 const author=s(p.photographer).slice(0,120),provider=s(p.provider);
 if(p.attribution_required===true){
  return author+' / '+s(p.license_name)+' / '+s(p.license_url)+' / '+s(p.source_url)+' (cropped and text overlaid)';
 }
 return author+' / '+(provider==='wikimedia'?'Wikimedia Commons':provider==='openverse'?'Openverse':provider==='pixabay'?'Pixabay':provider==='unsplash'?'Unsplash':'Pexels');
}
export function captionHasRequiredCredits(caption:string,photos:LicensedPhoto[]):boolean{
 return photos.every(p=>p.attribution_required!==true||(
  caption.includes(s(p.photographer))&&caption.includes(s(p.source_url))&&
  caption.includes(s(p.license_url))&&caption.includes('(cropped and text overlaid)')
 ));
}
