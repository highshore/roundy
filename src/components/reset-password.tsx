'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { RoundyBrand } from './roundy-brand';
import { tr, type Locale } from '@/lib/locale';
import styles from './sign-in.module.css';
import { PasswordForm } from './password-form';
import './auth-shell.css';

export function ResetPassword({ locale }: { locale: Locale }) {
  const [status, setStatus] = useState<'checking' | 'ready' | 'missing' | 'error'>('checking');
  useEffect(() => {
    let active = true;
    createClient().auth.getUser().then(({ data: { user }, error }) => {
      if (active) setStatus(user && !error ? 'ready' : 'missing');
    }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, []);
  return <section className={'sign-in-panel ' + styles.panel}>
    <RoundyBrand/>
    {status === 'ready' ? <PasswordForm locale={locale} recovery/> : <>
      <h1>{tr(locale, 'Reset password', '비밀번호 재설정')}</h1>
      <p role="status">{status === 'checking'
        ? tr(locale, 'Checking reset link…', '재설정 링크 확인 중…')
        : status === 'missing'
          ? tr(locale, 'Open the password reset link from your email.', '이메일의 비밀번호 재설정 링크를 열어 주세요.')
          : tr(locale, 'Could not check your reset link. Request a new one.', '재설정 링크를 확인하지 못했어요. 새로 요청해 주세요.')}</p>
      {status !== 'checking' && <Link className="button" href="/signin?mode=forgot">{tr(locale, 'Request a new reset link', '재설정 링크 다시 받기')}</Link>}
    </>}
  </section>;
}
