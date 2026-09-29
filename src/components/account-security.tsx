'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { authSecurityError, maskEmail } from '@/lib/auth-security';
import { tr, type Locale } from '@/lib/locale';
import { PasswordForm } from './password-form';
import styles from './sign-in.module.css';

export function AccountSecurity({ locale, mode }: { locale: Locale; mode: 'email' | 'password' }) {
  const t = (en: string, ko: string) => tr(locale, en, ko);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function refresh() {
    const { data, error } = await createClient().auth.getUser();
    if (error) throw error;
    setUser(data.user); setReady(true);
    return data.user;
  }

  useEffect(() => {
    let active = true;
    const read = () => createClient().auth.getUser().then(({ data, error }) => {
      if (!active) return;
      setUser(data.user); setReady(true);
      if (error) setError(authSecurityError(error, locale));
    }).catch(error => { if (active) { setError(authSecurityError(error, locale)); setReady(true); } });
    void read();
    window.addEventListener('focus', read);
    return () => { active = false; window.removeEventListener('focus', read); };
  }, [locale]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !user) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const nextEmail = email.trim();
      if (nextEmail.toLowerCase() === user.email?.toLowerCase()) {
        setError(t('Enter a different email address.', '현재 이메일과 다른 주소를 입력해 주세요.')); return;
      }
      const redirect = new URL('/auth/callback', window.location.origin);
      redirect.searchParams.set('next', '/me/email');
      const { error } = await createClient().auth.updateUser({ email: nextEmail }, { emailRedirectTo: redirect.toString() });
      if (error) throw error;
      await refresh(); setEmail('');
      setNotice(user.email
        ? t('Request sent. Confirm the change in both your old and new inboxes.', '변경 요청을 보냈어요. 기존 이메일과 새 이메일에서 모두 확인해 주세요.')
        : t('Confirm the link in your new email inbox.', '새 이메일로 받은 인증 링크를 눌러 주세요.'));
    } catch (error) { setError(authSecurityError(error, locale)); } finally { setBusy(false); }
  }

  async function checkStatus() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const updated = await refresh();
      setNotice(updated?.new_email
        ? t('Still waiting for confirmation. Check both inboxes.', '아직 확인을 기다리고 있어요. 두 이메일의 받은편지함을 확인해 주세요.')
        : t('Your account email is up to date.', '현재 계정 이메일을 확인했어요.'));
    } catch (error) { setError(authSecurityError(error, locale)); } finally { setBusy(false); }
  }

  if (!ready) return <p role="status">{t('Loading account…', '계정 확인 중…')}</p>;
  if (!user) return <section className={styles.security}><p>{t('Sign in again to continue.', '다시 로그인해 주세요.')}</p><Link className="button" href={'/signin?next=' + encodeURIComponent('/me/' + mode)}>{t('Sign in', '로그인')}</Link></section>;
  if (mode === 'password') {
    // A social/phone identity does not prove that a password exists. Offer the
    // email recovery route instead of requiring a password they never created.
    const emailIdentity = user.identities?.some(identity => identity.provider === 'email');
    if (!emailIdentity) return <section className={styles.security}><h1>{t('Password', '비밀번호')}</h1><p>{user.email ? t('Use email recovery to set or reset a password for this account.', '이메일 인증으로 이 계정의 비밀번호를 설정하거나 재설정할 수 있어요.') : t('Add and confirm an email address first.', '먼저 이메일 주소를 추가하고 인증해 주세요.')}</p><Link className="button" href={user.email ? '/signin?mode=forgot' : '/me/email'}>{user.email ? t('Continue by email', '이메일로 계속하기') : t('Add email', '이메일 추가')}</Link><Link href="/me/settings">{t('Back to settings', '설정으로 돌아가기')}</Link></section>;
    return <PasswordForm locale={locale}/>;
  }

  return <section className={styles.security} aria-busy={busy}>
    <h1>{user.new_email ? t('Confirm both emails', '이메일 변경을 확인해 주세요') : t('Email address', '이메일 주소')}</h1>
    <p>{t('Current email', '현재 이메일')}: <strong>{user.email ? maskEmail(user.email) : t('Not added', '등록되지 않음')}</strong></p>
    {user.new_email ? <>
      <p>{t('Pending email', '변경 대기 중')}: <strong>{maskEmail(user.new_email)}</strong></p>
      <p>{user.email ? t('Confirm the change in both your old and new inboxes. Your current email stays active until then.', '기존 이메일과 새 이메일에서 모두 확인해 주세요. 확인이 끝날 때까지 현재 이메일이 유지돼요.') : t('Confirm the link sent to your new email.', '새 이메일로 받은 인증 링크를 눌러 주세요.')}</p>
      <button className="button" disabled={busy} onClick={() => void checkStatus()}>{t('Refresh status', '변경 상태 확인')}</button>
    </> : <form className={styles.form} onSubmit={submit}><fieldset className={styles.fields} disabled={busy}>
      <label>{t('New email', '새 이메일')}<input type="email" required autoComplete="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)}/></label>
      <p className={styles.help}>{user.email ? t('Confirmation is required on both email addresses.', '기존 이메일과 새 이메일에서 모두 인증해야 해요.') : t('We’ll send a confirmation link to this address.', '이 주소로 인증 링크를 보내드릴게요.')}</p>
      <button className="button" type="submit">{t('Send confirmation', '인증 메일 보내기')}</button>
    </fieldset></form>}
    {error && <p role="alert" className={styles.notice}>{error}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    <Link className={styles.textButton} href="/me/settings">{t('Back to settings', '설정으로 돌아가기')}</Link>
  </section>;
}
