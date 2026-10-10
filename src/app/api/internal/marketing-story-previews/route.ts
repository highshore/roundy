import {NextRequest,NextResponse} from 'next/server';
import {createServiceRoleClient} from '@/lib/supabase/service';
import {generateTomorrowStoryPreviews} from '@/lib/marketing-story-generation';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
// Cron authentication matches existing Roundy internal marketing routes.
export async function POST(req:NextRequest){
 const secret=req.headers.get('x-marketing-secret');
 if(!secret||secret.length>512)return NextResponse.json({error:'Unauthorized'},{status:401});
 const db=createServiceRoleClient();
 const verified=await db.rpc('marketing_scheduler_authorized',{p_secret:secret});
 if(verified.error||verified.data!==true)return NextResponse.json({error:'Unauthorized'},{status:401});
 try{
  return NextResponse.json(await generateTomorrowStoryPreviews(),{
   headers:{'Cache-Control':'private,no-store'}});
 }catch(error){
  return NextResponse.json({error:error instanceof Error?error.message:'STORY_GENERATION_FAILED'},
   {status:500,headers:{'Cache-Control':'private,no-store'}});
 }
}
