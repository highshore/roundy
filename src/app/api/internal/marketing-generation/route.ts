import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { automaticGeneration } from '@/lib/marketing-generation';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function POST(req:NextRequest){
 const secret=req.headers.get('x-marketing-secret');
 if(!secret||secret.length>512)return NextResponse.json({error:'Unauthorized'},{status:401});
 const service=createServiceRoleClient();
 const {data,error}=await service.rpc('marketing_scheduler_authorized',{p_secret:secret});
 if(error||data!==true)return NextResponse.json({error:'Unauthorized'},{status:401});
 try{const result=await automaticGeneration();return NextResponse.json(result,{status:'error' in result?400:200,headers:{'Cache-Control':'no-store'}});}
 catch(error){const message=error instanceof Error?error.message:String((error as {message?:unknown})?.message||'Generation stopped');return NextResponse.json({error:message.slice(0,500)},{status:400,headers:{'Cache-Control':'no-store'}});}
}
