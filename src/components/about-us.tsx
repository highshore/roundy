import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { aboutCopy } from '@/lib/about-copy';
import type { Locale } from '@/lib/locale';

export function AboutUs({ locale }: { locale: Locale }) {
  const copy = aboutCopy[locale];
  return <article className="about-page" lang={locale}>
    <header className="intro">
      <p className="eyebrow">{copy.eyebrow}</p>
      <h1>{copy.title}</h1>
      <p className="description">{copy.intro}</p>
    </header>
    <section className="about-story" aria-labelledby="our-story">
      <p className="eyebrow">{copy.storyLabel}</p>
      <h2 id="our-story">{copy.storyTitle}</h2>
      {copy.storyBody.split('\n\n').map(paragraph => <p key={paragraph}>{paragraph}</p>)}
      <a href="https://1cupenglish.com" target="_blank" rel="noopener noreferrer">{copy.source} ↗</a>
    </section>
    <section className="about-section" aria-labelledby="our-hosts">
      <div className="about-section-heading"><p className="eyebrow">{copy.teamLabel}</p><h2 id="our-hosts">{copy.teamTitle}</h2></div>
      {(['kyle', 'joey'] as const).map(person => <section className="info-card" key={person}>
        <p className="eyebrow">{copy[person === 'kyle' ? 'kyleLabel' : 'joeyLabel']}</p>
        <h3>{copy[person]}</h3>
        <p className="card-copy">{copy[person === 'kyle' ? 'kyleBody' : 'joeyBody']}</p>
      </section>)}
    </section>
    <section className="about-section" aria-labelledby="our-principles">
      <div className="about-section-heading"><p className="eyebrow">{copy.principlesLabel}</p><h2 id="our-principles">{copy.principlesTitle}</h2></div>
      {copy.principles.map(([label, title, body]) => <section className="info-card" key={label}>
        <p className="eyebrow">{label}</p><h3>{title}</h3><p className="card-copy">{body}</p>
      </section>)}
    </section>
    <section className="about-section" aria-labelledby="our-trust">
      <div className="about-section-heading"><p className="eyebrow">{copy.trustLabel}</p><h2 id="our-trust">{copy.trustTitle}</h2></div>
      {copy.trust.map(([label, title, body]) => <section className="info-card" key={label}>
        <p className="eyebrow">{label}</p><h3>{title}</h3><p className="card-copy">{body}</p>
      </section>)}
    </section>
    <Link className="button secondary" href="/how-it-works">{copy.safety}<ArrowRight size={18} aria-hidden="true"/></Link>
    <Link className="button" href="/events">{copy.events}<ArrowRight size={18} aria-hidden="true"/></Link>
  </article>;
}
