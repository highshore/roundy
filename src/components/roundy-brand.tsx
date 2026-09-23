import type { HTMLAttributes } from 'react';

type BrandProps = HTMLAttributes<HTMLSpanElement> & { compact?: boolean };

export function RoundyBrand({compact=false, className='', ...props}:BrandProps) {
  return <span className={'roundy-brand '+className} {...props}>
    <svg className="roundy-mark" viewBox="0 0 48 48" aria-hidden="true">
      <path
        d="M 33.546 14.454 A 13.5 13.5 0 1 0 33.546 33.546"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="4.8"
      />
      <circle cx="14.454" cy="14.454" r="4.32" fill="var(--lime)" />
      <circle cx="33.546" cy="33.546" r="4.32" fill="currentColor" />
    </svg>
    {!compact&&<span className="roundy-name">roundy</span>}
  </span>;
}
