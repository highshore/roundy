import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { interests } from '@/lib/data';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const eventStatuses=['draft','published','live','closed','cancelled'] as const;
const eventImages=['/images/yeouido.webp','/images/anam-korea-university.webp'];
type EventStatus=typeof eventStatuses[number];
type AdminEventInput={slug:string;title:string;neighborhood:string;starts_at:string;ends_at:string;venue:string;address:string;age_min:number;age_max:number;capacity:number;seats_remaining:number;theme:string;description:string;image:string;status:EventStatus;latitude:number|null;longitude:number|null};
function eventInput(body:unknown):AdminEventInput{
 if(!body||typeof body!=='object')throw new Error('Invalid event.');
 const value=body as Record<string,unknown>;
 const text=(key:string,max:number)=>{const item=value[key];if(typeof item!=='string'||!item.trim()||item.trim().length>max)throw new Error(`Invalid ${key.replaceAll('_',' ')}.`);return item.trim();};
 const number=(key:string)=>{const item=value[key];if(typeof item!=='number'||!Number.isFinite(item))throw new Error(`Invalid ${key.replaceAll('_',' ')}.`);return item;};
 const slug=text('slug',80).toLowerCase();if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw new Error('Use lowercase letters, numbers and hyphens for the URL slug.');
 const starts_at=text('starts_at',80),ends_at=text('ends_at',80);if(Number.isNaN(Date.parse(starts_at))||Number.isNaN(Date.parse(ends_at))||Date.parse(ends_at)<=Date.parse(starts_at))throw new Error('Choose a valid start and end time.');
 const age_min=number('age_min'),age_max=number('age_max'),capacity=number('capacity'),seats_remaining=number('seats_remaining');
 if(!Number.isInteger(age_min)||!Number.isInteger(age_max)||age_min<18||age_max<age_min)throw new Error('Choose a valid age range.');
 if(!Number.isInteger(capacity)||capacity<12||capacity>24||capacity%2!==0||!Number.isInteger(seats_remaining)||seats_remaining<0||seats_remaining>capacity)throw new Error('Capacity must be an even number from 12 to 24.');
 const status=text('status',20) as EventStatus;if(!eventStatuses.includes(status))throw new Error('Invalid event visibility.');
 const image=text('image',120);if(!eventImages.includes(image))throw new Error('Choose a Roundy cover image.');
 const latitude=value.latitude,longitude=value.longitude;
 if((latitude===null)!==(longitude===null)||!(latitude===null||typeof latitude==='number'&&Number.isFinite(latitude)&&latitude>=-90&&latitude<=90)||!(longitude===null||typeof longitude==='number'&&Number.isFinite(longitude)&&longitude>=-180&&longitude<=180))throw new Error('Enter both map coordinates, or leave both blank.');
 return {slug,title:text('title',120),neighborhood:text('neighborhood',80),starts_at,ends_at,venue:text('venue',160),address:text('address',300),age_min,age_max,capacity,seats_remaining,theme:text('theme',120),description:text('description',3000),image,status,latitude:latitude as number|null,longitude:longitude as number|null};
}
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
   if(path[1]==='events'&&path.length===2&&req.method==='GET'){
    const {data,error}=await supabase.from('wis_events').select('*').order('starts_at',{ascending:false});if(error)throw error;return json({events:data});
   }
   if(path[1]==='events'&&path.length===2&&req.method==='POST'){
    const input=eventInput(await req.json());const {data,error}=await supabase.from('wis_events').insert(input).select('*').single();if(error)throw error;return json({event:data},201);
   }
   if(path[1]==='events'&&path.length===3){
    const id=path[2];if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:'Invalid event ID'},400);
    if(req.method==='PUT'){const input=eventInput(await req.json());const {data,error}=await supabase.from('wis_events').update(input).eq('id',id).select('*').single();if(error)throw error;return json({event:data});}
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
export {handle as GET,handle as POST,handle as PUT,handle as DELETE};
