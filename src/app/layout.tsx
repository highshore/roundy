import type { Metadata, Viewport } from 'next';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/700.css';
import './globals.css';
export const metadata: Metadata = {title:'ROUNDY — Meet in real life',description:'Curated English-speaking evenings in Seoul. Discover events online. Meet people in real life.',robots:{index:false,follow:false}};
export const viewport: Viewport = {width:'device-width',initialScale:1,themeColor:'#FFFEFA'};
export default function Layout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>;}
