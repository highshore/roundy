'use client';

import { Heading } from '@/components/heading';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarDays, Headphones, LayoutDashboard, Megaphone, TicketPercent, UsersRound } from 'lucide-react';
import { AdminReports } from './admin-reports';
import { AdminCustomerSupport } from './admin-customer-support';
import { AdminMarketing } from './admin-marketing';
import { AdminEvents } from './admin-events';
import { AdminMembers } from './admin-members';
import { AdminPromoCodes } from './admin-promo-codes';
import { RoundyBrand } from './roundy-brand';
import { LocaleToggle } from './locale-toggle';
import { LoadingScreen } from './loading-screen';
import { dateLabelForLocale, timeLabelForLocale, tr, type Locale } from '@/lib/locale';
import type { Event } from '@/lib/data';

type Overview = { members: number; pending: number; upcoming: number; drafts: number; events: Event[] };
function AdminOverview({ locale }: { locale: Locale }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetch('/api/admin/overview').then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load overview');
      if (active) setData(result);
    }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, []);
  if (error) return <p className="admin-error" role="alert">{locale==='ko'?tr(locale,'Could not load overview','개요를 불러오지 못했어요'):error}</p>;
  if (!data) return <LoadingScreen />;
  return <section className="admin-panel">
    <div className="admin-heading"><p className="admin-kicker">Roundy Admin</p><Heading level={1}>{tr(locale, 'Overview', '개요')}</Heading><p>{tr(locale, 'Your members and upcoming events, at a glance.', '회원과 예정된 이벤트를 한눈에 확인하세요.')}</p></div>
    <div className="admin-metrics">{[
      [tr(locale, 'Members', '전체 회원'), data.members, '/admin/members'],
      [tr(locale, 'Review needed', '승인 대기'), data.pending, '/admin/members?status=Reviewing'],
      [tr(locale, 'Upcoming events', '예정 이벤트'), data.upcoming, '/admin/events'],
      [tr(locale, 'Drafts', '초안'), data.drafts, '/admin/events?status=draft'],
    ].map(([label, count, href]) => <Link className="admin-metric" href={String(href)} key={String(label)}><span>{label}</span><strong>{count}</strong><ArrowUpRight size={18} /></Link>)}</div>
    <div className="admin-heading"><Heading level={2}>{tr(locale, 'Needs attention', '확인이 필요한 항목')}</Heading></div>
    <Link className="admin-attention" href="/admin/members?status=Reviewing"><span>{data.pending ? tr(locale, `${data.pending} profiles awaiting review`, `승인 대기 중인 프로필 ${data.pending}개`) : tr(locale, 'All profiles reviewed', '모든 프로필을 검토했어요')}</span><ArrowUpRight size={20}/></Link>
    <div className="admin-section-title"><Heading level={2}>{tr(locale, 'Upcoming events', '예정 이벤트')}</Heading><Link href="/admin/events">{tr(locale, 'View all', '전체 보기')} <ArrowUpRight size={16}/></Link></div>
    <div className="admin-upcoming">{data.events.map(event => <Link className="admin-upcoming-event" href={'/events/' + event.slug} key={event.id}><span className="admin-kicker">{dateLabelForLocale(event.starts_at, locale)} / {timeLabelForLocale(event.starts_at, locale)} KST</span><Heading level={3}>{event.title}</Heading><p>{event.venue} — {event.capacity - event.seats_remaining} / {event.capacity} {tr(locale, 'attending', '참가 예정')}</p></Link>)}{!data.events.length && <p className="admin-empty">{tr(locale, 'No upcoming live events.', '예정된 공개 이벤트가 없어요.')}</p>}</div>
    <Link className="admin-primary" href="/admin/events/new">{tr(locale, 'Create new event', '새 이벤트 만들기')}</Link>
  </section>;
}

