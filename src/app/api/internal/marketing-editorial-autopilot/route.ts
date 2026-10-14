import {NextRequest,NextResponse} from 'next/server';
import {createServiceRoleClient} from '@/lib/supabase/service';
import {editorialKstDate,runEditorialAutopilot} from '@/lib/marketing-editorial-autopilot';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function POST(req:NextRequest){
 const provided=req.headers.get('x-marketing-secret');
 if(!provided||provided.length>512)return NextResponse.json({error:'Unauthorized'},{status:401});
 const db=createServiceRoleClient();
 const result=await db.rpc('marketing_scheduler_authorized',{p_secret:provided});
 if(result.error||result.data!==true)return NextResponse.json({error:'Unauthorized'},{status:401});
 try{
  return NextResponse.json(await runEditorialAutopilot(db,'editorial:auto:'+editorialKstDate(),false),{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  console.error('Editorial discovery failed',error instanceof Error?error.message:'UNKNOWN');
  return NextResponse.json({error:'EDITORIAL_DISCOVERY_FAILED'},{status:500,headers:{'Cache-Control':'no-store'}});
 }
}
