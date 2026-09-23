'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, MapPin } from 'lucide-react';
import { tr, type Locale } from '@/lib/locale';

type MapInstance = { destroy(): void };
type NaverMaps = {
  LatLng: new (latitude: number, longitude: number) => object;
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapInstance;
  Marker: new (options: Record<string, unknown>) => { setMap(map: MapInstance | null): void };
};
declare global {
  interface Window { naver?: { maps: NaverMaps }; navermap_authFailure?: () => void }
}

export function VenueMap({ venue, address, latitude, longitude, locale }: {
  venue: string; address: string; latitude?: number | null; longitude?: number | null; locale: Locale;
}) {
  const key = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const valid = typeof latitude === 'number' && typeof longitude === 'number'
    && Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;

  useEffect(() => {
    if (!key || !valid) return;
    const previous = window.navermap_authFailure;
    window.navermap_authFailure = () => setFailed(true);
    const timer = window.setTimeout(() => { if (!window.naver?.maps) setFailed(true); }, 15000);
    return () => { window.clearTimeout(timer); window.navermap_authFailure = previous; };
  }, [key, valid]);

  useEffect(() => {
    if (!ready || !container.current || !valid || !key || failed) return;
    const maps = window.naver?.maps;
    if (!maps) { setFailed(true); return; }
    let map: MapInstance | undefined;
    let marker: { setMap(map: MapInstance | null): void } | undefined;
    try {
      const center = new maps.LatLng(latitude, longitude);
      map = new maps.Map(container.current, { center, zoom: 16, zoomControl: true, scrollWheel: false });
      marker = new maps.Marker({ position: center, map, title: venue });
      setLoaded(true);
    } catch { setFailed(true); }
    return () => { marker?.setMap(null); map?.destroy(); };
  }, [ready, valid, latitude, longitude, venue, key, failed]);

  return <section className="venue-map" aria-label={tr(locale, 'Venue Location', '행사 장소')}>
    <div className="venue-map-heading"><MapPin size={21}/><div><h3>{tr(locale, 'Find Your Way Here', '행사 장소 찾아가기')}</h3><p>{venue}</p></div></div>
    {key && valid && !failed ? <>
      <Script id="naver-maps" src={'https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=' + encodeURIComponent(key)} strategy="afterInteractive" onReady={() => setReady(true)} onError={() => setFailed(true)}/>
      <div ref={container} className="naver-map-canvas" aria-label={tr(locale, 'Naver map showing ', '네이버 지도: ') + venue}/>
      {!loaded && <p className="note" role="status">{tr(locale, 'Loading Naver Maps…', '네이버 지도를 불러오는 중…')}</p>}
    </> : <p className="map-unavailable">{!valid ? tr(locale, 'The exact venue pin will appear once the location is confirmed.', '정확한 장소가 확정되면 지도 핀이 표시돼요.') : tr(locale, 'The interactive map is unavailable. Open Naver Maps for directions.', '인터랙티브 지도를 불러올 수 없어요. 네이버 지도에서 길찾기를 열어 보세요.')}</p>}
    <div className="venue-map-footer"><p>{address}</p><a href={'https://map.naver.com/p/search/' + encodeURIComponent(address)} target="_blank" rel="noopener noreferrer">{tr(locale, 'Open Naver Maps', '네이버 지도 열기')} <ArrowUpRight size={17}/><span className="sr-only">{tr(locale, ' (opens in a new tab)', ' (새 탭에서 열림)')}</span></a></div>
  </section>;
}
