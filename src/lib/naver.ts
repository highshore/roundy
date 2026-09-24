import 'server-only';
export type Place = {title:string;address:string;latitude:number;longitude:number};
const clean=(s:unknown)=>String(s||'').replace(/<[^>]*>/g,'').replaceAll('&amp;','&');
const inKorea=(p:Place)=>p.latitude>=33&&p.latitude<=39&&p.longitude>=124&&p.longitude<=132;
const apiHubCredentials=()=>{const id=process.env.NAVER_API_HUB_CLIENT_ID,secret=process.env.NAVER_API_HUB_CLIENT_SECRET;if(!id||!secret)return null;return {id,secret};};
const mapCredentials=()=>{const id=process.env.NAVER_MAP_CLIENT_ID,secret=process.env.NAVER_MAP_CLIENT_SECRET;if(!id||!secret)throw new Error('Naver location search is not configured. Add NAVER_API_HUB_CLIENT_ID and NAVER_API_HUB_CLIENT_SECRET from NAVER API HUB.');return {id,secret};};
async function geocode(query:string):Promise<Place[]> {
 const {id,secret}=mapCredentials();
 const r=await fetch('https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode?query='+encodeURIComponent(query),{headers:{'x-ncp-apigw-api-key-id':id,'x-ncp-apigw-api-key':secret,Accept:'application/json'},signal:AbortSignal.timeout(10000),cache:'no-store'});
 if(!r.ok)throw new Error('Naver Maps address lookup is unavailable. Please try again.');
 const data=await r.json();return (data.addresses||[]).map((i:Record<string,unknown>)=>{const road=clean(i.roadAddress),jibun=clean(i.jibunAddress);return {title:road||jibun,address:[road,jibun].filter(Boolean).join(' / '),latitude:Number(i.y),longitude:Number(i.x)};}).filter(inKorea);
}
async function apiHubPlaceSearch(query:string):Promise<Place[]> {
 const credentials=apiHubCredentials();if(!credentials)return [];
 const r=await fetch('https://naverapihub.apigw.ntruss.com/search/v1/local?display=5&format=json&query='+encodeURIComponent(query),{headers:{'X-NCP-APIGW-API-KEY-ID':credentials.id,'X-NCP-APIGW-API-KEY':credentials.secret},signal:AbortSignal.timeout(10000),cache:'no-store'});
 if(!r.ok)throw new Error('Naver place search is unavailable. Please try again.');
 const data=await r.json();return (data.items||[]).map((i:Record<string,unknown>)=>({title:clean(i.title),address:clean(i.roadAddress||i.address),latitude:Number(i.mapy)/1e7,longitude:Number(i.mapx)/1e7})).filter(inKorea);
}
export async function searchPlaces(query:string):Promise<Place[]> {
 const hubResults=await apiHubPlaceSearch(query);if(hubResults.length)return hubResults;
 return geocode(query);
}
export async function resolvePlace(venue:string,address:string):Promise<Place|null> {
 const hubResults=await apiHubPlaceSearch([venue,address].filter(Boolean).join(' '));
 if(hubResults.length===1)return hubResults[0];
 if(address){const addresses=await geocode(address);if(addresses.length===1)return {...addresses[0],title:venue||addresses[0].title};}
 return null;
}
