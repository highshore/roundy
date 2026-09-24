'use client';
import { countries, interestCategories, interestLabel, normalizeNationality } from '@/lib/profile-options';
import { tr, type Locale } from '@/lib/locale';

export function NationalitySelect({value,onChange,locale}:{value:string;onChange:(value:string)=>void;locale:Locale}) {
  const normalized=normalizeNationality(value);const options=countries(locale);
  return <select required value={normalized} onChange={e=>onChange(e.target.value)}><option value="">{tr(locale,'Choose your nationality','국적을 선택하세요')}</option>{normalized&&!options.some(c=>c.code===normalized)&&<option value={normalized}>{normalized}</option>}{options.map(c=><option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}</select>;
}
export function InterestPicker({selected,onChange,query,locale}:{selected:string[];onChange:(tags:string[])=>void;query:string;locale:Locale}) {
  const needle=query.toLocaleLowerCase(locale).trim();
  const groups=interestCategories.map(c=>({...c,tags:c.tags.filter(t=>(c.en+c.ko+t.id+t.ko).toLocaleLowerCase(locale).includes(needle))})).filter(c=>c.tags.length);
  return <div className="interest-groups"><div className="interest-count" role="status">{tr(locale,`${selected.length} / 10 selected · Choose at least 3`,`${selected.length} / 10개 선택 · 3개 이상 선택하세요`)}</div>{groups.map(c=><fieldset key={c.en}><legend>{locale==='ko'?c.ko:c.en}</legend><div className="chips interests">{c.tags.map(t=><button type="button" key={t.id} aria-pressed={selected.includes(t.id)} disabled={!selected.includes(t.id)&&selected.length>=10} className={'chip '+(selected.includes(t.id)?'selected':'')} onClick={()=>onChange(selected.includes(t.id)?selected.filter(x=>x!==t.id):[...selected,t.id])}>{interestLabel(t.id,locale)}</button>)}</div></fieldset>)}{!groups.length&&<p>{tr(locale,'No interests found. Try another search.','검색 결과가 없어요. 다른 단어로 검색해 주세요.')}</p>}</div>;
}
