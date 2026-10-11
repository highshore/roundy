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
// Canonical display spellings avoid missing Unicode unit glyphs in Instagram raster output.
// The source JSON is unchanged; only the rendered representation is normalized.
const magazineDisplayUnits=(value:string)=>value.replace(/㎡/g,'m²').replace(/㎢/g,'km²')
 .replace(/㎞/g,'km').replace(/㎝/g,'cm').replace(/㎜/g,'mm').replace(/㎏/g,'kg');
function magazineBodyCandidate(
 slide:Record<string,any>,plan:CarouselPlan,index:number,language:string,layout:MagazineBodyLayout
):MagazineBodyFit{
 const titleText=magazineDisplayUnits(String(slide?.title||'').trim());
 const bodyText=magazineDisplayUnits(String(language==='en'?(slide?.body_en||slide?.body||''):(slide?.body_ko||slide?.body||'')).trim());
 const takeawayText=magazineDisplayUnits(String(slide?.highlight||'').trim());
 const rightSplit=index%2===0;
 const title=fitCarouselCopy(titleText,{
  width:920,availableHeight:245,preferred:Math.min(68,plan.title_font_size_px),
  minimum:52,maxLines:3,label:'MAGAZINE_BODY_TITLE'});
 const titleRect=magazineRect(80,235,920,title.height);
 const photoTop=titleRect.y+titleRect.height+27;
 // Body copy is always full-width: never force a 100-character Korean paragraph
 // into a narrow 350px column of tiny, stacked lines.
 const body=fitCarouselCopy(bodyText,{
  width:920,availableHeight:370,preferred:36,minimum:34,
  maxLines:8,label:'MAGAZINE_BODY_DETAILS'});
 const highlight=fitCarouselCopy(takeawayText,{
  width:layout==='split'?360:920,availableHeight:145,
  preferred:36,minimum:32,maxLines:3,label:'MAGAZINE_BODY_TAKEAWAY'});
 const hasHighlight=highlight.lines.length>0;
 const gapAfterTitle=hasHighlight?18:0;
 let photoRect:MagazineRect,highlightRect:MagazineRect,bodyRect:MagazineRect;
 if(layout==='photo'){
  // Photo-led spread. Large horizontal photograph, then a brief takeaway
  // and a readable full-width paragraph. No fake UI or overlaid text.
  const copyHeight=body.height+(hasHighlight?highlight.height+gapAfterTitle:0);
  const available=1175-photoTop-22-copyHeight;
  const photoHeight=Math.min(575,Math.floor(available));
  if(photoHeight<370)throw new Error('MAGAZINE_PHOTO_TOO_SMALL');
  photoRect=magazineRect(80,photoTop,920,photoHeight);
  const takeawayY=photoTop+photoHeight+22;
  highlightRect=magazineRect(80,takeawayY,920,highlight.height);
  bodyRect=magazineRect(80,takeawayY+(hasHighlight?highlight.height+gapAfterTitle:0),920,body.height);
 }else if(layout==='information'){
  // Information-first: one wide, short paragraph above a supporting photo.
  highlightRect=magazineRect(80,photoTop,920,highlight.height);
  const bodyY=photoTop+(hasHighlight?highlight.height+gapAfterTitle:0);
  bodyRect=magazineRect(80,bodyY,920,body.height);
  const photoY=Math.max(780,bodyY+body.height+34);
  const photoHeight=1175-photoY;
  if(photoHeight<215)throw new Error('MAGAZINE_INFORMATION_PHOTO_TOO_SMALL');
  photoRect=magazineRect(80,photoY,920,photoHeight);
 }else{
  // Split: picture and distilled takeaway side by side, full-width supporting
  // details below. Avoid making the entire explanation a 10-15-line column.
  const copyHeight=body.height;
  const available=1175-photoTop-26-copyHeight;
  const photoHeight=Math.min(545,Math.floor(available));
  if(photoHeight<360)throw new Error('MAGAZINE_SPLIT_PHOTO_TOO_SMALL');
  photoRect=magazineRect(rightSplit?474:80,photoTop,526,photoHeight);
  highlightRect=magazineRect(rightSplit?80:634,photoTop+25,360,highlight.height);
  bodyRect=magazineRect(80,photoTop+photoHeight+26,920,body.height);
 }
 const rects=[titleRect,highlightRect,bodyRect];
 const intersects=(a:MagazineRect,b:MagazineRect)=>a.width>0&&a.height>0&&b.width>0&&b.height>0&&
  a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
 if(rects.some(rect=>intersects(rect,photoRect)))
  throw new Error('MAGAZINE_BODY_PHOTO_TEXT_COLLISION');
 if(bodyRect.y+bodyRect.height>1175||highlightRect.y+highlightRect.height>1175)
  throw new Error('MAGAZINE_BODY_COPY_COLLISION');
 return {layout,title,body,highlight,titleRect,bodyRect,highlightRect,photoRect,takeawayLabelY:null};
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
