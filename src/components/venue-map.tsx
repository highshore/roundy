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

const markerHtml=`<span aria-hidden="true" style="display:grid;place-items:center;width:56px;height:56px;border-radius:50%;background:#20211f;border:3px solid #fffefa;box-shadow:0 7px 18px rgba(0,0,0,.28)"><svg viewBox="0 0 96 96" width="34" height="34" xmlns="http://www.w3.org/2000/svg"><path d="M22 40C28.6274 40 34 34.6274 34 28C34 21.3726 28.6274 16 22 16C15.3726 16 10 21.3726 10 28C10 34.6274 15.3726 40 22 40Z" fill="#fff"/><path d="M67 85C73.6274 85 79 79.6274 79 73C79 66.3726 73.6274 61 67 61C60.3726 61 55 66.3726 55 73C55 79.6274 60.3726 85 67 85Z" fill="#fff"/><path d="M11.4828 47C10.8635 52.1331 11.3613 57.252 12.9415 62.0016C14.5218 66.7512 17.1467 71.0176 20.6341 74.5051C24.1216 77.9925 28.388 80.6174 33.1376 82.1977C37.8872 83.7779 43.0061 84.2757 48.1392 83.6564" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round"/><path d="M76.6564 54.8333C77.2756 49.7002 76.7779 44.5813 75.1976 39.8317C73.6174 35.0821 70.9925 30.8157 67.505 27.3282C64.0176 23.8408 59.7511 21.2159 55.0016 19.6356C50.252 18.0554 45.1331 17.5576 40 18.1769" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round"/></svg></span>`;

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
      marker = new maps.Marker({ position: center, map, title: venue, icon:{ content:markerHtml, anchor:new maps.Point(28,28) } });
      if(maps.Event){maps.Event.addListener(map,'click',openPlace);maps.Event.addListener(marker,'click',openPlace);}
    } catch { setFailed(true); }
    return () => { marker?.setMap(null); map?.destroy(); };
  }, [ready, valid, latitude, longitude, venue, key, failed, mapUrl]);

  return <section className="venue-map" aria-label={tr(locale, 'Venue Location', '행사 장소')}>
    {key && valid && !failed ? <>
      <Script id="naver-maps" src={'https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=' + encodeURIComponent(key)} strategy="afterInteractive" onReady={() => setReady(true)} onError={() => setFailed(true)}/>
      <div ref={container} className="naver-map-canvas" role="link" tabIndex={0} aria-label={tr(locale, 'Open Naver map for ', '네이버 지도에서 보기: ') + venue} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();window.open(mapUrl,'_blank','noopener');}}}/>
    </> : <a className="map-unavailable" href={mapUrl} target="_blank" rel="noopener noreferrer" aria-label={tr(locale, 'Open Naver map for ', '네이버 지도에서 보기: ') + venue}><span className="map-fallback-marker map-marker-logo" aria-hidden="true"><svg viewBox="0 0 96 96"><path d="M22 40C28.6274 40 34 34.6274 34 28C34 21.3726 28.6274 16 22 16C15.3726 16 10 21.3726 10 28C10 34.6274 15.3726 40 22 40Z"/><path d="M67 85C73.6274 85 79 79.6274 79 73C79 66.3726 73.6274 61 67 61C60.3726 61 55 66.3726 55 73C55 79.6274 60.3726 85 67 85Z"/><path d="M11.4828 47C10.8635 52.1331 11.3613 57.252 12.9415 62.0016C14.5218 66.7512 17.1467 71.0176 20.6341 74.5051C24.1216 77.9925 28.388 80.6174 33.1376 82.1977C37.8872 83.7779 43.0061 84.2757 48.1392 83.6564" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round"/><path d="M76.6564 54.8333C77.2756 49.7002 76.7779 44.5813 75.1976 39.8317C73.6174 35.0821 70.9925 30.8157 67.505 27.3282C64.0176 23.8408 59.7511 21.2159 55.0016 19.6356C50.252 18.0554 45.1331 17.5576 40 18.1769" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round"/></svg></span></a>}
  </section>;
}
