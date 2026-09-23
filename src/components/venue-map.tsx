'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, MapPin } from 'lucide-react';

type MapInstance = { destroy(): void };
type NaverMaps = {
  LatLng: new (latitude: number, longitude: number) => object;
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapInstance;
  Marker: new (options: Record<string, unknown>) => { setMap(map: MapInstance | null): void };
};
declare global {
  interface Window { naver?: { maps: NaverMaps }; navermap_authFailure?: () => void }
}

export function VenueMap({ venue, address, latitude, longitude }: {
  venue: string; address: string; latitude?: number | null; longitude?: number | null;
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

  return <section className="venue-map" aria-label="Venue Location">
    <div className="venue-map-heading"><MapPin size={21}/><div><h3>Find Your Way Here</h3><p>{venue}</p></div></div>
    {key && valid && !failed ? <>
      <Script id="naver-maps" src={'https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=' + encodeURIComponent(key)} strategy="afterInteractive" onReady={() => setReady(true)} onError={() => setFailed(true)}/>
      <div ref={container} className="naver-map-canvas" aria-label={'Naver map showing ' + venue}/>
      {!loaded && <p className="note" role="status">Loading Naver Maps…</p>}
    </> : <p className="map-unavailable">{!valid ? 'The exact venue pin will appear once the location is confirmed.' : 'The interactive map is unavailable. Open Naver Maps for directions.'}</p>}
    <div className="venue-map-footer"><p>{address}</p><a href={'https://map.naver.com/p/search/' + encodeURIComponent(address)} target="_blank" rel="noopener noreferrer">Open Naver Maps <ArrowUpRight size={17}/><span className="sr-only"> (opens in a new tab)</span></a></div>
  </section>;
}
