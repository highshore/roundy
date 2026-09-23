import type { HTMLAttributes } from 'react';

type BrandProps = HTMLAttributes<HTMLSpanElement> & { compact?: boolean };

export function RoundyBrand({compact=false, className='', ...props}:BrandProps) {
  return <span className={'roundy-brand '+className} {...props}>
    <svg className="roundy-mark" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="15.5" fill="none" stroke="currentColor" strokeWidth="7.5" />
      <circle cx="13.05" cy="13.05" r="6.25" fill="var(--lime)" />
      <circle cx="34.95" cy="34.95" r="6.25" fill="currentColor" />
    </svg>
    {!compact&&<span className="roundy-name">roundy</span>}
  </span>;
}
