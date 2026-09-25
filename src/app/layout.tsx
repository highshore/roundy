import type { Metadata, Viewport } from 'next';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/700.css';
import './globals.css';
export const metadata: Metadata = {
 metadataBase:new URL('https://roundy.team'),
 title:'Roundy | Meet in Real Life',
 description:'Roundy | Meet in Real Life',
 icons:{icon:'/icon.svg'},
 robots:{index:false,follow:false},
 openGraph:{title:'Roundy | Meet in Real Life',description:'Roundy | Meet in Real Life',url:'https://roundy.team',siteName:'Roundy',type:'website',images:[{url:'/opengraph-image',width:1200,height:630,alt:'Roundy'}]},
 twitter:{card:'summary_large_image',title:'Roundy | Meet in Real Life',description:'Roundy | Meet in Real Life',images:['/opengraph-image']}
};
export const viewport: Viewport = {width:'device-width',initialScale:1,themeColor:'#FFFEFA'};
export default function Layout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>;}
