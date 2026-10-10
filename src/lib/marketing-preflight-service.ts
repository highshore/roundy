import 'server-only';
import type {createServiceRoleClient} from './supabase/service';
import {listStockSelections} from './marketing-stock-photos';
import {evaluateMarketingPreflight,mergePreflightQuality,type PreflightReport} from './marketing-preflight';
type DB=ReturnType<typeof createServiceRoleClient>;
type Row=Record<string,any>;
const check=(value:{data:any;error:any})=>{if(value.error)throw value.error;return value.data;};
export async function reviewMarketingDraft(db:DB,draft:Row):Promise<PreflightReport>{
 const [settings,photos]=await Promise.all([
  db.from('marketing_automation_settings').select('carousel_mode,carousel_default_slides,carousel_min_real_photos_5,carousel_min_real_photos_3,carousel_answer_first_enabled').eq('singleton',true).single(),
  listStockSelections(db,String(draft.id))
 ]);
 return evaluateMarketingPreflight(draft,check(settings)||{},photos);
}
export {mergePreflightQuality};
