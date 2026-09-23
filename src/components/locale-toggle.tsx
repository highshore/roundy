'use client';

import type { Locale } from '@/lib/locale';

export function LocaleToggle({ locale, onChange }: { locale: Locale; onChange: (locale: Locale) => void }) {
  return <div className="locale-toggle" role="group" aria-label="Language">
    <button type="button" aria-label="English" title="English" aria-pressed={locale === 'en'} onClick={() => onChange('en')}>
      <span aria-hidden="true">🇬🇧</span>
    </button>
    <button type="button" aria-label="한국어" title="한국어" aria-pressed={locale === 'ko'} onClick={() => onChange('ko')}>
      <span aria-hidden="true">🇰🇷</span>
    </button>
  </div>;
}
