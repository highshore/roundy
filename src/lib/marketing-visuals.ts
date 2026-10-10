import {createElement as h} from 'react';
import {ImageResponse} from 'next/og';
import {readTrendFactPack,selectGuideFacts,factLabel} from './marketing-trend-guide';
import {ROUNDY_IDENTITY as BRAND, EDITORIAL_PRESET, CAMPAIGN_PRESET, EVENT_CAMPAIGN_PRESET, type PresentationRow as Row} from './marketing-presentation';
import {savedCarouselPlan,mobileCarouselFit,carouselNarrative,CAROUSEL_CANVAS} from './marketing-carousel-template';

export type EditorialAssets = {
 photo?: string|null;
 photos?: string[];
 cardPhotos?: Record<number,string>;
 reusePhotos?: boolean;
 fonts?: Array<{name:string;data:ArrayBuffer;weight:400|700|900;style:'normal'}>;
};
const box=(style:Row,...children:any[])=>h('div',{style:{display:'flex',...style}},...children.filter(x=>x!==null&&x!==undefined&&x!==false));
const text=(value:unknown,size:number,style:Row={})=>box({fontSize:size,lineHeight:1.35,whiteSpace:'pre-wrap',wordBreak:'keep-all',...style},String(value||''));

// The geometry matches the website component. Tests compare the four official paths.
export const OFFICIAL_ROUNDY_PATHS=[
 'M22 40C28.6274 40 34 34.6274 34 28C34 21.3726 28.6274 16 22 16C15.3726 16 10 21.3726 10 28C10 34.6274 15.3726 40 22 40Z',
 'M67 85C73.6274 85 79 79.6274 79 73C79 66.3726 73.6274 61 67 61C60.3726 61 55 66.3726 55 73C55 79.6274 60.3726 85 67 85Z',
 'M11.4828 47C10.8635 52.1331 11.3613 57.252 12.9415 62.0016C14.5218 66.7512 17.1467 71.0176 20.6341 74.5051C24.1216 77.9925 28.388 80.6174 33.1376 82.1977C37.8872 83.7779 43.0061 84.2757 48.1392 83.6564',
 'M76.6564 54.8333C77.2756 49.7002 76.7779 44.5813 75.1976 39.8317C73.6174 35.0821 70.9925 30.8157 67.505 27.3282C64.0176 23.8408 59.7511 21.2159 55.0016 19.6356C50.252 18.0554 45.1331 17.5576 40 18.1769',
];

export function officialRoundyLogo(dark=false,size=56){
 const ink=dark?BRAND.paper:BRAND.ink;
 return box({alignItems:'center',gap:12},
  h('svg',{viewBox:'0 0 96 96',width:size,height:size,style:{display:'flex',flexShrink:0}},
   ...OFFICIAL_ROUNDY_PATHS.map((d,i)=>h('path',{key:i,d,fill:i===0?BRAND.accent:i===1?ink:'none',...(i>=2?{stroke:'#e7e7e7',strokeWidth:10,strokeLinecap:'round'}:{})}))
  ),
  text('roundy',size*.82,{color:ink,fontFamily:'DM Sans, sans-serif',fontWeight:700,letterSpacing:-2,lineHeight:1})
 );
}

