import { isRoundyEvent } from '@/lib/event-scope';
import { isMemberUser } from '@/lib/auth-user';
import { validFeedback } from '@/lib/feedback';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { mbtiTypes, smokingFrequencies, alcoholFrequencies, religions, sameReligionImportance, formatKoreanPhone, interests, isKoreanPhone } from '@/lib/data';
import { countryCodes,normalizeNationality } from '@/lib/profile-options';
import { marketingApi } from '@/lib/marketing';
import { eventInput } from '@/lib/event-input';
import { searchPlaces,resolvePlace } from '@/lib/naver';
import { summarizeWork } from '@/lib/profile-summary';
import { isAtLeastAge, MINIMUM_AGE } from '@/lib/age';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
async function isAdmin(supabase:Awaited<ReturnType<typeof createClient>>){const {data,error}=await supabase.rpc('is_admin');if(error)throw error;return data===true;}
async function eventSlugMap(supabase:Awaited<ReturnType<typeof createClient>>,ids:string[]){if(!ids.length)return new Map<string,string>();const {data,error}=await supabase.from('events').select('id,slug').is('deleted_at',null).in('id',ids);if(error)throw error;return new Map((data??[]).map(row=>[String(row.id),String(row.slug)]));}
async function invokeRoundyCheckout(supabase:Awaited<ReturnType<typeof createClient>>,payload:Record<string,unknown>){
 const {data:{session},error:sessionError}=await supabase.auth.getSession();
 if(sessionError||!session?.access_token)throw new Error('Sign in required');
 const response=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+'/functions/v1/roundy-checkout',{
  method:'POST',
  headers:{Authorization:'Bearer '+session.access_token,apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,'Content-Type':'application/json'},
  body:JSON.stringify(payload),
  signal:AbortSignal.timeout(45000)
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(typeof result.error==='string'?result.error:'Payment request failed');
 return result;
}
async function handle(req:NextRequest,{params}:{params:Promise<{path:string[]}>}){
 if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)return json({error:'Roundy is being connected. Please try again soon.'},503);
 if(req.method!=='GET'&&req.headers.get('origin')!==req.nextUrl.origin)return json({error:'Invalid request origin'},403);
 const path=(await params).path;const supabase=await createClient();
 try{
  if(path[0]==='events'&&path.length===1&&req.method==='GET'){const {data,error}=await supabase.from('events').select('*').is('deleted_at',null).order('starts_at');if(error)throw error;return json({events:(data??[]).filter(isRoundyEvent)});}
  if(path[0]==='events'&&path.length===3&&path[2]==='roster'&&req.method==='GET'){
   const eventId=path[1];if(!/^[0-9a-f-]{36}$/i.test(eventId))return json({error:'Invalid event ID'},400);
   const {data,error}=await supabase.rpc('event_public_roster',{p_event:eventId});if(error)throw error;return json({roster:data});
  }
  const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user)return json({error:'Sign in required'},401);
  if(!isMemberUser(user))return json({error:'Member sign-in required'},403);
  if(path[0]==='events'&&path.length===3&&path[2]==='attendees'&&req.method==='GET'){
   const eventId=path[1];if(!/^[0-9a-f-]{36}$/i.test(eventId))return json({error:'Invalid event ID'},400);
   const {data,error}=await supabase.rpc('event_attendees',{p_event:eventId});if(error)throw error;return json({attendees:data});
  }
  if(path[0]==='feedback'&&path.length===1){
   if(req.method==='GET'){const {data,error}=await supabase.rpc('first_meetup_feedback_context');if(error)throw error;return json(data?.event&&!isRoundyEvent(data.event)?{...data,event:null,eligible:false}:data);}
   if(req.method==='POST'){
    const body=await req.json().catch(()=>null);
    if(!body||typeof body.eventId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.eventId)||!validFeedback(body.survey))return json({error:'Invalid feedback'},400);
    const {data,error}=await supabase.rpc('submit_first_meetup_feedback',{p_event:body.eventId,p_survey:body.survey});
    if(error){if(error.message.includes('First completed attendance required'))return json({error:'Feedback is available after your first checked-in meetup ends.'},403);throw error;}
    return json({submitted:true,id:data},201);
   }
   return json({error:'Method not allowed'},405);
  }
  if(path[0]==='admin'){
   const admin=await isAdmin(supabase);
   if(path[1]==='role'&&req.method==='GET')return json({isAdmin:admin});
   if(!admin)return json({error:'Administrator access required'},403);
   if(path[1]==='reports'&&path.length===2&&req.method==='GET'){
    const status=req.nextUrl.searchParams.get('status')||'all';const kind=req.nextUrl.searchParams.get('kind')||'all';const page=Number(req.nextUrl.searchParams.get('page')||0);
    if(!['all','new','reviewing','resolved','dismissed'].includes(status)||!['all','report','feedback'].includes(kind)||!Number.isInteger(page)||page<0||page>100000)return json({error:'Invalid filters'},400);
    let query=supabase.from('reports').select('id,user_id,context,reason,kind,status,created_at,survey,feedback_event_id,report_reviews(notes,updated_at)',{count:'exact'}).order('created_at',{ascending:false}).order('id').range(page*30,page*30+29);
    if(status!=='all')query=query.eq('status',status);if(kind!=='all')query=query.eq('kind',kind);
    const {data,error,count}=await query;if(error)throw error;return json({reports:data??[],total:count??0});
   }
   if(path[1]==='reports'&&path.length===3&&req.method==='PATCH'){
    const body=await req.json();if(!/^[0-9a-f-]{36}$/i.test(path[2])||!['new','reviewing','resolved','dismissed'].includes(body.status)||typeof body.notes!=='string'||body.notes.length>10000)return json({error:'Invalid review'},400);
    const {error}=await supabase.rpc('admin_review_report',{p_report:path[2],p_status:body.status,p_notes:body.notes});if(error)throw error;return json({saved:true});
   }
   if(path[1]==='promo-codes'){
    const code=path[2]?.trim().toUpperCase()||'';
    const codePattern=/^[A-Z0-9_-]{4,24}$/;
    const parseNullableInt=(value:unknown)=>value===null||value===''?null:Number.isInteger(Number(value))&&Number(value)>0?Number(value):NaN;
    const parseNullableDate=(value:unknown)=>value===null||value===''?null:typeof value==='string'&&!Number.isNaN(Date.parse(value))?new Date(value).toISOString():'invalid';
    const normalizePromo=(body:Record<string,unknown>,partial=false)=>{
      const next:Record<string,unknown>={};
      if(!partial||'campaign_name'in body){if(typeof body.campaign_name!=='string'||body.campaign_name.trim().length>120)throw new Error('Campaign name must be 120 characters or fewer.');next.campaign_name=body.campaign_name.trim();}
      if(!partial||'discount_percent'in body){const discount=Number(body.discount_percent);if(!Number.isInteger(discount)||discount<1||discount>100)throw new Error('Discount must be between 1% and 100%.');next.discount_percent=discount;}
      if(!partial||'active'in body){if(typeof body.active!=='boolean')throw new Error('Invalid active status.');next.active=body.active;}
      if(!partial||'starts_at'in body){const starts=parseNullableDate(body.starts_at);if(starts==='invalid')throw new Error('Invalid start date.');next.starts_at=starts;}
      if(!partial||'ends_at'in body){const ends=parseNullableDate(body.ends_at);if(ends==='invalid')throw new Error('Invalid end date.');next.ends_at=ends;}
      if(!partial||'max_redemptions'in body){const max=parseNullableInt(body.max_redemptions);if(max!==null&&Number.isNaN(max))throw new Error('Total redemption limit must be a positive integer or blank.');next.max_redemptions=max;}
      if(!partial||'max_redemptions_per_user'in body){const maxPerUser=parseNullableInt(body.max_redemptions_per_user);if(maxPerUser!==null&&Number.isNaN(maxPerUser))throw new Error('Per-user limit must be a positive integer or blank.');next.max_redemptions_per_user=maxPerUser;}
      if(!partial||'allowed_user_id'in body){const allowed=body.allowed_user_id===null||body.allowed_user_id===''?null:String(body.allowed_user_id);if(allowed&&!/^[0-9a-f-]{36}$/i.test(allowed))throw new Error('Invalid member restriction.');next.allowed_user_id=allowed;}
      return next;
    };
    if(path.length===2&&req.method==='GET'){
      const service=createServiceRoleClient();
      const [promoResult,redemptionResult,memberResult]=await Promise.all([
        supabase.from('marketing_promo_codes').select('*').order('created_at',{ascending:false}),
        service.from('checkout_discount_redemptions').select('code,user_id,status').eq('kind','marketing').in('status',['reserved','consumed']),
        supabase.rpc('admin_members')
      ]);
      if(promoResult.error)throw promoResult.error;if(redemptionResult.error)throw redemptionResult.error;if(memberResult.error)throw memberResult.error;
      const redemptions=redemptionResult.data??[];
      const codes=(promoResult.data??[]).map(item=>{const rows=redemptions.filter(row=>row.code===item.code);return {...item,redemptions:rows.length,consumed_redemptions:rows.filter(row=>row.status==='consumed').length,distinct_users:new Set(rows.map(row=>row.user_id)).size};});
      const members=((memberResult.data??[]) as Array<Record<string,unknown>>).map(member=>{const profile=member.profile&&typeof member.profile==='object'?member.profile as Record<string,unknown>:{};return {user_id:String(member.user_id||''),email:typeof member.email==='string'?member.email:'',name:typeof profile.full_name==='string'?profile.full_name:''};}).filter(member=>member.user_id);
      return json({codes,members});
    }
    if(path.length===2&&req.method==='POST'){
      const body=await req.json().catch(()=>null);if(!body||typeof body!=='object')return json({error:'Invalid promo code.'},400);
      const next=normalizePromo(body as Record<string,unknown>);
      const nextCode=String((body as Record<string,unknown>).code||'').trim().toUpperCase();if(!codePattern.test(nextCode))return json({error:'Use 4–24 uppercase letters, numbers, underscores or hyphens.'},400);
      if(next.starts_at&&next.ends_at&&Date.parse(String(next.ends_at))<=Date.parse(String(next.starts_at)))return json({error:'End date must be after start date.'},400);
      if(next.allowed_user_id){const service=createServiceRoleClient();const {data:member,error:memberError}=await service.from('members').select('id').eq('id',String(next.allowed_user_id)).maybeSingle();if(memberError)throw memberError;if(!member)return json({error:'Restricted member was not found.'},400);}
      const {data,error}=await supabase.from('marketing_promo_codes').insert({code:nextCode,...next}).select('*').single();if(error){if(error.code==='23505')return json({error:'That promo code already exists.'},409);throw error;}return json({code:data},201);
    }
    if(path.length===3&&codePattern.test(code)&&req.method==='PATCH'){
      const body=await req.json().catch(()=>null);if(!body||typeof body!=='object')return json({error:'Invalid promo code update.'},400);
      const {data:current,error:currentError}=await supabase.from('marketing_promo_codes').select('*').eq('code',code).maybeSingle();if(currentError)throw currentError;if(!current)return json({error:'Promo code not found.'},404);
      const next=normalizePromo(body as Record<string,unknown>,true);
      const starts='starts_at'in next?next.starts_at:current.starts_at;const ends='ends_at'in next?next.ends_at:current.ends_at;
      if(starts&&ends&&Date.parse(String(ends))<=Date.parse(String(starts)))return json({error:'End date must be after start date.'},400);
      if(next.allowed_user_id){const {data:member,error:memberError}=await supabase.from('members').select('id').eq('id',String(next.allowed_user_id)).maybeSingle();if(memberError)throw memberError;if(!member)return json({error:'Restricted member was not found.'},400);}
      if(!Object.keys(next).length)return json({error:'Nothing to update.'},400);
      const {data,error}=await supabase.from('marketing_promo_codes').update(next).eq('code',code).select('*').single();if(error)throw error;return json({code:data});
    }
    if(path.length===3&&codePattern.test(code)&&req.method==='DELETE'){
      const service=createServiceRoleClient();const {count,error:countError}=await service.from('checkout_discount_redemptions').select('id',{count:'exact',head:true}).eq('kind','marketing').eq('code',code).in('status',['reserved','consumed']);if(countError)throw countError;if((count??0)>0)return json({error:'Used promo codes cannot be deleted. Disable the code instead.'},409);
      const {error}=await supabase.from('marketing_promo_codes').delete().eq('code',code);if(error)throw error;return json({deleted:true});
    }
    return json({error:'Not found'},404);
   }

   if(path[1]==='marketing')return await marketingApi(req,supabase,path.slice(2));
   if(path[1]==='overview'&&path.length===2&&req.method==='GET'){
    const now=new Date().toISOString();
    const [members,pending,upcoming,drafts,events]=await Promise.all([
     supabase.from('profiles').select('user_id',{count:'exact',head:true}),
     supabase.from('verifications').select('user_id',{count:'exact',head:true}).eq('status','Reviewing'),
     supabase.from('events').select('id',{count:'exact',head:true}).is('deleted_at',null).eq('status','live').gt('starts_at',now),
     supabase.from('events').select('id',{count:'exact',head:true}).is('deleted_at',null).eq('status','draft'),
     supabase.from('events').select('*').is('deleted_at',null).eq('status','live').gt('starts_at',now).order('starts_at').limit(5)
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
    const {data,error}=await supabase.from('events').select('*').is('deleted_at',null).order('starts_at',{ascending:false});if(error)throw error;return json({events:data});
   }
   if(path[1]==='events'&&path.length===2&&req.method==='POST'){
    const input=eventInput(await req.json());if(input.latitude===null){const place=await resolvePlace(input.venue,input.address);if(!place)return json({error:'Select a location from search results to confirm its coordinates.'},400);Object.assign(input,{address:input.address||place.address,latitude:place.latitude,longitude:place.longitude});}const {data,error}=await supabase.from('events').insert(input).select('*').single();if(error)throw error;return json({event:data},201);
   }
   if(path[1]==='events'&&path.length===3){
    const id=path[2];if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:'Invalid event ID'},400);
    if(req.method==='PUT'){const input=eventInput(await req.json());if(input.latitude===null){const place=await resolvePlace(input.venue,input.address);if(!place)return json({error:'Select a location from search results to confirm its coordinates.'},400);Object.assign(input,{address:input.address||place.address,latitude:place.latitude,longitude:place.longitude});}const {data,error}=await supabase.from('events').update(input).eq('id',id).is('deleted_at',null).select('*').single();if(error)throw error;return json({event:data});}
    if(req.method==='DELETE'){const {data,error}=await supabase.rpc('admin_delete_event',{p_event:id});if(error)throw error;return json(data);}
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
    if(!isAtLeastAge(String(profile.birth_date)))return json({error:`Roundy is available only to people age ${MINIMUM_AGE} or older.`},400);
    profile.phone=formatKoreanPhone(String(profile.phone));if(profile.phone&&!isKoreanPhone(String(profile.phone)))return json({error:'Use a Korean mobile number in the format 010-1234-5678.'},400);
    if(!Number.isInteger(body.height_cm)||body.height_cm<100||body.height_cm>250||typeof body.contact_consent!=='boolean')return json({error:'Invalid height or consent'},400);
    if(!Array.isArray(body.interests)||body.interests.length>10||body.interests.some((x:unknown)=>typeof x!=='string'||!interests.includes(x))||new Set(body.interests).size!==body.interests.length)return json({error:'Choose up to 10 distinct interests'},400);
    if(!Array.isArray(body.photos)||body.photos.length>3||body.photos.some((x:unknown)=>typeof x!=='string'||!x.startsWith('/api/photos/'+user.id+'/')||!/^\/api\/photos\/[a-f0-9-]+\/[a-f0-9-]+\.(jpg|png|webp)$/.test(x)))return json({error:'Invalid photo reference'},400);
    profile.nationality=normalizeNationality(String(profile.nationality));if(profile.nationality&&!countryCodes.includes(String(profile.nationality)))return json({error:'Choose a nationality from the list.'},400);
    const {data:old,error:oldError}=await supabase.from('profiles').select('profile').eq('user_id',user.id).maybeSingle();if(oldError)throw oldError;
    const mbti=body.mbti===undefined?(old?.profile?.mbti??''):body.mbti;if(typeof mbti!=='string'||(mbti!==''&&!mbtiTypes.includes(mbti as typeof mbtiTypes[number])))return json({error:'Choose a valid MBTI type or leave it blank.'},400);profile.mbti=mbti;
    const smokingFrequency=body.smoking_frequency===undefined?(old?.profile?.smoking_frequency??''):body.smoking_frequency;if(typeof smokingFrequency!=='string'||(smokingFrequency!==''&&!smokingFrequencies.includes(smokingFrequency as typeof smokingFrequencies[number])))return json({error:'Choose a valid smoking frequency or leave it blank.'},400);profile.smoking_frequency=smokingFrequency;
    const alcoholFrequency=body.alcohol_frequency===undefined?(old?.profile?.alcohol_frequency??''):body.alcohol_frequency;if(typeof alcoholFrequency!=='string'||(alcoholFrequency!==''&&!alcoholFrequencies.includes(alcoholFrequency as typeof alcoholFrequencies[number])))return json({error:'Choose a valid alcohol frequency or leave it blank.'},400);profile.alcohol_frequency=alcoholFrequency;
    const religion=body.religion===undefined?(old?.profile?.religion??''):body.religion;if(typeof religion!=='string'||(religion!==''&&!religions.includes(religion as typeof religions[number])))return json({error:'Choose a valid religion or leave it blank.'},400);profile.religion=religion;
    const sameReligion=body.same_religion_importance===undefined?(old?.profile?.same_religion_importance??''):body.same_religion_importance;if(typeof sameReligion!=='string'||(sameReligion!==''&&!sameReligionImportance.includes(sameReligion as typeof sameReligionImportance[number])))return json({error:'Choose a valid same-religion preference or leave it blank.'},400);if(!religion&&sameReligion!=='')return json({error:'Choose a religion before setting a same-religion preference.'},400);profile.same_religion_importance=sameReligion;
    const religionConsent=body.religion_consent===undefined?Boolean(old?.profile?.religion_consent):body.religion_consent;if(typeof religionConsent!=='boolean')return json({error:'Invalid religion consent value.'},400);if(religion&&!religionConsent)return json({error:'Consent is required only if you choose to share religion.'},400);profile.religion_consent=religion?religionConsent:false;
    const summary=old?.profile?.job_title===profile.job_title&&old?.profile?.workplace===profile.workplace&&old?.profile?.summary_status==='generated'?{public_job:old.profile.public_job,public_workplace:old.profile.public_workplace,summary_status:'generated'}:await summarizeWork(String(profile.job_title),String(profile.workplace));
    Object.assign(profile,summary);
    Object.assign(profile,{height_cm:body.height_cm,contact_consent:body.contact_consent,interests:body.interests,photos:body.photos});
    const profileRow={user_id:user.id,profile,updated_at:new Date().toISOString()};const write=old?await supabase.from('profiles').update(profileRow).eq('user_id',user.id):await supabase.from('profiles').insert(profileRow);if(write.error)throw write.error;const {data:verification,error:verificationError}=await supabase.from('verifications').select('status').eq('user_id',user.id).maybeSingle();if(verificationError)throw verificationError;return json({saved:true,verification:verification?.status??'Not started'});
   }
  }
  if(path[0]==='credits'&&req.method==='GET')return json({balance:0,nextExpiry:null});
  if(path[0]==='applications'){
   if(req.method==='GET')return json({applications:[]});
   return json({error:'Applications are retired. Continue to event checkout instead.'},410);
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
   if(path[1]==='quote'){
    if(req.method!=='POST')return json({error:'Method not allowed'},405);
    const body=await req.json().catch(()=>null);if(!body||typeof body!=='object')return json({error:'Invalid pricing request'},400);
    const eventId=typeof body.eventId==='string'?body.eventId:'';
    const code=typeof body.code==='string'?body.code.trim().toUpperCase():'';
    if(!/^[0-9a-f-]{36}$/i.test(eventId)||(code&&!/^[A-Z0-9_-]{4,24}$/.test(code)))return json({error:'Invalid pricing request'},400);
    const {data:activeOrder,error:activeOrderError}=await supabase.from('event_payment_orders').select('order_number,status,pricing_snapshot,discount_code').eq('event_id',eventId).eq('user_id',user.id).in('status',['pending_auth','charging']).maybeSingle();
    if(activeOrderError)throw activeOrderError;
    let raw:Record<string,unknown>;
    let paymentPending=false;
    let orderNumber:string|null=null;
    let paymentStatus:string|null=null;
    if(activeOrder?.pricing_snapshot&&typeof activeOrder.pricing_snapshot==='object'){
     raw=activeOrder.pricing_snapshot as Record<string,unknown>;
     paymentPending=true;
     orderNumber=String(activeOrder.order_number);
     paymentStatus=String(activeOrder.status);
    }else{
     const {data,error}=await supabase.rpc('event_checkout_quote',{p_event:eventId,p_code:code||null});if(error)throw error;
     raw=(data??{}) as Record<string,unknown>;
    }
    const codeKind=raw.code_kind==='referral'?'referral':raw.code_kind==='marketing'?'promo':'none';
    const original=Number(raw.base_amount||0);
    const codeDiscount=Number(raw.code_discount_amount||0);
    const totalDiscount=Number(raw.discount_amount||0);
    const quote={
     event_id:String(raw.event_id||eventId),
     gender:raw.gender,
     original_amount:original,
     code:raw.code??null,
     code_kind:codeKind,
     code_valid:raw.code_valid===true,
     code_reason:raw.code_reason?String(raw.code_reason):(raw.code?'invalid':'none'),
     code_discount_percent:Number(raw.code_discount_percent||0),
     referral_discount_amount:codeKind==='referral'?codeDiscount:0,
     promo_discount_amount:codeKind==='promo'?codeDiscount:0,
     gender_balance_discount_amount:Number(raw.gender_balance_discount_amount||0),
     gender_balance_applied:Number(raw.gender_balance_discount_amount||0)>0,
     time_discount_amount:Number(raw.time_discount_amount||0),
     time_discount_kind:raw.time_discount_kind??'none',
     boomerang_discount_amount:Number(raw.boomerang_discount_amount||0),
     boomerang_applied:raw.is_boomerang===true,
     total_discount_amount:totalDiscount,
     total_discount_percent:original>0?Math.round(totalDiscount*100/original):0,
     final_amount:Number(raw.final_amount||0),
     male_count:Number(raw.men_count||0),
     female_count:Number(raw.women_count||0),
     hours_to_start:Number(raw.hours_until_event||0),
     payment_pending:paymentPending,
     payment_status:paymentStatus,
     payment_order_number:orderNumber,
     locked:paymentPending
    };
    return json({quote});
   }
   if(path.length!==1)return json({error:'Not found'},404);
   if(req.method!=='POST')return json({error:'Method not allowed'},405);
   const body=await req.json().catch(()=>null);if(!body||typeof body!=='object')return json({error:'Invalid checkout request'},400);
   const action=String(body.action||'');
   if(action==='create'){
    const eventId=typeof body.eventId==='string'?body.eventId:'';
    const code=typeof body.code==='string'?body.code.trim().toUpperCase():'';
    if(body.termsAccepted!==true)return json({error:'Confirm the cancellation guidelines and terms before payment'},400);
    if(!/^[0-9a-f-]{36}$/i.test(eventId)||(code&&!/^[A-Z0-9_-]{4,24}$/.test(code)))return json({error:'Invalid checkout request'},400);
    return json(await invokeRoundyCheckout(supabase,{action:'create',eventId,code:code||undefined,termsAccepted:true}));
   }
   if(action==='status'){
    const orderNumber=typeof body.orderNumber==='string'?body.orderNumber:'';
    if(!/^RNDY-A-\d{14}-[A-F0-9]{10}$/.test(orderNumber))return json({error:'Invalid payment status request'},400);
    return json(await invokeRoundyCheckout(supabase,{action:'status',orderNumber}));
   }
   if(action==='abandon'){
    const eventId=typeof body.eventId==='string'?body.eventId:'';
    if(!/^[0-9a-f-]{36}$/i.test(eventId))return json({error:'Invalid payment cancellation request'},400);
    return json(await invokeRoundyCheckout(supabase,{action:'abandon',eventId}));
   }
   return json({error:'Invalid checkout action'},400);
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
   if(req.method==='GET'){const [{data,error},{data:pending,error:pendingError}]=await Promise.all([supabase.from('bookings').select('id,event_id,payment_order_number,event_payment_orders(status)'),supabase.from('event_payment_orders').select('order_number,event_id,status,amount').in('status',['pending_auth','charging']).order('created_at',{ascending:false})]);if(error||pendingError)throw error||pendingError;const rows=(data??[]).filter(row=>{const payment=Array.isArray(row.event_payment_orders)?row.event_payment_orders[0]:row.event_payment_orders;return payment?.status==='completed';});const eventIds=[...new Set([...rows.map(b=>String(b.event_id)),...(pending??[]).map(o=>String(o.event_id))])];const slugs=await eventSlugMap(supabase,eventIds);return json({bookings:rows.map(b=>({id:b.id,event_slug:slugs.get(String(b.event_id)),paid:true})),pending_payments:(pending??[]).map(o=>({event_slug:slugs.get(String(o.event_id)),order_number:String(o.order_number),status:String(o.status),amount:Number(o.amount||0)})).filter(o=>o.event_slug)});}
   if(req.method==='DELETE'){
    const body=await req.json();const eventId=typeof body.eventId==='string'?body.eventId:'';if(!/^[0-9a-f-]{36}$/i.test(eventId))return json({error:'Invalid event ID'},400);
    const {data:booking,error:bookingError}=await supabase.from('bookings').select('payment_order_number').eq('event_id',eventId).eq('user_id',user.id).maybeSingle();if(bookingError)throw bookingError;
    if(!booking?.payment_order_number)return json({error:'Paid booking not found'},404);
    const result=await invokeRoundyCheckout(supabase,{action:'cancel',eventId});return json({cancelled:true,refundAmount:Number(result.refundAmount||0),paid:true});
   }
   return json({error:'Method not allowed'},405);
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
  if(path[0]==='reports'&&req.method==='POST'){const body=await req.json();if(typeof body.reason!=='string'||body.reason.length<10||body.reason.length>5000||typeof body.context!=='string'||body.context.length>500)return json({error:'Include event context and a description of 10–5,000 characters.'},400);if(body.kind!==undefined&&!['report','feedback'].includes(body.kind))return json({error:'Invalid submission type'},400);const {error}=await supabase.from('reports').insert({user_id:user.id,context:body.context,reason:body.reason,kind:body.kind??'report'});if(error)throw error;return json({submitted:true},201);}
  return json({error:'Not found'},404);
 }catch(error){const message=error instanceof Error?error.message:typeof error==='object'&&error&&'message'in error?String(error.message):'Request failed';return json({error:message},400);}
}
export {handle as GET,handle as POST,handle as PUT,handle as PATCH,handle as DELETE};
