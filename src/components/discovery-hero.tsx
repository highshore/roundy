'use client';

import { Heading } from '@/components/heading';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { tr, type Locale } from '@/lib/locale';
import { DiscoveryVideo } from './discovery-video';

export function DiscoveryHero({ locale }: { locale: Locale }) {
 const [active, setActive] = useState(0);
 const [drag, setDrag] = useState(0);
 const [exit, setExit] = useState(0);
 const gesture = useRef<{id:number;x:number;y:number;dx:number;horizontal:boolean} | null>(null);
 const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
 const suppressClick = useRef(false);
 useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

 const cards = [
  {title:tr(locale,'Skip the Swipe\nMeet in Real Life','직접 만나야\n알 수 있는 사이'),body:tr(locale,'Meet 1:1, get to know each other, and reconnect when the feeling is mutual','대면으로 만나고 매칭되는 국제 로테이션 소개팅'),image:null,href:'/events',action:tr(locale,"See this week's events",'이번 주 모임 보기')},
  {title:tr(locale,"No Luck on Dating Apps?\nIt’s NOT on You.",'소개팅 앱에서 잘 안 풀려도,\n당신 탓이 아니에요.'),body:tr(locale,'Skip endless swiping. Meet profile-reviewed people face to face.','끝없는 스와이프 대신, 프로필 검토를 마친 사람들과 직접 만나요.'),image:'/images/discovery-offline.webp',href:'/events',action:tr(locale,'Explore events','모임 둘러보기')},
  {title:tr(locale,'A Safer Community\nStarts With All of Us.','안심할 수 있는 만남,\n모두의 인증에서 시작돼요.'),body:tr(locale,'Everyone completes the same verification before joining. A shared standard for safer, more comfortable connections.','모두가 같은 인증 과정을 거쳐 참여해요. 서로 안심하고 만날 수 있도록요.'),image:'/images/discovery-verification.webp',href:'/how-it-works',action:tr(locale,'How verification works','참여 과정 알아보기')}
 ];

 function move(direction:number, target?:number) {
  if (timer.current) return;
  const next = target ?? (active + direction + cards.length) % cards.length;
  if (next === active) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { setActive(next); setDrag(0); return; }
  setExit(direction);
  timer.current = setTimeout(() => {
   setActive(next); setDrag(0); setExit(0); timer.current = null;
  }, 240);
 }
 function start(event:PointerEvent<HTMLDivElement>) {
  if (!event.isPrimary || event.button !== 0 || timer.current) return;
  suppressClick.current = false;
  gesture.current = {id:event.pointerId,x:event.clientX,y:event.clientY,dx:0,horizontal:false};
 }
 function track(event:PointerEvent<HTMLDivElement>) {
  const g = gesture.current;
  if (!g || g.id !== event.pointerId) return;
  const dx = event.clientX-g.x, dy = event.clientY-g.y;
  if (!g.horizontal) {
   if (Math.abs(dy)>10 && Math.abs(dy)>Math.abs(dx)) { gesture.current=null; return; }
   if (Math.abs(dx)<10) return;
   g.horizontal=true;
   event.currentTarget.setPointerCapture(event.pointerId);
  }
  g.dx=dx; suppressClick.current=true; setDrag(dx);
 }
 function finish(event:PointerEvent<HTMLDivElement>,cancelled=false) {
  const g=gesture.current;
  if (!g || g.id !== event.pointerId) return;
  gesture.current=null;
  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  if (!cancelled && Math.abs(g.dx)>Math.min(65,event.currentTarget.clientWidth*.18)) move(g.dx<0?1:-1);
  else setDrag(0);
 }

 return <div className="discovery-carousel" role="region" aria-roledescription="carousel" aria-label={tr(locale,'Discover Roundy','라운디 소개')}
  onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();move(event.key==='ArrowLeft'?-1:1);}}}>
  <div className="discovery-deck" onPointerDown={start} onPointerMove={track} onPointerUp={event=>finish(event)} onPointerCancel={event=>finish(event,true)}
   onClickCapture={event=>{if(suppressClick.current){event.preventDefault();event.stopPropagation();suppressClick.current=false;}}}>
   {cards.map((card,index)=>{
    const depth=(index-active+cards.length)%cards.length;
    const front=depth===0;
    const transform=front ? `translateX(${exit ? -exit*115+'%' : drag+'px'}) rotate(${exit ? -exit*12 : drag/30}deg)` : `translateY(${depth*10}px) scale(${1-depth*.045})`;
    return <article key={index} className={'discovery-hero-card'+(front?' is-front':'')+(front&&drag&&!exit?' is-dragging':'')}
     role="group" aria-roledescription="slide" aria-label={`${index+1} / ${cards.length}`} aria-hidden={!front} inert={!front}
     style={{zIndex:cards.length-depth,transform,opacity:front&&exit?0:1}}>
     {card.image?<Image src={card.image} alt="" fill sizes="(max-width: 430px) calc(100vw - 48px), 382px" draggable={false}/>:<DiscoveryVideo active={front}/>}
     <span className="discovery-hero-label">{tr(locale,'Roundy | Seoul','Roundy | 서울')}</span>
     <div className="discovery-hero-overlay">
      {index===0?<Heading level={1}>{card.title}</Heading>:<Heading level={2}>{card.title}</Heading>}
      <div className="discovery-hero-bottom"><p>{card.body}</p><Link href={card.href} className="discovery-hero-cta" aria-label={card.action} draggable={false}><ChevronRight size={24} aria-hidden="true"/></Link></div>
     </div>
    </article>;
   })}
  </div>
  <div className="discovery-carousel-nav">
   <button type="button" onClick={()=>move(-1)} aria-label={tr(locale,'Previous card','이전 카드')}><ChevronLeft size={18}/></button>
   <div className="discovery-carousel-dots">{cards.map((_,index)=><button key={index} type="button" aria-label={tr(locale,`Show card ${index+1}`,`${index+1}번 카드 보기`)} aria-current={index===active?'true':undefined} onClick={()=>move(index>active?1:-1,index)}><span/></button>)}</div>
   <button type="button" onClick={()=>move(1)} aria-label={tr(locale,'Next card','다음 카드')}><ChevronRight size={18}/></button>
  </div>
  <span className="sr-only" aria-live="polite" aria-atomic="true">{active+1} / {cards.length}: {cards[active].title}</span>
 </div>;
}
