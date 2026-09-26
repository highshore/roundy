import { Globe, MapPin, Mars, Venus } from 'lucide-react';
import { flag } from '@/lib/profile-options';
import { tr, type Locale } from '@/lib/locale';
import { type NationalityRequirements, type NationalityRule } from '@/lib/event-requirements';

type Props={requirements?:NationalityRequirements;locale:Locale};
function ruleLabel(rule:NationalityRule,locale:Locale){
 if(rule.mode==='all')return tr(locale,'All nationalities','모든 국적');
 if(rule.mode==='korean')return tr(locale,'Korea','한국');
 if(rule.mode==='non_korean')return tr(locale,'Non-Korean','한국 외');
 const names=new Intl.DisplayNames([locale],{type:'region'});
 return rule.countries.map(code=>names.of(code)||code).join(', ');
}
const genderLabel=(gender:'female'|'male',locale:Locale)=>tr(locale,gender==='female'?'Ladies':'Gents',gender==='female'?'여성':'남성');
function GenderIcon({gender}:{gender:'female'|'male'}){const Icon=gender==='female'?Venus:Mars;return <Icon className={'requirement-gender '+gender} size={18} strokeWidth={2.2} aria-hidden="true"/>;}
export function NationalityBadges({requirements,locale}:Props){
 return <>{requirements&&(['female','male'] as const).filter(g=>requirements[g].mode!=='all').map(g=>{
 const rule=requirements[g],label=genderLabel(g,locale)+': '+ruleLabel(rule,locale);
 const flags=rule.mode==='non_korean'?'🌏':rule.mode==='korean'?'🇰🇷':rule.countries.map(flag).join(' ');
 return <span className="event-detail-badge nationality-chip" key={g} title={label}><GenderIcon gender={g}/><span aria-hidden="true">:</span><span className="requirement-flags" aria-hidden="true">{flags}</span><span className="sr-only">{label}</span></span>;
 })}</>;
}
export function EventCategoryBadges({category,requirements,locale}:Props&{category:string}){
 return <div className="event-detail-badges"><span className="event-detail-badge category-badge">{category}</span><NationalityBadges requirements={requirements} locale={locale}/></div>;
}
export function NationalityFact({requirements,locale}:Props){
 if(!requirements||(['female','male'] as const).every(g=>requirements[g].mode==='all'))return null;
 return <div className="event-fact nationality-fact"><span className="fact-icon"><Globe size={20}/></span><div className="fact-copy"><b>{tr(locale,'Nationality requirements','국적 조건')}</b><span className="nationality-text">{(['female','male'] as const).map(g=>genderLabel(g,locale)+': '+ruleLabel(requirements[g],locale)).join(' | ')}</span></div></div>;
}
export function VenueFact({venue,address,description,locale}:{venue:string;address:string;description?:string;locale:Locale}){
 return <div className="event-fact venue-fact"><span className="fact-icon"><MapPin size={20}/></span><span className="fact-copy"><b>{tr(locale,'Venue','장소')}</b><span className="venue-address">{venue}{address?` (${address})`:''}</span>{description?.trim()&&<small className="venue-description">{description}</small>}</span></div>;
}
