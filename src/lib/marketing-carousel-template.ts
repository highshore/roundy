// Shared, deterministic canvas and editorial layout contract. No publishing side effects.
export const CAROUSEL_CANVAS={width:1080,height:1350,safe:80} as const;
export type CarouselCount=3|5;
export type CarouselMode='fixed'|'alternating';
export type CarouselPlan={version:1;mode:CarouselMode;slide_count:CarouselCount;reservation_number:number|null;title_font_size_px:number;body_font_size_px:number};
type Settings=Record<string,unknown>|null|undefined;
const int=(x:unknown,fallback:number,min:number,max:number)=>typeof x==='number'&&Number.isInteger(x)&&x>=min&&x<=max?x:fallback;
export function resolveCarouselPlan(settings:Settings,reservation:number|null=null):CarouselPlan|null{
 if(settings?.carousel_mode!=='fixed'&&settings?.carousel_mode!=='alternating')return null; // Legacy fixtures, no retroactive rewrite.
 const mode=settings.carousel_mode;
 if(mode==='alternating'&&(!Number.isInteger(reservation)||Number(reservation)<1))throw new Error('CAROUSEL_RESERVATION_REQUIRED');
 const slide_count:CarouselCount=mode==='fixed'?5:Number(reservation)%2===1?3:5;
 return {version:1,mode,slide_count,reservation_number:mode==='alternating'?reservation:null,
  title_font_size_px:int(settings.carousel_title_font_size_px,72,24,160),
  body_font_size_px:int(settings.carousel_body_font_size_px,36,16,80)};
}
export function savedCarouselPlan(doc:Record<string,any>|null|undefined):CarouselPlan|null{
 const p=doc?.carousel_template;
 if(!p||p.version!==1||!['fixed','alternating'].includes(p.mode)||![3,5].includes(p.slide_count))return null;
 if(!Number.isInteger(p.title_font_size_px)||!Number.isInteger(p.body_font_size_px))return null;
 return p as CarouselPlan;
}
export function withCarouselPlan<T extends Record<string,any>>(document:T,plan:CarouselPlan|null):T{
 return plan?{...document,carousel_template:plan}:document;
}
export function carouselNarrative(count:number):string[]{
 return count===3?['RESULT','VALUE / DETAIL','ROUNDY']:['RESULT','CONTEXT','DETAIL','VALUE','ROUNDY'];
}
// Render whole grapheme clusters, not detached emoji modifiers or ZWJ fragments.
const graphemeSegmenter=typeof Intl.Segmenter==='function'
 ?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
const graphemes=(value:string)=>graphemeSegmenter
 ?Array.from(graphemeSegmenter.segment(value),part=>part.segment)
 :Array.from(value);
