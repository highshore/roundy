import {aiImageSlotForPolicy,requiredPhotoSlotsForRoles,savedPhotoSourcingPolicy} from './marketing-stock-photo-policy';
// Browser-only input helpers: no requests, authentication or publishing decisions.
type Row = Record<string, any>;
const topicKeys = new Set(['mbti','dating_archetype','book_insight','trend_research','meme_remix','dating_myth','conversation_prompt','seoul_dating','seoul_trend','korea_life','mini_quiz']);
export function generatorSelection(value: string): {basis:string;topic?:string}|null {
 if(value==='prelaunch'||value==='live_event')return {basis:value};
 return topicKeys.has(value)?{basis:'growth_carousel',topic:value}:null;
}
export function savedRenderContent(draft: Row) {
 const content_mode=draft.draft_kind==='growth_carousel'?'growth_carousel':draft.content_mode;
 if(!['prelaunch','live_event','growth_carousel'].includes(content_mode))throw new Error('INVALID_SAVED_CONTENT_TYPE');
 const topic_type=content_mode==='growth_carousel'?(draft.growth_topic_type||'conversation_prompt'):undefined;
 if(topic_type&&!topicKeys.has(topic_type))throw new Error('INVALID_SAVED_CONTENT_TYPE');
 return {content_mode,topic_type,language:draft.content_language==='en'?'en':'ko',
  event_id:content_mode==='live_event'?draft.event_id:undefined,
  event_campaign_stage:content_mode==='live_event'?draft.event_campaign_stage||'auto':undefined,
  instruction:'',editorial_lane:'auto'};
}
export function generatorMediaPlan(settings: Row|null,basis:string,requestedCount:number,requestedAi:number|null) {
 const storyCount=requestedCount===3||requestedCount===5?requestedCount:Number(settings?.carousel_default_slides)===3?3:5;
 const brand=basis==='growth_carousel'&&settings?.carousel_brand_outro_enabled===true;
 const known=settings?.carousel_mode!=='alternating';
 const aiAllowed=settings?.carousel_mode==='fixed'&&storyCount===5&&Number(settings?.carousel_min_real_photos_5??3)<=3;
 const aiSlot=aiAllowed&&requestedAi!==null?(brand?0:Math.min(3,Math.max(0,requestedAi))):null;
 const minimum=storyCount===5?Number(settings?.carousel_min_real_photos_5??3):Number(settings?.carousel_min_real_photos_3??2);
 const realPhotos=brand?storyCount-(aiSlot===null?0:1):Math.min(3,Math.max(2,minimum),storyCount-1-(aiSlot===null?0:1));
 return {storyCount,brand,known,aiAllowed,aiSlot,total:storyCount+(brand?1:0),realPhotos};
}
export function savedDraftMediaPlan(draft:Row|null) {
 const slides=Array.isArray(draft?.carousel_slides)?draft.carousel_slides:[];
 const roles=slides.map((slide:Row)=>String(slide.role||''));
 const raw=draft?.content_document?.photo_sourcing;
 const policy=savedPhotoSourcingPolicy(raw);
 const aiSlot=policy?aiImageSlotForPolicy(policy):raw?.ai_image_slot===undefined?(raw?.ai_thumbnail_enabled===true?0:null):raw.ai_image_slot;
 const brand=draft?.content_document?.brand_outro_version===1&&[4,6].includes(slides.length);
 let realSlots:number[]=[];
 try{realSlots=requiredPhotoSlotsForRoles(roles,policy);}catch{/* Invalid saved contracts stay subject to server preflight. */}
 const supportsAi=Boolean(policy)&&((brand&&slides.length===6)||(!brand&&slides.length===5&&Number(policy?.min_real_photos)<=3));
 const aiChoices=supportsAi?[0,1,2,3].filter(index=>index<slides.length-1&&!['brand_outro','cta','editorial_closing'].includes(roles[index])):[];
 return {total:slides.length,brand,aiSlot,aiChoices,realSlots,realPhotos:realSlots.length};
}
