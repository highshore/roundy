import {createHash} from 'node:crypto';
import type {Evidence} from './marketing-content-policy';

export type VerifiedBook = {
 title:string;
 author:string;
 url:string;
 publisher:string;
 evidence:string;
};

export const VERIFIED_MARKETING_BOOKS:VerifiedBook[]=[
 {
  title:"You're Not Listening",
  author:"Kate Murphy",
  url:"https://celadonbooks.com/book/youre-not-listening/",
  publisher:"Celadon Books",
  evidence:"You're Not Listening by Kate Murphy examines what listening means in everyday life and why people often feel unheard. The publisher describes the book as an exploration of listening habits and the difficulty many people have identifying someone who truly listens."
 },
 {
  title:"Supercommunicators",
  author:"Charles Duhigg",
  url:"https://www.penguinrandomhouse.com/books/677212/supercommunicators-by-charles-duhigg/",
  publisher:"Random House",
  evidence:"Supercommunicators by Charles Duhigg explores how conversations work. The publisher describes practical, emotional, and social layers of conversation and the value of recognizing and matching the kind of conversation taking place."
 },
 {
  title:"How to Know a Person",
  author:"David Brooks",
  url:"https://www.penguinrandomhouse.com/books/652822/how-to-know-a-person-by-david-brooks/",
  publisher:"Random House",
  evidence:"How to Know a Person by David Brooks is about understanding another person through attention, curiosity, listening, and conversation. The publisher describes the goal as helping another person feel seen, heard, and understood."
 },
 {
  title:"The Art of Gathering",
  author:"Priya Parker",
  url:"https://www.priyaparker.com/the-art-of-gathering",
  publisher:"Priya Parker",
  evidence:"The Art of Gathering by Priya Parker presents a human-centered approach to gatherings. The author emphasizes having a clear purpose, intentional structure, and thoughtful hosting so people can participate and connect more effectively."
 }
];

function normalized(value:string){return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ');}
export function selectVerifiedMarketingBook(instruction:string,seed:string){
 const query=normalized(instruction||'');
 if(query){
  const direct=VERIFIED_MARKETING_BOOKS.find(book=>{
   const title=normalized(book.title),author=normalized(book.author);
   return title.split(' ').filter(Boolean).some(token=>token.length>4&&query.includes(token))||author.split(' ').filter(Boolean).some(token=>token.length>3&&query.includes(token));
  });
  if(direct)return direct;
 }
 const digest=createHash('sha256').update(seed).digest();
 return VERIFIED_MARKETING_BOOKS[digest[0]%VERIFIED_MARKETING_BOOKS.length];
}
export function verifiedBookEvidence(book:VerifiedBook):Evidence[]{
 return [{id:'S1',url:book.url,title:book.title+' — '+book.author+' | '+book.publisher,evidence:book.title+' by '+book.author+'. '+book.evidence}];
}