export function textUnits(value:string){
 return [...value].reduce((n,c)=>n+(/[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af]/.test(c)?1:c===' '?0.32:/[A-ZMW@]/.test(c)?0.7:0.56),0);
}
export function titleLines(value:string,maxUnits=8):string[]{
 const paragraphs=value.split('\n').map(v=>v.trim()).filter(Boolean),lines:string[]=[];
 for(const paragraph of paragraphs){
  const words=paragraph.split(/\s+/).filter(Boolean);let line='';
  for(const word of words){
   const next=line?line+' '+word:word;
   if(line&&textUnits(next)>maxUnits){lines.push(line);line=word;}else line=next;
  }
  if(line)lines.push(line);
 }
 return lines;
}
function linesFor(value:string,size:number,width=940){
 return value.split('\n').flatMap(p=>p.trim()?titleLines(p,(width/size)*.92):['']);
}
function paragraph(value:string,size:number,width=940,style:Row={}){
 return box({flexDirection:'column',gap:2,...style},
  ...linesFor(value,size,width).map(line=>line?text(line,size,{lineHeight:1.48,whiteSpace:'nowrap',flexShrink:0}):box({height:size*.5}))
 );
}
function accentedHeadline(value:string,baseSize:number,width:number,color:string=BRAND.ink){
 let size=baseSize;
 const longest=Math.max(1,...value.split(/\s+/).filter(Boolean).map(textUnits));
 size=Math.min(size,Math.floor(width/longest));
 let lines=titleLines(value,width/size);
 while(lines.length>4&&size>54){size-=4;lines=titleLines(value,width/size);}
 const lastIndex=lines.length-1;
 return box({flexDirection:'column',gap:5},
  ...lines.map((line,i)=>{
   const cut=i===lastIndex?line.lastIndexOf(' '):-1;
   if(cut<=0)return text(line,size,{fontWeight:900,lineHeight:1.08,letterSpacing:-2,color,whiteSpace:'nowrap'});
   return box({alignItems:'baseline',whiteSpace:'nowrap'},
    text(line.slice(0,cut+1),size,{fontWeight:900,lineHeight:1.08,letterSpacing:-2,color,whiteSpace:'nowrap'}),
    text(line.slice(cut+1),size,{fontWeight:900,lineHeight:1.08,letterSpacing:-2,color:BRAND.accent,whiteSpace:'nowrap'})
   );
  })
 );
}
function selectedBody(slide:Row,language:string){
 if(language==='en')return String(slide.body_en||slide.body||'');
 return String(slide.body_ko||slide.body||'');
}
function selectedPhoto(assets:EditorialAssets,index:number,cover=false){
 const exact=assets.cardPhotos?.[index];if(exact)return exact;
 if(cover&&assets.photo)return assets.photo;
 const photos=(assets.photos||[]).filter(Boolean);
 if(assets.reusePhotos===false)return null;
 if(photos.length)return photos[Math.abs(index)%photos.length];
 return assets.photo||null;
}
function photo(src:string|null,style:Row={}){
 return src?h('img',{src,width:1080,height:1350,style:{display:'flex',width:'100%',height:'100%',objectFit:'cover',...style}}):box({width:'100%',height:'100%',background:'#e9e7df'});
}
function sourceFootnote(slide:Row,language:string){
 if(!String(slide.source_label||'').trim())return null;
 return text(language==='en'?'Sources in caption':'출처는 캡션에서 확인',19,{color:BRAND.muted,letterSpacing:.1});
}
function miniLogo(dark=false){
 return officialRoundyLogo(dark,44);
}

function cover(slide:Row,_index:number,_total:number,assets:EditorialAssets,document:Row){
 const language=document.content_language==='en'?'en':'ko',src=selectedPhoto(assets,0,true),title=String(slide.title||''),body=selectedBody(slide,language);
 const subtitleSize=Math.max(21,Math.min(34,Math.floor(900/Math.max(1,textUnits(body)))));
 return box({position:'relative',width:1080,height:1350,background:BRAND.ink,color:BRAND.paper,overflow:'hidden'},
  photo(src),
  box({position:'absolute',inset:0,background:'linear-gradient(180deg,rgba(20,20,18,.45) 0%,rgba(20,20,18,.12) 38%,rgba(20,20,18,.72) 100%)'}),
  box({position:'absolute',top:66,left:0,right:0,justifyContent:'center'},officialRoundyLogo(true,62)),
  box({position:'absolute',left:72,right:72,bottom:112,flexDirection:'column',gap:24},
   accentedHeadline(title,language==='ko'?112:100,900,BRAND.paper),
   text(body,subtitleSize,{fontWeight:400,lineHeight:1.35,color:'#f4f1e9',whiteSpace:'nowrap'})
  )
 );
}

function optionList(options:string[],language:string){
 return box({flexDirection:'column',gap:0},
  ...options.slice(0,3).flatMap((option,i)=>[
   box({alignItems:'flex-start',gap:20,padding:'18px 0'},
    text(String(i+1).padStart(2,'0'),22,{color:BRAND.accent,fontWeight:700,letterSpacing:1}),
    paragraph(option,language==='ko'?31:29,780,{fontWeight:700})
   ),
   i<Math.min(options.length,3)-1?box({height:1,background:'#d9d8d2',width:'100%'}):null
  ])
 );
}

