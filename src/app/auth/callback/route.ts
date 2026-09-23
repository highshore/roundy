import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authConfigured, safeReturnPath, signInPath } from '@/lib/auth-routing';
export async function GET(req:NextRequest){
 const code=req.nextUrl.searchParams.get('code');
 const next=safeReturnPath(req.nextUrl.searchParams.get('next'));
 if(code && authConfigured()){
  try {
   const supabase=await createClient();
   const {error}=await supabase.auth.exchangeCodeForSession(code);
   if(!error){
    const response=NextResponse.redirect(new URL(next,req.url));
    response.headers.set('Cache-Control','private, no-store');
    return response;
   }
  } catch { /* Offer a fresh sign-in after an expired code or network failure. */ }
 }
 const response=NextResponse.redirect(new URL(signInPath(next)+'&error=auth',req.url));
 response.headers.set('Cache-Control','private, no-store');
 return response;
}
