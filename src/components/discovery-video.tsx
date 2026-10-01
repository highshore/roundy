'use client';

import { useEffect, useRef } from 'react';

export function DiscoveryVideo({ active }: { active: boolean }) {
 const videoRef = useRef<HTMLVideoElement>(null);

 useEffect(() => {
  const video = videoRef.current;
  if (!video) return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const syncMotion = () => {
   if (!active || motion.matches) video.pause();
   else void video.play().catch(() => {});
  };
  syncMotion();
  motion.addEventListener('change', syncMotion);
  return () => motion.removeEventListener('change', syncMotion);
 }, [active]);

 return <video ref={videoRef} className="discovery-hero-video" muted loop playsInline preload="metadata"
  poster="/images/discovery-hero-v2-poster.webp" aria-hidden="true">
  <source src="/videos/discovery-hero-v2.mp4" type="video/mp4"/>
 </video>;
}
