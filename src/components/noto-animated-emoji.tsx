'use client';

import { useEffect, useState } from 'react';

type NotoAnimatedEmojiProps = {
  codepoint: string;
  fallback: string;
  label?: string;
  size?: number;
  className?: string;
};

export function NotoAnimatedEmoji({
  codepoint,
  fallback,
  label,
  size = 72,
  className = '',
}: NotoAnimatedEmojiProps) {
  const [failed, setFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);

  const classes = ['noto-animated-emoji', className].filter(Boolean).join(' ');
  const style = { width: size, height: size, fontSize: Math.round(size * 0.72) };

  return (
    <span
      className={classes}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {failed || reducedMotion ? (
        <span className="noto-animated-emoji-fallback" aria-hidden="true">{fallback}</span>
      ) : (
        <picture>
          <source
            srcSet={`https://fonts.gstatic.com/s/e/notoemoji/latest/${codepoint.toLowerCase()}/512.webp`}
            type="image/webp"
          />
          <img
            src={`https://fonts.gstatic.com/s/e/notoemoji/latest/${codepoint.toLowerCase()}/512.gif`}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
        </picture>
      )}
    </span>
  );
}
