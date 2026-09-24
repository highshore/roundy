import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { formatKoreanPhone, interests, isKoreanPhone } from '@/lib/data';
import { countryCodes,normalizeNationality } from '@/lib/profile-options';
import { eventInput } from '@/lib/event-input';
import { searchPlaces,resolvePlace } from '@/lib/naver';
import { summarizeWork } from '@/lib/profile-summary';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
async function isAdmin(supabase:Awaited<ReturnType<typeof createClient>>){const {data,error}=await supabase.rpc('wis_is_admin');if(error)throw error;return data===true;}
async function handle(req:NextRequest,{params}:{params:Promise<{path:string[]}>}){
 if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)return json({error:'Roundy is being connected. Please try again soon.'},503);
 if(req.method!=='GET'&&req.headers.get('origin')!==req.nextUrl.origin)return json({error:'Invalid request origin'},403);
 const path=(await params).path;const supabase=await createClient();
 try{
  if(path[0]==='events'&&req.method==='GET'){const {data,error}=await supabase.from('wis_events').select('*').order('starts_at');if(error)throw error;return json({events:data});}
  const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user)return json({error:'Sign in required'},401);
  if(user.app_metadata.provider!=='kakao')return json({error:'Please sign in with Kakao'},403);
  if(path[0]==='admin'){
   const admin=await isAdmin(supabase);
   if(path[1]==='role'&&req.method==='GET')return json({isAdmin:admin});
   if(!admin)return json({error:'Administrator access required'},403);
   if(path[1]==='integrations'&&req.method==='GET'){const {data:{session}}=await supabase.auth.getSession();const health=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+'/functions/v1/roundy-reminders',{headers:{Authorization:'Bearer '+session?.access_token,apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!},signal:AbortSignal.timeout(5000)}).then(r=>r.ok?r.json():null).catch(()=>null);return json({naver:Boolean(process.env.NAVER_API_HUB_CLIENT_ID&&process.env.NAVER_API_HUB_CLIENT_SECRET),reminders:Boolean(health?.configured),summaries:Boolean(process.env.OPENAI_API_KEY)});}
   if(path[1]==='members'&&path.length===2&&req.method==='GET'){const {data,error}=await supabase.rpc('wis_admin_members');if(error)throw error;return json({members:data??[]});}
   if(path[1]==='members'&&path.length===3&&req.method==='PATCH'){const body=await req.json();const id=path[2];const status=body.status;const reason=typeof body.rejection_reason==='string'?body.rejection_reason:'';if(!/^[0-9a-f-]{36}$/i.test(id)||!['Approved','Rejected'].includes(status))return json({error:'Invalid member review.'},400);if(status==='Rejected'&&!reason)return json({error:'Choose a rejection reason.'},400);const {data,error}=await supabase.rpc('wis_admin_review_member',{p_member:id,p_status:status,p_rejection_reason:reason});if(error)throw error;return json({member:data});}
   if(path[1]==='places'&&req.method==='GET'){const query=req.nextUrl.searchParams.get('q')?.trim();if(!query||query.length>200)return json({error:'Enter a place name or Korean address.'},400);return json({places:await searchPlaces(query)});}
   if(path[1]==='events'&&path.length===4&&path[3]==='seating'&&['GET','POST'].includes(req.method)){const {data,error}=await supabase.rpc(req.method==='POST'?'wis_generate_seating':'wis_get_seating',{p_event:path[2]});if(error)throw error;return json(data);}
   if(path[1]==='events'&&path.length===2&&req.method==='GET'){
    const {data,error}=await supabase.from('wis_events').select('*').order('starts_at',{ascending:false});if(error)throw error;return json({events:data});
   }
   if(path[1]==='events'&&path.length===2&&req.method==='POST'){
    const input=eventInput(await req.json());if(input.latitude===null){const place=await resolvePlace(input.venue,input.address);if(!place)return json({error:'Select a location from search results to confirm its coordinates.'},400);Object.assign(input,{address:place.address,latitude:place.latitude,longitude:place.longitude});}const {data,error}=await supabase.from('wis_events').insert(input).select('*').single();if(error)throw error;return json({event:data},201);
   }
   if(path[1]==='events'&&path.length===3){
    const id=path[2];if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:'Invalid event ID'},400);
    if(req.method==='PUT'){const input=eventInput(await req.json());if(input.latitude===null){const place=await resolvePlace(input.venue,input.address);if(!place)return json({error:'Select a location from search results to confirm its coordinates.'},400);Object.assign(input,{address:place.address,latitude:place.latitude,longitude:place.longitude});}const {data,error}=await supabase.from('wis_events').update(input).eq('id',id).select('*').single();if(error)throw error;return json({event:data});}
    if(req.method==='DELETE'){const {error}=await supabase.from('wis_events').delete().eq('id',id);if(error)throw error;return json({deleted:true});}
   }
   return json({error:'Not found'},404);
  }
  if(path[0]==='photos'){
   if(req.method==='POST'){
    const form=await req.formData();const photo=form.get('photo');
    if(!(photo instanceof File)||photo.size>2097152||!['image/jpeg','image/png','image/webp'].includes(photo.type))return json({error:'Use a JPEG, PNG or WebP under 2 MB.'},400);
    const key=user.id+'/'+crypto.randomUUID()+'.'+({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[photo.type]);
    const {error}=await supabase.storage.from('wis-profile-photos').upload(key,photo,{contentType:photo.type,upsert:false});if(error)throw error;
    return json({url:'/api/photos/'+key});
   }
   if(req.method==='GET'&&path.length===3){if(path[1]!==user.id&&!await isAdmin(supabase))return json({error:'Photo unavailable'},404);const {data,error}=await supabase.storage.from('wis-profile-photos').download(path.slice(1).join('/'));if(error)throw error;return new NextResponse(data,{headers:{'Content-Type':data.type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
   return json({error:'Photo unavailable'},404);
  }
  if(path[0]==='profile'){
   if(req.method==='GET'){const [{data,error},{data:verification,error:vError}]=await Promise.all([supabase.from('wis_profiles').select('profile').eq('user_id',user.id).maybeSingle(),supabase.from('wis_verifications').select('status').eq('user_id',user.id).maybeSingle()]);if(error||vError)throw error||vError;return json({profile:data?.profile??{},verification:verification?.status??'Not started'});}
   if(req.method==='PUT'){
    const body=await req.json();const profile:Record<string,unknown>={};
    for(const key of ['full_name','birth_date','gender','nationality','job_title','workplace','phone']){if(typeof body[key]!=='string'||body[key].length>200)return json({error:'Invalid profile field'},400);profile[key]=body[key].trim();}
    profile.phone=formatKoreanPhone(String(profile.phone));if(profile.phone&&!isKoreanPhone(String(profile.phone)))return json({error:'Use a Korean mobile number in the format 010-1234-5678.'},400);
    if(!Number.isInteger(body.height_cm)||body.height_cm<100||body.height_cm>250||typeof body.contact_consent!=='boolean')return json({error:'Invalid height or consent'},400);
    if(!Array.isArray(body.interests)||body.interests.length>10||body.interests.some((x:unknown)=>typeof x!=='string'||!interests.includes(x))||new Set(body.interests).size!==body.interests.length)return json({error:'Choose up to 10 distinct interests'},400);
    if(!Array.isArray(body.photos)||body.photos.length>3||body.photos.some((x:unknown)=>typeof x!=='string'||!x.startsWith('/api/photos/'+user.id+'/')||!/^\/api\/photos\/[a-f0-9-]+\/[a-f0-9-]+\.(jpg|png|webp)$/.test(x)))return json({error:'Invalid photo reference'},400);
    profile.nationality=normalizeNationality(String(profile.nationality));if(profile.nationality&&!countryCodes.includes(String(profile.nationality)))return json({error:'Choose a nationality from the list.'},400);
    const {data:old,error:oldError}=await supabase.from('wis_profiles').select('profile').eq('user_id',user.id).maybeSingle();if(oldError)throw oldError;
    const summary=old?.profile?.job_title===profile.job_title&&old?.profile?.workplace===profile.workplace&&old?.profile?.summary_status==='generated'?{public_job:old.profile.public_job,public_workplace:old.profile.public_workplace,summary_status:'generated'}:await summarizeWork(String(profile.job_title),String(profile.workplace));
    Object.assign(profile,summary);
    Object.assign(profile,{height_cm:body.height_cm,contact_consent:body.contact_consent,interests:body.interests,photos:body.photos});
    const {error}=await supabase.from('wis_profiles').upsert({user_id:user.id,profile,updated_at:new Date().toISOString()});if(error)throw error;return json({saved:true});
   }
  }
  if(path[0]==='applications'){
   if(req.method==='GET'){const {data,error}=await supabase.from('wis_applications').select('id,status,wis_events(slug)');if(error)throw error;return json({applications:(data??[]).map(a=>({id:a.id,status:a.status,event_slug:(a.wis_events as unknown as {slug:string})?.slug}))});}
   if(req.method==='POST'){const body=await req.json();const {data,error}=await supabase.rpc('wis_apply',{p_event:body.eventId});if(error)throw error;return json({id:data,status:'Reviewing'},201);}
  }
  if(path[0]==='verification-documents'&&req.method==='GET'&&path.length===3){
   if(path[1]!==user.id&&!await isAdmin(supabase))return json({error:'Document unavailable'},404);const {data,error}=await supabase.storage.from('wis-verification-documents').download(path.slice(1).join('/'));if(error)throw error;return new NextResponse(data,{headers:{'Content-Type':data.type,'Cache-Control':'private, no-store','Content-Disposition':'attachment','X-Content-Type-Options':'nosniff'}});
  }
  if(path[0]==='verification'&&req.method==='POST'){
   const body=await req.json();const method=body.verification_method;
   let instagram='',linkedin='',document_path='';
   if(method==='instagram'){instagram=String(body.instagram??'').trim();if(!/^[A-Za-z0-9_.]{1,30}$/.test(instagram)||instagram.includes('..'))return json({error:'Enter only your Instagram username.'},400);}
   else if(method==='linkedin'){const username=String(body.linkedin??'').trim();if(!/^[A-Za-z0-9_-]{1,100}$/.test(username))return json({error:'Enter only the LinkedIn username after /in/.'},400);linkedin='https://www.linkedin.com/in/'+username;}
   else if(method==='document'){document_path=String(body.document_path??'');if(!document_path.startsWith(user.id+'/')||!new RegExp('^[a-f0-9-]+/[a-f0-9-]+\\.(pdf|jpg|png|webp)$').test(document_path))return json({error:'Upload your work or student proof.'},400);const {data,error}=await supabase.storage.from('wis-verification-documents').list(user.id,{search:document_path.split('/')[1]});if(error||!data?.some(f=>f.name===document_path.split('/')[1]))return json({error:'Document upload could not be verified.'},400);}
   else return json({error:'Choose one verification method.'},400);
   const {data:existing,error:readError}=await supabase.from('wis_verifications').select('user_id').eq('user_id',user.id).maybeSingle();if(readError)throw readError;
   const payload={instagram,linkedin,document_path,method};const {error}=existing?await supabase.from('wis_verifications').update(payload).eq('user_id',user.id):await supabase.from('wis_verifications').insert({user_id:user.id,...payload});if(error)throw error;return json({saved:true});
  }
  if(path[0]==='checkout')return json({error:'Payments are not enabled. No charge has been made.'},503);
  if(path[0]==='bookings'){
   if(req.method==='GET'){const {data,error}=await supabase.from('wis_bookings').select('id,wis_events(slug)');if(error)throw error;return json({bookings:(data??[]).map(b=>({id:b.id,event_slug:(b.wis_events as unknown as {slug:string})?.slug}))});}
   if(req.method==='POST'){const body=await req.json();const {data,error}=await supabase.rpc('wis_redeem',{p_event:body.eventId});if(error)throw error;return json({id:data});}
  }
  if(path[0]==='choices'&&req.method==='POST'){const body=await req.json();const {error}=await supabase.rpc('wis_choose',{p_encounter:body.encounterId,p_choice:body.choice});if(error)throw error;return json({saved:true});}
  if(path[0]==='matches'&&req.method==='GET'){
   if(path[1]){const {data,error}=await supabase.rpc('wis_match_profile',{p_match:path[1]});if(error)throw error;return json({profile:data});}
   const {data,error}=await supabase.from('wis_matches').select('id,event_id,created_at');if(error)throw error;return json({matches:data});
  }
  if(path[0]==='reports'&&req.method==='POST'){const body=await req.json();if(typeof body.reason!=='string'||body.reason.length<10||body.reason.length>5000||typeof body.context!=='string'||body.context.length>500)return json({error:'Include event context and a description of 10–5,000 characters.'},400);const {error}=await supabase.from('wis_reports').insert({user_id:user.id,context:body.context,reason:body.reason});if(error)throw error;return json({submitted:true},201);}
  return json({error:'Not found'},404);
 }catch(error){const message=error instanceof Error?error.message:typeof error==='object'&&error&&'message'in error?String(error.message):'Request failed';return json({error:message},400);}
}
export {handle as GET,handle as POST,handle as PUT,handle as PATCH,handle as DELETE};
