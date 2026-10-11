// Pure, testable contract for non-destructive Instagram regeneration.
export type RegenerationMode='text'|'image'|'both'|'render'|'restore';
export type RegenerationScope='all'|'slides'|'cover_title'|'body'|'caption';
export type RegenerationRequest={
 request_key:string;revision:number;mode:Exclude<RegenerationMode,'restore'>;
 scope:RegenerationScope;slide_indices:number[];instruction:string;confirm_cost:boolean;
};
export type Slide=Record<string,any>;
const modes=['text','image','both','render'] as const;
const scopes=['all','slides','cover_title','body','caption'] as const;
export function parseRegenerationRequest(input:unknown,slideCount:number):RegenerationRequest{
 const v=input as Record<string,unknown>;
 if(!v||typeof v!=='object'||!Number.isInteger(slideCount)||slideCount<1||slideCount>10)
  throw new Error('INVALID_REGENERATION_REQUEST');
 if(!Number.isInteger(v.revision)||Number(v.revision)<1||Number(v.revision)>100)
  throw new Error('DRAFT_CHANGED_REFRESH_FIRST');
 if(typeof v.request_key!=='string'||!/^[a-zA-Z0-9:_-]{8,120}$/.test(v.request_key))
  throw new Error('INVALID_REGENERATION_REQUEST_KEY');
 if(!modes.includes(v.mode as any)||!scopes.includes(v.scope as any))
  throw new Error('INVALID_REGENERATION_OPTIONS');
 const mode=v.mode as RegenerationRequest['mode'],scope=v.scope as RegenerationScope;
 const instruction=typeof v.instruction==='string'?v.instruction.trim():'';
 if(instruction.length>500)throw new Error('INSTRUCTION_LIMIT_500');
 if(v.confirm_cost!==true)throw new Error('REGENERATION_COST_CONFIRMATION_REQUIRED');
 if((mode==='image'||mode==='both')&&['caption','cover_title','body'].includes(scope))
  throw new Error('REGENERATION_SCOPE_INCOMPATIBLE');
 if(mode==='render'&&['caption','cover_title','body'].includes(scope))
  throw new Error('RENDER_REQUIRES_SLIDES');
 const indices=Array.isArray(v.slide_indices)?v.slide_indices:[];
 if(indices.some(x=>!Number.isInteger(x)||Number(x)<0||Number(x)>=slideCount)
   ||new Set(indices).size!==indices.length)throw new Error('INVALID_REGENERATION_SLIDE_SELECTION');
 if(scope==='slides'&&!indices.length)throw new Error('SELECT_SLIDES_FIRST');
 return {request_key:v.request_key,revision:Number(v.revision),mode,scope,slide_indices:scope==='slides'?[...indices].sort((a,b)=>a-b):[],instruction,confirm_cost:true};
}
export function targetedSlideIndices(request:Pick<RegenerationRequest,'scope'|'slide_indices'>,total:number):number[]{
 if(request.scope==='caption')return [];
 if(request.scope==='cover_title')return [0];
 if(request.scope==='body')return Array.from({length:Math.max(total-1,0)},(_,i)=>i+1);
 if(request.scope==='slides')return request.slide_indices;
 return Array.from({length:total},(_,i)=>i);
}
export function estimatedUsd(mode:RegenerationRequest['mode'],scope:RegenerationScope,aiCover=false):number{
 if(mode==='render'||mode==='image'&&!aiCover)return 0;
 return (mode==='text'?0.02:mode==='both'?0.02:0)+(aiCover&&['image','both'].includes(mode)?0.15:0);
}
export type Rewrite={slides?:Array<{index:number;title?:string;body?:string;highlight?:string}>;caption?:string};
const trimmed=(x:unknown,max:number)=>typeof x==='string'&&x.trim()&&x.trim().length<=max?x.trim():null;
export function applySelectiveRewrite(original:Slide[],oldCaption:string,request:RegenerationRequest,rewrite:Rewrite){
 const targets=targetedSlideIndices(request,original.length),selected=new Set(targets);
 const next=original.map(slide=>({...slide}));let caption=oldCaption;
 if(request.mode==='render'||request.mode==='image')return {slides:next,caption,changed_indices:targets};
 if(!rewrite||typeof rewrite!=='object'||!Array.isArray(rewrite.slides))
  throw new Error('INVALID_REGENERATED_COPY');
 const incoming=new Map<number,{index:number;title?:string;body?:string;highlight?:string}>();
 for(const s of rewrite.slides){
  if(!Number.isInteger(s?.index)||!selected.has(s.index)||incoming.has(s.index))
   throw new Error('UNSELECTED_SLIDE_CHANGED');
  incoming.set(s.index,s);
 }
 for(const index of targets){
  const value=incoming.get(index);
  if(!value)throw new Error('REGENERATED_SLIDE_MISSING');
  if(request.scope!=='body'){
   const title=trimmed(value.title,100);
   if(!title)throw new Error('INVALID_REGENERATED_TITLE');
   next[index].title=title;
  }
  if(request.scope!=='cover_title'){
   const body=trimmed(value.body,550);
   if(!body)throw new Error('INVALID_REGENERATED_BODY');
   next[index].body=body;
   if(next[index].body_ko!==undefined&&next[index].body_en===undefined)next[index].body_ko=body;
   if(next[index].body_en!==undefined&&next[index].body_ko===undefined)next[index].body_en=body;
   // A primary-language field changes with the rendered body; secondary translations
   // are not rewritten without explicit model output and remain reviewable.
   if(request.scope!=='body'&&typeof value.highlight==='string'&&value.highlight.length<=120)next[index].highlight=value.highlight;
  }
 }
 if(request.scope==='all'||request.scope==='caption'){
  const nextCaption=trimmed(rewrite.caption,2000);
  if(!nextCaption)throw new Error('INVALID_REGENERATED_CAPTION');
  caption=nextCaption;
 }else if(rewrite.caption!==undefined&&rewrite.caption!==oldCaption){
  throw new Error('UNSELECTED_CAPTION_CHANGED');
 }
 return {slides:next,caption,changed_indices:targets};
}
export function unapprovedQuality(){
 return {version:2,status:'rejected',issues:['Regenerated content needs fresh rendering, copyright review and seven preflight checks.']};
}
export function immutableContentSnapshot(row:Record<string,any>,photos:unknown[]){
 const keys=['id','revision','status','caption','cta','content_document','carousel_slides','images','research_sources','research_status','content_language','visual_source','draft_kind','growth_topic_type','content_mode','content_pillar','generation_reason','render_style'];
 const snapshot:Record<string,unknown>={};for(const key of keys)snapshot[key]=row[key]??null;
 snapshot.stock_photo_selections=photos.map(p=>({...p as object}));
 return snapshot;
}
