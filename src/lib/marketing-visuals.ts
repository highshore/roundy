import {createElement as h} from 'react';
import {ImageResponse} from 'next/og';
import {ROUNDY_IDENTITY as BRAND, EDITORIAL_PRESET, type PresentationRow as Row} from './marketing-presentation';

export type EditorialAssets = {
 photo?: string|null;
 photos?: string[];
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
 if(cover&&assets.photo)return assets.photo;
 const photos=(assets.photos||[]).filter(Boolean);
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

function content(slide:Row,index:number,_total:number,document:Row,assets:EditorialAssets){
 const options=Array.isArray(slide.options)?slide.options.filter(Boolean):[];
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

export function compactEditorialTree(slide:Row,index:number,total:number,document:Row,assets:EditorialAssets={}){
 const language=document.content_language==='en'?'en':'ko';
 const tree=slide.role==='cover'?cover(slide,index,total,assets,document):slide.role==='cta'?outro(index,total,document):content(slide,index,total,document,assets);
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
