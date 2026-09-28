'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Smartphone } from 'lucide-react';
import { RoundyBrand } from './roundy-brand';
import { KakaoLoginSymbol } from './kakao-login-symbol';
import { createClient } from '@/lib/supabase/client';
import { authConfigured, safeReturnPath } from '@/lib/auth-routing';
import { tr, type Locale } from '@/lib/locale';
import { COUNTRY_DIAL_OPTIONS, DEFAULT_COUNTRY_DIAL_ID, toE164 } from '@/lib/country-codes';
import styles from './sign-in.module.css';
import './auth-shell.css';

export function SignIn({ eventSlug, locale }: { eventSlug?: string; locale: Locale }) {
  const [busy, setBusy] = useState(false);
  const [showMethods, setShowMethods] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [countryId, setCountryId] = useState(DEFAULT_COUNTRY_DIAL_ID);
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [phoneEnabled, setPhoneEnabled] = useState<boolean | null>(null);
  const t = (en: string, ko: string) => tr(locale, en, ko);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('error')) {
      setError(t('Sign-in wasn’t completed. Please try again.', '로그인이 완료되지 않았어요. 다시 시도해 주세요.'));
    }
    const controller = new AbortController();
    fetch('/auth/settings', { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then(settings => setPhoneEnabled(settings.phone === true))
      .catch(() => {
        if (!controller.signal.aborted) setPhoneEnabled(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(value => value - 1), 1000);
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

  function showError(value: unknown) {
    const authError = value as { code?: string; message?: string };
    if (authError.code === 'over_request_rate_limit') {
      setError(t('Too many attempts. Please wait and try again.', '요청이 많아요. 잠시 후 다시 시도해 주세요.'));
    } else if (authError.code === 'otp_expired') {
      setError(t('The code is invalid or has expired. Request a new code.', '인증번호가 올바르지 않거나 만료되었어요. 다시 요청해 주세요.'));
    } else if (authError.code === 'otp_disabled') {
      setError(t('Phone sign-in could not start. Please try again in a moment.', '휴대폰 로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.'));
    } else if (authError.code === 'sms_send_failed' || /sms|twilio/i.test(authError.message ?? '')) {
      setError(t('The verification message could not be sent. Please try again later.', '인증 문자를 보내지 못했어요. 잠시 후 다시 시도해 주세요.'));
    } else {
      setError(t('We couldn’t complete your request. Check your details and try again.', '요청을 완료하지 못했어요. 입력 내용을 확인하고 다시 시도해 주세요.'));
    }
  }

  async function kakao() {
    if (busy || !authConfigured()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { error: authError } = await createClient().auth.signInWithOAuth({
        provider: 'kakao',
        options: {
          redirectTo: callback(),
          scopes: 'profile_nickname profile_image',
        },
      });
      if (authError) throw authError;
    } catch (authError) {
      showError(authError);
      setBusy(false);
    }
  }

  async function sendCode() {
    const normalized = toE164(countryId, phone);
    if (!normalized) {
      setError(t('Choose a country code and enter a valid phone number.', '국가번호를 선택하고 올바른 휴대폰 번호를 입력해 주세요.'));
      return false;
    }
    const { error: authError } = await createClient().auth.signInWithOtp({
      phone: normalized,
      options: { shouldCreateUser: true },
    });
    if (authError) throw authError;
    setSentTo(normalized);
    setCode('');
    setCooldown(60);
    setNotice(t('Enter the verification code sent to your phone.', '문자로 받은 인증번호를 입력해 주세요.'));
    return true;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !authConfigured() || phoneEnabled !== true) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (!sentTo) {
        await sendCode();
        return;
      }
      const { error: authError } = await createClient().auth.verifyOtp({
        phone: sentTo,
        token: code.trim(),
        type: 'sms',
      });
      if (authError) throw authError;
      window.location.assign(nextPath());
    } catch (authError) {
      showError(authError);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (busy || cooldown) return;
    setBusy(true);
    setError('');
    try {
      await sendCode();
    } catch (authError) {
      showError(authError);
    } finally {
      setBusy(false);
    }
  }

  const legal = <div className={styles.legal}>
    <Link href="/terms">{t('Terms of Use', '이용약관')}</Link>
    <span aria-hidden="true">|</span>
    <Link href="/privacy">{t('Privacy Policy', '개인정보처리방침')}</Link>
  </div>;

  if (showMethods) {
    return <section className={'sign-in-panel ' + styles.panel} aria-busy={busy}>
      <div className={styles.brand}><RoundyBrand/></div>
      <div className={styles.methodHeading}>
        <p>{t('Sign up or sign in to join your next meetup.', '회원가입하거나 로그인하고 모임에 참여해 보세요.')}</p>
      </div>
      <div className={styles.providerList}>
        <button type="button" disabled={busy || !authConfigured()} onClick={() => void kakao()}>
          <span className={styles.kakaoIcon}><KakaoLoginSymbol/></span>
          <span>{t('Continue with Kakao', '카카오로 계속하기')}</span>
        </button>
        <button type="button" disabled={busy} onClick={() => { setShowMethods(false); setError(''); setNotice(''); }}>
          <Smartphone size={20}/>
          <span>{t('Continue with phone', '휴대폰 번호로 계속하기')}</span>
        </button>
      </div>
      {error && <p role="alert" className={styles.notice}>{error}</p>}
      {legal}
    </section>;
  }

  return <section className={'sign-in-panel ' + styles.panel} aria-busy={busy}>
    <div className={styles.topline}>
      <button type="button" className={styles.back} disabled={busy} onClick={() => {
        setShowMethods(true);
        setError('');
        setNotice('');
        setCode('');
        setSentTo('');
      }}>
        <ArrowLeft size={18}/>{t('All sign-in options', '로그인 방법 선택')}
      </button>
    </div>
    <div className={styles.brand}><RoundyBrand/></div>
    <div className={styles.heading}>
      <h1>{t('Continue with your phone.', '휴대폰 번호로 계속하기')}</h1>
      <p>{t('We’ll send you a verification code.', '문자로 인증번호를 보내드릴게요.')}</p>
    </div>
    {phoneEnabled === false && <p className={styles.notice} role="status">
      {t('Phone sign-in is temporarily unavailable. Please use Kakao.', '휴대폰 로그인을 사용할 수 없어요. 카카오 로그인을 이용해 주세요.')}
    </p>}
    <form className={styles.form} onSubmit={submit}>
      <fieldset disabled={busy || phoneEnabled !== true} className={styles.fields}>
        <label>
          {t('Phone number', '휴대폰 번호')}
          <div className={styles.phoneRow}>
            <select
              className={styles.countrySelect}
              aria-label={t('Country code', '국가번호')}
              value={countryId}
              disabled={!!sentTo}
              onChange={event => setCountryId(event.target.value)}
            >
              {COUNTRY_DIAL_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <input
              type="tel"
              required
              inputMode="tel"
              autoComplete="tel-national"
              value={phone}
              readOnly={!!sentTo}
              onChange={event => setPhone(event.target.value.replace(/[^\d\s()-]/g, '').slice(0, 24))}
              placeholder="01068584123"
              aria-describedby="phone-format"
            />
          </div>
        </label>
        <p id="phone-format" className={styles.help}>
          {t('Enter the local number only. We’ll add the selected country code.', '휴대폰 번호만 입력해 주세요. 선택한 국가번호는 자동으로 붙어요.')}
        </p>
        {sentTo && <>
          <label>
            {t('Verification code', '인증번호')}
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoComplete="one-time-code"
              value={code}
              onChange={event => setCode(event.target.value.replace(/\D/g, ''))}
            />
          </label>
          <div className={styles.links}>
            <button type="button" disabled={cooldown > 0} onClick={() => void resend()}>
              {cooldown ? t('Resend in ' + cooldown + 's', cooldown + '초 후 재전송') : t('Resend code', '인증번호 재전송')}
            </button>
            <button type="button" onClick={() => { setSentTo(''); setCode(''); setNotice(''); }}>
              {t('Change number', '번호 변경')}
            </button>
          </div>
        </>}
        <button type="submit" className={styles.primary}>
          {busy ? t('Please wait…', '처리 중…') : sentTo ? t('Verify and continue', '인증하고 계속하기') : t('Send verification code', '인증번호 받기')}
        </button>
      </fieldset>
    </form>
    {error && <p role="alert" className={styles.notice}>{error}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {legal}
  </section>;
}
