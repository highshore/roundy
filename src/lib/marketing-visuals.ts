import {createElement as h} from 'react';
import {ImageResponse} from 'next/og';
import {ROUNDY_IDENTITY as BRAND, EDITORIAL_PRESET, type PresentationRow as Row} from './marketing-presentation';

export type EditorialAssets = {photo?: string|null; fonts?: Array<{name:string;data:ArrayBuffer;weight:400|700|900;style:'normal'}>};
const box=(style:Row,...children:any[])=>h('div',{style:{display:'flex',...style}},...children.filter(x=>x!==null&&x!==undefined&&x!==false));
const text=(value:unknown,size:number,style:Row={})=>box({fontSize:size,lineHeight:1.45,whiteSpace:'pre-wrap',wordBreak:'keep-all',...style},String(value||''));
// Paths intentionally match src/components/roundy-brand.tsx. The tests compare all four.
export const OFFICIAL_ROUNDY_PATHS=[
 'M22 40C28.6274 40 34 34.6274 34 28C34 21.3726 28.6274 16 22 16C15.3726 16 10 21.3726 10 28C10 34.6274 15.3726 40 22 40Z',
 'M67 85C73.6274 85 79 79.6274 79 73C79 66.3726 73.6274 61 67 61C60.3726 61 55 66.3726 55 73C55 79.6274 60.3726 85 67 85Z',
 'M11.4828 47C10.8635 52.1331 11.3613 57.252 12.9415 62.0016C14.5218 66.7512 17.1467 71.0176 20.6341 74.5051C24.1216 77.9925 28.388 80.6174 33.1376 82.1977C37.8872 83.7779 43.0061 84.2757 48.1392 83.6564',
 'M76.6564 54.8333C77.2756 49.7002 76.7779 44.5813 75.1976 39.8317C73.6174 35.0821 70.9925 30.8157 67.505 27.3282C64.0176 23.8408 59.7511 21.2159 55.0016 19.6356C50.252 18.0554 45.1331 17.5576 40 18.1769',
];
export function officialRoundyLogo(dark=false,size=56) {
 const ink=dark?BRAND.paper:BRAND.ink;
 return box({alignItems:'center',gap:12},
  h('svg',{viewBox:'0 0 96 96',width:size,height:size,style:{display:'flex',flexShrink:0}},
   ...OFFICIAL_ROUNDY_PATHS.map((d,i)=>h('path',{key:i,d,fill:i===0?BRAND.accent:i===1?ink:'none',...(i>=2?{stroke:'#e7e7e7',strokeWidth:10,strokeLinecap:'round'}:{})}))),
  text('roundy',size*.82,{color:ink,fontFamily:'DM Sans, sans-serif',fontWeight:700,letterSpacing:-2,lineHeight:1}));
}
function badge(index:number,total:number,dark=false){return text((index+1)+'/'+total,26,{padding:'8px 17px',borderRadius:999,background:dark?'rgba(32,33,31,.6)':'#eeefec',color:dark?'#fffefa':BRAND.ink});}
function header(index:number,total:number,dark=false){return box({justifyContent:'space-between',alignItems:'center',position:'absolute',left:64,right:64,top:62},officialRoundyLogo(dark,54),badge(index,total,dark));}
function fontSizeForTitle(title:string,cover=false){
 const ko=/[가-힣]/.test(title),len=[...title].length;
 if(cover)return ko?(len>26?104:len>19?118:132):(len>55?86:len>35?100:118);
 return ko?(len>24?52:62):(len>48?48:58);
}
// Balance only at word boundaries. Never truncate source facts or silently delete words.
export function titleLines(value:string,maxUnits=10.5):string[]{
 const measure=(s:string)=>[...s].reduce((n,c)=>n+(/[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af]/.test(c)?1:c===' '?0.28:0.52),0);
 const words=value.trim().split(/\s+/).filter(Boolean),lines:string[]=[];let line='';
 for(const word of words){const next=line?line+' '+word:word;if(line&&measure(next)>maxUnits){lines.push(line);line=word;}else line=next;}
 if(line)lines.push(line);
 return lines;
}
function sourceFootnote(slide:Row){
 const source=String(slide.source_label||'').replace(/\s+/g,' ').trim();
 // Full, unabridged citations are retained in caption and source data.
 return source?text('출처 / Source  '+(source.length>155?source.slice(0,152)+'…':source),20,{color:'#74776f',lineHeight:1.4}):null;
}
function background(photo:string|null|undefined,height=1350){
 return photo?h('img',{src:photo,width:1080,height,style:{position:'absolute',left:0,top:0,width:1080,height,objectFit:'cover'}}):null;
}
function cover(slide:Row,index:number,total:number,assets:EditorialAssets){
 const dark=Boolean(assets.photo),title=String(slide.title||''),lines=titleLines(title,/[가-힣]/.test(title)?10:16),fs=fontSizeForTitle(title,true);
 return box({position:'relative',width:1080,height:1350,background:dark?BRAND.ink:BRAND.paper,color:dark?BRAND.paper:BRAND.ink},
  background(assets.photo),dark?box({position:'absolute',inset:0,background:'linear-gradient(180deg,rgba(0,0,0,.3) 0%,rgba(0,0,0,.12) 28%,rgba(0,0,0,.82) 82%)'}):null,
  header(index,total,dark),
  box({position:'absolute',left:64,right:64,bottom:176,flexDirection:'column',gap:28},
   text('Roundy Notes',24,{color:dark?'#e2e3de':'#72776c',letterSpacing:1}),
   box({flexDirection:'column',gap:8},...lines.map((line,i)=>text(line,fs,{fontWeight:900,lineHeight:1.14,letterSpacing:-3,alignSelf:'flex-start',padding:i===Math.min(1,lines.length-1)?'4px 12px':'4px 0',background:i===Math.min(1,lines.length-1)?BRAND.accent:'transparent',color:i===Math.min(1,lines.length-1)?BRAND.ink:dark?BRAND.paper:BRAND.ink}))),
   text(slide.body,36,{lineHeight:1.4,maxWidth:850})),
  box({position:'absolute',left:64,right:64,bottom:65,justifyContent:'space-between',alignItems:'center'},text(BRAND.instagram,25),text(BRAND.website,25)));
}
function content(slide:Row,index:number,total:number,document:Row){
 const lang=document.content_language||(/[가-힣]/.test(String(slide.title))?'ko':'en');
 const ko=String(slide.body_ko||(lang==='ko'?slide.body:slide.secondary_body)||''),en=String(slide.body_en||(lang==='en'?slide.body:slide.secondary_body)||'');
 const title=String(slide.title||''),highlight=String(slide.highlight||'');
 const numbered=/^\d+[.)]/.test(title)?title:index+'. '+title;
 const options=Array.isArray(slide.options)?slide.options.filter(Boolean).slice(0,3):[];
 return box({position:'relative',width:1080,height:1350,background:BRAND.paper,color:BRAND.ink},header(index,total),
  box({position:'absolute',left:64,right:64,top:215,bottom:165,flexDirection:'column',gap:30},
   text(numbered,fontSizeForTitle(title),{background:BRAND.accent,padding:'13px 22px',fontWeight:900,lineHeight:1.25,letterSpacing:-1,alignSelf:'flex-start',maxWidth:952}),
   box({flexDirection:'column',gap:12,marginTop:20},text('국문본문',22,{color:'#84877e',fontWeight:700}),text(ko,42,{lineHeight:1.5})),
   options.length?box({flexDirection:'column',gap:12},...options.map((option:string,i:number)=>text(String.fromCharCode(65+i)+'. '+option,30,{fontWeight:700}))):null,
   highlight?text(highlight,44,{fontWeight:900,lineHeight:1.35,padding:'10px 0',background:'linear-gradient(180deg,transparent 68%,#ffe2df 68%)'}):null,
   en?box({flexDirection:'column',gap:12,marginTop:10},text('영어본문',22,{color:'#84877e',fontWeight:700}),text(en,31,{lineHeight:1.45})):null),
  box({position:'absolute',left:64,right:64,bottom:48,flexDirection:'column',gap:15},sourceFootnote(slide),slide.footer_note?text(slide.footer_note,19,{color:BRAND.muted}):null,
   box({justifyContent:'space-between',alignItems:'center'},text(BRAND.instagram,20,{color:BRAND.muted}),text(BRAND.website,20,{color:BRAND.muted}))));
}
function outro(index:number,total:number,document:Row,assets:EditorialAssets){
 const ko=document.content_language!=='en';
 return box({position:'relative',width:1080,height:1350,background:BRAND.paper,color:BRAND.ink},
  background(assets.photo,590),!assets.photo?box({position:'absolute',top:0,left:0,right:0,height:590,background:BRAND.ink,alignItems:'center',justifyContent:'center'},officialRoundyLogo(true,98)):box({position:'absolute',top:0,left:0,right:0,height:210,background:'linear-gradient(180deg,rgba(0,0,0,.5),transparent)'}),
  header(index,total,true),
  box({position:'absolute',left:64,right:64,top:642,flexDirection:'column',gap:24},
   text(ko?'서울에서 만나는\n1:1 밍글':'Meet in Seoul.\nOne person at a time.',ko?80:70,{fontWeight:900,lineHeight:1.15,letterSpacing:-2}),
   text(ko?'한 사람씩 만나고, 대화해보세요.':'Meet face to face, one conversation at a time.',34),
   box({gap:18,alignItems:'center',justifyContent:'space-between',padding:'14px 0'},...['서울 밍글','1:1 로테이션','직접 만나서'].map((s,i)=>text(ko?s:['Seoul','1:1 rotations','In person'][i],27,{fontWeight:700}))),
   box({height:1,background:'#dedfd7',width:'100%'}),
   box({justifyContent:'space-between',alignItems:'center',gap:22},
    box({flexDirection:'column',gap:8},text('Find Roundy',29,{fontWeight:900}),text('Instagram  '+BRAND.instagram,26),text('Website  '+BRAND.website,26)),
    text(ko?'Roundy 둘러보기  ›':'Explore Roundy  ›',28,{fontWeight:700,background:BRAND.accent,padding:'22px 28px',borderRadius:999}))),
  document.slides?.find((s:Row)=>s.role==='cta')?.footer_note?text(document.slides.find((s:Row)=>s.role==='cta').footer_note,18,{position:'absolute',left:64,right:64,bottom:30,color:BRAND.muted}):null);
}
export function compactEditorialTree(slide:Row,index:number,total:number,document:Row,assets:EditorialAssets={}) {
 const tree=slide.role==='cover'?cover(slide,index,total,assets):slide.role==='cta'?outro(index,total,document,assets):content(slide,index,total,document);
 return box({display:'flex',width:1080,height:1350,fontFamily:assets.fonts?.length?'Roundy Gothic, sans-serif':'sans-serif'},tree);
}
export function renderCompactEditorial(slide:Row,index:number,total:number,document:Row,assets:EditorialAssets={}) {
 return new ImageResponse(compactEditorialTree(slide,index,total,document,assets),{width:1080,height:1350,...(assets.fonts?.length?{fonts:assets.fonts}:{}),headers:{'x-roundy-design-preset':EDITORIAL_PRESET}});
}
