import 'server-only';
export type Place = {title:string;address:string;latitude:number;longitude:number};
const clean=(s:unknown)=>String(s||'').replace(/<[^>]*>/g,'').replaceAll('&amp;','&');
export async function searchPlaces(query:string):Promise<Place[]> {
 const id=process.env.NAVER_SEARCH_CLIENT_ID,secret=process.env.NAVER_SEARCH_CLIENT_SECRET;
 if(!id||!secret)throw new Error('Naver place search is not configured. Add NAVER_SEARCH_CLIENT_ID and NAVER_SEARCH_CLIENT_SECRET.');
 const r=await fetch('https://openapi.naver.com/v1/search/local.json?display=5&query='+encodeURIComponent(query),{headers:{'X-Naver-Client-Id':id,'X-Naver-Client-Secret':secret},signal:AbortSignal.timeout(10000),cache:'no-store'});
 if(!r.ok)throw new Error('Naver search is unavailable. Please try again.');
 const data=await r.json();return (data.items||[]).map((i:Record<string,unknown>)=>({title:clean(i.title),address:clean(i.roadAddress||i.address),latitude:Number(i.mapy)/1e7,longitude:Number(i.mapx)/1e7})).filter((p:Place)=>p.latitude>=33&&p.latitude<=39&&p.longitude>=124&&p.longitude<=132);
}
export async function resolvePlace(venue:string,address:string):Promise<Place|null> {
 const id=process.env.NAVER_MAP_CLIENT_ID||process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID,secret=process.env.NAVER_MAP_CLIENT_SECRET;
 if(address&&id&&secret){
  const r=await fetch('https://maps.apigw.ntruss.com/map-geocode/v2/geocode?query='+encodeURIComponent(address),{headers:{'x-ncp-apigw-api-key-id':id,'x-ncp-apigw-api-key':secret},signal:AbortSignal.timeout(10000),cache:'no-store'});
  if(!r.ok)throw new Error('Naver address lookup is unavailable. Please try again.');
  const data=await r.json();if(data.addresses?.length===1){const p=data.addresses[0];return {title:venue,address:p.roadAddress||p.jibunAddress,latitude:Number(p.y),longitude:Number(p.x)};}
 }
 const results=await searchPlaces([venue,address].filter(Boolean).join(' '));
 // Ambiguous place names must be selected explicitly, never silently pinned to the first match.
 return results.length===1?results[0]:null;
}
