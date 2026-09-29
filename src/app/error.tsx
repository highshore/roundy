'use client';
import { useEffect, useState } from 'react';
import { tr, type Locale } from '@/lib/locale';

function detectLocale():Locale {
  try {
    const saved=localStorage.getItem('roundy-locale');
    if(saved==='en'||saved==='ko')return saved;
  } catch {}
  const browser=(navigator.languages?.[0]??navigator.language??'en').toLowerCase();
  return browser==='ko'||browser.startsWith('ko-')?'ko':'en';
}

export default function ErrorPage({reset}:{reset:()=>void}) {
  const [locale,setLocale]=useState<Locale>('en');
  useEffect(()=>{const next=detectLocale();setLocale(next);document.documentElement.lang=next;},[]);
  return <main className="content narrow"><h1>{tr(locale,'Something went wrong.','문제가 발생했어요.')}</h1><p>{tr(locale,'Please try again. Your saved choices won’t be changed.','다시 시도해 주세요. 저장된 선택 내용은 변경되지 않아요.')}</p><button className="button" onClick={reset}>{tr(locale,'Try again','다시 시도')}</button></main>;
}
