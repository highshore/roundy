import { retiredEventDestination } from '@/lib/event-scope';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
export async function proxy(request:NextRequest){
 const retired=retiredEventDestination(request.nextUrl.pathname,request.nextUrl.searchParams.get('category'));
 if(retired){
  const destination=request.nextUrl.clone();
  destination.pathname=retired;
  destination.searchParams.delete('category');
  return NextResponse.redirect(destination,308);
 }
 let response=NextResponse.next({request});
 if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)return response;
 const supabase=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>request.cookies.getAll(),setAll:(items,headers)=>{items.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request});items.forEach(({name,value,options})=>response.cookies.set(name,value,options));Object.entries(headers??{}).forEach(([k,v])=>response.headers.set(k,v));}}});
 await supabase.auth.getClaims();response.headers.set('Cache-Control','private, no-store');return response;
}
export const config={matcher:['/((?!_next/static|_next/image|images|favicon.ico).*)']};