export function AdminCenter({ path }: { path: string[] }) {
  const [locale, setLocale] = useState<Locale>('en');
  const [supportAttention,setSupportAttention]=useState(0);
  useEffect(() => { let next:Locale='en';try{const saved=localStorage.getItem('roundy-locale');if(saved==='en'||saved==='ko')next=saved;else{const browser=(navigator.languages?.[0]??navigator.language??'en').toLowerCase();next=browser==='ko'||browser.startsWith('ko-')?'ko':'en';}}catch{const browser=(navigator.languages?.[0]??navigator.language??'en').toLowerCase();next=browser==='ko'||browser.startsWith('ko-')?'ko':'en';}setLocale(next);document.documentElement.lang=next; }, []);
  useEffect(()=>{
    let active=true;
    const refresh=()=>{fetch('/api/admin/support/summary',{cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load support alerts');if(active)setSupportAttention(Number(data.total||0));}).catch(()=>{});};
    void refresh();
    const timer=window.setInterval(refresh,30000);
    window.addEventListener('roundy:admin-support-updated',refresh);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener('roundy:admin-support-updated',refresh);};
  },[]);
  const links = [
    { href: '/admin', label: tr(locale, 'Overview', '개요'), icon: LayoutDashboard, active: !path.length },
    { href: '/admin/members', label: tr(locale, 'Members', '회원'), icon: UsersRound, active: path[0] === 'members' },
    { href: '/admin/events', label: tr(locale, 'Events', '이벤트'), icon: CalendarDays, active: path[0] === 'events' },
    { href: '/admin/marketing', label: tr(locale, 'Marketing', '마케팅'), icon: Megaphone, active: path[0] === 'marketing', badge: 0 },
    { href: '/admin/support', label: tr(locale, 'Customer Support', '고객지원'), icon: Headphones, active: path[0] === 'support', badge: supportAttention },
    { href: '/admin/promo-codes', label: tr(locale, 'Promo Codes', '프로모션 코드'), icon: TicketPercent, active: path[0] === 'promo-codes', badge: 0 },
  ];
  return <div className="experience route-admin admin-center"><a className="skip" href="#admin-main">{tr(locale, 'Skip to content', '본문으로 건너뛰기')}</a>
    <header className="admin-topbar"><Link href="/admin" className="admin-brand"><RoundyBrand/><span>Admin</span></Link><div className="admin-topbar-actions"><LocaleToggle locale={locale} onChange={next => { setLocale(next); try { localStorage.setItem('roundy-locale', next); } catch {} }}/><Link href="/me">{tr(locale, 'Back to Roundy', 'Roundy로 돌아가기')}<ArrowUpRight size={16}/></Link></div></header>
    <div className="admin-workspace"><aside className="admin-sidebar"><nav aria-label={tr(locale, 'Admin navigation', '관리자 내비게이션')}>{links.map(link => <Link key={link.href} href={link.href} aria-current={link.active ? 'page' : undefined}><link.icon size={20}/><span>{link.label}</span>{link.badge>0&&<span className="admin-nav-badge" aria-label={tr(locale,`${link.badge} items need attention`,`확인 필요한 항목 ${link.badge}개`)}>{link.badge>99?'99+':link.badge}</span>}</Link>)}</nav><p>{tr(locale, 'Admin access only', '관리자 전용')}</p></aside>
      <main id="admin-main" className="admin-main">{path[0] === 'promo-codes' ? <AdminPromoCodes locale={locale}/> : path[0] === 'support' ? <AdminCustomerSupport locale={locale}/> : path[0] === 'reports' ? <AdminReports locale={locale}/> : path[0] === 'marketing' ? <AdminMarketing locale={locale}/> : path[0] === 'members' ? <AdminMembers key={path.join('/')} locale={locale} memberId={path[1]}/> : path[0] === 'events' ? <AdminEvents key={path.join('/')} locale={locale} eventId={path[1] === 'new' ? undefined : path[1]} createNew={path[1] === 'new'}/> : <AdminOverview locale={locale}/>}</main>
    </div>
  </div>;
}
