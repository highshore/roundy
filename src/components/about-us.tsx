import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ArrowUpRight, BadgeCheck, QrCode, LockKeyhole, ShieldCheck } from 'lucide-react';
import { aboutCopy } from '@/lib/about-copy';
import type { Locale } from '@/lib/locale';

const trustIcons = [BadgeCheck, QrCode, LockKeyhole, ShieldCheck];

export function AboutUs({ locale }: { locale: Locale }) {
  const copy = aboutCopy[locale];
  return <article className="about-page" lang={locale}>
    <header className="about-hero">
      <p className="eyebrow">{copy.eyebrow}</p>
      <h1>{copy.title}</h1>
      <figure className="about-cover">
        <div className="about-image-window">
          <Image src="/images/about/conversation.webp" alt={copy.conversationAlt} width={900} height={902} sizes="(max-width: 430px) calc(100vw - 48px), 382px" priority/>
        </div>
        <figcaption>{copy.photoCaption}</figcaption>
      </figure>
    </header>

    <section className="about-story about-reveal" aria-labelledby="our-story">
      <span className="about-accent" aria-hidden="true"/>
      <h2 id="our-story">{copy.storyTitle}</h2>
      <p>{copy.storyBody}</p>
      <span className="about-signature">{copy.storySignature}</span>
    </section>

    <section className="about-community about-reveal" aria-labelledby="our-community">
      <div className="about-community-photo about-image-window">
        <Image src="/images/about/moments.webp" alt={copy.momentsAlt} width={768} height={1024} sizes="(max-width: 430px) calc(100vw - 48px), 382px"/>
      </div>
      <h2 id="our-community">{copy.communityTitle}</h2>
      <p>{copy.communityBody}</p>
      <a className="about-proof" href="https://1cupenglish.com" target="_blank" rel="noopener noreferrer">
        <strong>{copy.proofValue}</strong>
        <span><b>{copy.source}</b><span>{copy.proofLabel}</span></span>
        <ArrowUpRight size={20} aria-hidden="true"/>
      </a>
    </section>

    <section className="about-team about-reveal" aria-labelledby="our-hosts">
      <h2 id="our-hosts">{copy.teamTitle}</h2>
      {(['kyle', 'joey'] as const).map(person => <section className="about-host" key={person}>
        <div className={'about-portrait about-portrait-' + person}>
          <Image src={'/images/about/' + person + '.webp'} alt={copy[person]} width={person === 'kyle' ? 720 : 1024} height={person === 'kyle' ? 720 : 768} sizes="120px"/>
        </div>
        <div className="about-host-copy">
          <h3>{copy[person]}</h3>
          <p className="about-role">{copy.role}</p>
          <p className="about-background">{copy[person === 'kyle' ? 'kyleBackground' : 'joeyBackground']}</p>
        </div>
      </section>)}
    </section>

    <section className="about-trust about-reveal" aria-labelledby="our-trust">
      <h2 id="our-trust">{copy.trustTitle}</h2>
      <ul>{copy.trust.map((label, index) => {
        const Icon = trustIcons[index];
        return <li key={label}><Icon size={20} strokeWidth={1.5} aria-hidden="true"/><span>{label}</span></li>;
      })}</ul>
      <Link className="about-safety" href="/how-it-works">{copy.safety}<ArrowRight size={16} aria-hidden="true"/></Link>
    </section>
    <Link className="button" href="/events">{copy.events}<ArrowRight size={18} aria-hidden="true"/></Link>
  </article>;
}
