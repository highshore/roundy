// New magazines keep their reserved 3/5 STORY cards and append one immutable
// brand-only card. The server, not the copywriter model, authors the outro.
import {savedCarouselPlan,type CarouselPlan} from './marketing-carousel-template';

type Row=Record<string,any>;
export const BRAND_OUTRO_VERSION=1;

export function brandedStoryCount(doc:Row|null|undefined):number|null {
 if(doc?.brand_outro_version!==BRAND_OUTRO_VERSION)return null;
 const plan=savedCarouselPlan(doc);
 if(!plan||!Array.isArray(doc.slides)||doc.slides.length!==plan.slide_count+1
    ||doc.slides[plan.slide_count]?.role!=='brand_outro')return null;
 return plan.slide_count;
}
export function makeRoundyOutro(language:string):Row{
 const ko=language!=='en';
 const titleKo='소개팅, 이제는 마주 앉아서.';
 const titleEn='Meet face to face in Seoul.';
 const bodyKo='한 사람씩 직접 만나 대화하는 서울 로테이션 소개팅, Roundy.';
 const bodyEn='Rotation Dating in Seoul. One person at a time, face to face.';
 return {
  role:'brand_outro',eyebrow:'ROUNDY / SEOUL',
  title:ko?titleKo:titleEn,body:ko?bodyKo:bodyEn,
  secondary_body:ko?bodyEn:bodyKo,
  body_ko:bodyKo,body_en:bodyEn,
  highlight:'',options:[],source_ids:[],closing_type:'brand_outro',
  source_label:'',footer_note:'',variant:'roundy'
 };
}
export function appendRoundyOutro(document:Row,slides:Row[],language:string,plan:CarouselPlan):{
 document:Row;slides:Row[]
}{
 if(!Array.isArray(document.slides)||document.slides.length!==plan.slide_count
    ||!Array.isArray(slides)||slides.length!==plan.slide_count
    ||document.slides[plan.slide_count-1]?.role!=='editorial_closing'
    ||slides[plan.slide_count-1]?.role!=='editorial_closing')
  throw new Error('ROUNDY_OUTRO_STORY_CONTRACT_INVALID');
 const brand=makeRoundyOutro(language);
 return {
  document:{...document,brand_outro_version:BRAND_OUTRO_VERSION,
   story_slide_count:plan.slide_count,slides:[...document.slides,brand]},
  slides:[...slides,brand]
 };
}
// Re-review the model-authored story, never the immutable server-owned brand card.
// This also protects historic completed drafts from a retroactive rewrite.
export function storyOnlyDocument(document:Row):Row{
 const count=brandedStoryCount(document);
 if(count===null)return document;
 return {...document,slides:document.slides.slice(0,count)};
}
export function totalMagazineSlides(doc:Row|null|undefined):number|null{
 const plan=savedCarouselPlan(doc);
 return plan?(doc?.brand_outro_version===BRAND_OUTRO_VERSION?plan.slide_count+1:plan.slide_count):null;
}
