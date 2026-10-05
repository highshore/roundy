import {createElement as h} from 'react';
import {ImageResponse} from 'next/og';
import {ROUNDY_IDENTITY as BRAND, EDITORIAL_PRESET, type PresentationRow as Row} from './marketing-presentation';

export type EditorialAssets = {photo?: string|null; fonts?: Array<{name:string;data:ArrayBuffer;weight:400|700|900;style:'normal'}>};
const box=(style:Row,...children:any[])=>h('div',{style:{display:'flex',...style}},...children.filter(x=>x!==null&&x!==undefined&&x!==false));
const text=(value:unknown,size:number,style:Row={})=>box({fontSize:size,lineHeight:1.45,whiteSpace:'pre-wrap',wordBreak:'keep-all',...style},String(value||''));
// The geometry matches the website component. Tests compare the four official paths.
export const OFFICIAL_ROUNDY_PATHS=[
 'M22 40C28.6274 40 34 34.6274 34 28C34 21.3726 28.6274 16 22 16C15.3726 16 10 21.3726 10 28C10 34.6274 15.3726 40 22 40Z',
 'M67 85C73.6274 85 79 79.6274 79 73C79 66.3726 73.6274 61 67 61C60.3726 61 55 66.3726 55 73C55 79.6274 60.3726 85 67 85Z',
 'M11.4828 47C10.8635 52.1331 11.3613 57.252 12.9415 62.0016C14.5218 66.7512 17.1467 71.0176 20.6341 74.5051C24.1216 77.9925 28.388 80.6174 33.1376 82.1977C37.8872 83.7779 43.0061 84.2757 48.1392 83.6564',
 'M76.6564 54.8333C77.2756 49.7002 76.7779 44.5813 75.1976 39.8317C73.6174 35.0821 70.9925 30.8157 67.505 27.3282C64.0176 23.8408 59.7511 21.2159 55.0016 19.6356C50.252 18.0554 45.1331 17.5576 40 18.1769',
];
export function officialRoundyLogo(dark=false,size=56){
 const ink=dark?BRAND.paper:BRAND.ink;
 return box({alignItems:'center',gap:12},h('svg',{viewBox:'0 0 96 96',width:size,height:size,style:{display:'flex',flexShrink:0}},...OFFICIAL_ROUNDY_PATHS.map((d,i)=>h('path',{key:i,d,fill:i===0?BRAND.accent:i===1?ink:'none',...(i>=2?{stroke:'#e7e7e7',strokeWidth:10,strokeLinecap:'round'}:{})}))),text('roundy',size*.82,{color:ink,fontFamily:'DM Sans, sans-serif',fontWeight:700,letterSpacing:-2,lineHeight:1}));
}
function badge(index:number,total:number,dark=false){return text((index+1)+'/'+total,26,{padding:'8px 17px',borderRadius:999,background:dark?'rgba(32,33,31,.6)':'#eeefec',color:dark?BRAND.paper:BRAND.ink});}
function header(index:number,total:number,dark=false){return box({justifyContent:'space-between',alignItems:'center',position:'absolute',left:64,right:64,top:62},officialRoundyLogo(dark,54),badge(index,total,dark));}
export function textUnits(value:string){return [...value].reduce((n,c)=>n+(/[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af]/.test(c)?1:c===' '?0.32:/[A-ZMW@]/.test(c)?0.7:0.56),0);}
// Break whole words, retaining punctuation with its word. No content deletion or paraphrasing.
export function titleLines(value:string,maxUnits=8):string[]{
 const words=value.trim().split(/\s+/).filter(Boolean),lines:string[]=[];let line='';
 for(const word of words){const next=line?line+' '+word:word;if(line&&textUnits(next)>maxUnits){lines.push(line);line=word;}else line=next;}
 if(line)lines.push(line);return lines;
}
function linesFor(value:string,size:number,width=940){return value.split('\n').flatMap(p=>p.trim()?titleLines(p,(width/size)*.90):['']);}
function paragraph(value:string,size:number,width=940,style:Row={}){
 return box({flexDirection:'column',gap:2,...style},...linesFor(value,size,width).map((line,i)=>line?text(line,size,{lineHeight:1.48,whiteSpace:'nowrap',flexShrink:0}):box({height:size*.5})));
}
function sourceFootnote(slide:Row){
 const source=String(slide.source_label||'').replace(/\s+/g,' ').trim();
 return source?text('출처 / Source  '+(source.length>155?source.slice(0,152)+'…':source),20,{color:'#74776f',lineHeight:1.4}):null;
}
function background(photo:string|null|undefined,height=1350){return photo?h('img',{src:photo,width:1080,height,style:{position:'absolute',left:0,top:0,width:1080,height,objectFit:'cover'}}):null;}
function cover(slide:Row,index:number,total:number,assets:EditorialAssets){
 const dark=Boolean(assets.photo),title=String(slide.title||'');
 let fs=/[가-힣]/.test(title)?126:112;
 const longestWord=Math.max(1,...title.split(/\s+/).map(textUnits));fs=Math.min(fs,Math.floor(880/longestWord));
 let lines=titleLines(title,880/fs);
 while(lines.length>4&&fs>76){fs-=4;lines=titleLines(title,880/fs);}
 return box({position:'relative',width:1080,height:1350,background:dark?BRAND.ink:BRAND.paper,color:dark?BRAND.paper:BRAND.ink},
  background(assets.photo),dark?box({position:'absolute',top:0,left:0,width:1080,height:1350,background:'linear-gradient(180deg,rgba(0,0,0,.25) 0%,rgba(0,0,0,.18) 32%,rgba(0,0,0,.84) 90%)'}):null,header(index,total,dark),
  box({position:'absolute',left:64,right:64,bottom:160,flexDirection:'column',gap:30},
   text('Roundy Notes',24,{color:dark?'#e2e3de':'#72776c',letterSpacing:1}),
   box({flexDirection:'column',gap:8},...lines.map((line,i)=>text(line,fs,{fontWeight:900,lineHeight:1.12,whiteSpace:'nowrap',flexShrink:0,letterSpacing:-2,alignSelf:'flex-start',padding:i===Math.min(1,lines.length-1)?'7px 12px':'7px 0',background:i===Math.min(1,lines.length-1)?BRAND.accent:'transparent',color:i===Math.min(1,lines.length-1)?BRAND.ink:dark?BRAND.paper:BRAND.ink}))),
   paragraph(String(slide.body||''),34,850)),
  box({position:'absolute',left:64,right:64,bottom:65,justifyContent:'space-between'},text(BRAND.instagram,25),text(BRAND.website,25)));
}
function content(slide:Row,index:number,total:number,document:Row){
 const lang=document.content_language||(/[가-힣]/.test(String(slide.title))?'ko':'en');
 const ko=String(slide.body_ko||(lang==='ko'?slide.body:slide.secondary_body)||''),en=String(slide.body_en||(lang==='en'?slide.body:slide.secondary_body)||'');
 const title=String(slide.title||''),highlight=String(slide.highlight||''),numbered=/^\d+[.)]/.test(title)?title:index+'. '+title;
 const options=Array.isArray(slide.options)?slide.options.filter(Boolean).slice(0,3):[];
 let bodySize=46,enSize=34,titleSize=/[가-힣]/.test(title)?60:56,highlightSize=44;
 const estimate=()=>linesFor(numbered,titleSize,900).length*titleSize*1.3+linesFor(ko,bodySize).length*bodySize*1.5+linesFor(en,enSize).length*enSize*1.5+(highlight?linesFor(highlight,highlightSize).length*highlightSize*1.4:0)+options.length*42+250;
 while(estimate()>930&&bodySize>34){bodySize-=2;enSize-=1;titleSize-=1;highlightSize-=1;}
 const titleRows=titleLines(numbered,870/titleSize);
 return box({position:'relative',width:1080,height:1350,background:BRAND.paper,color:BRAND.ink},header(index,total),
  box({position:'absolute',left:64,right:64,top:210,height:930,justifyContent:'center',flexDirection:'column',gap:34},
   box({flexDirection:'column',alignSelf:'flex-start',background:BRAND.accent,padding:'14px 20px',gap:5},...titleRows.map(line=>text(line,titleSize,{fontWeight:900,whiteSpace:'nowrap',lineHeight:1.2,letterSpacing:-1}))),
   box({flexDirection:'column',gap:15},text('국문본문',22,{color:'#84877e',fontWeight:700}),paragraph(ko,bodySize)),
   options.length?box({flexDirection:'column',gap:12},...options.map((option:string,i:number)=>paragraph(String.fromCharCode(65+i)+'. '+option,30,940,{fontWeight:700}))):null,
   highlight?paragraph(highlight,highlightSize,940,{fontWeight:900,padding:'10px 0',background:'linear-gradient(180deg,transparent 70%,#ffe2df 70%)'}):null,
   en?box({flexDirection:'column',gap:15},text('영어본문',22,{color:'#84877e',fontWeight:700}),paragraph(en,enSize)):null),
  box({position:'absolute',left:64,right:64,bottom:48,flexDirection:'column',gap:15},sourceFootnote(slide),slide.footer_note?text(slide.footer_note,19,{color:BRAND.muted}):null,
   box({justifyContent:'space-between'},text(BRAND.instagram,20,{color:BRAND.muted}),text(BRAND.website,20,{color:BRAND.muted}))));
}
function outro(index:number,total:number,document:Row,assets:EditorialAssets){
 const ko=document.content_language!=='en';
 return box({position:'relative',width:1080,height:1350,background:BRAND.paper,color:BRAND.ink},
  background(assets.photo,590),!assets.photo?box({position:'absolute',top:0,left:0,width:1080,height:590,background:BRAND.ink,alignItems:'center',justifyContent:'center'},officialRoundyLogo(true,98)):box({position:'absolute',top:0,left:0,width:1080,height:210,background:'linear-gradient(180deg,rgba(0,0,0,.5),transparent)'}),header(index,total,true),
  box({position:'absolute',left:64,right:64,top:642,flexDirection:'column',gap:24},
   box({flexDirection:'column',gap:8},text(ko?'서울에서 만나는':'Meet in Seoul.',78,{fontWeight:900,lineHeight:1.13,letterSpacing:-2}),text(ko?'1:1 밍글':'One person at a time.',ko?86:68,{fontWeight:900,lineHeight:1.13,letterSpacing:-2,color:BRAND.accent})),
   paragraph(ko?'한 사람씩 만나고, 대화해보세요.':'Meet face to face, one conversation at a time.',33),
   box({gap:18,justifyContent:'space-between',padding:'16px 0'},...['서울 밍글','1:1 로테이션','직접 만나서'].map((s,i)=>text(ko?s:['Seoul','1:1 rotations','In person'][i],27,{fontWeight:700}))),
   box({height:1,background:'#dedfd7',width:'100%'}),
   box({justifyContent:'space-between',alignItems:'center',gap:22},box({flexDirection:'column',gap:8},text('Find Roundy',29,{fontWeight:900}),text('Instagram  '+BRAND.instagram,26),text('Website  '+BRAND.website,26)),text(ko?'Roundy 둘러보기  ›':'Explore Roundy  ›',28,{fontWeight:700,background:BRAND.accent,padding:'22px 28px',borderRadius:999}))),
  document.slides?.find((s:Row)=>s.role==='cta')?.footer_note?text(document.slides.find((s:Row)=>s.role==='cta').footer_note,18,{position:'absolute',left:64,right:64,bottom:30,color:BRAND.muted}):null);
}
export function compactEditorialTree(slide:Row,index:number,total:number,document:Row,assets:EditorialAssets={}){
 const tree=slide.role==='cover'?cover(slide,index,total,assets):slide.role==='cta'?outro(index,total,document,assets):content(slide,index,total,document);
 return box({width:1080,height:1350,fontFamily:assets.fonts?.length?'Roundy Gothic, sans-serif':'sans-serif'},tree);
}
export function renderCompactEditorial(slide:Row,index:number,total:number,document:Row,assets:EditorialAssets={}){
 return new ImageResponse(compactEditorialTree(slide,index,total,document,assets),{width:1080,height:1350,...(assets.fonts?.length?{fonts:assets.fonts}:{}),headers:{'x-roundy-design-preset':EDITORIAL_PRESET}});
}
