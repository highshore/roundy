'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, LockKeyhole, MessageCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { authConfigured, safeReturnPath } from '@/lib/auth-routing';

export function SignIn({ eventSlug }: { eventSlug?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('error')) {
      setError('Sign-in wasn’t completed. Please try Kakao again.');
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
      setError('We couldn’t connect to Kakao. Please try again in a moment.');
      setBusy(false);
    }
  }

  return <section className="sign-in-panel">
    <Link className="signin-back" href={eventSlug ? '/events/' + eventSlug : '/discover'}><ArrowLeft size={18}/> Keep Exploring</Link>
    <div className="signin-art" aria-hidden="true"><span/><span/><i>R</i></div>
    <div className="intro"><p className="eyebrow">YOUR NEXT HELLO</p><h1>Good Company Starts Here</h1><p className="description">Sign in with Kakao to save your profile, join an evening, and see your mutual matches.</p></div>
    <button className="button kakao-button" disabled={busy || !authConfigured()} onClick={signIn}><MessageCircle size={22} fill="currentColor"/>{busy ? 'Connecting to Kakao…' : 'Continue with Kakao'}</button>
    {!authConfigured() && <p role="status" className="signin-notice">Sign-in is being set up. You can still explore Roundy.</p>}
    {error && <p role="alert" className="signin-notice">{error}</p>}
    <p className="signin-privacy"><LockKeyhole size={17}/> Your profile is private, not a public listing</p>
    <p className="note">New here? Your account is created when you continue. Read our <Link href="/how-it-works">event rules and privacy principles</Link>.</p>
  </section>;
}
