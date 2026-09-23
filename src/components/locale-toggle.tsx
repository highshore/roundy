'use client';

import type { Locale } from '@/lib/locale';

export function LocaleToggle({ locale, onChange }: { locale: Locale; onChange: (locale: Locale) => void }) {
  return <div className="locale-toggle" role="group" aria-label="Language">
    <button type="button" aria-pressed={locale === 'en'} onClick={() => onChange('en')}>EN</button>
    <button type="button" aria-pressed={locale === 'ko'} onClick={() => onChange('ko')}>한국어</button>
  </div>;
}
