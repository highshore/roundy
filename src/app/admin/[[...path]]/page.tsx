import { notFound, redirect } from 'next/navigation';
import { AdminCenter } from '@/components/admin-center';
import { createClient } from '@/lib/supabase/server';
import { authConfigured, signInPath } from '@/lib/auth-routing';

export default async function AdminPage({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  const pathname = '/admin' + (path.length ? '/' + path.join('/') : '');
  if (!authConfigured()) redirect(signInPath(pathname));
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || user.app_metadata.provider !== 'kakao') redirect(signInPath(pathname));
  const { data: admin, error: adminError } = await supabase.rpc('is_admin');
  if (adminError || admin !== true) redirect('/me');
  if (path.length > 2 || (path.length && !['events', 'members'].includes(path[0]))) notFound();
  if (path[1] && !(path[0] === 'events' && path[1] === 'new') && !/^[0-9a-f-]{36}$/i.test(path[1])) notFound();
  return <AdminCenter path={path} />;
}
