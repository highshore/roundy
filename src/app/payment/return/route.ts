import { NextRequest, NextResponse } from 'next/server';

const validOrder=(value:string)=>/^RNDY-A-\d{14}-[A-F0-9]{10}$/.test(value);

function resultRedirect(req:NextRequest,order:string){
 const url=new URL('/payment/result',req.nextUrl.origin);
 if(validOrder(order))url.searchParams.set('order',order);
 return NextResponse.redirect(url,303);
}

export function GET(req:NextRequest){return resultRedirect(req,req.nextUrl.searchParams.get('order')??'');}

export async function POST(req:NextRequest){
 const fromQuery=req.nextUrl.searchParams.get('order')??'';
 const form=await req.formData().catch(()=>null);
 const fromForm=typeof form?.get('order')==='string'?String(form.get('order')):typeof form?.get('var1')==='string'?String(form.get('var1')):'';
 return resultRedirect(req,fromQuery||fromForm);
}
