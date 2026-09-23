'use client';
export default function ErrorPage({reset}:{reset:()=>void}) {return <main className="content narrow"><h1>Something went wrong.</h1><p>Please try again. Your saved choices won’t be changed.</p><button className="button" onClick={reset}>Try again</button></main>;}
