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
const textUnits=(value:string)=>Array.from(value).reduce((total,char)=>{
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
    const chars=Array.from(word);let count=1;
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
 const title=fitCarouselCopy(String(slide?.title||''),{
  width:safeWidth,availableHeight:cover?400:cta?350:350,
  preferred:plan.title_font_size_px+(cover?8:0),minimum:cover?56:50,maxLines:cover?5:4,label:'TITLE'});
 const body=fitCarouselCopy(String(language==='en'?(slide?.body_en||slide?.body||''):(slide?.body_ko||slide?.body||'')),{
  width:safeWidth,availableHeight:cover?260:cta?210:510,
  preferred:Math.max(42,plan.body_font_size_px+6),minimum:38,
  maxLines:cover?5:cta?4:8,label:'BODY'});
 const highlight=fitCarouselCopy(String(slide?.highlight||''),{
  width:safeWidth,availableHeight:120,preferred:Math.max(36,plan.body_font_size_px),minimum:32,maxLines:2,label:'HIGHLIGHT'});
 const total=title.height+body.height+highlight.height+(body.lines.length?35:0)+(highlight.lines.length?30:0);
 if(total>(cover?840:cta?720:790))throw new Error('CAROUSEL_TEXT_OVERFLOW_TOTAL');
 return {title,body,highlight,total,margin:CAROUSEL_CANVAS.safe,contentWidth:safeWidth};
}
