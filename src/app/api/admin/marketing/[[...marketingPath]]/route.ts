import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isMemberUser } from '@/lib/auth-user';
import { marketingApi } from '@/lib/marketing';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=240;
async function handle(req:NextRequest,{params}:{params:Promise<{marketingPath?:string[]}>}){
 if(req.method!=='GET'&&req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Invalid request origin'},{status:403});
 const db=await createClient(),{data:{user},error}=await db.auth.getUser();
 if(error||!user)return NextResponse.json({error:'Sign in required'},{status:401});
 if(!isMemberUser(user))return NextResponse.json({error:'Member sign-in required'},{status:403});
 const role=await db.rpc('is_admin');if(role.error||role.data!==true)return NextResponse.json({error:'Administrator access required'},{status:403});
 try{return await marketingApi(req,db,(await params).marketingPath||[]);}
 catch(error){const message=error instanceof Error?error.message:String((error as {message?:unknown})?.message||'Request failed');return NextResponse.json({error:message.slice(0,500)},{status:400});}
}
export {handle as GET,handle as POST,handle as PUT,handle as PATCH,handle as DELETE};
