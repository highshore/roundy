import { countries, countryCodes } from './profile-options';
import { tr, type Locale } from './locale';
export type NationalityRule = { mode: 'all' | 'korean' | 'non_korean' | 'selected'; countries: string[] };
export type NationalityRequirements = { female: NationalityRule; male: NationalityRule };
export const allNationalities = (): NationalityRequirements => ({ female: { mode: 'all', countries: [] }, male: { mode: 'all', countries: [] } });
export function validateRequirements(value: unknown): NationalityRequirements {
 if(value === undefined) return allNationalities();
 if(!value || typeof value !== 'object') throw new Error('Invalid nationality requirements.');
 const result=allNationalities();
 for(const gender of ['female','male'] as const){
  const rule=(value as Record<string,unknown>)[gender] as NationalityRule;
  if(!rule || !['all','korean','non_korean','selected'].includes(rule.mode) || !Array.isArray(rule.countries) || rule.countries.some(c=>!countryCodes.includes(c))) throw new Error('Invalid nationality requirements.');
  if(rule.mode==='selected'&&!rule.countries.length) throw new Error('Choose at least one nationality for each selected list.');
  result[gender]={mode:rule.mode,countries:rule.mode==='selected'?[...new Set(rule.countries)]:[]};
 }
 return result;
}
export function nationalitySummary(requirements:NationalityRequirements|undefined,locale:Locale){
 if(!requirements) return '';
 const names=countries(locale);
 return (['female','male'] as const).filter(g=>requirements[g].mode!=='all').map(g=>{
  const rule=requirements[g];
  const label=rule.mode==='korean'?tr(locale,'Korean','한국'):rule.mode==='non_korean'?tr(locale,'Non-Korean','한국 외'):rule.countries.map(code=>names.find(c=>c.code===code)?.name||code).join(', ');
  return tr(locale,g==='female'?'Ladies':'Gents',g==='female'?'여성':'남성')+': '+label;
 }).join(' · ');
}
export function lockdownNotice(minutes:number,locale:Locale){
 if(!minutes) return tr(locale,'You can cancel until the event starts.','이벤트 시작 전까지 취소할 수 있어요.');
 const hours=Math.floor(minutes/60),rest=minutes%60;
 const duration=locale==='ko'?`${hours?hours+'시간 ':''}${rest?rest+'분':''}`.trim():[hours?`${hours} hour${hours===1?'':'s'}`:'',rest?`${rest} minute${rest===1?'':'s'}`:''].filter(Boolean).join(' ');
 return tr(locale,`Cancellation closes ${duration} before the event. You can still apply.`,`시작 ${duration} 전부터 취소할 수 없지만 신청은 가능해요.`);
}
