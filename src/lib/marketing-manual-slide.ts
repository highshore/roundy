import {isEditorFirst} from './marketing-editor-first';
// Explicit manual edits to one Magazine Editorial card.
// Returns a new immutable copy: role, source IDs, photo assignments and other
// slides are never accepted from the browser or rewritten by this helper.
import {translationPendingAfterEdit} from './marketing-editorial-brief';
import {magazineCarouselFit,savedCarouselPlan} from './marketing-carousel-template';
import {EDITORIAL_AD_CTA} from './marketing-presentation';
import {evaluateHeadlineOptions,reviewMagazineStoryboard} from './marketing-editorial-storyboard';
import {brandedStoryCount,storyOnlyDocument} from './marketing-brand-outro';

type Row=Record<string,any>;
const isText=(v:unknown,max:number)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=max;
export type ManualEditResult={
 request_key:string;revision:number;index:number;slides:Row[];document:Row;
};
export function composeManualMagazineEdit(source:Row,value:unknown):ManualEditResult {
 const v=(value&&typeof value==='object'&&!Array.isArray(value)?value:{}) as Row;
 const slides=source?.carousel_slides as Row[]||[],original=source?.content_document||{};
 if(original.design_preset!=='roundy_magazine_editorial_v2'||!Array.isArray(slides)||![3,4,5,6].includes(slides.length))
  throw new Error('MAGAZINE_SLIDES_REQUIRED');
 const plan=savedCarouselPlan(original);
 const branded=original.brand_outro_version===1;
 const storyCount=branded?brandedStoryCount(original):null;
 if(!plan||slides.length!==(plan.slide_count+(branded?1:0))||(branded&&storyCount===null))
  throw new Error('CAROUSEL_RESERVATION_MISMATCH');
 if(!Number.isInteger(v.revision)||v.revision!==source.revision)throw new Error('DRAFT_CHANGED_REFRESH_FIRST');
 if(typeof v.request_key!=='string'||!/^manual:[a-zA-Z0-9-]{8,100}$/.test(v.request_key))
  throw new Error('INVALID_MANUAL_EDIT_KEY');
 if(!Number.isInteger(v.index)||v.index<0||v.index>=slides.length||(branded&&v.index===storyCount))
  throw new Error('INVALID_MANUAL_SLIDE_INDEX');
 if(!isText(v.title,72)||!isText(v.body,260)||(v.secondary_body!==undefined&&v.secondary_body!==''&&!isText(v.secondary_body,260)))
  throw new Error('MANUAL_TEXT_LENGTH_INVALID');
 if(v.highlight!==undefined&&(typeof v.highlight!=='string'||v.highlight.length>80))
  throw new Error('MANUAL_HIGHLIGHT_INVALID');
 const index=v.index,sourceSlide=slides[index],language=source.content_language==='en'?'en':'ko';
 // A complete set of alternative cover titles can be repaired without changing
 // the rendered first card. Non-cover edits may never alter headline metadata.
 if(v.thumbnail_candidates!==undefined&&index!==0)throw new Error('HEADLINE_OPTIONS_COVER_ONLY');
 const title=v.title.trim(),body=v.body.trim(),oldSecondary=String(sourceSlide.secondary_body||(language==='ko'?sourceSlide.body_en:sourceSlide.body_ko)||''),secondary=String(v.secondary_body||oldSecondary).trim();
 const pending=translationPendingAfterEdit(original,index,body!==sourceSlide.body,v.secondary_body,oldSecondary);
 const highlight=String(v.highlight??sourceSlide.highlight??'').trim();
 if(EDITORIAL_AD_CTA.test([title,body,secondary,highlight].join(' ')))
  throw new Error('FEED_AD_CTA_NOT_ALLOWED');
 if(index===0&&sourceSlide.title!==title&&(!Array.isArray(original.thumbnail_candidates)||original.thumbnail_candidates.length<(isEditorFirst(original)?1:3)))
  throw new Error('HEADLINE_OPTIONS_REQUIRED');
 const changed={...sourceSlide,title,body,secondary_body:secondary,highlight,
  body_ko:language==='ko'?body:secondary,body_en:language==='en'?body:secondary};
 // Never accept role/source_ids/closing_type/options/metadata/photo URLs from the browser.
 magazineCarouselFit(changed,plan,index,language);
 const nextSlides=slides.map((slide:Row,i:number)=>i===index?changed:{...slide});
 const visibleCopyChanged=(['title','body','secondary_body','highlight'] as const).some(field=>
  String(sourceSlide[field]??'').trim()!==String(changed[field]??'').trim());
 let nextDoc={...original,slides:nextSlides,
  thumbnail_render_pending:original.thumbnail_render_pending===true||(index===0&&visibleCopyChanged),
  translation_pending_indices:pending,
  editorial_human_approval:visibleCopyChanged?null:original.editorial_human_approval,
  editorial_critic:visibleCopyChanged?null:original.editorial_critic,
  editorial_critic_history:visibleCopyChanged?[]:original.editorial_critic_history,
  editorial_critic_policy:visibleCopyChanged?null:original.editorial_critic_policy};
 if(index===0&&original.thumbnail_candidates){
  if(!Array.isArray(original.thumbnail_candidates))throw new Error('HEADLINE_OPTIONS_REQUIRED');
  const count=original.thumbnail_candidates.length,selected=Number(original.thumbnail_selected_index??0);
  if(!(isEditorFirst(original)?[1]:[3,5]).includes(count)||!Number.isInteger(selected)||selected<0||selected>=count)
   throw new Error('INVALID_THUMBNAIL_CHOICE');
  const supplied=v.thumbnail_candidates!==undefined;
  if(supplied&&(!Array.isArray(v.thumbnail_candidates)||v.thumbnail_candidates.length!==count))
   throw new Error('HEADLINE_OPTIONS_COUNT_MISMATCH');
  const choices=supplied?[...v.thumbnail_candidates]:[...original.thumbnail_candidates];
  choices[selected]=supplied?choices[selected]:title;
  const maxLength=language==='en'?64:34;
  if(choices.some((candidate:unknown)=>typeof candidate!=='string'||
   candidate.trim().length<6||candidate.trim().length>maxLength))
   throw new Error('HEADLINE_OPTIONS_LENGTH_INVALID');
  if(supplied&&choices[selected].trim()!==title)
   throw new Error('HEADLINE_SELECTED_TITLE_MISMATCH');
  const normalized=choices.map((candidate:string)=>candidate.normalize('NFKC').toLowerCase()
   .replace(/[^\p{L}\p{N}]+/gu,''));
  if(new Set(normalized).size!==choices.length)throw new Error('DUPLICATE_THUMBNAIL_COPY');
  nextDoc={...nextDoc,thumbnail_candidates:choices.map((candidate:string)=>candidate.trim())};
 }
 const storyboard=reviewMagazineStoryboard(storyOnlyDocument(nextDoc),language);
 nextDoc={...nextDoc,
  ...(original.editorial_storyboard_version?{
   editorial_headline_reviews:evaluateHeadlineOptions(nextDoc,language),
   editorial_storyboard_review:storyboard
  }:{})};
 return {request_key:v.request_key,revision:v.revision,index,slides:nextSlides,document:nextDoc};
}
