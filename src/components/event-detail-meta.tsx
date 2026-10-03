import { Cigarette, Globe, MapPin, Mars, Ruler, Venus } from 'lucide-react';
import { flag } from '@/lib/profile-options';
import { tr, type Locale } from '@/lib/locale';
import { eventLanguageLabel, type EventLanguage } from '@/lib/event-presentation';
import {
  heightRuleLabel,
  smokingRuleLabel,
  type HeightRequirements,
  type NationalityRequirements,
  type NationalityRule,
  type SmokingRequirements,
} from '@/lib/event-requirements';

type Props={requirements?:NationalityRequirements;locale:Locale};
const genders=['female','male'] as const;

function ruleLabel(rule:NationalityRule,locale:Locale){
 if(rule.mode==='all')return tr(locale,'All nationalities','국적 제한 없음');
 if(rule.mode==='korean')return tr(locale,'Korean','한국');
 if(rule.mode==='non_korean')return tr(locale,'Non-Korean','외국 국적');
 const names=new Intl.DisplayNames([locale],{type:'region'});
 return rule.countries.map(code=>names.of(code)||code).join(', ');
}
const genderLabel=(gender:'female'|'male',locale:Locale)=>tr(locale,gender==='female'?'Ladies':'Gents',gender==='female'?'여성':'남성');
function GenderIcon({gender}:{gender:'female'|'male'}){const Icon=gender==='female'?Venus:Mars;return <Icon className={'requirement-gender '+gender} size={18} strokeWidth={2.2} aria-hidden="true"/>;}

export function NationalityBadges({requirements,locale}:Props){
 return <>{requirements&&genders.filter(g=>requirements[g].mode!=='all').map(g=>{
  const rule=requirements[g],label=genderLabel(g,locale)+': '+ruleLabel(rule,locale);
  const flags=rule.mode==='non_korean'?'🌏':rule.mode==='korean'?'🇰🇷':rule.countries.map(flag).join(' ');
  return <span className="event-detail-badge nationality-chip" key={g} title={label}><GenderIcon gender={g}/><span aria-hidden="true">:</span><span className="requirement-flags" aria-hidden="true">{flags}</span><span className="sr-only">{label}</span></span>;
 })}</>;
}

export function EventCategoryBadges({category,requirements,language,locale}:Props&{category:string;language?:EventLanguage}){
 return <div className="event-detail-badges"><span className="event-detail-badge category-badge">{category}</span><span className="event-detail-badge language-badge">{eventLanguageLabel(language,locale)}</span><NationalityBadges requirements={requirements} locale={locale}/></div>;
}

export function NationalityFact({requirements,locale}:Props){
 if(!requirements||genders.every(g=>requirements[g].mode==='all'))return null;
 return <div className="event-fact nationality-fact requirement-fact"><span className="fact-icon"><Globe size={20}/></span><div className="fact-copy"><b>{tr(locale,'Nationality requirements','참여 가능 국적')}</b><span className="nationality-text requirement-text">{genders.map(g=>genderLabel(g,locale)+': '+ruleLabel(requirements[g],locale)).join('\n')}</span></div></div>;
}

export function HeightFact({requirements,locale}:{requirements?:HeightRequirements;locale:Locale}){
 if(!requirements||genders.every(g=>requirements[g].min_cm===null&&requirements[g].max_cm===null))return null;
 return <div className="event-fact height-fact requirement-fact"><span className="fact-icon"><Ruler size={20}/></span><div className="fact-copy"><b>{tr(locale,'Height requirements','키 조건')}</b><span className="requirement-text">{genders.map(g=>genderLabel(g,locale)+': '+heightRuleLabel(requirements[g],locale)).join('\n')}</span></div></div>;
}

export function SmokingFact({requirements,locale}:{requirements?:SmokingRequirements;locale:Locale}){
 if(!requirements||genders.every(g=>requirements[g].mode==='all'))return null;
 return <div className="event-fact smoking-fact requirement-fact"><span className="fact-icon"><Cigarette size={20}/></span><div className="fact-copy"><b>{tr(locale,'Smoking requirements','흡연 조건')}</b><span className="requirement-text">{genders.map(g=>genderLabel(g,locale)+': '+smokingRuleLabel(requirements[g],locale)).join('\n')}</span></div></div>;
}

export function VenueFact({venue,address,description,locale}:{venue:string;address:string;description?:string;locale:Locale}){
 return <div className="event-fact venue-fact"><span className="fact-icon"><MapPin size={20}/></span><span className="fact-copy"><b>{tr(locale,'Venue','장소')}</b><span className="venue-address">{venue}{address?` (${address})`:''}</span>{description?.trim()&&<small className="venue-description">{description}</small>}</span></div>;
}
