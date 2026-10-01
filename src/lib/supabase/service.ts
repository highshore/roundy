import 'server-only';

import { createClient } from '@supabase/supabase-js';

export class SupabaseServiceConfigurationError extends Error {}

export function createServiceRoleClient(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
 if(!url||!key)throw new SupabaseServiceConfigurationError('Roundy chat is not configured yet.');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
