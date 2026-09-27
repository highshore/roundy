import Link from 'next/link';
import Image from 'next/image';
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
    <figure className="about-moments">
      <div className="about-photo-collage">
        <Image className="about-conversation" src="/images/about/conversation.webp" alt={locale === 'ko' ? '테이블에 둘러앉아 대화하는 영어 한잔 참가자들' : 'One Cup English participants talking around a table'} width={900} height={902} sizes="(max-width: 430px) 75vw, 290px" priority/>
        <Image className="about-outing" src="/images/about/moments.webp" alt={locale === 'ko' ? '벚꽃 아래에서 함께한 디저트' : 'Desserts shared under cherry blossoms'} width={768} height={1024} sizes="160px"/>
      </div>
      <figcaption>{copy.photoCaption}</figcaption>
    </figure>
    <section className="about-story" aria-labelledby="our-story">
      <p className="eyebrow">{copy.storyLabel}</p>
      <h2 id="our-story">{copy.storyTitle}</h2>
      {copy.storyBody.split('\n\n').map(paragraph => <p key={paragraph}>{paragraph}</p>)}
      <div className="about-origin-contrast">
        {copy.storyContrast.map(([label, value]) => <div className="about-origin-row" key={label}>
          <span className="about-origin-key">{label}</span>
          <span className="about-origin-value">{value}</span>
        </div>)}
      </div>
    </section>
    <section className="about-origin" aria-labelledby="origin-lesson">
      <div className="about-section-heading">
        <p className="eyebrow">{copy.originLabel}</p>
        <h2 id="origin-lesson">{copy.originTitle}</h2>
        <p className="about-origin-copy">{copy.originBody}</p>
      </div>
      {copy.originSteps.map(([label, title, body]) => <section className="info-card about-origin-step" key={label}>
        <p className="eyebrow">{label}</p>
        <h3>{title}</h3>
        <p className="card-copy">{body}</p>
      </section>)}
    </section>
    <aside className="about-proof" aria-label={copy.proofLabel}>
      <div className="about-proof-number">{copy.proofValue}</div>
      <p className="eyebrow">{copy.proofLabel}</p>
      <p className="about-proof-copy">{copy.proofBody}</p>
      <a href="https://1cupenglish.com" target="_blank" rel="noopener noreferrer">{copy.source} ↗</a>
    </aside>
    <section className="about-section" aria-labelledby="our-hosts">
      <div className="about-section-heading"><p className="eyebrow">{copy.teamLabel}</p><h2 id="our-hosts">{copy.teamTitle}</h2></div>
      {(['kyle', 'joey'] as const).map(person => <section className="info-card about-host" key={person}>
        <div className={'about-portrait about-portrait-' + person}><Image src={'/images/about/' + person + '.webp'} alt={copy[person]} width={person === 'kyle' ? 720 : 1024} height={person === 'kyle' ? 720 : 768} sizes="(max-width: 430px) 100vw, 382px"/></div>
        <div className="about-host-copy">
          <p className="eyebrow">{copy[person === 'kyle' ? 'kyleLabel' : 'joeyLabel']}</p>
          <h3>{copy[person]}</h3>
          <p className="about-background">{copy[person === 'kyle' ? 'kyleBackground' : 'joeyBackground']}</p>
          <p className="card-copy">{copy[person === 'kyle' ? 'kyleBody' : 'joeyBody']}</p>
        </div>
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