function contentSplit(slide:Row,index:number,document:Row,assets:EditorialAssets){
 const language=document.content_language==='en'?'en':'ko',body=selectedBody(slide,language),src=selectedPhoto(assets,index),options=Array.isArray(slide.options)?slide.options.filter(Boolean):[];
 return box({position:'relative',width:1080,height:1350,background:BRAND.paper,color:BRAND.ink},
  box({position:'absolute',left:64,top:58},miniLogo()),
  box({position:'absolute',left:64,top:180,width:540,bottom:100,flexDirection:'column',justifyContent:'center',gap:30},
   accentedHeadline(String(slide.title||''),language==='ko'?70:65,520),
   paragraph(body,language==='ko'?36:33,520,{color:'#3e403b'}),
   options.length?optionList(options,language):null,
   String(slide.highlight||'')?text(slide.highlight,language==='ko'?31:29,{fontWeight:700,color:BRAND.accent,lineHeight:1.35}):null,
   sourceFootnote(slide,language)
  ),
  box({position:'absolute',right:0,top:0,width:390,height:1350,overflow:'hidden'},photo(src,{objectPosition:index%2?'52% center':'42% center'}))
 );
}

function contentPhotoBand(slide:Row,index:number,document:Row,assets:EditorialAssets){
 const language=document.content_language==='en'?'en':'ko',body=selectedBody(slide,language),src=selectedPhoto(assets,index),options=Array.isArray(slide.options)?slide.options.filter(Boolean):[];
 return box({position:'relative',width:1080,height:1350,background:BRAND.paper,color:BRAND.ink},
  box({position:'absolute',left:0,right:0,top:0,height:470,overflow:'hidden'},photo(src,{objectPosition:'center 45%'})),
  box({position:'absolute',top:0,left:0,right:0,height:160,background:'linear-gradient(180deg,rgba(20,20,18,.45),transparent)'}),
  box({position:'absolute',left:64,top:58},miniLogo(true)),
  box({position:'absolute',left:72,right:72,top:535,bottom:86,flexDirection:'column',justifyContent:'center',gap:28},
   accentedHeadline(String(slide.title||''),language==='ko'?74:68,900),
   paragraph(body,language==='ko'?37:34,900,{color:'#3e403b'}),
   options.length?optionList(options,language):null,
   String(slide.highlight||'')?text(slide.highlight,language==='ko'?32:30,{fontWeight:700,color:BRAND.accent,lineHeight:1.35}):null,
   sourceFootnote(slide,language)
  )
 );
}

function contentTextLead(slide:Row,index:number,document:Row,assets:EditorialAssets){
 const language=document.content_language==='en'?'en':'ko',body=selectedBody(slide,language),src=selectedPhoto(assets,index),options=Array.isArray(slide.options)?slide.options.filter(Boolean):[];
 return box({position:'relative',width:1080,height:1350,background:BRAND.paper,color:BRAND.ink},
  box({position:'absolute',left:64,top:58},miniLogo()),
  box({position:'absolute',left:72,right:72,top:190,height:720,flexDirection:'column',justifyContent:'center',gap:30},
   accentedHeadline(String(slide.title||''),language==='ko'?78:70,900),
   paragraph(body,language==='ko'?39:35,850,{color:'#3e403b'}),
   options.length?optionList(options,language):null,
   String(slide.highlight||'')?text(slide.highlight,language==='ko'?34:31,{fontWeight:700,color:BRAND.accent,lineHeight:1.35}):null
  ),
  box({position:'absolute',left:72,right:72,bottom:76,height:270,overflow:'hidden'},photo(src,{objectPosition:index%2?'center 38%':'center 58%'})),
  box({position:'absolute',left:72,bottom:42},sourceFootnote(slide,language))
 );
}

