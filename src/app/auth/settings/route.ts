import { NextResponse } from 'next/server';
import { authConfigured } from '@/lib/auth-routing';

export async function GET() {
  if (!authConfigured()) return NextResponse.json({ email: false, phone: false });
  try {
    const response = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/auth/v1/settings', {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
      signal: AbortSignal.timeout(5000), cache: 'no-store',
    });
    if (!response.ok) throw new Error('Settings unavailable');
    const settings = await response.json();
    return NextResponse.json({ email: settings.external?.email === true, phone: settings.external?.phone === true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ email: false, phone: false }, { status: 503 });
  }
}
