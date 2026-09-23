import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
export async function GET(req:NextRequest){
 const code=req.nextUrl.searchParams.get('code');const next=req.nextUrl.searchParams.get('next')??'/me';
 // Strict internal path allowlist prevents protocol-relative or encoded redirect tricks.
 const safeNext=/^\/(me|onboarding|applications)(\/[a-z0-9-]+)*$/.test(next)?next:'/me';
 if(code){const supabase=await createClient();const {error}=await supabase.auth.exchangeCodeForSession(code);if(!error)return NextResponse.redirect(new URL(safeNext,req.url));}
 return NextResponse.redirect(new URL('/signin?error=auth',req.url));
}