function contentTextOnly(slide:Row,document:Row){
 const language=document.content_language==='en'?'en':'ko',body=selectedBody(slide,language),options=Array.isArray(slide.options)?slide.options.filter(Boolean):[];
 return box({position:'relative',width:1080,height:1350,background:BRAND.paper,color:BRAND.ink},
  box({position:'absolute',left:64,top:58},miniLogo()),
  box({position:'absolute',left:92,right:92,top:220,bottom:160,flexDirection:'column',justifyContent:'center',gap:38},
   accentedHeadline(String(slide.title||''),language==='ko'?88:78,880),
   paragraph(body,language==='ko'?42:38,840,{color:'#3e403b'}),
   options.length?optionList(options,language):null,
   String(slide.highlight||'')?text(slide.highlight,language==='ko'?36:33,{fontWeight:700,color:BRAND.accent,lineHeight:1.35}):null
  ),
  box({position:'absolute',left:92,bottom:78},sourceFootnote(slide,language))
 );
}
function trendFactSheet(slide:Row,document:Row){
 const language=document.content_language==='en'?'en':'ko',sources=Array.isArray(document.trend?.source_ids)?document.trend.source_ids:[],
  pack=readTrendFactPack(document.trend_fact_pack,sources);
 if(!pack)return contentTextOnly(slide,document);
 const facts=selectGuideFacts(pack,4);
 return box({position:'relative',width:1080,height:1350,background:BRAND.paper,color:BRAND.ink,overflow:'hidden'},
  box({position:'absolute',left:65,top:55},miniLogo()),
  box({position:'absolute',left:72,right:72,top:160,flexDirection:'column',gap:18},
   text(language==='ko'?'서울 트렌드 / 방문 가이드':'SEOUL TREND / QUICK GUIDE',23,{letterSpacing:1.2,color:BRAND.accent,fontWeight:800}),
   accentedHeadline(String(slide.title||(language==='ko'?'방문 전에 알아둘 것':'The details that matter')),language==='ko'?68:65,900)
  ),
  box({position:'absolute',left:70,right:70,top:365,bottom:126,flexDirection:'column',gap:13},
   ...facts.map((fact,i)=>box({borderRadius:22,background:i%2===0?'#f0f0ea':'#f8f1e9',padding:'23px 31px',flexDirection:'column',gap:10,minHeight:145},
    text(factLabel(fact.kind,language),20,{color:BRAND.accent,fontWeight:800,letterSpacing:1.5}),
    paragraph(language==='ko'?fact.value_ko:fact.value_en,language==='ko'?34:32,840,{fontWeight:650,color:BRAND.ink})
   ))
  ),
  box({position:'absolute',bottom:68,left:72,right:72,flexDirection:'row',justifyContent:'space-between'},
   text(language==='ko'?'근거 자료는 게시글 본문에서 확인':'Sources are linked in the caption',19,{color:BRAND.muted}),
   text('ROUNDY / '+facts.length+' FACTS',19,{color:BRAND.muted,fontWeight:700})
  )
 );
}
function content(slide:Row,index:number,_total:number,document:Row,assets:EditorialAssets){
 const options=Array.isArray(slide.options)?slide.options.filter(Boolean):[];
 if(assets.reusePhotos===false&&!selectedPhoto(assets,index))return contentTextOnly(slide,document);
 if(options.length>=2)return contentTextLead(slide,index,document,assets);
 return index%3===1?contentSplit(slide,index,document,assets):index%3===2?contentPhotoBand(slide,index,document,assets):contentTextLead(slide,index,document,assets);
}

function outro(_index:number,_total:number,document:Row){
 const ko=document.content_language!=='en';
 const description=ko
  ?'대면으로 만나고, 서로 선택하면 매칭되는 서울의 로테이션 소개팅.'
  :'Meet face to face in Seoul. Match only when the interest is mutual.';
 return box({position:'relative',width:1080,height:1350,background:BRAND.paper,color:BRAND.ink,alignItems:'center',justifyContent:'center'},
  box({width:820,flexDirection:'column',alignItems:'center',gap:38,textAlign:'center'},
   officialRoundyLogo(false,94),
   box({width:90,height:5,background:BRAND.accent}),
   paragraph(description,ko?44:40,820,{fontWeight:700,textAlign:'center',alignItems:'center'}),
   box({flexDirection:'column',alignItems:'center',gap:8,marginTop:18},
    text(BRAND.instagram,29,{fontWeight:700}),
    text('https://'+BRAND.website,29,{fontWeight:700})
   )
  )
 );
}

