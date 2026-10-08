import { retiredEventDestination } from '@/lib/event-scope';
import { isMemberUser } from '@/lib/auth-user';
import { App } from '@/components/app';
import LanguageExchangePage from '@/app/language-exchange/page';
import { redirect, permanentRedirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { authConfigured, isPrivatePath, signInPath } from '@/lib/auth-routing';

export default async function Page({params,searchParams}:{params:Promise<{path?:string[]}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const {path=[]}=await params;
 const pathname='/' + path.join('/');
 const query=await searchParams;
 const category=typeof query.category==='string'?query.category:null;
 const retired=retiredEventDestination(pathname,category);
 if(retired){
  const remaining=new URLSearchParams();
  for(const [key,value] of Object.entries(query)){
   if(key==='category'||value===undefined)continue;
   for(const item of Array.isArray(value)?value:[value])remaining.append(key,item);
  }
  permanentRedirect(retired+(remaining.size?'?'+remaining.toString():''));
 }
 // Serve the same program landing at the actual homepage as at /discover.
 // The original discovery is preserved at /discover/classic.
 if (path.length === 0) return <LanguageExchangePage/>;
 if (isPrivatePath(pathname)) {
  if (!authConfigured()) redirect(signInPath(pathname));
  const supabase=await createClient();
  const {data:{user},error}=await supabase.auth.getUser();
  if (error || !isMemberUser(user)) redirect(signInPath(pathname));
  if (path[0] === 'admin') {
   const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin');
   if (adminError || !isAdmin) redirect('/me');
  }
 }
 return <App key={pathname} path={path.join('/')} />;
}
