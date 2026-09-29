'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { RoundyBrand } from './roundy-brand';
import { tr, type Locale } from '@/lib/locale';
import styles from './sign-in.module.css';
import { PasswordForm } from './password-form';

function preferredLocale():Locale {
  try {
    const saved=localStorage.getItem('roundy-locale');
    if(saved==='en'||saved==='ko')return saved;
  } catch {}
  const browser=(navigator.languages?.[0]??navigator.language??'en').toLowerCase();
  return browser==='ko'||browser.startsWith('ko-')?'ko':'en';
}

export function ResetPassword() {
  const [locale,setLocale]=useState<Locale>('en');
  const [ready,setReady]=useState(false);const [message,setMessage]=useState('');
  useEffect(()=>{const next=preferredLocale();setLocale(next);document.documentElement.lang=next;},[]);
  useEffect(()=>{createClient().auth.getUser().then(({data:{user},error})=>{if(user&&!error)setReady(true);else setMessage(tr(preferredLocale(),'Open the password reset link from your email.','이메일의 비밀번호 재설정 링크를 열어 주세요.'));}).catch(()=>setMessage(tr(preferredLocale(),'Could not check your reset link. Request a new one.','재설정 링크를 확인하지 못했어요. 새로 요청해 주세요.')));},[]);
  return <main className={'content sign-in-panel '+styles.panel}><RoundyBrand/>{ready?<PasswordForm locale={locale} recovery/>:<><p role="status">{message||tr(locale,'Checking reset link…','재설정 링크 확인 중…')}</p><Link href="/signin?mode=forgot">{tr(locale,'Request a new reset link','재설정 링크 다시 받기')}</Link></>}</main>;
}
