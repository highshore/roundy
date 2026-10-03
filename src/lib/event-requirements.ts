import { countries, countryCodes } from './profile-options';
import { tr, type Locale } from './locale';

export type NationalityRule = { mode: 'all' | 'korean' | 'non_korean' | 'selected'; countries: string[] };
export type NationalityRequirements = { female: NationalityRule; male: NationalityRule };

export type HeightRule = { min_cm: number | null; max_cm: number | null };
export type HeightRequirements = { female: HeightRule; male: HeightRule };

export const smokingRequirementValues = ['never','socially','sometimes','daily'] as const;
export type SmokingRequirementValue = typeof smokingRequirementValues[number];
export type SmokingRule = { mode: 'all' | 'selected'; values: SmokingRequirementValue[] };
export type SmokingRequirements = { female: SmokingRule; male: SmokingRule };

export const allNationalities = (): NationalityRequirements => ({
 female: { mode: 'all', countries: [] },
 male: { mode: 'all', countries: [] }
});

export const anyHeightRequirements = (): HeightRequirements => ({
 female: { min_cm: null, max_cm: null },
 male: { min_cm: null, max_cm: null }
});

export const anySmokingRequirements = (): SmokingRequirements => ({
 female: { mode: 'all', values: [] },
 male: { mode: 'all', values: [] }
});

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

export function validateHeightRequirements(value: unknown): HeightRequirements {
 if(value === undefined) return anyHeightRequirements();
 if(!value || typeof value !== 'object') throw new Error('Invalid height requirements.');
 const result=anyHeightRequirements();
 for(const gender of ['female','male'] as const){
  const raw=(value as Record<string,unknown>)[gender];
  if(!raw || typeof raw!=='object') throw new Error('Invalid height requirements.');
  const rule=raw as Record<string,unknown>;
  const normalize=(input:unknown)=>{
   if(input===null||input===undefined||input==='')return null;
   if(typeof input!=='number'||!Number.isInteger(input)||input<100||input>250)throw new Error('Height requirements must be between 100 and 250 cm.');
   return input;
  };
  const min_cm=normalize(rule.min_cm),max_cm=normalize(rule.max_cm);
  if(min_cm!==null&&max_cm!==null&&min_cm>max_cm)throw new Error('Minimum height cannot exceed maximum height.');
  result[gender]={min_cm,max_cm};
 }
 return result;
}

export function validateSmokingRequirements(value: unknown): SmokingRequirements {
 if(value === undefined) return anySmokingRequirements();
 if(!value || typeof value !== 'object') throw new Error('Invalid smoking requirements.');
 const result=anySmokingRequirements();
 for(const gender of ['female','male'] as const){
  const raw=(value as Record<string,unknown>)[gender];
  if(!raw || typeof raw!=='object') throw new Error('Invalid smoking requirements.');
  const rule=raw as Record<string,unknown>;
  const mode=rule.mode;
  const values=rule.values;
  if(!['all','selected'].includes(String(mode))||!Array.isArray(values)||values.some(value=>!smokingRequirementValues.includes(value as SmokingRequirementValue)))throw new Error('Invalid smoking requirements.');
  if(mode==='selected'&&!values.length)throw new Error('Choose at least one allowed smoking habit for each selected list.');
  result[gender]={mode:mode as SmokingRule['mode'],values:mode==='selected'?[...new Set(values as SmokingRequirementValue[])]:[]};
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
 }).join(' | ');
}

export function heightRuleLabel(rule:HeightRule,locale:Locale){
 if(rule.min_cm===null&&rule.max_cm===null)return tr(locale,'No height restriction','키 제한 없음');
 if(rule.min_cm!==null&&rule.max_cm!==null)return `${rule.min_cm}–${rule.max_cm} cm`;
 if(rule.min_cm!==null)return `${rule.min_cm} cm+`;
 return tr(locale,`Up to ${rule.max_cm} cm`,`${rule.max_cm} cm 이하`);
}

export function heightSummary(requirements:HeightRequirements|undefined,locale:Locale){
 if(!requirements)return '';
 return (['female','male'] as const).filter(g=>requirements[g].min_cm!==null||requirements[g].max_cm!==null).map(g=>
  tr(locale,g==='female'?'Ladies':'Gents',g==='female'?'여성':'남성')+': '+heightRuleLabel(requirements[g],locale)
 ).join(' | ');
}

export function smokingValueLabel(value:SmokingRequirementValue,locale:Locale){
 const labels:Record<SmokingRequirementValue,[string,string]>={
  never:['Non-smoker','비흡연'],
  socially:['Social smoker','가끔 흡연'],
  sometimes:['Sometimes','종종 흡연'],
  daily:['Daily smoker','매일 흡연']
 };
 return tr(locale,labels[value][0],labels[value][1]);
}

export function smokingRuleLabel(rule:SmokingRule,locale:Locale){
 if(rule.mode==='all')return tr(locale,'No smoking restriction','흡연 제한 없음');
 return rule.values.map(value=>smokingValueLabel(value,locale)).join(', ');
}

export function smokingSummary(requirements:SmokingRequirements|undefined,locale:Locale){
 if(!requirements)return '';
 return (['female','male'] as const).filter(g=>requirements[g].mode!=='all').map(g=>
  tr(locale,g==='female'?'Ladies':'Gents',g==='female'?'여성':'남성')+': '+smokingRuleLabel(requirements[g],locale)
 ).join(' | ');
}

export function lockdownNotice(minutes:number,locale:Locale){
 if(!minutes) return tr(locale,'You can cancel until the event starts.','이벤트 시작 전까지 취소할 수 있어요.');
 const hours=Math.floor(minutes/60),rest=minutes%60;
 const duration=locale==='ko'?`${hours?hours+'시간 ':''}${rest?rest+'분':''}`.trim():[hours?`${hours} hour${hours===1?'':'s'}`:'',rest?`${rest} minute${rest===1?'':'s'}`:''].filter(Boolean).join(' ');
 return tr(locale,`Cancellation closes ${duration} before the event. You can still apply.`,`시작 ${duration} 전부터 취소할 수 없지만 신청은 가능해요.`);
}
