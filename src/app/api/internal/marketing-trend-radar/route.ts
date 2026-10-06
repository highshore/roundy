import {NextRequest,NextResponse} from 'next/server';
import {createServiceRoleClient} from '@/lib/supabase/service';
import {runTrendRadar} from '@/lib/marketing-trend-radar';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=180;

export async function POST(req:NextRequest){
 const secret=req.headers.get('x-marketing-secret');
 if(!secret||secret.length>512)return NextResponse.json({error:'Unauthorized'},{status:401});
 const service=createServiceRoleClient(),authorization=await service.rpc('marketing_scheduler_authorized',{p_secret:secret});
 if(authorization.error||authorization.data!==true)return NextResponse.json({error:'Unauthorized'},{status:401});
 const body=await req.json().catch(()=>({}));
 const supplied=typeof body.scan_key==='string'?body.scan_key:'';
 const now=new Date(),kst=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const part=(name:string)=>kst.find(x=>x.type===name)?.value||'00';
 const key=supplied&&/^radar:auto:[0-9-]{13}$/.test(supplied)?supplied:'radar:auto:'+part('year')+'-'+part('month')+'-'+part('day')+'-'+part('hour');
 try{return NextResponse.json(await runTrendRadar(key),{headers:{'Cache-Control':'no-store'}});}
 catch(error){return NextResponse.json({error:(error instanceof Error?error.message:'Trend radar failed').slice(0,500)},{status:400,headers:{'Cache-Control':'no-store'}});}
}
