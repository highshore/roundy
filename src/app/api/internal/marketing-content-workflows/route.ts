import {NextRequest,NextResponse} from 'next/server';
import {createServiceRoleClient} from '@/lib/supabase/service';
import {processContentStep} from '@/lib/marketing-content-workers';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function POST(req:NextRequest){
 const secret=req.headers.get('x-marketing-secret');
 if(!secret||secret.length>512)return NextResponse.json({error:'Unauthorized'},{status:401});
 const db=createServiceRoleClient(),auth=await db.rpc('marketing_scheduler_authorized',{p_secret:secret});
 if(auth.error||auth.data!==true)return NextResponse.json({error:'Unauthorized'},{status:401});
 try{return NextResponse.json(await processContentStep(db),{headers:{'Cache-Control':'no-store'}});}
 catch(error){console.error('Content workflow delivery stopped',error instanceof Error?error.message:'STEP_STOPPED');
  return NextResponse.json({error:'CONTENT_WORKER_STOPPED'},{status:500,headers:{'Cache-Control':'no-store'}});}
}
