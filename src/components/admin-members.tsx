'use client';

import { useEffect, useRef, useState } from 'react';
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

function MemberModal({ member, locale, busy, onClose, onReview }: { member: Member; locale: Locale; busy: boolean; onClose: () => void; onReview: (next: 'Approved' | 'Rejected', reason?: string) => void }) {
  const [reason, setReason] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const profile = member.profile;
  const photos = Array.isArray(profile.photos) ? profile.photos.filter((photo): photo is string => typeof photo === 'string') : [];
  const documentName = member.verification.document_path.split('/').at(-1);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button,select,a[href]')?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [onClose]);
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
  return <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="roundy-modal member-modal" role="dialog" aria-modal="true" aria-label={tr(locale, 'Member details', '회원 상세')} ref={ref}><header><div><p className="admin-kicker">{tr(locale, 'Member profile', '회원 프로필')}</p><h2>{value(profile, 'full_name') || tr(locale, 'Incomplete profile', '미완성 프로필')}</h2></div><button type="button" className="icon-button" aria-label={tr(locale, 'Close', '닫기')} onClick={onClose}><X /></button></header>
    <div className="member-status-row"><span className={'member-status '+member.verification.status.toLowerCase()}>{status(member, locale)}</span><span>{tr(locale, 'Verification', '인증')}: {member.verification.method || '—'}</span></div>
    {photos.length > 0 && <div className="member-photo-grid">{photos.map((photo, index) => <img src={photo} key={photo} alt={tr(locale, 'Profile photo ', '프로필 사진 ') + (index + 1)} />)}</div>}
    <dl className="member-profile-details">{detail.map(([label, content]) => <div key={label}><dt>{label}</dt><dd>{content}</dd></div>)}</dl>
    {interests.length > 0 && <section className="member-section"><h3>{tr(locale, 'Interests', '관심사')}</h3><div className="chips">{interests.map(interest => <span className="chip" key={interest}>{interest}</span>)}</div></section>}
    <section className="member-section"><h3>{tr(locale, 'Verification', '인증')}</h3><p>{member.verification.status === 'Verified' ? tr(locale, 'Approved', '승인됨') : member.verification.status || tr(locale, 'Not submitted', '미제출')}</p>{member.verification.instagram && <p>📷 @{member.verification.instagram}</p>}{member.verification.linkedin && <p>💼 {member.verification.linkedin}</p>}{documentName && <a className="admin-secondary" href={'/api/verification-documents/' + member.user_id + '/' + documentName} target="_blank" rel="noreferrer"><FileText size={16}/>{tr(locale, 'Open work or student proof', '재직 또는 재학 증빙 열기')}<ExternalLink size={15}/></a>}{member.verification.rejection_reason && <p className="member-rejection">{tr(locale, 'Previous rejection: ', '이전 반려 사유: ')}{member.verification.rejection_reason}</p>}</section>
    <section className="member-section"><h3>{tr(locale, 'Payments & attendance', '결제 및 참석')}</h3><div className="member-stats"><span><b>{member.payments.credit_lots}</b>{tr(locale, 'payment lots', '결제 건')}</span><span><b>{member.payments.credits_remaining}</b>{tr(locale, 'credits left', '남은 크레딧')}</span><span><b>{member.bookings.length}</b>{tr(locale, 'bookings', '예약')}</span><span><b>{member.applications.length}</b>{tr(locale, 'applications', '신청')}</span></div>{member.applications.length > 0 && <ul className="member-event-list">{member.applications.map(application => <li key={application.id}><span>{application.event_title}</span><b>{application.status}</b></li>)}</ul>}</section>
    <section className="member-review"><h3>{tr(locale, 'Member approval', '회원 승인')}</h3><label><span>{tr(locale, 'Rejection reason', '반려 사유')}</span><select value={reason} onChange={event => setReason(event.target.value)}><option value="">{tr(locale, 'Choose a reason before rejecting', '반려 사유를 선택하세요')}</option>{rejectionReasons.map(([id, en, ko]) => <option key={id} value={id}>{tr(locale, en, ko)}</option>)}</select></label><div><button type="button" className="admin-primary" disabled={busy} onClick={() => onReview('Approved')}>{busy ? tr(locale, 'Saving…', '저장 중…') : <><BadgeCheck size={18}/>{tr(locale, 'Approve member', '회원 승인')}</>}</button><button type="button" className="admin-reject" disabled={busy || !reason} onClick={() => onReview('Rejected', reason)}>{tr(locale, 'Reject member', '회원 반려')}</button></div></section>
  </div></div>;
}

export function AdminMembers({ locale }: { locale: Locale }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState<Member | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  async function load() { const result = await request('admin/members'); setMembers(result.members || []); return result.members as Member[]; }
  useEffect(() => { void load().catch(error => setError(error instanceof Error ? error.message : 'Request failed')).finally(() => setBusy(false)); }, []);
  async function review(next: 'Approved' | 'Rejected', reason?: string) {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      const result = await request('admin/members/' + selected.user_id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next, rejection_reason: reason || '' }) });
      setSelected(result.member); setMembers(current => current.map(member => member.user_id === result.member.user_id ? result.member : member));
    } catch (error) { setError(error instanceof Error ? error.message : 'Request failed'); }
    finally { setBusy(false); }
  }
  return <section className="admin-panel admin-members">{busy && !selected && <LoadingScreen />}{error && <p role="alert" className="admin-error">{error}</p>}<div className="admin-toolbar"><span className="admin-kicker">Roundy Admin</span></div><div className="admin-heading"><h1>{tr(locale, 'Member Management', '회원 관리')}</h1><p>{tr(locale, 'Review profiles, verification, payments and event eligibility.', '프로필, 인증, 결제 및 이벤트 참여 자격을 검토하세요.')}</p></div><div className="member-list">{members.map(member => { const profile = member.profile; const photo = Array.isArray(profile.photos) && typeof profile.photos[0] === 'string' ? profile.photos[0] : ''; return <button type="button" className="member-row" key={member.user_id} onClick={() => setSelected(member)}><span className="member-avatar">{photo ? <img src={photo} alt="" /> : <UserRound size={22} />}</span><span><b>{value(profile, 'full_name') || tr(locale, 'Incomplete profile', '미완성 프로필')}</b><small>{value(profile, 'job_title') || member.email || tr(locale, 'No profile details yet', '아직 프로필 정보가 없어요')}</small></span><span className={'member-status '+member.verification.status.toLowerCase()}>{status(member, locale)}</span><ChevronRight size={18} /></button>; })}</div>{!busy && members.length === 0 && <div className="admin-empty"><UsersRound size={28}/><p>{tr(locale, 'No members yet.', '아직 회원이 없어요.')}</p></div>}{selected && <MemberModal member={selected} locale={locale} busy={busy} onClose={() => setSelected(null)} onReview={review} />}</section>;
}
