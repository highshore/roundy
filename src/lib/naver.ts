import 'server-only';
export type Place = {title:string;address:string;latitude:number;longitude:number};
const clean=(s:unknown)=>String(s||'').replace(/<[^>]*>/g,'').replaceAll('&amp;','&');
const inKorea=(p:Place)=>p.latitude>=33&&p.latitude<=39&&p.longitude>=124&&p.longitude<=132;
const mapCredentials=()=>{const id=process.env.NAVER_MAP_CLIENT_ID,secret=process.env.NAVER_MAP_CLIENT_SECRET;if(!id||!secret)throw new Error('Naver Maps address search is not configured. Add NAVER_MAP_CLIENT_ID and NAVER_MAP_CLIENT_SECRET from Naver Cloud Maps.');return {id,secret};};
const legacySearchCredentials=()=>{const id=process.env.NAVER_SEARCH_CLIENT_ID,secret=process.env.NAVER_SEARCH_CLIENT_SECRET;return id&&secret?{id,secret}:null;};
async function geocode(query:string):Promise<Place[]> {
 const {id,secret}=mapCredentials();
 const r=await fetch('https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode?query='+encodeURIComponent(query),{headers:{'x-ncp-apigw-api-key-id':id,'x-ncp-apigw-api-key':secret,Accept:'application/json'},signal:AbortSignal.timeout(10000),cache:'no-store'});
 if(!r.ok)throw new Error('Naver Maps address lookup is unavailable. Please try again.');
 const data=await r.json();return (data.addresses||[]).map((i:Record<string,unknown>)=>{const road=clean(i.roadAddress),jibun=clean(i.jibunAddress);return {title:road||jibun,address:[road,jibun].filter(Boolean).join(' / '),latitude:Number(i.y),longitude:Number(i.x)};}).filter(inKorea);
}
async function legacyPlaceSearch(query:string):Promise<Place[]> {
 const credentials=legacySearchCredentials();if(!credentials)return [];
 const r=await fetch('https://openapi.naver.com/v1/search/local.json?display=5&query='+encodeURIComponent(query),{headers:{'X-Naver-Client-Id':credentials.id,'X-Naver-Client-Secret':credentials.secret},signal:AbortSignal.timeout(10000),cache:'no-store'});
 if(!r.ok)throw new Error('Naver place search is unavailable. Please try again.');
 const data=await r.json();return (data.items||[]).map((i:Record<string,unknown>)=>({title:clean(i.title),address:clean(i.roadAddress||i.address),latitude:Number(i.mapy)/1e7,longitude:Number(i.mapx)/1e7})).filter(inKorea);
}
export async function searchPlaces(query:string):Promise<Place[]> {
 try{return await geocode(query);}catch(error){if(!legacySearchCredentials())throw error;return legacyPlaceSearch(query);}
}
export async function resolvePlace(venue:string,address:string):Promise<Place|null> {
 if(address){const results=await searchPlaces(address);if(results.length===1)return {...results[0],title:venue||results[0].title};}
 const results=await legacyPlaceSearch([venue,address].filter(Boolean).join(' '));
 return results.length===1?results[0]:null;
}
