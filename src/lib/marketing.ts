import { NextRequest, NextResponse } from 'next/server';
import type { createClient } from './supabase/server';
type Client=Awaited<ReturnType<typeof createClient>>;
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
export async function marketingApi(req:NextRequest,db:Client,path:string[]){
 const id=path[0];
 if(!id&&req.method==='GET'){
  const [templates,runs]=await Promise.all([db.from('marketing_templates').select('*').order('updated_at',{ascending:false}),db.from('marketing_runs').select('*').order('created_at',{ascending:false}).limit(50)]);
  if(templates.error)throw templates.error;if(runs.error)throw runs.error;
  const {data:{session}}=await db.auth.getSession();
  const connection=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+'/functions/v1/roundy-marketing',{headers:{Authorization:'Bearer '+session?.access_token,apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!},signal:AbortSignal.timeout(8000)}).then(r=>r.ok?r.json():null).catch(()=>null);
  return json({templates:templates.data,runs:runs.data,connection:connection??{instagram:false,koreapas:false,unavailable:true}});
 }
 if(id==='publish'&&req.method==='POST'){
  const body=await req.json();if(!/^[0-9a-f-]{36}$/i.test(body.template_id)||!/^[0-9a-f-]{36}$/i.test(body.request_key))return json({error:'Invalid publish request'},400);
  const {data:{session}}=await db.auth.getSession();
  const result=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+'/functions/v1/roundy-marketing',{method:'POST',headers:{Authorization:'Bearer '+session?.access_token,apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(140000)});
  return json(await result.json(),result.status);
 }
 if(id==='resolve'&&req.method==='POST'){
  const body=await req.json();if(typeof body.published!=='boolean'||!/^[0-9a-f-]{36}$/i.test(body.run_id))return json({error:'Invalid review'},400);
  const {error}=await db.rpc('resolve_marketing_run',{p_run:body.run_id,p_published:body.published});if(error)throw error;return json({ok:true});
 }
 if(id&&!/^[0-9a-f-]{36}$/i.test(id))return json({error:'Not found'},404);
 if(id&&req.method==='DELETE'){const {error}=await db.from('marketing_templates').delete().eq('id',id);if(error)throw error;return json({ok:true});}
 if((!id&&req.method==='POST')||(id&&req.method==='PUT')){
  const v=await req.json();
  const text=(key:string,max:number)=>{if(typeof v[key]!=='string'||v[key].length>max)throw new Error('Invalid '+key);return v[key].trim();};
  const base=process.env.NEXT_PUBLIC_SUPABASE_URL+'/storage/v1/object/public/wis-event-images/';
  const input={channel:text('channel',20),name:text('name',100),title:text('title',120),caption:text('caption',2000),cta:text('cta',80),destination_url:text('destination_url',2000),images:v.images,days:v.days,time_kst:text('time_kst',8),enabled:v.enabled};
  if(!['instagram','koreapas'].includes(input.channel)||!input.name||typeof input.enabled!=='boolean'||!Array.isArray(input.days)||input.days.some((d:unknown)=>!Number.isInteger(d)||Number(d)<0||Number(d)>6)||!/^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(input.time_kst))throw new Error('Check the template and schedule.');
  if(input.destination_url){const url=new URL(input.destination_url);if(url.protocol!=='https:'||url.username||url.password)throw new Error('Use an HTTPS destination URL.');}
  if(!Array.isArray(input.images)||input.images.length>10||input.images.some((src:unknown)=>typeof src!=='string'||!src.startsWith(base)||!/^[-a-f0-9]+\/[-a-f0-9]+\.jpg$/.test(src.slice(base.length))))throw new Error('Choose up to 10 uploaded JPEG images.');
  input.days=[...new Set(input.days)];if(!input.days.length)input.enabled=false;
  const q=id?db.from('marketing_templates').update(input).eq('id',id):db.from('marketing_templates').insert(input);
  const {data,error}=await q.select('*').single();if(error)throw error;return json({template:data},id?200:201);
 }
 return json({error:'Not found'},404);
}
