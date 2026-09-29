'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { RoundyBrand } from './roundy-brand';
import { tr, type Locale } from '@/lib/locale';
import styles from './sign-in.module.css';

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
  const [ready,setReady]=useState(false);const [busy,setBusy]=useState(false);const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');const [message,setMessage]=useState('');const [done,setDone]=useState(false);
  useEffect(()=>{const next=preferredLocale();setLocale(next);document.documentElement.lang=next;},[]);
  useEffect(()=>{createClient().auth.getUser().then(({data:{user},error})=>{if(user&&!error)setReady(true);else setMessage(tr(preferredLocale(),'Open the password reset link from your email.','이메일의 비밀번호 재설정 링크를 열어 주세요.'));});},[]);
  async function submit(e:FormEvent){e.preventDefault();if(busy||!ready)return;if(password!==confirm){setMessage(tr(locale,'Passwords do not match.','비밀번호가 일치하지 않아요.'));return;}setBusy(true);setMessage('');try{const {error}=await createClient().auth.updateUser({password});if(error)throw error;setPassword('');setConfirm('');setDone(true);setMessage(tr(locale,'Password updated.','비밀번호가 변경되었어요.'));}catch{setMessage(tr(locale,'Could not update password. Try a new reset link and a stronger password.','비밀번호를 변경하지 못했어요. 새 재설정 링크와 더 안전한 비밀번호로 다시 시도해 주세요.'));}finally{setBusy(false);}}
  return <main className={'content sign-in-panel '+styles.panel}><RoundyBrand/><h1 className={styles.resetTitle}>{tr(locale,'Reset password','비밀번호 재설정')}</h1>{!done&&<form className={styles.form} onSubmit={submit}><fieldset className={styles.fields} disabled={!ready||busy}><label>{tr(locale,'New password','새 비밀번호')}<input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><label>{tr(locale,'Confirm password','비밀번호 확인')}<input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><button className="button">{busy?tr(locale,'Saving…','저장 중…'):tr(locale,'Save password','비밀번호 저장')}</button></fieldset></form>}{message&&<p role="status">{message}</p>}<Link href={done?'/me':'/signin'}>{done?tr(locale,'Continue','계속하기'):tr(locale,'Back to sign in','로그인으로 돌아가기')}</Link></main>;
}
