'use client';

const PAYPLE_HOST=(process.env.NEXT_PUBLIC_PAYPLE_HOST||'https://cpay.payple.kr').replace(/\/+$/,'');
const PAYPLE_SDK_SRC=PAYPLE_HOST+'/js/v1/payment.js';
const JQUERY_SRC='https://code.jquery.com/jquery-3.6.0.min.js';

declare global {
 interface Window {
  $?:unknown;
  jQuery?:unknown;
  PaypleCpayAuthCheck?:(params:Record<string,unknown>)=>void;
  PaypleCpayCallback?:Array<(response:Record<string,unknown>)=>boolean>;
 }
}

function loadScript(src:string):Promise<void>{
 return new Promise((resolve,reject)=>{
  const existing=document.querySelector('script[src="'+src+'"]') as HTMLScriptElement|null;
  if(existing){
   if(existing.dataset.loaded==='true')return resolve();
   existing.addEventListener('load',()=>resolve(),{once:true});
   existing.addEventListener('error',()=>reject(new Error('Payment script failed to load.')),{once:true});
   return;
  }
  const script=document.createElement('script');
  script.src=src;
  script.async=true;
  script.addEventListener('load',()=>{script.dataset.loaded='true';resolve();},{once:true});
  script.addEventListener('error',()=>reject(new Error('Payment script failed to load.')),{once:true});
  document.body.appendChild(script);
 });
}

export async function ensurePayple():Promise<void>{
 if(!window.$&&!window.jQuery)await loadScript(JQUERY_SRC);
 if(typeof window.PaypleCpayAuthCheck!=='function')await loadScript(PAYPLE_SDK_SRC);
 if(typeof window.PaypleCpayAuthCheck!=='function')throw new Error('Payment service is still loading. Please try again.');
}

export async function openPayple(params:Record<string,unknown>):Promise<Record<string,unknown>>{
 await ensurePayple();
 return await new Promise((resolve,reject)=>{
  const callbacks=window.PaypleCpayCallback??[];
  window.PaypleCpayCallback=callbacks;
  const callback=(response:Record<string,unknown>)=>{
   window.PaypleCpayCallback=(window.PaypleCpayCallback??[]).filter(item=>item!==callback);
   resolve(response);
   return true;
  };
  callbacks.push(callback);
  try{
   window.PaypleCpayAuthCheck!(params);
  }catch(error){
   window.PaypleCpayCallback=callbacks.filter(item=>item!==callback);
   reject(error instanceof Error?error:new Error('Could not open the payment window.'));
  }
 });
}
