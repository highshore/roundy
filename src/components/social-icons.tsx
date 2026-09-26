import type { SVGProps } from 'react';
type Props=SVGProps<SVGSVGElement>&{size?:number};
export function Instagram({size=20,...props}:Props){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>;}
export function Linkedin({size=20,...props}:Props){return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...props}><path d="M5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM3.5 9h3v12h-3V9Zm5.5 0h3v1.6c.8-1.2 2-1.9 3.6-1.9 3.1 0 4.9 1.8 4.9 5.3v7h-3v-6.5c0-2-.7-3-2.3-3-1.8 0-3.2 1.2-3.2 3.3V21H9V9Z"/></svg>;}
