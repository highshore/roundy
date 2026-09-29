'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { authSecurityError, newPasswordError, passwordRequirements, passwordMismatch } from '@/lib/auth-security';
import { tr, type Locale } from '@/lib/locale';
import { NotoAnimatedEmoji } from './noto-animated-emoji';
import styles from './sign-in.module.css';

export function PasswordForm({ locale, recovery = false }: { locale: Locale; recovery?: boolean }) {
  const t = (en: string, ko: string) => tr(locale, en, ko);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [nonce, setNonce] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!busy && !verifying) {
      if (passwordError) passwordRef.current?.focus();
      else if (confirmError) confirmRef.current?.focus();
    }
  }, [passwordError, confirmError, busy, verifying]);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(n => n - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function sendNonce() {
    const { error } = await createClient().auth.reauthenticate();
    if (error) throw error;
    setVerifying(true); setNonce(''); setCooldown(60);
    setNotice(t('Enter the code sent to your account email or phone.', '계정 이메일 또는 휴대폰으로 받은 인증번호를 입력해 주세요.'));
  }

  async function resend() {
    if (busy || cooldown) return;
    setBusy(true); setError('');
    try { await sendNonce(); } catch (error) { setError(authSecurityError(error, locale)); } finally { setBusy(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(''); setNotice('');
    const invalid = newPasswordError(password, locale);
    setPasswordError(invalid);
    setConfirmError(password !== confirm ? passwordMismatch(locale) : '');
    if (invalid || password !== confirm) return;
    setBusy(true);
    try {
      // Supabase decides whether the session needs reauthentication. Token refresh
      // timestamps do not indicate when the user originally signed in.
      const { error } = await createClient().auth.updateUser({
        password,
        ...(!recovery ? { current_password: current } : {}),
        ...(verifying ? { nonce: nonce.trim() } : {}),
      });
      if (error?.code === 'reauthentication_needed') { await sendNonce(); return; }
      if (error) throw error;
      setCurrent(''); setPassword(''); setConfirm(''); setNonce(''); setDone(true);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'weak_password' || code === 'same_password') {
        setVerifying(false); setNonce(''); setNotice('');
        setPasswordError(authSecurityError(error, locale));
      } else setError(authSecurityError(error, locale));
    } finally { setBusy(false); }
  }

  if (done) return <section className={styles.security}>
    <div className={styles.statusIcon}><NotoAnimatedEmoji codepoint="2705" fallback="✅" size={64}/></div>
    <h1>{t('Password updated', '비밀번호가 변경되었어요')}</h1>
    <p>{t('Use your new password next time you sign in.', '다음 로그인부터 새 비밀번호를 사용해 주세요.')}</p>
    <Link className="button" href={recovery ? '/me' : '/me/settings'}>{t('Continue', '계속하기')}</Link>
  </section>;

  return <section className={styles.security} aria-busy={busy}>
    <h1>{verifying ? t('Verify it’s you', '본인 확인이 필요해요') : recovery ? t('Reset password', '비밀번호 재설정') : t('Change password', '비밀번호 변경')}</h1>
    <form className={styles.form} onSubmit={submit}>
      <fieldset className={styles.fields} disabled={busy}>
        {verifying ? <label>{t('Verification code', '인증번호')}<input autoFocus required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={nonce} onChange={e => setNonce(e.target.value.replace(/\D/g, ''))}/></label> : <>
          {!recovery && <label>{t('Current password', '현재 비밀번호')}<input type="password" autoComplete="current-password" required maxLength={128} value={current} onChange={e => setCurrent(e.target.value)}/></label>}
          <label>{t('New password', '새 비밀번호')}<input ref={passwordRef} aria-invalid={!!passwordError} aria-describedby="new-password-feedback" type="password" autoComplete="new-password" required minLength={8} maxLength={128} onInvalid={e => { e.preventDefault(); setPasswordError(passwordRequirements(locale)); passwordRef.current?.focus(); }} value={password} onChange={e => { setPassword(e.target.value); setPasswordError(''); setConfirmError(''); }}/>
            <small id="new-password-feedback" className={passwordError ? styles.fieldError : undefined} role={passwordError ? 'alert' : undefined}>{passwordError || passwordRequirements(locale)}</small>
          </label>
          <label>{t('Confirm new password', '새 비밀번호 확인')}<input ref={confirmRef} aria-invalid={!!confirmError} aria-describedby={confirmError ? 'new-confirm-feedback' : undefined} type="password" autoComplete="new-password" required maxLength={128} onInvalid={e => { e.preventDefault(); setConfirmError(passwordMismatch(locale)); }} value={confirm} onChange={e => { setConfirm(e.target.value); setConfirmError(''); }}/>
            {confirmError && <small id="new-confirm-feedback" className={styles.fieldError} role="alert">{confirmError}</small>}
          </label>
        </>}
        <button className="button" type="submit">{busy ? t('Please wait…', '처리 중…') : verifying ? t('Verify & change password', '확인하고 비밀번호 변경') : t('Save password', '비밀번호 저장')}</button>
      </fieldset>
    </form>
    {error && <p role="alert" className={styles.notice}>{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {verifying ? <div className={styles.links}>
      <button disabled={busy || cooldown > 0} onClick={() => void resend()}>{cooldown ? t(`Resend in ${cooldown}s`, `${cooldown}초 후 다시 받기`) : t('Resend code', '인증번호 다시 받기')}</button>
      <button disabled={busy} onClick={() => { setVerifying(false); setNonce(''); setError(''); setNotice(''); }}>{t('Back', '돌아가기')}</button>
    </div> : <Link className={styles.textButton} href="/signin?mode=forgot">{t('Forgot password?', '비밀번호를 잊으셨나요?')}</Link>}
    <Link className={styles.textButton} href="/me/settings">{t('Back to settings', '설정으로 돌아가기')}</Link>
  </section>;
}
