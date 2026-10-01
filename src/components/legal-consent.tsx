'use client';
import { Heading } from '@/components/heading';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { LEGAL_VERSION } from '@/lib/legal-consent';
import { tr, type Locale } from '@/lib/locale';
import { LegalConsentDocument } from './legal';
import { NotoAnimatedEmoji } from './noto-animated-emoji';
import styles from './legal-consent.module.css';

export async function recordLegalConsent() {
  const response = await fetch('/api/legal-consent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: LEGAL_VERSION, terms: true, privacy: true }) });
  if (!response.ok) throw new Error('Consent could not be saved');
}

type ConsentView = 'summary' | 'terms' | 'privacy' | 'refused';

export function LegalConsentDialog({ locale, busy, error, onAccept, onCancel }: { locale: Locale; busy: boolean; error?: string; onAccept: () => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [view, setView] = useState<ConsentView>('summary');
  const t = (en: string, ko: string) => tr(locale, en, ko);

  useEffect(() => {
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = overflow; };
  }, []);

  function handleDismiss() {
    if (busy) return;
    if (view === 'terms' || view === 'privacy' || view === 'refused') setView('summary');
    else setView('refused');
  }

  const documentView = view === 'terms' || view === 'privacy';

  return <dialog
    ref={dialog}
    className={`${styles.dialog} ${view === 'refused' ? styles.refusedDialog : ''}`}
    aria-labelledby="legal-consent-title"
    onCancel={event => { event.preventDefault(); handleDismiss(); }}
  >
    {documentView ? <>
      <div className={styles.documentHeader}>
        <button type="button" className={styles.back} onClick={() => setView('summary')} aria-label={t('Back to agreements', '동의 화면으로 돌아가기')}>
          <ArrowLeft size={19}/>
        </button>
        <div>
          <p>{t('Required agreement', '필수 동의')}</p>
          <Heading level={2} id="legal-consent-title">{view === 'terms' ? t('Terms of Use', '이용약관') : t('Privacy Policy', '개인정보 처리방침')}</Heading>
        </div>
      </div>
      <div className={styles.legalScroll} tabIndex={0} aria-label={view === 'terms' ? t('Scrollable Terms of Use', '스크롤 가능한 이용약관') : t('Scrollable Privacy Policy', '스크롤 가능한 개인정보 처리방침')}>
        <LegalConsentDocument locale={locale} document={view}/>
      </div>
      <button className={styles.primary} type="button" onClick={() => setView('summary')}>
        {t('Done reviewing', '확인했어요')}
      </button>
    </> : view === 'refused' ? <>
      <div className={styles.refusal}>
        <NotoAnimatedEmoji
          codepoint="1f62d"
          fallback="😭"
          label={t('Loudly crying face', '엉엉 우는 얼굴')}
          size={88}
          className={styles.cryingEmoji}
        />
        <Heading level={2} id="legal-consent-title">{t('Agreement required', '동의가 필요해요')}</Heading>
        <p>{t('To use Roundy, please agree to the Terms and Privacy Policy.', 'Roundy를 이용하려면 이용약관과 개인정보 처리방침에 동의해 주세요.')}</p>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.primary} type="button" disabled={busy} onClick={() => setView('summary')}>
        {t('Review terms', '약관 확인하기')}
      </button>
      <button className={styles.cancel} type="button" disabled={busy} onClick={onCancel}>
        {t('Leave', '나가기')}
      </button>
    </> : <>
      <div className={styles.icon}><ShieldCheck size={26}/></div>
      <Heading level={2} id="legal-consent-title">{t('Before we get started', '시작하기 전에 확인해 주세요')}</Heading>
      <p>{t('Please review and agree to the following to use your Roundy account.', 'Roundy 계정을 이용하려면 아래 내용을 확인하고 동의해 주세요.')}</p>
      <div className={styles.agreements}>
        <div className={styles.row}>
          <label><input type="checkbox" checked={terms} disabled={busy} onChange={e => setTerms(e.target.checked)}/><span>{t('Terms of Use', '이용약관 동의')} <small>{t('(required)', '(필수)')}</small></span></label>
          <button type="button" className={styles.read} onClick={() => setView('terms')}>{t('Read', '보기')}</button>
        </div>
        <div className={styles.row}>
          <label><input type="checkbox" checked={privacy} disabled={busy} onChange={e => setPrivacy(e.target.checked)}/><span>{t('Privacy Policy', '개인정보 처리방침 동의')} <small>{t('(required)', '(필수)')}</small></span></label>
          <button type="button" className={styles.read} onClick={() => setView('privacy')}>{t('Read', '보기')}</button>
        </div>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.primary} type="button" disabled={busy || !terms || !privacy} onClick={onAccept}>{busy ? t('Please wait…', '잠시만 기다려 주세요…') : t('Agree and continue', '동의하고 계속하기')}</button>
      <button className={styles.cancel} type="button" disabled={busy} onClick={() => setView('refused')}>{t('Not now', '다음에 할게요')}</button>
    </>}
  </dialog>;
}

export function AccountConsent({ locale, path }: { locale: Locale; path: string }) {
  const [status, setStatus] = useState<'checking' | 'accepted' | 'required' | 'error'>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const legalPage = ['terms', 'privacy', 'refund-policy', 'copyright'].includes(path.split('/')[0]);
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
