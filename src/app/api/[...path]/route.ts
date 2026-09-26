import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { formatKoreanPhone, interests, isKoreanPhone } from '@/lib/data';
import { countryCodes,normalizeNationality } from '@/lib/profile-options';
import { marketingApi } from '@/lib/marketing';
import { eventInput } from '@/lib/event-input';
import { searchPlaces,resolvePlace } from '@/lib/naver';
import { summarizeWork } from '@/lib/profile-summary';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
async function isAdmin(supabase:Awaited<ReturnType<typeof createClient>>){const {data,error}=await supabase.rpc('is_admin');if(error)throw error;return data===true;}
async function eventSlugMap(supabase:Awaited<ReturnType<typeof createClient>>,ids:string[]){if(!ids.length)return new Map<string,string>();const {data,error}=await supabase.from('events').select('id,slug').in('id',ids);if(error)throw error;return new Map((data??[]).map(row=>[String(row.id),String(row.slug)]));}
async function handle(req:NextRequest,{params}:{params:Promise<{path:string[]}>}){
 if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)return json({error:'Roundy is being connected. Please try again soon.'},503);
 if(req.method!=='GET'&&req.headers.get('origin')!==req.nextUrl.origin)return json({error:'Invalid request origin'},403);
 const path=(await params).path;const supabase=await createClient();
 try{
  if(path[0]==='events'&&path.length===1&&req.method==='GET'){const {data,error}=await supabase.from('events').select('*').order('starts_at');if(error)throw error;return json({events:data});}
  const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user)return json({error:'Sign in required'},401);
  if(user.app_metadata.provider!=='kakao')return json({error:'Please sign in with Kakao'},403);
  if(path[0]==='events'&&path.length===3&&path[2]==='attendees'&&req.method==='GET'){
   const eventId=path[1];if(!/^[0-9a-f-]{36}$/i.test(eventId))return json({error:'Invalid event ID'},400);
   const {data,error}=await supabase.rpc('event_attendees',{p_event:eventId});if(error)throw error;return json({attendees:data});
  }
  if(path[0]==='admin'){
   const admin=await isAdmin(supabase);
   if(path[1]==='role'&&req.method==='GET')return json({isAdmin:admin});
   if(!admin)return json({error:'Administrator access required'},403);
   if(path[1]==='marketing')return await marketingApi(req,supabase,path.slice(2));
   if(path[1]==='overview'&&path.length===2&&req.method==='GET'){
    const now=new Date().toISOString();
    const [members,pending,upcoming,drafts,events]=await Promise.all([
     supabase.from('profiles').select('user_id',{count:'exact',head:true}),
     supabase.from('verifications').select('user_id',{count:'exact',head:true}).eq('status','Reviewing'),
     supabase.from('events').select('id',{count:'exact',head:true}).eq('status','live').gt('starts_at',now),
     supabase.from('events').select('id',{count:'exact',head:true}).eq('status','draft'),
     supabase.from('events').select('*').eq('status','live').gt('starts_at',now).order('starts_at').limit(5)
    ]);
    for(const result of [members,pending,upcoming,drafts,events])if(result.error)throw result.error;
    return json({members:members.count??0,pending:pending.count??0,upcoming:upcoming.count??0,drafts:drafts.count??0,events:events.data??[]});
   }
   if(path[1]==='integrations'&&req.method==='GET'){const {data:{session}}=await supabase.auth.getSession();const health=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+'/functions/v1/roundy-reminders',{headers:{Authorization:'Bearer '+session?.access_token,apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!},signal:AbortSignal.timeout(5000)}).then(r=>r.ok?r.json():null).catch(()=>null);return json({naver:Boolean(process.env.NAVER_API_HUB_CLIENT_ID&&process.env.NAVER_API_HUB_CLIENT_SECRET),reminders:Boolean(health?.configured),summaries:Boolean(process.env.OPENAI_API_KEY)});}
   if(path[1]==='members'&&path.length===2&&req.method==='GET'){const {data,error}=await supabase.rpc('admin_members');if(error)throw error;return json({members:data??[]});}
   if(path[1]==='members'&&path.length===3&&req.method==='PATCH'){const body=await req.json();const id=path[2];const status=body.status;const reason=typeof body.rejection_reason==='string'?body.rejection_reason:'';if(!/^[0-9a-f-]{36}$/i.test(id)||!['Approved','Rejected'].includes(status))return json({error:'Invalid member review.'},400);if(status==='Rejected'&&!reason)return json({error:'Choose a rejection reason.'},400);const {data,error}=await supabase.rpc('admin_review_member',{p_member:id,p_status:status,p_rejection_reason:reason});if(error)throw error;return json({member:data});}
   if(path[1]==='places'&&req.method==='GET'){const query=req.nextUrl.searchParams.get('q')?.trim();if(!query||query.length>200)return json({error:'Enter a place name or Korean address.'},400);return json({places:await searchPlaces(query)});}
   if(path[1]==='check-in'&&req.method==='POST'){
    const body=await req.json();const token=String(body.token||'').trim();if(!/^[0-9a-f-]{36}$/i.test(token))return json({error:'Invalid check-in QR'},400);
    const {data,error}=await supabase.rpc('admin_check_in_by_token',{p_token:token});if(error)throw error;return json({checkIn:data});
   }
   if(path[1]==='events'&&path.length===4&&path[3]==='event-night'){
    const eventId=path[2];if(!/^[0-9a-f-]{36}$/i.test(eventId))return json({error:'Invalid event ID'},400);
    if(req.method==='GET'){const {data,error}=await supabase.rpc('admin_event_night_state',{p_event:eventId});if(error)throw error;return json({state:data});}
    if(req.method==='POST'){
     const body=await req.json();const action=String(body.action||'');
     if(action==='check-in'){const userId=String(body.userId||'');if(!/^[0-9a-f-]{36}$/i.test(userId)||typeof body.checked!=='boolean')return json({error:'Invalid check-in request'},400);const {error}=await supabase.rpc('admin_set_check_in',{p_event:eventId,p_user:userId,p_checked:body.checked});if(error)throw error;}
     else if(action==='prepare'){const {error}=await supabase.rpc('admin_prepare_event_night',{p_event:eventId});if(error)throw error;}
     else if(action==='start'){const {error}=await supabase.rpc('admin_start_event_night',{p_event:eventId});if(error)throw error;}
     else if(action==='advance'){const {error}=await supabase.rpc('admin_advance_event_night',{p_event:eventId});if(error)throw error;}
     else if(action==='finish'){const {error}=await supabase.rpc('admin_finish_event_night',{p_event:eventId});if(error)throw error;}
     else return json({error:'Invalid meetup action'},400);
     const {data,error}=await supabase.rpc('admin_event_night_state',{p_event:eventId});if(error)throw error;return json({state:data});
    }
    return json({error:'Method not allowed'},405);
   }
   if(path[1]==='events'&&path.length===4&&path[3]==='seating'&&['GET','POST'].includes(req.method)){const {data,error}=await supabase.rpc(req.method==='POST'?'generate_seating':'get_seating',{p_event:path[2]});if(error)throw error;return json(data);}
   if(path[1]==='events'&&path.length===2&&req.method==='GET'){
    const {data,error}=await supabase.from('events').select('*').order('starts_at',{ascending:false});if(error)throw error;return json({events:data});
   }
   if(path[1]==='events'&&path.length===2&&req.method==='POST'){
    const input=eventInput(await req.json());if(input.latitude===null){const place=await resolvePlace(input.venue,input.address);if(!place)return json({error:'Select a location from search results to confirm its coordinates.'},400);Object.assign(input,{address:place.address,latitude:place.latitude,longitude:place.longitude});}const {data,error}=await supabase.from('events').insert(input).select('*').single();if(error)throw error;return json({event:data},201);
   }
   if(path[1]==='events'&&path.length===3){
    const id=path[2];if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:'Invalid event ID'},400);
    if(req.method==='PUT'){const input=eventInput(await req.json());if(input.latitude===null){const place=await resolvePlace(input.venue,input.address);if(!place)return json({error:'Select a location from search results to confirm its coordinates.'},400);Object.assign(input,{address:place.address,latitude:place.latitude,longitude:place.longitude});}const {data,error}=await supabase.from('events').update(input).eq('id',id).select('*').single();if(error)throw error;return json({event:data});}
    if(req.method==='DELETE'){const {error}=await supabase.from('events').delete().eq('id',id);if(error)throw error;return json({deleted:true});}
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
   if(req.method==='GET'&&path.length===3){if(path[1]!==user.id&&!await isAdmin(supabase)){const {data:canView,error:visibilityError}=await supabase.rpc('can_view_attendee_photo',{p_member:path[1]});if(visibilityError||canView!==true)return json({error:'Photo unavailable'},404);}const {data,error}=await supabase.storage.from('wis-profile-photos').download(path.slice(1).join('/'));if(error)throw error;return new NextResponse(data,{headers:{'Content-Type':data.type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
   return json({error:'Photo unavailable'},404);
  }
  if(path[0]==='profile'){
   if(req.method==='GET'){const [{data,error},{data:verification,error:vError}]=await Promise.all([supabase.from('profiles').select('profile').eq('user_id',user.id).maybeSingle(),supabase.from('verifications').select('status').eq('user_id',user.id).maybeSingle()]);if(error||vError)throw error||vError;return json({profile:data?.profile??{},verification:verification?.status??'Not started'});}
   if(req.method==='PUT'){
    const body=await req.json();const profile:Record<string,unknown>={};
    for(const key of ['full_name','birth_date','gender','nationality','job_title','workplace','phone']){if(typeof body[key]!=='string'||body[key].length>200)return json({error:'Invalid profile field'},400);profile[key]=body[key].trim();}
    profile.phone=formatKoreanPhone(String(profile.phone));if(profile.phone&&!isKoreanPhone(String(profile.phone)))return json({error:'Use a Korean mobile number in the format 010-1234-5678.'},400);
    if(!Number.isInteger(body.height_cm)||body.height_cm<100||body.height_cm>250||typeof body.contact_consent!=='boolean')return json({error:'Invalid height or consent'},400);
    if(!Array.isArray(body.interests)||body.interests.length>10||body.interests.some((x:unknown)=>typeof x!=='string'||!interests.includes(x))||new Set(body.interests).size!==body.interests.length)return json({error:'Choose up to 10 distinct interests'},400);
    if(!Array.isArray(body.photos)||body.photos.length>3||body.photos.some((x:unknown)=>typeof x!=='string'||!x.startsWith('/api/photos/'+user.id+'/')||!/^\/api\/photos\/[a-f0-9-]+\/[a-f0-9-]+\.(jpg|png|webp)$/.test(x)))return json({error:'Invalid photo reference'},400);
    profile.nationality=normalizeNationality(String(profile.nationality));if(profile.nationality&&!countryCodes.includes(String(profile.nationality)))return json({error:'Choose a nationality from the list.'},400);
    const {data:old,error:oldError}=await supabase.from('profiles').select('profile').eq('user_id',user.id).maybeSingle();if(oldError)throw oldError;
    const summary=old?.profile?.job_title===profile.job_title&&old?.profile?.workplace===profile.workplace&&old?.profile?.summary_status==='generated'?{public_job:old.profile.public_job,public_workplace:old.profile.public_workplace,summary_status:'generated'}:await summarizeWork(String(profile.job_title),String(profile.workplace));
    Object.assign(profile,summary);
    Object.assign(profile,{height_cm:body.height_cm,contact_consent:body.contact_consent,interests:body.interests,photos:body.photos});
    const profileRow={user_id:user.id,profile,updated_at:new Date().toISOString()};const write=old?await supabase.from('profiles').update(profileRow).eq('user_id',user.id):await supabase.from('profiles').insert(profileRow);if(write.error)throw write.error;return json({saved:true});
   }
  }
  if(path[0]==='credits'&&req.method==='GET'){
   const now=new Date().toISOString();
   const {data,error}=await supabase.from('credit_lots').select('remaining,expires_at').gt('remaining',0).gt('expires_at',now);if(error)throw error;
   const balance=(data??[]).reduce((sum,row)=>sum+Number(row.remaining||0),0);
   const nextExpiry=(data??[]).map(row=>String(row.expires_at||'')).filter(Boolean).sort()[0]??null;
   return json({balance,nextExpiry});
  }
  if(path[0]==='applications'){
   if(req.method==='GET'){const {data,error}=await supabase.from('applications').select('id,status,event_id');if(error)throw error;const rows=data??[];const slugs=await eventSlugMap(supabase,[...new Set(rows.map(a=>String(a.event_id)))]);return json({applications:rows.map(a=>({id:a.id,status:a.status,event_slug:slugs.get(String(a.event_id))}))});}
   if(req.method==='POST'){const body=await req.json();const {data,error}=await supabase.rpc('apply',{p_event:body.eventId});if(error)throw error;return json({id:data,status:'Reviewing'},201);}
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
   const {data:existing,error:readError}=await supabase.from('verifications').select('user_id').eq('user_id',user.id).maybeSingle();if(readError)throw readError;
   const payload={instagram,linkedin,document_path,method};const {error}=existing?await supabase.from('verifications').update(payload).eq('user_id',user.id):await supabase.from('verifications').insert({user_id:user.id,...payload});if(error)throw error;return json({saved:true});
  }
  if(path[0]==='referral'){
   if(path.length===1&&req.method==='GET'){const {data,error}=await supabase.rpc('get_my_referral_code');if(error)throw error;return json({referralCode:data??''});}
   if(path.length===1&&req.method==='POST'){const {data,error}=await supabase.rpc('get_or_create_referral_code');if(error)throw error;return json({referralCode:data});}
   if(path[1]==='quote'&&req.method==='POST'){const body=await req.json();const code=typeof body.code==='string'?body.code.trim().toUpperCase():'';const quantity=Number(body.quantity);if(!/^[A-Z0-9]{6}$/.test(code)||![1,3].includes(quantity))return json({error:'Enter a valid 6-character referral code.'},400);const {data,error}=await supabase.rpc('referral_quote',{p_code:code,p_quantity:quantity});if(error)throw error;return json({quote:data});}
   return json({error:'Not found'},404);
  }
  if(path[0]==='account'&&req.method==='DELETE'){
   const body=await req.json().catch(()=>({}));
   if(body.confirmation!=='delete account')return json({error:'Type "delete account" to confirm.'},400);
   const {data:{session},error:sessionError}=await supabase.auth.getSession();
   if(sessionError||!session?.access_token)return json({error:'Sign in required'},401);
   const response=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+'/functions/v1/roundy-delete-account',{
    method:'POST',
    headers:{Authorization:'Bearer '+session.access_token,apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,'Content-Type':'application/json'},
    body:JSON.stringify({confirmation:'delete account'}),
    signal:AbortSignal.timeout(15000)
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok)return json({error:typeof result.error==='string'?result.error:'Could not delete account.'},response.status);
   return json({deleted:true});
  }
  if(path[0]==='checkout'){
   if(req.method!=='POST')return json({error:'Method not allowed'},405);
   const body=await req.json();const eventId=typeof body.eventId==='string'?body.eventId:'';const quantity=Number(body.quantity);const referralCode=typeof body.referralCode==='string'?body.referralCode.trim().toUpperCase():'';
   if(!referralCode)return json({error:'Payments are not enabled yet. Enter a valid referral code to use the 100% discount, or use an existing ticket.'},503);
   if(body.termsAccepted!==true)return json({error:'Confirm the cancellation guidelines and terms before enrolling'},400);
   if(!/^[0-9a-f-]{36}$/i.test(eventId)||![1,3].includes(quantity)||!/^[A-Z0-9]{6}$/.test(referralCode))return json({error:'Invalid checkout request'},400);
   const {data,error}=await supabase.rpc('redeem_referral',{p_event:eventId,p_quantity:quantity,p_code:referralCode,p_terms_accepted:true});if(error)throw error;return json({free:true,result:data});
  }
  if(path[0]==='event-night'&&path.length===2){
   const eventId=path[1];if(!/^[0-9a-f-]{36}$/i.test(eventId))return json({error:'Invalid event ID'},400);
   if(req.method==='GET'){const {data,error}=await supabase.rpc('event_night_state',{p_event:eventId});if(error)throw error;const {data:booking,error:bookingError}=await supabase.from('bookings').select('check_in_token').eq('event_id',eventId).eq('user_id',user.id).maybeSingle();if(bookingError)throw bookingError;const checkInUrl=booking?.check_in_token?'https://roundy.team/check-in/'+booking.check_in_token:null;return json({state:{...(data??{}),check_in_url:checkInUrl}});}
   if(req.method==='POST'){
    const body=await req.json();const action=String(body.action||'');
    if(action==='choice'){const encounterId=String(body.encounterId||'');const choice=String(body.choice||'');if(!/^[0-9a-f-]{36}$/i.test(encounterId)||!['no','maybe','yes'].includes(choice))return json({error:'Invalid choice'},400);const {error}=await supabase.rpc('choose',{p_encounter:encounterId,p_choice:choice});if(error)throw error;}
    else if(action==='submit'){const {error}=await supabase.rpc('submit_event_choices',{p_event:eventId});if(error)throw error;}
    else return json({error:'Invalid meetup action'},400);
    const {data,error}=await supabase.rpc('event_night_state',{p_event:eventId});if(error)throw error;return json({state:data});
   }
   return json({error:'Method not allowed'},405);
  }
  if(path[0]==='bookings'){
   if(req.method==='GET'){const {data,error}=await supabase.from('bookings').select('id,event_id');if(error)throw error;const rows=data??[];const slugs=await eventSlugMap(supabase,[...new Set(rows.map(b=>String(b.event_id)))]);return json({bookings:rows.map(b=>({id:b.id,event_slug:slugs.get(String(b.event_id))}))});}
   if(req.method==='POST'){const body=await req.json();if(body.termsAccepted!==true)return json({error:'Confirm the cancellation guidelines and terms before enrolling'},400);const {data,error}=await supabase.rpc('redeem',{p_event:body.eventId,p_terms_accepted:true});if(error)throw error;return json({id:data});}
   if(req.method==='DELETE'){const body=await req.json();const eventId=typeof body.eventId==='string'?body.eventId:'';if(!/^[0-9a-f-]{36}$/i.test(eventId))return json({error:'Invalid event ID'},400);const {data,error}=await supabase.rpc('cancel_booking',{p_event:eventId});if(error)throw error;return json({cancelled:data===true});}
  }
  if(path[0]==='choices'&&req.method==='POST'){const body=await req.json();const {error}=await supabase.rpc('choose',{p_encounter:body.encounterId,p_choice:body.choice});if(error)throw error;return json({saved:true});}
  if(path[0]==='matches'&&req.method==='GET'){
   if(path[1]&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path[1]))return json({error:'Invalid match ID'},400);
   if(path.length===3&&path[2]==='contact'){const {data,error}=await supabase.rpc('match_contact',{p_match:path[1]});if(error)throw error;return json({contact:data});}
   if(path.length>2)return json({error:'Not found'},404);
   const {data,error}=await supabase.rpc('match_cards',{p_match:path[1]??null});if(error)throw error;
   if(path[1]&&!data?.length)return json({error:'Match unavailable'},404);
   return json({matches:data??[]});
  }
  if(path[0]==='reports'&&req.method==='POST'){const body=await req.json();if(typeof body.reason!=='string'||body.reason.length<10||body.reason.length>5000||typeof body.context!=='string'||body.context.length>500)return json({error:'Include event context and a description of 10–5,000 characters.'},400);const {error}=await supabase.from('reports').insert({user_id:user.id,context:body.context,reason:body.reason});if(error)throw error;return json({submitted:true},201);}
  return json({error:'Not found'},404);
 }catch(error){const message=error instanceof Error?error.message:typeof error==='object'&&error&&'message'in error?String(error.message):'Request failed';return json({error:message},400);}
}
export {handle as GET,handle as POST,handle as PUT,handle as PATCH,handle as DELETE};
