import Image from 'next/image';

export function LoadingScreen({ label = 'Loading / 불러오는 중' }: { label?: string }) {
  return <div className="roundy-loading" role="status" aria-live="polite" aria-label={label}>
    <Image src="/images/roundy-loader.webp" alt="" width={72} height={72} unoptimized priority />
    <span className="sr-only">{label}</span>
  </div>;
}