// Unified new-generation cards; older documents use their original branded templates.
export function standardCarouselTree(slide:Row,index:number,total:number,document:Row,assets:EditorialAssets={}){
 const plan=savedCarouselPlan(document);
 if(!plan||plan.slide_count!==total||index<0||index>=total)throw new Error('CAROUSEL_TEMPLATE_LAYOUT_MISMATCH');
 const language=document.content_language==='en'?'en':'ko',fit=mobileCarouselFit(slide,plan,index,language);
 const cover=index===0,cta=index===total-1,src=cta?null:selectedPhoto(assets,index,cover);
 const dark=!!src||cover||cta,fg=dark?BRAND.paper:BRAND.ink;
 const typeface=language==='ko'?(assets.fonts?.length?'Noto Sans KR, sans-serif':'sans-serif')
   :(assets.fonts?.length?'DM Sans, sans-serif':'sans-serif');
 const lines=(items:string[],size:number,color:string,weight:number,lh:number)=>
  box({width:'100%',flexDirection:'column',alignItems:'flex-start',gap:2},
   ...items.map(line=>text(line||' ',size,{whiteSpace:'nowrap',fontWeight:weight,lineHeight:lh,color,letterSpacing:weight>=700?-1:0})));
 return box({position:'relative',width:CAROUSEL_CANVAS.width,height:CAROUSEL_CANVAS.height,
  background:dark?BRAND.ink:BRAND.paper,color:fg,overflow:'hidden',fontFamily:typeface},
  src?photo(src):null,
  // Opaque photographic scrim prevents bright imagery from reducing text contrast.
  // Satori/ImageResponse does not reliably paint shorthand inset:0 overlays.
  // Explicit dimensions and edges ensure bright photographs retain text contrast.
  src?box({position:'absolute',top:0,left:0,width:CAROUSEL_CANVAS.width,
   height:CAROUSEL_CANVAS.height,backgroundColor:'rgba(13,18,15,.83)'}):null,
  box({position:'absolute',left:80,right:80,top:66,alignItems:'center',justifyContent:'space-between'},
   officialRoundyLogo(dark,48),
   text(String(index+1).padStart(2,'0')+' / '+String(total).padStart(2,'0'),23,
    {fontWeight:700,color:dark?'#ffffff':'#454740',letterSpacing:2})),
  box({position:'absolute',left:80,right:80,top:cover?320:cta?345:280,bottom:cover?145:cta?174:140,
   flexDirection:'column',justifyContent:'center',alignItems:'flex-start',gap:22},
   text(carouselNarrative(total)[index]||'ROUNDY',23,{fontWeight:900,color:dark?'#ffffff':BRAND.accent,letterSpacing:2.6}),
   lines(fit.title.lines,fit.title.fontSize,fg,900,1.14),
   box({height:5,width:74,background:BRAND.accent,marginTop:10,marginBottom:8}),
   lines(fit.body.lines,fit.body.fontSize,dark?'#ffffff':'#30352f',500,1.32),
   fit.highlight.lines.length?lines(fit.highlight.lines,fit.highlight.fontSize,dark?'#ffe0d8':BRAND.accent,700,1.26):null,
   cta?box({flexDirection:'column',gap:12,marginTop:20},text(BRAND.instagram,30,{fontWeight:700,color:fg}),
    text(BRAND.website,28,{fontWeight:700,color:fg})):null),
  !cta&&slide.source_label?box({position:'absolute',left:80,bottom:64,right:80},
   text(language==='en'?'Sources in caption':'출처는 본문에서 확인',22,{fontWeight:600,color:dark?'#ffffff':'#555b53'})):null
 );
}
export function compactEditorialTree(slide:Row,index:number,total:number,document:Row,assets:EditorialAssets={}){
 const language=document.content_language==='en'?'en':'ko';
 const tree=savedCarouselPlan(document)?standardCarouselTree(slide,index,total,document,assets):slide.role==='cover'?cover(slide,index,total,assets,document):slide.role==='cta'?outro(index,total,document):slide.role==='facts'&&document.trend_fact_pack?trendFactSheet(slide,document):content(slide,index,total,document,assets);
 return box({
  width:1080,
  height:1350,
  fontFamily:language==='ko'?(assets.fonts?.length?'Noto Sans KR, sans-serif':'sans-serif'):(assets.fonts?.length?'DM Sans, sans-serif':'sans-serif')
 },tree);
}
export function renderCompactEditorial(slide:Row,index:number,total:number,document:Row,assets:EditorialAssets={}){
 return new ImageResponse(compactEditorialTree(slide,index,total,document,assets),{
  width:1080,
  height:1350,
  ...(assets.fonts?.length?{fonts:assets.fonts}:{}),
  headers:{'x-roundy-design-preset':EDITORIAL_PRESET}
 });
}


