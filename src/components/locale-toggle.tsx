'use client';

import type { Locale } from '@/lib/locale';

export function LocaleToggle({ locale, onChange }: { locale: Locale; onChange: (locale: Locale) => void }) {
  const nextLocale = locale === 'en' ? 'ko' : 'en';
  const currentLabel = locale === 'en' ? 'English' : '한국어';
  const nextLabel = nextLocale === 'en' ? 'English' : '한국어';

  return <div className="locale-toggle">
    <button type="button" aria-label={`Language: ${currentLabel}. Switch to ${nextLabel}.`} title={`Switch to ${nextLabel}`} onClick={() => onChange(nextLocale)}>
      <img src={locale === 'en' ? '/images/flags/i18n_en.jpg' : '/images/flags/i18n_ko.jpg'} alt="" aria-hidden="true" />
    </button>
  </div>;
}
