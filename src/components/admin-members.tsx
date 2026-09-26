'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BadgeCheck, ChevronRight, ExternalLink, FileText, ShieldCheck, UserRound, UsersRound, X } from 'lucide-react';
import { LoadingScreen } from './loading-screen';
import { tr, type Locale } from '@/lib/locale';

type Verification = { status: string; method: string; instagram: string; linkedin: string; document_path: string; rejection_reason: string; updated_at?: string | null };
type PaymentSummary = { credit_lots: number; credits_total: number; credits_remaining: number; last_purchased_at?: string | null };
type MemberEvent = { id: string; status: string; event_title: string; event_slug: string; starts_at: string };
type Member = { user_id: string; email?: string | null; profile: Record<string, unknown>; profile_updated_at?: string | null; verification: Verification; payments: PaymentSummary; applications: MemberEvent[]; bookings: MemberEvent[] };

const rejectionReasons = [
  ['profile_incomplete', 'Profile information is incomplete', '프로필 정보가 부족해요'],
  ['verification_unconfirmed', 'Verification could not be confirmed', '인증 정보를 확인할 수 없어요'],
  ['photo_guidelines', 'Profile photo does not meet our guidelines', '프로필 사진이 가이드라인에 맞지 않아요'],
  ['other', 'Other', '기타'],
] as const;

