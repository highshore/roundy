'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { tr, type Locale } from '@/lib/locale';

export function DiscoveryVideo({ locale }: { locale: Locale }) {
 const videoRef = useRef<HTMLVideoElement>(null);
 const [playing, setPlaying] = useState(false);

 useEffect(() => {
  const video = videoRef.current;
  if (!video) return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const syncMotion = () => {
   if (motion.matches) video.pause();
   else void video.play().catch(() => setPlaying(false));
  };
  syncMotion();
  motion.addEventListener('change', syncMotion);
  return () => motion.removeEventListener('change', syncMotion);
 }, []);

 const togglePlayback = () => {
  const video = videoRef.current;
  if (!video) return;
  if (video.paused) void video.play().catch(() => setPlaying(false));
  else video.pause();
 };

 return <>
  <video ref={videoRef} className="discovery-hero-video" muted loop playsInline preload="metadata"
   poster="/images/discovery-hero-poster.webp" aria-hidden="true"
   onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}>
   <source src="/videos/discovery-hero.mp4" type="video/mp4"/>
  </video>
  <button className="discovery-hero-playback" type="button" onClick={togglePlayback}
   aria-label={playing ? tr(locale, 'Pause background video', '배경 영상 일시 정지') : tr(locale, 'Play background video', '배경 영상 재생')}>
   {playing ? <Pause size={16} aria-hidden="true"/> : <Play size={16} aria-hidden="true"/>}
  </button>
 </>;
}
