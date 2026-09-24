'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { tr, type Locale } from '@/lib/locale';

type MapInstance = { destroy(): void };
type NaverMaps = {
  LatLng: new (latitude: number, longitude: number) => object;
  Point: new (x: number, y: number) => object;
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapInstance;
  Marker: new (options: Record<string, unknown>) => { setMap(map: MapInstance | null): void };
  Event?: { addListener(target: object, event: string, listener: () => void): unknown };
};
declare global { interface Window { naver?: { maps: NaverMaps }; navermap_authFailure?: () => void } }

const markerHtml='<img aria-hidden="true" src="/images/roundy-loader.webp" style="display:block;width:48px;height:48px;filter:drop-shadow(0 5px 10px rgba(0,0,0,.25))" />';

export function VenueMap({ venue, address, latitude, longitude, locale }: { venue: string; address: string; latitude?: number | null; longitude?: number | null; locale: Locale }) {
  const key = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const valid = typeof latitude === 'number' && typeof longitude === 'number' && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  const mapUrl='https://map.naver.com/v5/search/'+encodeURIComponent(venue||address);

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
      const openPlace=()=>window.open(mapUrl,'_blank','noopener');
      map = new maps.Map(container.current, { center, zoom: 16, zoomControl: false, scrollWheel: false, draggable: false, disableDoubleClickZoom: true, keyboardShortcuts: false, pinchZoom: false });
      marker = new maps.Marker({ position: center, map, title: venue, icon:{ content:markerHtml, anchor:new maps.Point(24,24) } });
      if(maps.Event){maps.Event.addListener(map,'click',openPlace);maps.Event.addListener(marker,'click',openPlace);}
    } catch { setFailed(true); }
    return () => { marker?.setMap(null); map?.destroy(); };
  }, [ready, valid, latitude, longitude, venue, key, failed, mapUrl]);

  return <section className="venue-map" aria-label={tr(locale, 'Venue Location', '행사 장소')}>
    {key && valid && !failed ? <>
      <Script id="naver-maps" src={'https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=' + encodeURIComponent(key)} strategy="afterInteractive" onReady={() => setReady(true)} onError={() => setFailed(true)}/>
      <div ref={container} className="naver-map-canvas" role="link" tabIndex={0} aria-label={tr(locale, 'Open Naver map for ', '네이버 지도에서 보기: ') + venue} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();window.open(mapUrl,'_blank','noopener');}}}/>
    </> : <a className="map-unavailable" href={mapUrl} target="_blank" rel="noopener noreferrer" aria-label={tr(locale, 'Open Naver map for ', '네이버 지도에서 보기: ') + venue}><img className="map-fallback-marker" src="/images/roundy-loader.webp" alt="" /></a>}
  </section>;
}
