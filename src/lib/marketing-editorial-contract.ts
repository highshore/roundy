// Validates the raw model response against the exact JSON contract sent to
// Chat Completions. This runs before any compatibility normalization can hide
// unexpected CTA fields or mutate slide roles. No database or provider calls.
import {magazineRolesForCount} from './marketing-answer-first';
import {captionCoreIssues, EDITORIAL_AD_CTA, MAGAZINE_EDITORIAL_PRESET, MAGAZINE_EDITORIAL_SCHEMA_VERSION} from './marketing-presentation';

type Schema = Record<string, any>;
const own=(value:Record<string,unknown>,key:string)=>Object.prototype.hasOwnProperty.call(value,key);
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);

export function generatedMagazineJsonIssues(value:unknown,schema:Schema,slideCount:3|5):string[]{
 const issues:string[]=[];
 const add=(reason:string)=>{if(issues.length<20&&!issues.includes(reason))issues.push(reason);};
 const inspect=(spec:Schema,node:unknown,path:string):void=>{
  if(issues.length>=20)return;
  if(Array.isArray(spec.enum)&&!spec.enum.some((choice:unknown)=>choice===node))add(path+': forbidden enum value');
  switch(spec.type){
   case 'object':{
    if(!object(node)){add(path+': expected object');return;}
    const props:Record<string,Schema>=spec.properties||{};
    for(const field of (spec.required||[]) as string[])if(!own(node,field))add(path+'.'+field+': required');
    if(spec.additionalProperties===false)
     for(const key of Object.keys(node))if(!own(props,key))add(path+'.'+key+': unexpected field');
    for(const [key,fieldSpec] of Object.entries(props))if(own(node,key))inspect(fieldSpec,node[key],path+'.'+key);
    break;
   }
   case 'array':{
    if(!Array.isArray(node)){add(path+': expected array');return;}
    if(typeof spec.minItems==='number'&&node.length<spec.minItems)add(path+': too few items');
    if(typeof spec.maxItems==='number'&&node.length>spec.maxItems)add(path+': too many items');
    node.forEach((item,index)=>inspect(spec.items||{},item,path+'['+index+']'));
    break;
   }
   case 'string':{
    if(typeof node!=='string'){add(path+': expected string');return;}
    if(typeof spec.minLength==='number'&&node.length<spec.minLength)add(path+': too short');
    if(typeof spec.maxLength==='number'&&node.length>spec.maxLength)add(path+': too long');
    break;
   }
   case 'integer':if(!Number.isInteger(node))add(path+': expected integer');break;
   case 'boolean':if(typeof node!=='boolean')add(path+': expected boolean');break;
  }
 };
 inspect(schema,value,'document');
 if(!object(value))return issues;
 if(value.design_preset!==MAGAZINE_EDITORIAL_PRESET||value.editorial_schema_version!==MAGAZINE_EDITORIAL_SCHEMA_VERSION)
  add('document: unsupported new-feed editorial contract');
 const slides=Array.isArray(value.slides)?value.slides:[];
 const roles=magazineRolesForCount(slideCount);
 for(let i=0;i<roles.length;i++){
  const card=slides[i];
  if(!object(card))continue;
  if(card.role!==roles[i])add('slides['+i+'].role: expected '+roles[i]);
  if(i<roles.length-1&&card.closing_type!=='none')
   add('slides['+i+'].closing_type: body/cover must be none');
  if(i===roles.length-1&&!['summary','insight','brand_outro'].includes(String(card.closing_type||'')))
   add('slides['+i+'].closing_type: invalid editorial closing');
  if(EDITORIAL_AD_CTA.test([card.title,card.body,card.highlight,...(Array.isArray(card.options)?card.options:[])].join(' ')))
   add('slides['+i+']: advertising CTA prohibited');
 }
 if(EDITORIAL_AD_CTA.test([value.caption,value.caption_ko,value.caption_en].join(' '))||
   ['ko','en'].some(language=>{
    const raw=value['caption_'+language];
    return typeof raw==='string'&&captionCoreIssues(raw,language).some(issue=>/CTA|URL|계정명|해시태그/.test(issue));
   }))add('caption: advertising CTA prohibited');
 return issues;
}