function campaignOverlay(tone:string){
 if(tone==='soft_romantic')return 'linear-gradient(180deg,rgba(24,20,20,.22) 0%,rgba(24,20,20,.06) 34%,rgba(24,20,20,.70) 100%)';
 if(tone==='bold_teaser')return 'linear-gradient(180deg,rgba(12,12,11,.52) 0%,rgba(12,12,11,.20) 34%,rgba(12,12,11,.84) 100%)';
 return 'linear-gradient(180deg,rgba(20,20,18,.36) 0%,rgba(20,20,18,.10) 38%,rgba(20,20,18,.76) 100%)';
}
function campaignPoster(slide:Row,index:number,document:Row,assets:EditorialAssets){
 const language=document.content_language==='en'?'en':'ko',src=selectedPhoto(assets,index,index===0),body=selectedBody(slide,language);
 return box({position:'relative',width:1080,height:1350,background:BRAND.ink,color:BRAND.paper,overflow:'hidden'},
  photo(src),
  box({position:'absolute',inset:0,background:campaignOverlay(String(document.campaign_tone||'modern_premium'))}),
  box({position:'absolute',left:64,top:58},officialRoundyLogo(true,52)),
  box({position:'absolute',left:72,right:72,bottom:96,flexDirection:'column',gap:22},
   accentedHeadline(String(slide.title||''),language==='ko'?106:94,900,BRAND.paper),
   body?paragraph(body,language==='ko'?32:30,850,{color:'#f6f2eb',fontWeight:500}):null
  )
 );
}
function campaignSplit(slide:Row,index:number,document:Row,assets:EditorialAssets){
 const language=document.content_language==='en'?'en':'ko',src=selectedPhoto(assets,index,index===0),body=selectedBody(slide,language);
 return box({position:'relative',width:1080,height:1350,background:BRAND.paper,color:BRAND.ink,overflow:'hidden'},
  box({position:'absolute',left:0,right:0,top:0,height:820,overflow:'hidden'},photo(src,{objectPosition:index%2?'center 42%':'center 52%'})),
  box({position:'absolute',left:0,right:0,top:0,height:180,background:'linear-gradient(180deg,rgba(20,20,18,.40),transparent)'}),
  box({position:'absolute',left:56,top:52},officialRoundyLogo(true,46)),
  box({position:'absolute',left:72,right:72,top:860,bottom:72,flexDirection:'column',justifyContent:'center',gap:22},
   accentedHeadline(String(slide.title||''),language==='ko'?78:70,900),
   body?paragraph(body,language==='ko'?31:29,860,{color:'#454740'}):null
  )
 );
}
function campaignStep(slide:Row,index:number,document:Row,assets:EditorialAssets){
 const language=document.content_language==='en'?'en':'ko',src=selectedPhoto(assets,index),body=selectedBody(slide,language),step=Math.max(1,Number(slide.step_number||index));
 return box({position:'relative',width:1080,height:1350,background:BRAND.paper,color:BRAND.ink,overflow:'hidden'},
  box({position:'absolute',right:0,top:0,width:520,height:1350,overflow:'hidden'},photo(src,{objectPosition:'center'})),
  box({position:'absolute',right:0,top:0,width:520,height:1350,background:'linear-gradient(90deg,rgba(255,254,250,.20),rgba(32,33,31,.12))'}),
  box({position:'absolute',left:62,top:56},miniLogo()),
  box({position:'absolute',left:76,top:220,width:470,bottom:120,flexDirection:'column',justifyContent:'center',gap:26},
   text(String(step).padStart(2,'0'),116,{fontWeight:900,color:BRAND.accent,lineHeight:1,letterSpacing:-4}),
   accentedHeadline(String(slide.title||''),language==='ko'?72:64,455),
   body?paragraph(body,language==='ko'?31:29,440,{color:'#454740'}):null
  )
 );
}
function campaignOutro(slide:Row,index:number,document:Row,assets:EditorialAssets){
 const language=document.content_language==='en'?'en':'ko',src=selectedPhoto(assets,index),body=selectedBody(slide,language);
 return box({position:'relative',width:1080,height:1350,background:BRAND.ink,color:BRAND.paper,overflow:'hidden',alignItems:'center',justifyContent:'center'},
  photo(src),
  box({position:'absolute',inset:0,background:'rgba(20,20,18,.68)'}),
  box({position:'absolute',left:90,right:90,top:210,bottom:150,flexDirection:'column',alignItems:'center',justifyContent:'center',gap:34,textAlign:'center'},
   officialRoundyLogo(true,88),
   box({width:86,height:5,background:BRAND.accent}),
   paragraph(String(slide.title||''),language==='ko'?58:52,860,{fontWeight:900,textAlign:'center',alignItems:'center',color:BRAND.paper}),
   body?paragraph(body,language==='ko'?30:28,760,{textAlign:'center',alignItems:'center',color:'#f3eee8'}):null,
   box({flexDirection:'column',alignItems:'center',gap:8,marginTop:18},
    text(BRAND.instagram,28,{fontWeight:700,color:BRAND.paper}),
    text(BRAND.website,28,{fontWeight:700,color:BRAND.paper})
   )
  )
 );
}
export function prelaunchCampaignTree(slide:Row,index:number,total:number,document:Row,assets:EditorialAssets={}){
 if(savedCarouselPlan(document))return standardCarouselTree(slide,index,total,document,assets);
 const language=document.content_language==='en'?'en':'ko',pattern=String(document.campaign_pattern||'poster');
 let tree;
 if(slide.role==='cta'||index===total-1)tree=campaignOutro(slide,index,document,assets);
 else if(pattern==='how_it_works'&&slide.role==='step')tree=campaignStep(slide,index,document,assets);
 else if(pattern==='problem_solution'||pattern==='benefit_stack')tree=campaignSplit(slide,index,document,assets);
 else tree=campaignPoster(slide,index,document,assets);
 return box({width:1080,height:1350,fontFamily:language==='ko'?(assets.fonts?.length?'Noto Sans KR, sans-serif':'sans-serif'):(assets.fonts?.length?'DM Sans, sans-serif':'sans-serif')},tree);
}
export function renderPrelaunchCampaign(slide:Row,index:number,total:number,document:Row,assets:EditorialAssets={}){
 return new ImageResponse(prelaunchCampaignTree(slide,index,total,document,assets),{
  width:1080,
  height:1350,
  ...(assets.fonts?.length?{fonts:assets.fonts}:{}),
  headers:{'x-roundy-design-preset':CAMPAIGN_PRESET}
 });
}


