import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authConfigured, profileSetupPath, safeReturnPath, signInPath } from '@/lib/auth-routing';
import { emptyProfile, profileComplete } from '@/lib/data';
export async function GET(req:NextRequest){
 const code=req.nextUrl.searchParams.get('code');
 const next=safeReturnPath(req.nextUrl.searchParams.get('next'));
 if(code && authConfigured()){
  try {
   const supabase=await createClient();
   const {data,error}=await supabase.auth.exchangeCodeForSession(code);
   if(!error){
    let destination=next;
    if(next!=='/reset-password'&&data.user){
     const {data:profileRow,error:profileError}=await supabase.from('profiles').select('profile').eq('user_id',data.user.id).maybeSingle();
     if(!profileError&&!profileComplete({...emptyProfile,...(profileRow?.profile??{})}))destination=profileSetupPath(next);
    }
    const response=NextResponse.redirect(new URL(destination,req.url));
    response.headers.set('Cache-Control','private, no-store');
    return response;
   }
  } catch { /* Offer a fresh sign-in after an expired code or network failure. */ }
 }
 const response=NextResponse.redirect(new URL(signInPath(next)+'&error=auth',req.url));
 response.headers.set('Cache-Control','private, no-store');
 return response;
}