const textUnits=(value:string)=>graphemes(value).reduce((total,char)=>{
 if(/\p{Extended_Pictographic}/u.test(char))return total+1.4;
 if(/[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af]/u.test(char))return total+1;
 if(char===' ')return total+.32;
 if(/[A-ZMW@]/.test(char))return total+.72;
 if(/[.,:;!?'"()]/.test(char))return total+.30;
 return total+.55;
},0);
/** Break at natural word boundaries, then at grapheme boundaries for unbreakable tokens. Never cut content. */
export function wrapCarouselCopy(value:string,widthUnits:number):string[]{
 if(!Number.isFinite(widthUnits)||widthUnits<2)throw new Error('CAROUSEL_TEXT_WIDTH_INVALID');
 const lines:string[]=[];
 for(const paragraph of value.replace(/\r\n?/g,'\n').split('\n')){
  if(!paragraph.trim()){if(lines.length)lines.push('');continue;}
  let line='';
  for(const token of paragraph.trim().split(/\s+/u)){
   let word=token;
   while(word){
    const possible=line?line+' '+word:word;
    if(textUnits(possible)<=widthUnits){line=possible;break;}
    if(line){lines.push(line);line='';continue;}
    const chars=graphemes(word);let count=1;
    while(count<chars.length&&textUnits(chars.slice(0,count+1).join(''))<=widthUnits)count++;
    lines.push(chars.slice(0,count).join(''));
    word=chars.slice(count).join('');
   }
  }
  if(line)lines.push(line);
 }
 while(lines.length&&lines.at(-1)==='')lines.pop();
 return lines;
}
export type FitCopy={lines:string[];fontSize:number;lineHeight:number;height:number};
export function fitCarouselCopy(value:string,options:{width:number;availableHeight:number;preferred:number;minimum:number;maxLines:number;label:string}):FitCopy{
 const {width,availableHeight,minimum,maxLines,label}=options;
 if(!value||!value.trim())return {lines:[],fontSize:options.preferred,lineHeight:1.26,height:0};
 const preferred=Math.max(minimum,Math.floor(options.preferred));
 for(let fontSize=preferred;fontSize>=minimum;fontSize-=2){
  // Approximate width conservatively; 0.84 leaves room for variations in CJK/Latin font metrics.
  const lines=wrapCarouselCopy(value,width/fontSize*.84);
  const lineHeight=1.26;
  const height=lines.length*fontSize*lineHeight;
  if(lines.length<=maxLines&&height<=availableHeight)
   return {lines,fontSize,lineHeight,height};
 }
 throw new Error('CAROUSEL_TEXT_OVERFLOW_'+label.toUpperCase().replace(/[^A-Z0-9_]/g,'_'));
}
export function mobileCarouselFit(slide:Record<string,any>,plan:CarouselPlan,index:number,language:string){
 const cover=index===0,cta=index===plan.slide_count-1;
 const safeWidth=CAROUSEL_CANVAS.width-2*CAROUSEL_CANVAS.safe;
 // Text budgets match the bright layout's separate photography frame.
 // Reject impossible copy instead of silently clipping or overlaying the image.
 const title=fitCarouselCopy(String(slide?.title||''),{
  width:safeWidth,availableHeight:cover?310:cta?270:300,
  preferred:plan.title_font_size_px+(cover?8:0),minimum:cover?45:cta?47:44,
  maxLines:4,label:'TITLE'});
 const body=fitCarouselCopy(String(language==='en'?(slide?.body_en||slide?.body||''):(slide?.body_ko||slide?.body||'')),{
  width:safeWidth,availableHeight:cover?170:cta?145:225,
  preferred:Math.max(42,plan.body_font_size_px+6),minimum:31,
  maxLines:cover?4:cta?3:6,label:'BODY'});
 const highlight=fitCarouselCopy(String(slide?.highlight||''),{
  width:safeWidth,availableHeight:80,preferred:Math.max(36,plan.body_font_size_px),minimum:27,
  maxLines:2,label:'HIGHLIGHT'});
  const total=title.height+body.height+highlight.height+(body.lines.length?35:0)+(highlight.lines.length?30:0);
 if(total>(cover?840:cta?720:790))throw new Error('CAROUSEL_TEXT_OVERFLOW_TOTAL');
 return {title,body,highlight,total,margin:CAROUSEL_CANVAS.safe,contentWidth:safeWidth};
}

// Magazine body cards have their own elastic 1080 x 1350 grid. Cover and
// editorial closing retain their existing, immutable fit rules below.
export type MagazineBodyLayout='photo'|'information'|'split';
export type MagazineRect={x:number;y:number;width:number;height:number};
export type MagazineBodyFit={
 layout:MagazineBodyLayout;
 title:FitCopy;body:FitCopy;highlight:FitCopy;
 titleRect:MagazineRect;bodyRect:MagazineRect;highlightRect:MagazineRect;
 photoRect:MagazineRect;takeawayLabelY:number|null;
};
const magazineRect=(x:number,y:number,width:number,height:number):MagazineRect=>({x,y,width,height});
function magazineBodyCandidate(
 slide:Record<string,any>,plan:CarouselPlan,index:number,language:string,layout:MagazineBodyLayout
):MagazineBodyFit{
 const titleText=String(slide?.title||'').trim();
 const bodyText=String(language==='en'?(slide?.body_en||slide?.body||''):(slide?.body_ko||slide?.body||'')).trim();
 const takeawayText=String(slide?.highlight||'').trim();
 const isPhoto=layout==='photo',isSplit=layout==='split';
 const titleX=isPhoto?644:80,titleY=isPhoto?255:240,titleWidth=isPhoto?356:920;
 const title=fitCarouselCopy(titleText,{
  width:titleWidth,availableHeight:isPhoto?325:isSplit?250:245,
  preferred:isPhoto?Math.min(55,plan.title_font_size_px):Math.min(69,plan.title_font_size_px),
  minimum:isPhoto?43:49,maxLines:isPhoto?6:4,label:'MAGAZINE_BODY_TITLE'});
 const columnY=titleY+title.height+(isSplit?30:18);
 const textX=isPhoto?644:isSplit?(index%2===1?500:80):80;
 const copyWidth=isPhoto?356:isSplit?500:920;
 const highlight=fitCarouselCopy(takeawayText,{
  width:copyWidth,availableHeight:isPhoto?164:isSplit?160:130,
  preferred:isPhoto?32:35,minimum:29,maxLines:isPhoto?4:3,label:'MAGAZINE_BODY_TAKEAWAY'});
 const hasTakeaway=highlight.lines.length>0;
 const labelY=hasTakeaway?columnY:null;
 const highlightY=columnY+(hasTakeaway?29:0);
 const bodyY=hasTakeaway?highlightY+highlight.height+18:columnY;
 // The information variant yields part of the content band to a photograph.
 // All others use a distinct side-by-side photo/text composition.
 const maxCopyY=isPhoto||isSplit?1185:972;
 const body=fitCarouselCopy(bodyText,{
  width:copyWidth,availableHeight:maxCopyY-bodyY,
  preferred:isPhoto?32:isSplit?33:35,minimum:isPhoto?29:30,
  maxLines:isPhoto?19:isSplit?17:13,label:'MAGAZINE_BODY_DETAILS'});
 if(bodyY+body.height>maxCopyY+.001)throw new Error('MAGAZINE_BODY_COPY_COLLISION');
 let photoRect:MagazineRect;
 if(isPhoto)photoRect=magazineRect(80,238,522,947);
 else if(isSplit)photoRect=magazineRect(index%2===1?80:622,columnY,378,1185-columnY);
 else{
  const photoY=Math.max(836,bodyY+body.height+24);
  if(photoY>995)throw new Error('MAGAZINE_INFORMATION_PHOTO_COLLISION');
  photoRect=magazineRect(80,photoY,920,1185-photoY);
 }
 if(photoRect.height<190)throw new Error('MAGAZINE_PHOTO_FRAME_TOO_SMALL');
 const titleRect=magazineRect(titleX,titleY,titleWidth,title.height);
 const bodyRect=magazineRect(textX,bodyY,copyWidth,body.height);
 const highlightRect=magazineRect(textX,highlightY,copyWidth,highlight.height);
 // Explicitly check every text/photo rectangle rather than hiding collisions
 // with clipping, ellipses, image overlays or smaller fonts.
 const intersects=(a:MagazineRect,b:MagazineRect)=>a.width>0&&a.height>0&&b.width>0&&b.height>0&&
  a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
 if([titleRect,bodyRect,highlightRect].some(rect=>intersects(rect,photoRect)))
  throw new Error('MAGAZINE_BODY_PHOTO_TEXT_COLLISION');
 return {layout,title,body,highlight,titleRect,bodyRect,highlightRect,photoRect,takeawayLabelY:labelY};
}
function magazineBodyFit(slide:Record<string,any>,plan:CarouselPlan,index:number,language:string):MagazineBodyFit{
 const body=String(language==='en'?(slide?.body_en||slide?.body||''):(slide?.body_ko||slide?.body||''));
 const copy=body+' '+String(slide?.title||'');
 const count=[...body].length;
 const comparison=/(?:\bvs\.?\b|\bversus\b|\bwhereas\b|\bcompared\b|비교|반면|차이|대비|달리)/iu.test(copy);
 const figures=(copy.match(/\d+(?:,\d{3})*(?:\.\d+)?/g)||[]).length;
 const provenance=Array.isArray(slide?.source_ids)?slide.source_ids.length:0;
 const priority:MagazineBodyLayout[]=comparison?['split','information','photo']:
  count>=140||figures>=3||provenance>=2?['information','split','photo']:
  count>=116?['split','information','photo']:['photo','split','information'];
 const issues:string[]=[];
 for(const layout of priority){
  try{return magazineBodyCandidate(slide,plan,index,language,layout);}
  catch(error){issues.push(layout+': '+(error instanceof Error?error.message:String(error)));}
 }
 // Overflow rejects the render; no approved text is dropped or made illegible.
 throw new Error('MAGAZINE_BODY_TEXT_OVERFLOW: '+issues.join('; '));
}
// Magazine V2 typography budgets correspond to photograph-first and copy-first grids.
// Unlike old cards, final content is an editorial closing, not a CTA.
export function magazineCarouselFit(slide:Record<string,any>,plan:CarouselPlan,index:number,language:string){
 if(plan.slide_count!==3&&plan.slide_count!==5)throw new Error('MAGAZINE_SLIDE_COUNT_INVALID');
 const cover=index===0,closing=index===plan.slide_count-1;
 if(!cover&&!closing){
  const editorial=magazineBodyFit(slide,plan,index,language);
  return {...editorial,editorial,margin:CAROUSEL_CANVAS.safe,
   contentWidth:CAROUSEL_CANVAS.width-2*CAROUSEL_CANVAS.safe,
   total:editorial.title.height+editorial.body.height+editorial.highlight.height};
 }
 const width=CAROUSEL_CANVAS.width-2*CAROUSEL_CANVAS.safe;
 const title=fitCarouselCopy(String(slide?.title||''),{
  width,availableHeight:cover?385:closing?320:235,
  preferred:cover?Math.max(78,plan.title_font_size_px+8):closing?76:Math.min(74,plan.title_font_size_px),
  minimum:cover?54:closing?48:43,maxLines:cover?4:3,label:'MAGAZINE_TITLE'});
 const body=fitCarouselCopy(String(language==='en'?(slide?.body_en||slide?.body||''):(slide?.body_ko||slide?.body||'')),{
  width,availableHeight:cover?115:closing?240:165,
  preferred:Math.max(36,Math.min(44,plan.body_font_size_px+6)),
  minimum:29,maxLines:cover?2:closing?4:3,label:'MAGAZINE_BODY'});
 const highlight=fitCarouselCopy(String(slide?.highlight||''),{
  width,availableHeight:65,preferred:31,minimum:25,maxLines:1,label:'MAGAZINE_HIGHLIGHT'});
 // The common 80px inset is fixed. The geometry never truncates text to fit photography.
 if(cover&&title.height+body.height>495)throw new Error('MAGAZINE_COVER_TEXT_OVERFLOW');
 if(!cover&&!closing&&title.height+body.height+highlight.height>435)throw new Error('MAGAZINE_INSIGHT_TEXT_OVERFLOW');
 if(closing&&title.height+body.height>575)throw new Error('MAGAZINE_CLOSING_TEXT_OVERFLOW');
 return {title,body,highlight,editorial:undefined,margin:CAROUSEL_CANVAS.safe,contentWidth:width,
  total:title.height+body.height+highlight.height};
}
