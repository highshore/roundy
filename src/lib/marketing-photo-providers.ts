import 'server-only';
import {createHash} from 'node:crypto';
import {LICENSE_URLS,normalizeOpenLicense,secureUrl,validLicensedPhoto,
 type PhotoProvider,type LicensedPhoto} from './marketing-photo-rights';

export type PhotoCandidate=LicensedPhoto & {
 provider:PhotoProvider;provider_photo_id:string;source_url:string;image_url:string;preview_url:string;
 photographer:string;photographer_url:string;license_name:string;license_url:string;license_evidence_url:string;
 license_checked_at:string;commercial_use_allowed:boolean;modifications_allowed:boolean;attribution_required:boolean;
 width:number;height:number;topic_key:string;search_query:string;download_tracking_url?:string|null;
};
export type SearchResult={provider:PhotoProvider;query:string;photos:PhotoCandidate[];skipped?:string};
const SEARCH_TIMEOUT_MS=8500,PER_PAGE=24;
const val=(v:unknown)=>typeof v==='string'?v.trim():'';
const textOnly=(v:unknown)=>val(v).replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim().slice(0,180);
export const supportedPhotoSources=['pexels','unsplash','pixabay','wikimedia','openverse'] as const;
export function providerConfigured(provider:PhotoProvider){
 if(provider==='pexels')return Boolean(process.env.PEXELS_API_KEY?.trim());
 if(provider==='unsplash')return Boolean(process.env.UNSPLASH_ACCESS_KEY?.trim());
 if(provider==='pixabay')return Boolean(process.env.PIXABAY_API_KEY?.trim());
 return true;
}
async function requestJson(url:URL,headers:Record<string,string>={}):Promise<any>{
 const response=await fetch(url,{headers:{Accept:'application/json','User-Agent':'RoundyContentResearch/1.0 (https://roundy.team)',...headers},
  redirect:'error',cache:'no-store',signal:AbortSignal.timeout(SEARCH_TIMEOUT_MS)});
 if(!response.ok)throw new Error('PHOTO_PROVIDER_HTTP_'+response.status);
 const payload=await response.json().catch(()=>null);
 if(!payload||typeof payload!=='object')throw new Error('PHOTO_PROVIDER_RESPONSE_INVALID');
 return payload;
}
function candidate(p:Record<string,unknown>):PhotoCandidate|null{
 const item={...p,license_checked_at:new Date().toISOString(),
  commercial_use_allowed:true,modifications_allowed:true} as PhotoCandidate;
 if(!Number.isInteger(item.width)||!Number.isInteger(item.height)||item.width<700||item.height<650||
  !item.preview_url||!secureUrl(item.preview_url,
   ['images.pexels.com','images.unsplash.com','cdn.pixabay.com','pixabay.com','upload.wikimedia.org'])||
  !validLicensedPhoto(item))return null;
 return item;
}
function parsePexels(p:any,topic:string,query:string):PhotoCandidate|null{
 const id=String(p?.id||'');
 if(!/^\d{1,20}$/.test(id))return null;
 const source=secureUrl(p.url,['www.pexels.com']);
 const image=secureUrl(p.src?.large2x||p.src?.portrait||p.src?.large,['images.pexels.com']);
 const preview=secureUrl(p.src?.medium,['images.pexels.com']);
 const photographerUrl=secureUrl(p.photographer_url,['www.pexels.com']);
 if(!source||!image||!preview||!photographerUrl||!new URL(image).pathname.startsWith('/photos/'+id+'/'))return null;
 return candidate({provider:'pexels',provider_photo_id:id,source_url:source,image_url:image,preview_url:preview,
  photographer:val(p.photographer),photographer_url:photographerUrl,width:p.width,height:p.height,
  topic_key:topic,search_query:query,license_name:'Pexels License',license_url:LICENSE_URLS.pexels,
  license_evidence_url:source,attribution_required:false});
}
function parseUnsplash(p:any,topic:string,query:string):PhotoCandidate|null{
 const id=String(p?.id||'');
 if(!/^[\w-]{3,40}$/.test(id))return null;
 const source=secureUrl(p.links?.html,['unsplash.com']);
 const image=secureUrl(p.urls?.regular||p.urls?.full,['images.unsplash.com']);
 const preview=secureUrl(p.urls?.small||p.urls?.regular,['images.unsplash.com']);
 const author=secureUrl(p.user?.links?.html,['unsplash.com']);
 const tracker=secureUrl(p.links?.download_location,['api.unsplash.com']);
 if(!source||!image||!preview||!author||!tracker)return null;
 return candidate({provider:'unsplash',provider_photo_id:id,source_url:source,image_url:image,preview_url:preview,
  photographer:val(p.user?.name),photographer_url:author,width:p.width,height:p.height,
  topic_key:topic,search_query:query,license_name:'Unsplash License',license_url:LICENSE_URLS.unsplash,
  license_evidence_url:source,attribution_required:false,download_tracking_url:tracker});
}
function parsePixabay(p:any,topic:string,query:string):PhotoCandidate|null{
 const id=String(p?.id||'');
 if(!/^\d{1,20}$/.test(id))return null;
 const source=secureUrl(p.pageURL,['pixabay.com']);
 const image=secureUrl(p.largeImageURL||p.webformatURL,['cdn.pixabay.com','pixabay.com']);
 const preview=secureUrl(p.webformatURL,['cdn.pixabay.com','pixabay.com']);
 const author=secureUrl('https://pixabay.com/users/'+encodeURIComponent(val(p.user))+'-'+String(p.user_id||'')+'/', ['pixabay.com']);
 if(!source||!image||!preview||!author)return null;
 return candidate({provider:'pixabay',provider_photo_id:id,source_url:source,image_url:image,preview_url:preview,
  photographer:val(p.user),photographer_url:author,width:p.imageWidth,height:p.imageHeight,
  topic_key:topic,search_query:query,license_name:'Pixabay Content License',license_url:LICENSE_URLS.pixabay,
  license_evidence_url:source,attribution_required:false});
}
function commonsSource(title:unknown){
 const name=val(title);if(!name.startsWith('File:')||name.length>220)return null;
 return 'https://commons.wikimedia.org/wiki/'+encodeURIComponent(name).replace('%3A',':');
}
function parseCommons(page:any,topic:string,query:string,provider:'wikimedia'|'openverse',overrideId?:string):PhotoCandidate|null{
 const meta=page?.imageinfo?.[0],ext=meta?.extmetadata||{};
 const source=commonsSource(page?.title);
 const image=secureUrl(meta?.thumburl||meta?.url,['upload.wikimedia.org']);
 const preview=secureUrl(meta?.thumburl||meta?.url,['upload.wikimedia.org']);
 const license=normalizeOpenLicense(ext.LicenseShortName?.value,ext.LicenseUrl?.value);
 const author=textOnly(ext.Artist?.value||ext.Credit?.value);
 if(!source||!image||!preview||!license||!author)return null;
 const stable=overrideId||createHash('sha256').update(String(page.title)).digest('hex');
 const explicitAttribution=val(ext.AttributionRequired?.value).toLowerCase();
 if(license.attribution&&explicitAttribution==='false')return null;
 return candidate({provider,provider_photo_id:stable,source_url:source,image_url:image,preview_url:preview,
  photographer:author,photographer_url:source,width:meta?.width,height:meta?.height,
  topic_key:topic,search_query:query,license_name:license.name,license_url:license.url,
  license_evidence_url:source,attribution_required:license.attribution});
}
async function commonsByTitles(titles:string[],thumbWidth=1080):Promise<any[]>{
 if(!titles.length)return [];
 const url=new URL('https://commons.wikimedia.org/w/api.php');
 url.searchParams.set('action','query');
 url.searchParams.set('format','json');url.searchParams.set('formatversion','2');
 url.searchParams.set('prop','imageinfo');
 url.searchParams.set('iiprop','url|size|mime|extmetadata');
 url.searchParams.set('iiurlwidth',String(thumbWidth));
 url.searchParams.set('titles',titles.slice(0,8).join('|'));
 const data=await requestJson(url);
 return Array.isArray(data.query?.pages)?data.query.pages:[];
}
async function searchPexels(query:string,topic:string):Promise<PhotoCandidate[]>{
 const url=new URL('https://api.pexels.com/v1/search');
 url.searchParams.set('query',query);url.searchParams.set('orientation','portrait');url.searchParams.set('per_page',String(PER_PAGE));
 const data=await requestJson(url,{Authorization:process.env.PEXELS_API_KEY!});
 if(!Array.isArray(data.photos))throw new Error('PHOTO_PROVIDER_RESPONSE_INVALID');
 return data.photos.map((p:any)=>parsePexels(p,topic,query)).filter(Boolean);
}
async function searchUnsplash(query:string,topic:string):Promise<PhotoCandidate[]>{
 const url=new URL('https://api.unsplash.com/search/photos');
 url.searchParams.set('query',query);url.searchParams.set('orientation','portrait');url.searchParams.set('per_page',String(PER_PAGE));
 const data=await requestJson(url,{Authorization:'Client-ID '+process.env.UNSPLASH_ACCESS_KEY!,'Accept-Version':'v1'});
 if(!Array.isArray(data.results))throw new Error('PHOTO_PROVIDER_RESPONSE_INVALID');
 return data.results.map((p:any)=>parseUnsplash(p,topic,query)).filter(Boolean);
}
async function searchPixabay(query:string,topic:string):Promise<PhotoCandidate[]>{
 const url=new URL('https://pixabay.com/api/');
 url.searchParams.set('key',process.env.PIXABAY_API_KEY!);
 url.searchParams.set('q',query);url.searchParams.set('image_type','photo');
 url.searchParams.set('orientation','vertical');url.searchParams.set('per_page',String(PER_PAGE));
 const data=await requestJson(url);
 if(!Array.isArray(data.hits))throw new Error('PHOTO_PROVIDER_RESPONSE_INVALID');
 return data.hits.map((p:any)=>parsePixabay(p,topic,query)).filter(Boolean);
}
async function searchWikimedia(query:string,topic:string):Promise<PhotoCandidate[]>{
 const url=new URL('https://commons.wikimedia.org/w/api.php');
 url.searchParams.set('action','query');url.searchParams.set('format','json');url.searchParams.set('formatversion','2');
 url.searchParams.set('generator','search');
 url.searchParams.set('gsrsearch','filetype:bitmap '+query.slice(0,100));url.searchParams.set('gsrnamespace','6');
 url.searchParams.set('gsrlimit',String(PER_PAGE));url.searchParams.set('prop','imageinfo');
 url.searchParams.set('iiprop','url|size|mime|extmetadata');url.searchParams.set('iiurlwidth','1080');
 const data=await requestJson(url);
 if(!Array.isArray(data.query?.pages))return [];
 return data.query.pages.map((page:any)=>parseCommons(page,topic,query,'wikimedia')).filter(Boolean);
}
async function searchOpenverse(query:string,topic:string):Promise<PhotoCandidate[]>{
 const url=new URL('https://api.openverse.org/v1/images/');
 url.searchParams.set('q',query.slice(0,150));url.searchParams.set('license','cc0,pdm,by');
 url.searchParams.set('license_type','commercial');url.searchParams.set('page_size','20');
 url.searchParams.set('source','wikimedia');url.searchParams.set('mature','false');
 const data=await requestJson(url);
 if(!Array.isArray(data.results))throw new Error('PHOTO_PROVIDER_RESPONSE_INVALID');
 // Openverse is a discovery index, not proof of rights. Batch-verify originals
 // against Commons' current authoritative extmetadata before admitting assets.
 const matches=data.results.filter((p:any)=>
  /^[0-9a-f-]{36}$/i.test(String(p.id))&&secureUrl(p.foreign_landing_url,['commons.wikimedia.org'])&&
  new URL(p.foreign_landing_url).pathname.startsWith('/wiki/File:')).slice(0,8);
 const titleToId=new Map<string,string>();
 for(const p of matches){
  const decoded=decodeURIComponent(new URL(p.foreign_landing_url).pathname.slice('/wiki/'.length));
  titleToId.set(decoded.replaceAll('_',' '),p.id);
 }
 const pages=await commonsByTitles([...titleToId.keys()]);
 return pages.map((page:any)=>{
  const id=titleToId.get(String(page.title||'').replaceAll('_',' '));
  return id?parseCommons(page,topic,query,'openverse',id):null;
 }).filter(Boolean);
}
export async function searchLicensedPhotos(provider:PhotoProvider,query:string,topic:string):Promise<SearchResult>{
 if(!providerConfigured(provider))return {provider,query,photos:[],skipped:'API_KEY_NOT_CONFIGURED'};
 const searches={pexels:searchPexels,unsplash:searchUnsplash,pixabay:searchPixabay,
  wikimedia:searchWikimedia,openverse:searchOpenverse};
 const photos=await searches[provider](query.slice(0,100),topic);
 return {provider,query,photos:photos.slice(0,PER_PAGE)};
}
export async function trackUnsplashDownload(asset:Record<string,any>):Promise<void>{
 if(asset.provider!=='unsplash')return;
 const uri=secureUrl(asset.download_tracking_url,['api.unsplash.com']);
 if(!uri||!providerConfigured('unsplash'))throw new Error('UNSPLASH_DOWNLOAD_TRACKING_UNAVAILABLE');
 const response=await fetch(uri,{headers:{Authorization:'Client-ID '+process.env.UNSPLASH_ACCESS_KEY!,'Accept-Version':'v1'},
  redirect:'error',cache:'no-store',signal:AbortSignal.timeout(SEARCH_TIMEOUT_MS)});
 if(!response.ok)throw new Error('UNSPLASH_DOWNLOAD_TRACKING_FAILED_'+response.status);
}
