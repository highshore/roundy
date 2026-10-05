import type { HeightRequirements, NationalityRequirements, SmokingRequirements } from './event-requirements';
import type { EventLanguage, ParticipantDisclosures } from './event-presentation';
import { isAtLeastAge } from './age';
// Missing configuration must never authenticate a visitor or simulate a booking.
export const demoMode = false;
export { interestIds as interests } from './profile-options';
export const eventCategories=['1:1 Speed Mingle'] as const;
export type EventCategory=typeof eventCategories[number];
export type Event = {price_gents?:number;price_ladies?:number;early_bird_hours?:number;last_minute_hours?:number;venue_description?:string;nationality_requirements?:NationalityRequirements;height_requirements?:HeightRequirements;smoking_requirements?:SmokingRequirements;participant_disclosures?:ParticipantDisclosures;event_language?:EventLanguage;title_ko?:string;description_ko?:string;id:string;slug:string;title:string;neighborhood:string;starts_at:string;ends_at:string;venue:string;address:string;latitude?:number|null;longitude?:number|null;age_min:number;age_max:number;capacity:number;seats_remaining:number;theme:string;description:string;image:string;status:string;images?:string[];previous_slugs?:string[];duration_minutes?:number;lockdown_minutes?:number;reminder_minutes?:number|null};
export const eventCategory=(event:{theme?:string}):EventCategory|'Archived event'=>event.theme==='1:1 Speed Mingle'||event.theme==='1:1 Speed Meetup'?'1:1 Speed Mingle':'Archived event';
export const events: Event[] = [{id:'demo-yeouido',slug:'saturday-social',title:'Saturday Social',neighborhood:'Yeouido',starts_at:'2026-10-10T10:00:00Z',ends_at:'2026-10-10T12:00:00Z',venue:'Sample venue',address:'Yeouido, Seoul — illustrative event',age_min:26,age_max:35,capacity:12,seats_remaining:4,theme:'1:1 Speed Mingle',description:'A small room, a few new faces, and hosted Rotation Dating in Seoul. Meet each person in turn, then decide who you want to know better.',image:'/images/yeouido.webp',status:'live'}];
export function dateLabel(value:string){return new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',month:'short',day:'numeric',weekday:'short'}).format(new Date(value));}
export function timeLabel(value:string){return new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit'}).format(new Date(value));}
export type Profile = {full_name:string;birth_date:string;gender:string;nationality:string;height_cm:number;mbti:string;smoking_frequency:string;alcohol_frequency:string;religion:string;same_religion_importance:string;religion_consent:boolean;job_title:string;workplace:string;public_job:string;public_workplace:string;phone:string;contact_consent:boolean;interests:string[];photos:string[]};
export const emptyProfile:Profile={full_name:'',birth_date:'',gender:'',nationality:'',height_cm:170,mbti:'',smoking_frequency:'',alcohol_frequency:'',religion:'',same_religion_importance:'',religion_consent:false,job_title:'',workplace:'',public_job:'',public_workplace:'',phone:'',contact_consent:false,interests:[],photos:[]};
export const sampleProfile:Profile={full_name:'Jamie Kim',birth_date:'1997-05-10',gender:'female',nationality:'Korean',height_cm:168,mbti:'ENFP',smoking_frequency:'never',alcohol_frequency:'socially',religion:'none',same_religion_importance:'not_important',religion_consent:true,job_title:'Product designer',workplace:'Example studio',public_job:'Designer',public_workplace:'a creative company',phone:'010-1234-5678',contact_consent:true,interests:['Coffee','Art','Travel'],photos:['sample-avatar']};
export type Choice = 'no'|'maybe'|'yes';
export function formatKoreanPhone(value:string){const digits=value.replace(/\D/g,'').replace(/^82/,'0').slice(0,11);if(digits.length<=3)return digits;if(digits.length<=7)return digits.slice(0,3)+'-'+digits.slice(3);return digits.slice(0,3)+'-'+digits.slice(3,7)+'-'+digits.slice(7);}
export function isKoreanPhone(value:string){return /^010-\d{4}-\d{4}$/.test(value);}
export function profileComplete(p:Profile){return !!(p.full_name.trim()&&isAtLeastAge(p.birth_date)&&p.gender&&p.nationality.trim()&&p.height_cm>=100&&p.height_cm<=250&&p.job_title.trim()&&p.workplace.trim()&&isKoreanPhone(p.phone)&&p.contact_consent&&p.photos.length>=1&&p.photos.length<=3&&p.interests.length>=3&&p.interests.length<=10);}

export const mbtiTypes = ['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'] as const;
export const smokingFrequencies = ['never','socially','sometimes','daily'] as const;
export const alcoholFrequencies = ['never','rarely','socially','weekly','frequently'] as const;
export const religions = ['none','christian_protestant','catholic','buddhist','muslim','hindu','jewish','other'] as const;
export const sameReligionImportance = ['not_important','nice_to_have','important','essential'] as const;