function eventFactsCard(slide:Row,index:number,document:Row,assets:EditorialAssets){
 const language=document.content_language==='en'?'en':'ko',src=selectedPhoto(assets,index),body=selectedBody(slide,language);
 return box({position:'relative',width:1080,height:1350,background:BRAND.paper,color:BRAND.ink,overflow:'hidden'},
  box({position:'absolute',left:0,right:0,top:0,height:690,overflow:'hidden'},photo(src,{objectPosition:'center 48%'})),
  box({position:'absolute',left:0,right:0,top:0,height:160,background:'linear-gradient(180deg,rgba(20,20,18,.44),transparent)'}),
  box({position:'absolute',left:58,top:52},officialRoundyLogo(true,48)),
  box({position:'absolute',left:72,right:72,top:748,bottom:72,flexDirection:'column',justifyContent:'center',gap:24},
   text(String(slide.eyebrow||'ROUNDY EVENT').toUpperCase(),20,{fontWeight:700,color:BRAND.accent,letterSpacing:1.2}),
   accentedHeadline(String(slide.title||''),language==='ko'?68:62,900),
   body?paragraph(body,language==='ko'?30:28,870,{color:'#454740',fontWeight:600}):null
  )
 );
}
function eventExperienceCard(slide:Row,index:number,document:Row,assets:EditorialAssets){
 const language=document.content_language==='en'?'en':'ko',src=selectedPhoto(assets,index),body=selectedBody(slide,language),step=Math.max(1,Number(slide.step_number||index));
 return box({position:'relative',width:1080,height:1350,background:BRAND.paper,color:BRAND.ink,overflow:'hidden'},
  box({position:'absolute',left:0,top:0,width:1080,height:520,overflow:'hidden'},photo(src,{objectPosition:'center 45%'})),
  box({position:'absolute',left:58,top:52},officialRoundyLogo(true,46)),
  box({position:'absolute',left:72,right:72,top:570,bottom:82,flexDirection:'column',justifyContent:'center',gap:26},
   text(String(step).padStart(2,'0'),100,{fontWeight:900,color:BRAND.accent,lineHeight:1,letterSpacing:-3}),
   accentedHeadline(String(slide.title||''),language==='ko'?72:64,880),
   body?paragraph(body,language==='ko'?31:29,850,{color:'#454740'}):null
  )
 );
}
function eventStatusCard(slide:Row,index:number,document:Row,assets:EditorialAssets){
 const language=document.content_language==='en'?'en':'ko',src=selectedPhoto(assets,index),body=selectedBody(slide,language);
 return box({position:'relative',width:1080,height:1350,background:BRAND.ink,color:BRAND.paper,overflow:'hidden'},
  photo(src),
  box({position:'absolute',inset:0,background:'linear-gradient(180deg,rgba(18,18,17,.40),rgba(18,18,17,.18) 34%,rgba(18,18,17,.86) 100%)'}),
  box({position:'absolute',left:58,top:52},officialRoundyLogo(true,48)),
  box({position:'absolute',left:74,right:74,bottom:104,flexDirection:'column',gap:22},
   text(String(slide.eyebrow||'ROUNDY EVENT').toUpperCase(),19,{fontWeight:700,color:'#f0ddd8',letterSpacing:1.2}),
   accentedHeadline(String(slide.title||''),language==='ko'?100:88,900,BRAND.paper),
   body?paragraph(body,language==='ko'?31:29,850,{color:'#f5f0e9',fontWeight:600}):null
  )
 );
}
function eventOutro(slide:Row,index:number,document:Row,assets:EditorialAssets){
 const language=document.content_language==='en'?'en':'ko',src=selectedPhoto(assets,index),body=selectedBody(slide,language);
 return box({position:'relative',width:1080,height:1350,background:BRAND.ink,color:BRAND.paper,overflow:'hidden',alignItems:'center',justifyContent:'center'},
  photo(src),
  box({position:'absolute',inset:0,background:'rgba(20,20,18,.70)'}),
  box({position:'absolute',left:90,right:90,top:190,bottom:140,flexDirection:'column',alignItems:'center',justifyContent:'center',gap:32,textAlign:'center'},
   officialRoundyLogo(true,86),
   box({width:88,height:5,background:BRAND.accent}),
   paragraph(String(slide.title||''),language==='ko'?58:50,850,{fontWeight:900,textAlign:'center',alignItems:'center',color:BRAND.paper}),
   body?paragraph(body,language==='ko'?30:28,760,{textAlign:'center',alignItems:'center',color:'#f3eee8'}):null,
   text(BRAND.instagram+'  |  '+BRAND.website,27,{fontWeight:700,color:BRAND.paper,marginTop:16})
  )
 );
}
export function liveEventCampaignTree(slide:Row,index:number,total:number,document:Row,assets:EditorialAssets={}){
 if(savedCarouselPlan(document))return standardCarouselTree(slide,index,total,document,assets);
 const language=document.content_language==='en'?'en':'ko',pattern=String(document.event_campaign_pattern||'event_poster');
 let tree;
 if(slide.role==='cta'||index===total-1)tree=eventOutro(slide,index,document,assets);
 else if(pattern==='experience'&&slide.role==='step')tree=eventExperienceCard(slide,index,document,assets);
 else if(['status','offer'].includes(String(slide.role)))tree=eventStatusCard(slide,index,document,assets);
 else tree=eventFactsCard(slide,index,document,assets);
 return box({width:1080,height:1350,fontFamily:language==='ko'?(assets.fonts?.length?'Noto Sans KR, sans-serif':'sans-serif'):(assets.fonts?.length?'DM Sans, sans-serif':'sans-serif')},tree);
}
export function renderLiveEventCampaign(slide:Row,index:number,total:number,document:Row,assets:EditorialAssets={}){
 return new ImageResponse(liveEventCampaignTree(slide,index,total,document,assets),{
  width:1080,height:1350,...(assets.fonts?.length?{fonts:assets.fonts}:{}),
  headers:{'x-roundy-design-preset':EVENT_CAMPAIGN_PRESET}
 });
}
