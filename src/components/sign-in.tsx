'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, MessageCircle, Smartphone, Eye, EyeOff, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { authConfigured, safeReturnPath } from '@/lib/auth-routing';
import { tr, type Locale } from '@/lib/locale';
import { LegalConsentDialog, recordLegalConsent } from './legal-consent';
import styles from './sign-in.module.css';
import './auth-shell.css';

type Method = 'email' | 'phone';
type Mode = 'signin' | 'signup' | 'forgot';

export function SignIn({ eventSlug, locale }: { eventSlug?: string; locale: Locale }) {
  const [busy, setBusy] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [signupAgreed, setSignupAgreed] = useState(false);
  const [showMethods, setShowMethods] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [method, setMethod] = useState<Method>('email');
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [providers, setProviders] = useState<{email: boolean; phone: boolean} | null>(null);
  const t = (en: string, ko: string) => tr(locale, en, ko);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('error')) setError(t('Sign-in wasn’t completed. Please try again.', '로그인이 완료되지 않았어요. 다시 시도해 주세요.'));
    const controller = new AbortController();
    fetch('/auth/settings', { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(setProviders).catch(() => { if (!controller.signal.aborted) setProviders({ email: false, phone: false }); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(n => n - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  function nextPath() {
    const query = new URLSearchParams(window.location.search);
    return safeReturnPath(query.get('next') ?? (eventSlug ? '/onboarding/basics/' + eventSlug : '/me'));
  }
  function callback(next = nextPath()) {
    const url = new URL('/auth/callback', window.location.origin);
    url.searchParams.set('next', next);
    return url.toString();
  }
  function switchView(nextMethod: Method, nextMode: Mode) {
    setSignupAgreed(false); setConsentOpen(false); setMethod(nextMethod); setMode(nextMode); setError(''); setNotice(''); setPassword(''); setConfirm(''); setCode(''); setSentTo(''); setShowPassword(false);
  }
  function showError(value: unknown) {
    const code = (value as { code?: string })?.code;
    if (code === 'invalid_credentials') setError(t('ID, email or password is incorrect.', '아이디, 이메일 또는 비밀번호를 확인해 주세요.'));
    else if (code === 'email_not_confirmed') setError(t('Confirm your email before signing in.', '이메일 인증을 완료한 후 로그인해 주세요.'));
    else if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') setError(t('Too many attempts. Please wait and try again.', '요청이 많아요. 잠시 후 다시 시도해 주세요.'));
    else if (code === 'otp_expired') setError(t('The code is invalid or has expired. Request a new code.', '인증번호가 올바르지 않거나 만료되었어요. 다시 요청해 주세요.'));
    else if (code === 'weak_password') setError(t('Choose a stronger password with at least 8 characters, including letters and numbers.', '영문과 숫자를 포함한 8자 이상의 비밀번호를 입력해 주세요.'));
    else setError(t('We couldn’t complete your request. Check your details and try again.', '요청을 완료하지 못했어요. 입력 내용을 확인하고 다시 시도해 주세요.'));
  }
  async function kakao() {
    if (busy || !authConfigured()) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const { error } = await createClient().auth.signInWithOAuth({ provider: 'kakao', options: { redirectTo: callback(), scopes: 'profile_nickname profile_image' } });
      if (error) throw error;
    } catch (error) { showError(error); setBusy(false); }
  }
  async function sendCode() {
    const normalized = phone.replace(/[\s()-]/g, '');
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) { setError(t('Include your country code, for example +821012345678.', '국가번호를 포함해 입력해 주세요. 예: +821012345678')); return; }
    const { error } = await createClient().auth.signInWithOtp({ phone: normalized, options: { shouldCreateUser: mode === 'signup' } });
    if (error) throw error;
    setSentTo(normalized); setCode(''); setCooldown(60);
    setNotice(t('Enter the verification code sent to your phone.', '문자로 받은 인증번호를 입력해 주세요.'));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !authConfigured() || !providers?.[method]) return;
    if (mode === 'signup' && method === 'email' && password !== confirm) { setError(t('Passwords do not match.', '비밀번호가 일치하지 않아요.')); return; }
    if (mode === 'signup' && !signupAgreed) { setConsentOpen(true); return; }
    await authenticate();
  }
  async function authenticate() {
    setBusy(true); setError(''); setNotice('');
    try {
      const auth = createClient().auth;
      if (method === 'phone') {
        if (!sentTo) await sendCode();
        else {
          const { error } = await auth.verifyOtp({ phone: sentTo, token: code.trim(), type: 'sms' });
          if (error) throw error;
          if (mode === 'signup') await recordLegalConsent().catch(() => { /* The account popup retries after navigation. */ });
          window.location.assign(nextPath());
        }
      } else if (mode === 'forgot') {
        const { error } = await auth.resetPasswordForEmail(email.trim(), { redirectTo: callback('/reset-password') });
        if (error) throw error;
        setNotice(t('If an account exists, a password reset link will be sent to your email.', '가입된 계정이 있으면 비밀번호 재설정 링크를 이메일로 보내드려요.'));
      } else if (mode === 'signup') {
        if (password !== confirm) { setError(t('Passwords do not match.', '비밀번호가 일치하지 않아요.')); return; }
        const { data, error } = await auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: callback(), data: { username: username.trim().toLowerCase() } } });
        if (error) throw error;
        if (data.session) { await recordLegalConsent().catch(() => { /* The account popup retries after navigation. */ }); window.location.assign(nextPath()); }
        else setNotice(t('Check your email to confirm your account. If you already have an account, sign in.', '이메일에서 계정 인증을 완료해 주세요. 이미 가입했다면 로그인해 주세요.'));
      } else {
        if (email.includes('@')) {
          const { error } = await auth.signInWithPassword({ email: email.trim(), password });
          if (error) throw error;
        } else {
          const { data, error } = await createClient().functions.invoke('roundy-username-login', { body: { username: email.trim().toLowerCase(), password } });
          if (error || !data?.access_token || !data?.refresh_token) {
            let code = data?.code;
            if (!code && error && 'context' in error) {
              try { code = (await error.context.json()).code; } catch { /* Use the generic credential error. */ }
            }
            throw { code: code || 'invalid_credentials' };
          }
          const { error: sessionError } = await auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
          if (sessionError) throw sessionError;
        }
        window.location.assign(nextPath());
      }
      setConsentOpen(false);
    } catch (error) { showError(error); }
    finally { setBusy(false); }
  }
  async function resend() {
    if (busy || cooldown) return;
    setBusy(true); setError('');
    try { await sendCode(); } catch (error) { showError(error); } finally { setBusy(false); }
  }
  const available = authConfigured() && providers?.[method] === true;
  const legal = <div className={styles.legal}><Link href="/terms">{t('Terms of Use', '이용약관')}</Link><span aria-hidden="true">|</span><Link href="/privacy">{t('Privacy Policy', '개인정보처리방침')}</Link></div>;
  if (showMethods) return <section className={'sign-in-panel ' + styles.panel} aria-busy={busy}>
    <div className={styles.methodHeading}>
      <h1>{t('Meet people in real life.', 'Roundy에서 만나요.')}</h1>
      <p>{t('Sign up or sign in to join your next meetup.', '회원가입하거나 로그인하고 모임에 참여해 보세요.')}</p>
    </div>
    <div className={styles.providerList}>
      <button type="button" disabled={busy} onClick={() => { switchView('email', 'signin'); setShowMethods(false); }}><Mail size={20}/><span>{t('Continue with ID or email', '아이디 또는 이메일로 계속하기')}</span></button>
      <button type="button" disabled={busy || !authConfigured()} onClick={kakao}><MessageCircle size={20} fill="#fee500" stroke="#191919"/><span>{t('Continue with Kakao', '카카오로 계속하기')}</span></button>
      <button type="button" disabled={busy} onClick={() => { switchView('phone', 'signin'); setShowMethods(false); }}><Smartphone size={20}/><span>{t('Continue with phone', '휴대폰 번호로 계속하기')}</span></button>
    </div>
    {error && <p role="alert" className={styles.notice}>{error}</p>}
    {legal}
  </section>;
  return <section className={'sign-in-panel ' + styles.panel} aria-busy={busy}>
    {consentOpen && <LegalConsentDialog locale={locale} busy={busy} error={error} onAccept={() => { setSignupAgreed(true); void authenticate(); }} onCancel={() => { setConsentOpen(false); setSignupAgreed(false); }}/> }
    <div className={styles.topline}>
      <button type="button" className={styles.back} disabled={busy} onClick={() => { setShowMethods(true); setError(''); setNotice(''); setPassword(''); setConfirm(''); }}><ArrowLeft size={18}/>{t('All sign-in options', '로그인 방법 선택')}</button>
    </div>
    <div className={styles.heading}>
      <h1>{mode === 'signup' ? t('Create your account', '계정 만들기') : mode === 'forgot' ? t('Forgot your password?', '비밀번호를 잊으셨나요?') : method === 'phone' ? t('Continue with your phone.', '휴대폰 번호로 로그인') : t('Welcome back', '다시 만나 반가워요')}</h1>
      <p>{mode === 'signup' ? t('Create an account to join Roundy.', '계정을 만들고 Roundy에 함께해요.') : mode === 'forgot' ? t('We’ll email you a link to reset it.', '이메일로 재설정 링크를 보내드릴게요.') : method === 'phone' ? t('We’ll send you a verification code.', '문자로 인증번호를 보내드릴게요.') : t('Sign in to your Roundy account.', 'Roundy 계정으로 로그인해 주세요.')}</p>
    </div>
    {providers && !available && <p className={styles.notice} role="status">{method === 'phone' ? t('Phone sign-in is not available yet. Please use email or Kakao.', '휴대폰 로그인은 준비 중이에요. 이메일 또는 카카오를 이용해 주세요.') : t('Email sign-in is temporarily unavailable. Please try again later or use Kakao.', '이메일 로그인을 사용할 수 없어요. 잠시 후 다시 시도하거나 카카오를 이용해 주세요.')}</p>}
    <form className={styles.form} onSubmit={submit}>
      <fieldset disabled={busy || !available} className={styles.fields}>
        {method === 'email' ? <>
          {mode === 'signup' && <label>{t('ID', '아이디')}<input type="text" required minLength={3} maxLength={30} pattern="[a-zA-Z0-9_][a-zA-Z0-9_-]{2,29}" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={e => setUsername(e.target.value)} placeholder={t('Choose your ID', '사용할 아이디 입력')} aria-describedby="id-format"/><small id="id-format">{t('3–30 letters, numbers, underscores or hyphens.', '영문, 숫자, 밑줄, 하이픈 3~30자')}</small></label>}
          <label>{mode === 'signin' ? t('ID or email', '아이디 또는 이메일') : t('Email', '이메일')}<input type={mode === 'signin' ? 'text' : 'email'} required autoComplete={mode === 'signin' ? 'username' : 'email'} autoCapitalize="none" spellCheck={false} value={email} onChange={e => setEmail(e.target.value)} placeholder={mode === 'signin' ? t('Enter your ID or email', '아이디 또는 이메일 입력') : 'you@example.com'} maxLength={254}/></label>
          {mode !== 'forgot' && <label>{t('Password', '비밀번호')}<div className={styles.password}><input aria-label={t('Password', '비밀번호')} type={showPassword ? 'text' : 'password'} required minLength={mode === 'signup' ? 8 : undefined} maxLength={128} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'signup' ? t('At least 8 characters', '8자 이상 입력') : t('Enter your password', '비밀번호 입력')}/><button type="button" aria-label={showPassword ? t('Hide password', '비밀번호 숨기기') : t('Show password', '비밀번호 보기')} aria-pressed={showPassword} onClick={() => setShowPassword(v => !v)}>{showPassword ? <EyeOff size={19}/> : <Eye size={19}/>}</button></div></label>}
          {mode === 'signup' && <label>{t('Confirm password', '비밀번호 확인')}<input type={showPassword ? 'text' : 'password'} required minLength={8} maxLength={128} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={t('Re-enter your password', '비밀번호 다시 입력')}/></label>}
          {mode === 'signin' && <button type="button" className={styles.forgot} onClick={() => { setEmail(''); switchView('email', 'forgot'); }}>{t('Forgot password?', '비밀번호 찾기')}</button>}
        </> : <>
          <label>{t('Phone number', '휴대폰 번호')}<input type="tel" required autoComplete="tel" value={phone} readOnly={!!sentTo} onChange={e => setPhone(e.target.value)} placeholder="+821012345678" aria-describedby="phone-format"/></label>
          <p id="phone-format" className={styles.help}>{t('Include the country code. For Korea, replace the first 0 with +82.', '국가번호를 포함해 주세요. 한국 번호는 맨 앞 0을 +82로 바꿔 입력하세요.')}</p>
          {sentTo && <><label>{t('Verification code', '인증번호')}<input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}/></label><div className={styles.links}><button type="button" disabled={cooldown > 0} onClick={resend}>{cooldown ? t(`Resend in ${cooldown}s`, `${cooldown}초 후 재전송`) : t('Resend code', '인증번호 재전송')}</button><button type="button" onClick={() => { setSentTo(''); setCode(''); setNotice(''); }}>{t('Change number', '번호 변경')}</button></div></>}
        </>}
        <button type="submit" className={styles.primary}>{busy ? t('Please wait…', '처리 중…') : method === 'phone' ? (sentTo ? t('Verify and continue', '인증하고 계속하기') : t('Send verification code', '인증번호 받기')) : mode === 'signup' ? t('Create account', '회원가입') : mode === 'forgot' ? t('Send reset link', '재설정 링크 받기') : t('Sign in', '로그인')}</button>
      </fieldset>
    </form>
    {error && <p role="alert" className={styles.notice}>{error}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {mode !== 'forgot' ? <p className={styles.switchMode}>{mode === 'signup' ? t('Already have an account?', '이미 계정이 있나요?') : t('Don’t have an account?', '계정이 없으신가요?')} <button type="button" disabled={busy} onClick={() => { setEmail(''); switchView(method, mode === 'signup' ? 'signin' : 'signup'); }}>{mode === 'signup' ? t('Log in', '로그인') : t('Sign up', '회원가입')}</button></p> : <button type="button" className={styles.textButton} disabled={busy} onClick={() => switchView('email', 'signin')}>{t('Back to sign in', '로그인으로 돌아가기')}</button>}
    {legal}
  </section>;
}
