'use client';

import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { tr, type Locale } from '@/lib/locale';

const AUTO_ADVANCE_MS = 4500;
const SWIPE_THRESHOLD_PX = 42;

export function EventImageCarousel({
  coverImage,
  images,
  title,
  locale,
}: {
  coverImage?: string | null;
  images?: string[] | null;
  title: string;
  locale: Locale;
}) {
  const slides = [coverImage, ...(images ?? [])]
    .filter((src): src is string => Boolean(src))
    .filter((src, index, all) => all.indexOf(src) === index);

  if (slides.length === 0) slides.push('/images/yeouido.webp');

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const activeIndex = index % slides.length;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    if (slides.length < 2 || paused || reduceMotion) return;
    const timer = window.setInterval(() => {
      setIndex(current => (current + 1) % slides.length);
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [slides.length, paused, reduceMotion]);

  const move = (direction: number) => {
    setIndex(current => (current + direction + slides.length) % slides.length);
  };

  return (
    <div
      className="event-image-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label={tr(locale, `${title} photos`, `${title} 사진`)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={event => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={event => {
        if (touchStartX.current === null || slides.length < 2) return;
        const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
        const delta = endX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
        move(delta < 0 ? 1 : -1);
      }}
    >
      <div className="detail-photo event-image-carousel-viewport">
        <Image
          key={slides[activeIndex]}
          className="event-image-carousel-image"
          src={slides[activeIndex]}
          alt={title}
          fill
          sizes="(max-width: 640px) 100vw, 800px"
          priority={activeIndex === 0}
        />
      </div>

      {slides.length > 1 && (
        <>
          <button
            className="event-image-carousel-nav previous"
            type="button"
            onClick={() => move(-1)}
            aria-label={tr(locale, 'Previous photo', '이전 사진')}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            className="event-image-carousel-nav next"
            type="button"
            onClick={() => move(1)}
            aria-label={tr(locale, 'Next photo', '다음 사진')}
          >
            <ChevronRight size={20} />
          </button>

          <div
            className="event-image-carousel-dots"
            aria-label={tr(locale, 'Photo selection', '사진 선택')}
          >
            {slides.map((_, dotIndex) => (
              <button
                key={dotIndex}
                type="button"
                className={dotIndex === activeIndex ? 'active' : ''}
                aria-label={tr(
                  locale,
                  `Show photo ${dotIndex + 1} of ${slides.length}`,
                  `${slides.length}장 중 ${dotIndex + 1}번째 사진 보기`,
                )}
                aria-current={dotIndex === activeIndex ? 'true' : undefined}
                onClick={() => setIndex(dotIndex)}
              />
            ))}
          </div>

          <span className="event-image-carousel-count" aria-hidden="true">
            {activeIndex + 1} / {slides.length}
          </span>
        </>
      )}
    </div>
  );
}
