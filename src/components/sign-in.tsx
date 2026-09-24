'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, LockKeyhole, MessageCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { authConfigured, safeReturnPath } from '@/lib/auth-routing';
import { LoadingScreen } from './loading-screen';
import { tr, type Locale } from '@/lib/locale';

export function SignIn({ eventSlug, locale }: { eventSlug?: string; locale: Locale }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('error')) {
      setError(tr(locale, 'Sign-in wasn’t completed. Please try Kakao again.', '로그인이 완료되지 않았어요. 카카오로 다시 시도해 주세요.'));
    }
  }, []);

  async function signIn() {
    if (!authConfigured()) return;
    setBusy(true);
    setError('');
    try {
      const query = new URLSearchParams(window.location.search);
      const next = safeReturnPath(query.get('next') ?? (eventSlug ? '/onboarding/basics/' + eventSlug : '/me'));
      const callback = new URL('/auth/callback', window.location.origin);
      callback.searchParams.set('next', next);
      const { error } = await createClient().auth.signInWithOAuth({
        provider: 'kakao',
        options: { redirectTo: callback.toString(), scopes: 'profile_nickname profile_image' },
      });
      if (error) throw error;
    } catch {
      setError(tr(locale, 'We couldn’t connect to Kakao. Please try again in a moment.', '카카오에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'));
      setBusy(false);
    }
  }

  return <section className="sign-in-panel">{busy&&<LoadingScreen/>}
    <Link className="signin-back" href={eventSlug ? '/events/' + eventSlug : '/discover'}><ArrowLeft size={18}/> {tr(locale, 'Keep Exploring', '이벤트 더 둘러보기')}</Link>
    <div className="signin-art" aria-hidden="true"><span/><span/><i>R</i></div>
    <h1 className="sr-only">{tr(locale, 'Sign In', '로그인')}</h1>
    <button className="button kakao-button" disabled={busy || !authConfigured()} onClick={signIn}><MessageCircle size={22} fill="currentColor"/>{busy ? tr(locale, 'Connecting to Kakao…', '카카오에 연결하는 중…') : tr(locale, 'Continue with Kakao', '카카오로 계속하기')}</button>
    {!authConfigured() && <p role="status" className="signin-notice">{tr(locale, 'Sign-in is being set up. You can still explore Roundy.', '로그인 설정을 진행 중이에요. Roundy는 계속 둘러볼 수 있어요.')}</p>}
    {error && <p role="alert" className="signin-notice">{error}</p>}
    <p className="signin-privacy"><LockKeyhole size={17}/> {tr(locale, 'Your profile is private, not a public listing', '프로필은 공개 목록이 아닌, 비공개 정보예요')}</p>
    <p className="note">{tr(locale, 'New here? Your account is created when you continue. Read our ', '처음이신가요? 계속하면 계정이 만들어져요. ')}<Link href="/how-it-works">{tr(locale, 'event rules and privacy principles', '이벤트 규칙과 개인정보 원칙')}</Link>{tr(locale, '.', '을 확인해 주세요.')}</p>
  </section>;
}