async function request(path: string, init?: RequestInit) {
  const response = await fetch('/api/' + path, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function value(profile: Record<string, unknown>, key: string) {
  const item = profile[key];
  return typeof item === 'string' || typeof item === 'number' ? String(item) : '';
}

function status(member: Member, locale: Locale) {
  if (member.verification.status === 'Verified') return tr(locale, 'Approved', '승인됨');
  if (member.verification.status === 'Rejected') return tr(locale, 'Rejected', '반려됨');
  if (member.verification.status === 'Reviewing') return tr(locale, 'Review needed', '검토 필요');
  return tr(locale, 'Profile incomplete', '프로필 미완성');
}

function MemberModal({ member, locale, busy, onClose, onReview, inline=false }: { inline?: boolean; member: Member; locale: Locale; busy: boolean; onClose: () => void; onReview: (next: 'Approved' | 'Rejected', reason?: string) => void }) {
  const [reason, setReason] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const profile = member.profile;
  const photos = Array.isArray(profile.photos) ? profile.photos.filter((photo): photo is string => typeof photo === 'string') : [];
  const documentName = member.verification.document_path.split('/').at(-1);
  useEffect(() => {
    if (inline) return;
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button,select,a[href]')?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [inline, onClose]);
  const detail = [
    [tr(locale, 'Name', '이름'), value(profile, 'full_name')],
    [tr(locale, 'Email', '이메일'), member.email || '—'],
    [tr(locale, 'Phone', '전화번호'), value(profile, 'phone') || '—'],
    [tr(locale, 'Date of birth', '생년월일'), value(profile, 'birth_date') || '—'],
    [tr(locale, 'Gender', '성별'), value(profile, 'gender') || '—'],
    [tr(locale, 'Nationality', '국적'), value(profile, 'nationality') || '—'],
    [tr(locale, 'Height', '키'), value(profile, 'height_cm') ? value(profile, 'height_cm') + ' cm' : '—'],
    [tr(locale, 'Job title', '직업'), value(profile, 'job_title') || '—'],
    [tr(locale, 'Workplace / school', '직장 또는 학교'), value(profile, 'workplace') || '—'],
  ];
  const interests = Array.isArray(profile.interests) ? profile.interests.filter((item): item is string => typeof item === 'string') : [];
  return <div className={inline?'member-detail-page':'modal-backdrop'} onClick={event => { if (!inline && event.target === event.currentTarget) onClose(); }}><div className={inline?'member-detail-content':'roundy-modal member-modal'} role={inline?undefined:'dialog'} aria-modal={inline?undefined:true} aria-label={tr(locale, 'Member details', '회원 상세')} ref={ref}><header><div><p className="admin-kicker">{tr(locale, 'Member profile', '회원 프로필')}</p><h2>{value(profile, 'full_name') || tr(locale, 'Incomplete profile', '미완성 프로필')}</h2></div><button type="button" className="icon-button" aria-label={tr(locale, 'All members', '전체 회원')} onClick={onClose}><X /></button></header>
    <div className="member-status-row"><span className={'member-status '+member.verification.status.toLowerCase()}>{status(member, locale)}</span><span>{tr(locale, 'Verification', '인증')}: {member.verification.method || '—'}</span></div>
    {photos.length > 0 && <div className="member-photo-grid">{photos.map((photo, index) => <img src={photo} key={photo} alt={tr(locale, 'Profile photo ', '프로필 사진 ') + (index + 1)} />)}</div>}
    <dl className="member-profile-details">{detail.map(([label, content]) => <div key={label}><dt>{label}</dt><dd>{content}</dd></div>)}</dl>
    {interests.length > 0 && <section className="member-section"><h3>{tr(locale, 'Interests', '관심사')}</h3><div className="chips">{interests.map(interest => <span className="chip" key={interest}>{interest}</span>)}</div></section>}
    <section className="member-section"><h3>{tr(locale, 'Verification', '인증')}</h3><p>{member.verification.status === 'Verified' ? tr(locale, 'Approved', '승인됨') : member.verification.status || tr(locale, 'Not submitted', '미제출')}</p>{member.verification.instagram && <p>📷 @{member.verification.instagram}</p>}{member.verification.linkedin && <p>💼 {member.verification.linkedin}</p>}{documentName && <a className="admin-secondary" href={'/api/verification-documents/' + member.user_id + '/' + documentName} target="_blank" rel="noreferrer"><FileText size={16}/>{tr(locale, 'Open work or student proof', '재직 또는 재학 증빙 열기')}<ExternalLink size={15}/></a>}{member.verification.rejection_reason && <p className="member-rejection">{tr(locale, 'Previous rejection: ', '이전 반려 사유: ')}{member.verification.rejection_reason}</p>}</section>
    <section className="member-section"><h3>{tr(locale, 'Payments & attendance', '결제 및 참석')}</h3><div className="member-stats"><span><b>{member.payments.credit_lots}</b>{tr(locale, 'payment lots', '결제 건')}</span><span><b>{member.payments.credits_remaining}</b>{tr(locale, 'credits left', '남은 크레딧')}</span><span><b>{member.bookings.length}</b>{tr(locale, 'bookings', '예약')}</span><span><b>{member.applications.length}</b>{tr(locale, 'applications', '신청')}</span></div>{member.applications.length > 0 && <ul className="member-event-list">{member.applications.map(application => <li key={application.id}><span>{application.event_title}</span><b>{application.status}</b></li>)}</ul>}</section>
    <section className="member-review"><h3>{tr(locale, 'Member approval', '회원 승인')}</h3><label><span>{tr(locale, 'Rejection reason', '반려 사유')}</span><select value={reason} onChange={event => setReason(event.target.value)}><option value="">{tr(locale, 'Choose a reason before rejecting', '반려 사유를 선택하세요')}</option>{rejectionReasons.map(([id, en, ko]) => <option key={id} value={id}>{tr(locale, en, ko)}</option>)}</select></label><div><button type="button" className="admin-primary" disabled={busy} onClick={() => onReview('Approved')}>{busy ? tr(locale, 'Saving…', '저장 중…') : <><BadgeCheck size={18}/>{tr(locale, 'Approve member', '회원 승인')}</>}</button><button type="button" className="admin-reject" disabled={busy || !reason} onClick={() => onReview('Rejected', reason)}>{tr(locale, 'Reject member', '회원 반려')}</button></div></section>
  </div></div>;
}

export function AdminMembers({ locale, memberId }: { locale: Locale; memberId?: string }) {
  const router=useRouter();const params=useSearchParams();
  const [query,setQuery]=useState('');const [filter,setFilter]=useState(params.get('status')||'all');const [gender,setGender]=useState('all');const [page,setPage]=useState(0);
  const [members, setMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState<Member | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  async function load() { const result = await request('admin/members'); setMembers(result.members || []); return result.members as Member[]; }
  useEffect(() => { void load().then(members=>{if(memberId){const member=members.find(member=>member.user_id===memberId);if(!member)throw new Error(tr(locale,'Member not found.','회원을 찾을 수 없어요.'));setSelected(member);}}).catch(error => setError(error instanceof Error ? error.message : 'Request failed')).finally(() => setBusy(false)); }, []);
  async function review(next: 'Approved' | 'Rejected', reason?: string) {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      const result = await request('admin/members/' + selected.user_id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next, rejection_reason: reason || '' }) });
      setSelected(result.member); setMembers(current => current.map(member => member.user_id === result.member.user_id ? result.member : member));
    } catch (error) { setError(error instanceof Error ? error.message : 'Request failed'); }
    finally { setBusy(false); }
  }
  const filtered=members.filter(member=>(filter==='all'||member.verification.status===filter)&&(gender==='all'||value(member.profile,'gender')===gender)&&[value(member.profile,'full_name'),member.email||''].some(text=>text.toLowerCase().includes(query.toLowerCase())));
  const pageCount=Math.max(1,Math.ceil(filtered.length/25));
  const currentPage=Math.min(page,pageCount-1);
  return <section className="admin-panel admin-members">{busy && !selected && <LoadingScreen />}{error && <p role="alert" className="admin-error">{error}</p>}
    {memberId ? <><Link className="admin-back" href="/admin/members">← {tr(locale,'All members','전체 회원')}</Link>{selected&&<MemberModal inline member={selected} locale={locale} busy={busy} onClose={()=>router.push('/admin/members')} onReview={review}/>}</> : <>
    <div className="admin-heading"><p className="admin-kicker">Roundy Admin</p><h1>{tr(locale, 'Members', '회원')}</h1><p>{tr(locale, 'Review profiles, verification, payments and event eligibility.', '프로필, 인증, 결제 및 이벤트 참여 자격을 검토하세요.')}</p></div>
    <div className="admin-filters"><label><span>{tr(locale,'Search members','회원 검색')}</span><input value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}} placeholder={tr(locale,'Name or email','이름 또는 이메일')}/></label><label><span>{tr(locale,'Status','상태')}</span><select value={filter} onChange={event=>{setFilter(event.target.value);setPage(0);}}>{[['all','All statuses','전체 상태'],['Reviewing','Review needed','검토 필요'],['Verified','Approved','승인됨'],['Rejected','Rejected','반려됨'],['Not started','Not started','미시작']].map(([id,en,ko])=><option value={id} key={id}>{tr(locale,en,ko)}</option>)}</select></label><label><span>{tr(locale,'Gender','성별')}</span><select value={gender} onChange={event=>{setGender(event.target.value);setPage(0);}}>{[['all','All genders','전체 성별'],['male','Male','남성'],['female','Female','여성']].map(([id,en,ko])=><option value={id} key={id}>{tr(locale,en,ko)}</option>)}</select></label></div>
    <table className="admin-member-table"><thead><tr><th>{tr(locale,'Member','회원')}</th><th>{tr(locale,'Status','상태')}</th><th>{tr(locale,'Gender','성별')}</th><th>{tr(locale,'Credits','크레딧')}</th><th>{tr(locale,'Actions','관리')}</th></tr></thead><tbody>{filtered.slice(currentPage*25,(currentPage+1)*25).map(member=>{const photo=Array.isArray(member.profile.photos)&&typeof member.profile.photos[0]==='string'?member.profile.photos[0]:'';return <tr key={member.user_id}><td><div className="admin-member-identity"><span className="member-avatar">{photo?<img src={photo} alt=""/>:<UserRound size={22}/>}</span><span><b>{value(member.profile,'full_name')||tr(locale,'Incomplete profile','미완성 프로필')}</b><small>{member.email||value(member.profile,'job_title')}</small></span></div></td><td><span className={'member-status '+member.verification.status.toLowerCase()}>{status(member,locale)}</span></td><td>{value(member.profile,'gender')||'—'}</td><td>{member.payments.credits_remaining} {tr(locale,'credits','크레딧')}</td><td><Link className="admin-secondary" href={'/admin/members/'+member.user_id}>{tr(locale,'View profile','프로필 보기')}<ChevronRight size={16}/></Link></td></tr>;})}</tbody></table>
    {!busy&&!filtered.length&&<div className="admin-empty"><UsersRound size={28}/><p>{tr(locale,'No members match this view.','표시할 회원이 없어요.')}</p></div>}
    <div className="admin-pagination"><span>{filtered.length} {tr(locale,'members','명')} / {currentPage+1} – {pageCount}</span><button className="admin-secondary" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>{tr(locale,'Previous','이전')}</button><button className="admin-secondary" disabled={currentPage>=pageCount-1} onClick={()=>setPage(currentPage+1)}>{tr(locale,'Next','다음')}</button></div>
    </>}
  </section>;
}
