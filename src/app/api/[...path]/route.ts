import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { interests } from '@/lib/data';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
async function handle(req:NextRequest,{params}:{params:Promise<{path:string[]}>}){
 if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)return json({error:'Roundy is being connected. Please try again soon.'},503);
 if(req.method!=='GET'&&req.headers.get('origin')!==req.nextUrl.origin)return json({error:'Invalid request origin'},403);
 const path=(await params).path;const supabase=await createClient();
 try{
  if(path[0]==='events'&&req.method==='GET'){const {data,error}=await supabase.from('wis_events').select('*').order('starts_at');if(error)throw error;return json({events:data});}
  const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user)return json({error:'Sign in required'},401);
  if(user.app_metadata.provider!=='kakao')return json({error:'Please sign in with Kakao'},403);
  if(path[0]==='photos'){
   if(req.method==='POST'){
    const form=await req.formData();const photo=form.get('photo');
    if(!(photo instanceof File)||photo.size>2097152||!['image/jpeg','image/png','image/webp'].includes(photo.type))return json({error:'Use a JPEG, PNG or WebP under 2 MB.'},400);
    const key=user.id+'/'+crypto.randomUUID()+'.'+({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[photo.type]);
    const {error}=await supabase.storage.from('wis-profile-photos').upload(key,photo,{contentType:photo.type,upsert:false});if(error)throw error;
    return json({url:'/api/photos/'+key});
   }
   if(req.method==='GET'&&path.length===3&&path[1]===user.id){const {data,error}=await supabase.storage.from('wis-profile-photos').download(path.slice(1).join('/'));if(error)throw error;return new NextResponse(data,{headers:{'Content-Type':data.type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
   return json({error:'Photo unavailable'},404);
  }
  if(path[0]==='profile'){
   if(req.method==='GET'){const [{data,error},{data:verification,error:vError}]=await Promise.all([supabase.from('wis_profiles').select('profile').eq('user_id',user.id).maybeSingle(),supabase.from('wis_verifications').select('status').eq('user_id',user.id).maybeSingle()]);if(error||vError)throw error||vError;return json({profile:data?.profile??{},verification:verification?.status??'Not started'});}
   if(req.method==='PUT'){
    const body=await req.json();const profile:Record<string,unknown>={};
    for(const key of ['full_name','birth_date','gender','nationality','job_title','workplace','public_job','public_workplace','phone']){if(typeof body[key]!=='string'||body[key].length>200)return json({error:'Invalid profile field'},400);profile[key]=body[key].trim();}
    if(!Number.isInteger(body.height_cm)||body.height_cm<100||body.height_cm>250||typeof body.contact_consent!=='boolean')return json({error:'Invalid height or consent'},400);
    if(!Array.isArray(body.interests)||body.interests.length>10||body.interests.some((x:unknown)=>typeof x!=='string'||!interests.includes(x))||new Set(body.interests).size!==body.interests.length)return json({error:'Choose up to 10 distinct interests'},400);
    if(!Array.isArray(body.photos)||body.photos.length>3||body.photos.some((x:unknown)=>typeof x!=='string'||!x.startsWith('/api/photos/'+user.id+'/')||!/^\/api\/photos\/[a-f0-9-]+\/[a-f0-9-]+\.(jpg|png|webp)$/.test(x)))return json({error:'Invalid photo reference'},400);
    Object.assign(profile,{height_cm:body.height_cm,contact_consent:body.contact_consent,interests:body.interests,photos:body.photos});
    const {error}=await supabase.from('wis_profiles').upsert({user_id:user.id,profile,updated_at:new Date().toISOString()});if(error)throw error;return json({saved:true});
   }
  }
  if(path[0]==='applications'){
   if(req.method==='GET'){const {data,error}=await supabase.from('wis_applications').select('id,status,wis_events(slug)');if(error)throw error;return json({applications:(data??[]).map(a=>({id:a.id,status:a.status,event_slug:(a.wis_events as unknown as {slug:string})?.slug}))});}
   if(req.method==='POST'){const body=await req.json();const {data,error}=await supabase.rpc('wis_apply',{p_event:body.eventId});if(error)throw error;return json({id:data,status:'Reviewing'},201);}
  }
  if(path[0]==='verification'&&req.method==='POST'){
   const body=await req.json();const instagram=String(body.instagram??'').trim(),linkedin=String(body.linkedin??'').trim();if((!instagram&&!linkedin)||instagram.length>200||linkedin.length>300)return json({error:'Provide a valid social account'},400);
   const {data:existing,error:readError}=await supabase.from('wis_verifications').select('user_id').eq('user_id',user.id).maybeSingle();if(readError)throw readError;
   const {error}=existing?await supabase.from('wis_verifications').update({instagram,linkedin}).eq('user_id',user.id):await supabase.from('wis_verifications').insert({user_id:user.id,instagram,linkedin});if(error)throw error;return json({saved:true});
  }
  if(path[0]==='checkout')return json({error:'Payments are not enabled. No charge has been made.'},503);
  if(path[0]==='bookings'&&req.method==='POST'){const body=await req.json();const {data,error}=await supabase.rpc('wis_redeem',{p_event:body.eventId});if(error)throw error;return json({id:data});}
  if(path[0]==='choices'&&req.method==='POST'){const body=await req.json();const {error}=await supabase.rpc('wis_choose',{p_encounter:body.encounterId,p_choice:body.choice});if(error)throw error;return json({saved:true});}
  if(path[0]==='matches'&&req.method==='GET'){
   if(path[1]){const {data,error}=await supabase.rpc('wis_match_profile',{p_match:path[1]});if(error)throw error;return json({profile:data});}
   const {data,error}=await supabase.from('wis_matches').select('id,event_id,created_at');if(error)throw error;return json({matches:data});
  }
  if(path[0]==='reports'&&req.method==='POST'){const body=await req.json();if(typeof body.reason!=='string'||body.reason.length<10||body.reason.length>5000||typeof body.context!=='string'||body.context.length>500)return json({error:'Include event context and a description of 10–5,000 characters.'},400);const {error}=await supabase.from('wis_reports').insert({user_id:user.id,context:body.context,reason:body.reason});if(error)throw error;return json({submitted:true},201);}
  return json({error:'Not found'},404);
 }catch(error){const message=error instanceof Error?error.message:typeof error==='object'&&error&&'message'in error?String(error.message):'Request failed';return json({error:message},400);}
}
export {handle as GET,handle as POST,handle as PUT};
