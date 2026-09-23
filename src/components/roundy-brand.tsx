import type { HTMLAttributes } from 'react';

type BrandProps = HTMLAttributes<HTMLSpanElement> & { compact?: boolean };

export function RoundyBrand({compact=false, className='', ...props}:BrandProps) {
  return <span className={'roundy-brand '+className} {...props}>
    <svg className="roundy-mark" viewBox="0 0 48 48" aria-hidden="true">
      <path
        d="M 11.52 12.48 A 17 17 0 0 0 37.44 12.48"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="5"
      />
      <path
        d="M 11.52 12.48 A 17 17 0 0 0 37.44 33.6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="5"
      />
      <circle cx="11.52" cy="12.48" r="4.32" fill="var(--lime)" />
      <circle cx="37.44" cy="33.6" r="4.32" fill="currentColor" />
    </svg>
    {!compact&&<span className="roundy-name">roundy</span>}
  </span>;
}
