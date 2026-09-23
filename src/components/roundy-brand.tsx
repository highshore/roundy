import type { HTMLAttributes } from 'react';

type BrandProps = HTMLAttributes<HTMLSpanElement> & { compact?: boolean };

export function RoundyBrand({compact=false, className='', ...props}:BrandProps) {
  return <span className={'roundy-brand '+className} {...props}>
    <svg className="roundy-mark" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M13.05 13.05A15.5 15.5 0 1 1 34.95 34.95" fill="none" stroke="currentColor" strokeWidth="7.5" strokeLinecap="round" />
      <circle cx="13.05" cy="13.05" r="6.25" fill="var(--lime)" />
      <circle cx="34.95" cy="34.95" r="6.25" fill="currentColor" />
    </svg>
    {!compact&&<span className="roundy-name">roundy</span>}
  </span>;
}
