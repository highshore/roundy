// Stage 3 magazine copy checks. Review only; no source, image or workflow mutations.
// Heuristic ratings are an editing aid, NOT a prediction of Instagram reach.
import {savedCarouselPlan,magazineCarouselFit} from './marketing-carousel-template';

export const EDITORIAL_STORYBOARD_VERSION=1;
export const EDITORIAL_HEADLINE_VERSION=1;

type Slide=Record<string,any>;
type Document=Record<string,any>;
const txt=(s:unknown)=>typeof s==='string'?s.trim():'';
const normalize=(s:unknown)=>txt(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const grams=(s:string)=>{const value=normalize(s),a=new Set<string>();for(let i=0;i+3<=value.length;i++)a.add(value.slice(i,i+3));return a;};
export function editorialOverlap(a:unknown,b:unknown){
 const one=normalize(a),two=normalize(b);
 if(!one||!two)return 0;
 if(one===two)return 1;
 if(one.length>=14&&two.length>=14&&(one.includes(two)||two.includes(one)))return .92;
 const x=grams(one),y=grams(two),both=[...x].filter(t=>y.has(t)).length;
 return x.size+y.size?2*both/(x.size+y.size):0;
}
export type HeadlineReview={index:number;title:string;score:number;reasons:string[];fits_canvas:boolean};
export function evaluateHeadlineOptions(doc:Document,language:string):HeadlineReview[]{
 const choices=Array.isArray(doc?.thumbnail_candidates)?doc.thumbnail_candidates:[];
 const plan=savedCarouselPlan(doc),cover=doc?.slides?.[0]||{},rest=(doc?.slides||[]).slice(1);
 const ko=language!=='en';
 const bodyContext=rest.map((x:Slide)=>[txt(x.title),txt(x.body)].join(' ')).join(' ');
 return choices.map((v:unknown,index:number)=>{
  const title=txt(v);let score=100;const notes:string[]=[];
  const deduct=(v:number,note:string)=>{score-=v;notes.push(note);};
  const length=Array.from(title).length;
  if(length<(ko?9:16)||length>(ko?28:55))deduct(18,ko?'제목 길이를 조정하세요.':'Consider a more compact headline.');
  if(/(?:좋은\s*대화|관계의\s*본질|소통의\s*중요성|자연스러운\s*대화|meaningful connections?|better conversations?)/i.test(title))
   deduct(27,ko?'상투적인 표현입니다.':'Generic editorial language.');
  if(/(?:충격|역대급|무조건|비밀\s*공개|100\s*%|shocking|guaranteed|you won.t believe)/i.test(title))
   deduct(35,ko?'과장되거나 검증되지 않은 표현입니다.':'Unverified or exaggerated claim.');
  if(editorialOverlap(title,bodyContext)<.09)deduct(15,ko?'본문과 관련성이 약할 수 있습니다.':'Check headline/body alignment.');
  if(!/(?:이유|반면|오히려|차이|대신|때문|순간|실수|선택|어색|다른|궁금|조용|고민|면접|질문|[0-9]|why|instead|when|because|mistake|versus|difference|awkward|question|quiet|[0-9])/i.test(title))
   deduct(13,ko?'상황이나 관찰을 더 명확하게 표현하세요.':'Make the situation or observation clearer.');
  let fits=true;
  if(plan)try{magazineCarouselFit({...cover,title,body:cover.body||''},plan,0,language);}
   catch{fits=false;deduct(30,ko?'표지 렌더 영역에 맞지 않습니다.':'Headline may overflow the cover.');}
  score=Math.max(0,Math.min(100,score));
  return {index,title,score,reasons:notes,fits_canvas:fits};
 });
}
export type StoryboardReview={
 version:number; reserved_count:3|5; suggested_count:3|5; density:'thin'|'balanced'|'dense';
 reason:string; issues:string[]; note:string; measured_cards:number;
};
export function reviewMagazineStoryboard(doc:Document,language:string):StoryboardReview|null{
 const plan=savedCarouselPlan(doc);
 if(!plan||!Array.isArray(doc.slides)||doc.slides.length!==plan.slide_count)return null;
 const ko=language!=='en',body=doc.slides.slice(1,-1) as Slide[],issues:string[]=[];
 // Card roles, sources and reserved slide count never change as a result of this review.
 const short=body.filter(s=>Array.from(txt(s.body)).length<(ko?17:34));
 const overlaps:([number,number])[]=[];
 for(let i=0;i<body.length;i++)for(let j=i+1;j<body.length;j++){
  if(editorialOverlap(body[i].body,body[j].body)>=.79)overlaps.push([i+2,j+2]);
 }
 if(overlaps.length)issues.push(ko
  ?'서로 다른 카드에서 같은 설명을 반복합니다 ('+overlaps.map(([a,b])=>a+'번과 '+b+'번').join(', ')+'). 실제 사례나 새로운 관찰로 구별하세요.'
  :'Some body cards repeat substantially the same explanation. Give each a distinct insight or example.');
 if(body.length>=3&&short.length>=2)issues.push(ko
  ?'5장 구성에 비해 정보가 부족합니다. 각 카드에 다른 구체적 장면이나 독자 효용을 추가하세요.'
  :'The reserved five-card format needs distinct, useful detail on each middle card.');
 const distinct=body.length-overlaps.length;
 const dense=body.filter(s=>Array.from(txt(s.body)).length>=(ko?55:100)).length;
 const suggested_count:3|5=distinct>=3&&short.length===0&&dense>=1?5:3;
 const density:StoryboardReview['density']=short.length>=2?'thin':dense>=2?'dense':'balanced';
 return {
  version:EDITORIAL_STORYBOARD_VERSION,reserved_count:plan.slide_count,suggested_count,density,
  reason:suggested_count===5?'Several distinct informational beats support a longer explanation.':'The main takeaway can be communicated more concisely.',
  note:plan.mode==='alternating'
   ?'The existing alternating 3/5 reservation is immutable. The writing stage must compress or deepen the reserved number of cards.'
   :'The fixed five-card reservation stays unchanged; empty filler is rejected rather than silently changing the schedule.',
  issues,measured_cards:body.length
 };
}
export function storyboardWritingGuide(count:3|5){
 return count===3
  ?'STORYBOARD EDIT: Three reserved slides are immutable: (1) one truthful reader-first cover, (2) a dense but readable key insight, including source context or limitations when relevant, (3) a specific editorial takeaway. Combine overlapping details instead of adding new slides.'
  :'STORYBOARD EDIT: Five reserved slides are immutable: cover, a recognisable context, two genuinely different useful insights, and a memorable editorial closing. Do not split one obvious tip over multiple cards. Each middle card must add an observable scene, substantive distinction, or sourced fact, without padding.';
}
