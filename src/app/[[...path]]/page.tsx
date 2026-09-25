import { App } from '@/components/app';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { authConfigured, isPrivatePath, signInPath } from '@/lib/auth-routing';

export default async function Page({params}:{params:Promise<{path?:string[]}>}) {
 const {path=[]}=await params;
 const pathname='/' + path.join('/');
 if (isPrivatePath(pathname)) {
  if (!authConfigured()) redirect(signInPath(pathname));
  const supabase=await createClient();
  const {data:{user},error}=await supabase.auth.getUser();
  if (error || !user || user.app_metadata.provider !== 'kakao') redirect(signInPath(pathname));
  if (path[0] === 'admin') {
   const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin');
   if (adminError || !isAdmin) redirect('/me');
  }
 }
 return <App key={pathname} path={path.join('/')} />;
}
