import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authConfigured, profileSetupPath, safeReturnPath, signInPath } from '@/lib/auth-routing';
import { emptyProfile, profileComplete } from '@/lib/data';
import { kakaoProfilePrefill, type KakaoUserInfo } from '@/lib/kakao-profile';
import { deliverRoundyWelcome } from '@/lib/roundy-welcome.server';

export const runtime='nodejs';

const kakaoImageTypes: Record<string, string> = {
 'image/jpeg': 'jpg',
 'image/png': 'png',
 'image/webp': 'webp',
};

export async function GET(req:NextRequest){
 const code=req.nextUrl.searchParams.get('code');
 const next=safeReturnPath(req.nextUrl.searchParams.get('next'));
 if(code && authConfigured()){
  try {
   const supabase=await createClient();
   const {data,error}=await supabase.auth.exchangeCodeForSession(code);
   if(!error){
    // The welcome queue exists only for accounts created after this feature is
    // deployed. A chat outage must never block a verified sign-in.
    if(data.user)await deliverRoundyWelcome(data.user.id).catch(()=>undefined);
    let destination=next;
    if(next!=='/reset-password'&&next!=='/me/email'&&data.user){
     const {data:profileRow,error:profileError}=await supabase.from('profiles').select('profile').eq('user_id',data.user.id).maybeSingle();
     let profile=profileRow?.profile??{};
     const isKakao=data.user.app_metadata.provider==='kakao'||data.user.identities?.some(identity=>identity.provider==='kakao')===true;

     if(!profileError&&isKakao&&data.session?.provider_token){
      try {
       const kakaoResponse=await fetch('https://kapi.kakao.com/v2/user/me',{
        headers:{Authorization:'Bearer '+data.session.provider_token},
        signal:AbortSignal.timeout(5000),
       });
       if(kakaoResponse.ok){
        const prefill=kakaoProfilePrefill(await kakaoResponse.json() as KakaoUserInfo);
        const merged={...profile};
        let changed=false;
        for(const key of ['full_name','birth_date','gender','phone'] as const){
         if(!merged[key]&&prefill[key]){merged[key]=prefill[key];changed=true;}
        }

        if((!Array.isArray(merged.photos)||merged.photos.length===0)&&prefill.profile_image_url){
         try {
          const photoResponse=await fetch(prefill.profile_image_url,{signal:AbortSignal.timeout(5000)});
          const contentType=(photoResponse.headers.get('content-type')??'').split(';')[0].trim().toLowerCase();
          const extension=kakaoImageTypes[contentType];
          if(photoResponse.ok&&extension){
           const bytes=new Uint8Array(await photoResponse.arrayBuffer());
           if(bytes.byteLength>0&&bytes.byteLength<=2097152){
            const key=data.user.id+'/'+crypto.randomUUID()+'.'+extension;
            const {error:uploadError}=await supabase.storage.from('wis-profile-photos').upload(key,bytes,{contentType,upsert:false});
            if(!uploadError){merged.photos=['/api/photos/'+key];changed=true;}
           }
          }
         } catch { /* Profile image import is optional. */ }
        }

        if(changed){
         const payload={user_id:data.user.id,profile:merged,updated_at:new Date().toISOString()};
         const write=profileRow
          ?await supabase.from('profiles').update(payload).eq('user_id',data.user.id)
          :await supabase.from('profiles').insert(payload);
         if(!write.error)profile=merged;
        }
       }
      } catch { /* Kakao prefill must never block a successful sign-in. */ }
     }

     if(!profileError&&!profileComplete({...emptyProfile,...profile}))destination=profileSetupPath(next);
    }
    const response=NextResponse.redirect(new URL(destination,req.url));
    response.headers.set('Cache-Control','private, no-store');
    return response;
   }
  } catch { /* Offer a fresh sign-in after an expired code or network failure. */ }
 }
 // Secure email change can confirm one address without creating a new session.
 if(next==='/me/email'&&authConfigured()&&!req.nextUrl.searchParams.has('error')){
  try {
   const {data:{user}}=await (await createClient()).auth.getUser();
   if(user){const response=NextResponse.redirect(new URL(next,req.url));response.headers.set('Cache-Control','private, no-store');return response;}
  } catch { /* Fall through to a fresh sign-in if session validation fails. */ }
 }
 const response=NextResponse.redirect(new URL(signInPath(next)+'&error=auth',req.url));
 response.headers.set('Cache-Control','private, no-store');
 return response;
}
