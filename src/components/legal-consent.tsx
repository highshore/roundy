'use client';
import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { LEGAL_VERSION } from '@/lib/legal-consent';
import { tr, type Locale } from '@/lib/locale';
import styles from './legal-consent.module.css';

export async function recordLegalConsent() {
  const response = await fetch('/api/legal-consent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: LEGAL_VERSION, terms: true, privacy: true }) });
  if (!response.ok) throw new Error('Consent could not be saved');
}

export function LegalConsentDialog({ locale, busy, error, onAccept, onCancel }: { locale: Locale; busy: boolean; error?: string; onAccept: () => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const t = (en: string, ko: string) => tr(locale, en, ko);
  useEffect(() => {
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    element?.showModal(); document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = overflow; };
  }, []);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="legal-consent-title" aria-describedby="legal-consent-description" onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <div className={styles.icon}><ShieldCheck size={26}/></div>
    <h2 id="legal-consent-title">{t('Before we get started', '시작하기 전에 확인해 주세요')}</h2>
    <p id="legal-consent-description">{t('Please review and agree to the following to use your Roundy account.', 'Roundy 계정을 이용하려면 아래 내용을 확인하고 동의해 주세요.')}</p>
    <div className={styles.agreements}>
      <div className={styles.row}><label><input type="checkbox" checked={terms} disabled={busy} onChange={e => setTerms(e.target.checked)}/><span>{t('Terms of Use', '이용약관 동의')} <small>{t('(required)', '(필수)')}</small></span></label><a href="/terms" target="_blank" rel="noopener noreferrer">{t('Read', '보기')}</a></div>
      <div className={styles.row}><label><input type="checkbox" checked={privacy} disabled={busy} onChange={e => setPrivacy(e.target.checked)}/><span>{t('Privacy Policy', '개인정보 처리방침 동의')} <small>{t('(required)', '(필수)')}</small></span></label><a href="/privacy" target="_blank" rel="noopener noreferrer">{t('Read', '보기')}</a></div>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <button className={styles.primary} type="button" disabled={busy || !terms || !privacy} onClick={onAccept}>{busy ? t('Please wait…', '잠시만 기다려 주세요…') : t('Agree and continue', '동의하고 계속하기')}</button>
    <button className={styles.cancel} type="button" disabled={busy} onClick={onCancel}>{t('Not now', '다음에 할게요')}</button>
  </dialog>;
}

export function AccountConsent({ locale, path }: { locale: Locale; path: string }) {
  const [status, setStatus] = useState<'checking' | 'accepted' | 'required' | 'error'>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const legalPage = ['terms', 'privacy'].includes(path.split('/')[0]);
  useEffect(() => {
    if (legalPage) return;
    let active = true;
    const controller = new AbortController();
    fetch('/api/legal-consent', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      return response.json();
    }).then(data => { if (active) setStatus(data.accepted ? 'accepted' : 'required'); }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; controller.abort(); };
  }, [legalPage, retry]);
  async function accept() {
    setBusy(true); setError('');
    try { await recordLegalConsent(); setStatus('accepted'); }
    catch { setError(tr(locale, 'We couldn’t save your agreement. Please try again.', '동의 내용을 저장하지 못했어요. 다시 시도해 주세요.')); }
    finally { setBusy(false); }
  }
  async function cancel() {
    setBusy(true); setError('');
    try {
      const { error } = await createClient().auth.signOut({ scope: 'local' });
      if (error) throw error;
      window.location.assign('/signin');
    } catch { setError(tr(locale, 'Couldn’t sign out. Please try again.', '로그아웃하지 못했어요. 다시 시도해 주세요.')); setBusy(false); }
  }
  if (legalPage || status === 'accepted') return null;
  if (status === 'required') return <LegalConsentDialog locale={locale} busy={busy} error={error} onAccept={() => void accept()} onCancel={() => void cancel()}/>;
  return <div className={styles.checking} role="status"><p>{tr(locale, status === 'error' ? 'We couldn’t check your agreements.' : 'Checking your account…', status === 'error' ? '약관 동의 내역을 확인하지 못했어요.' : '계정을 확인하고 있어요…')}</p>{status === 'error' && <><button onClick={() => { setStatus('checking'); setRetry(n => n + 1); }}>{tr(locale, 'Try again', '다시 시도')}</button><button disabled={busy} onClick={() => void cancel()}>{tr(locale, 'Sign out', '로그아웃')}</button>{error && <p role="alert">{error}</p>}</>}</div>;
}
