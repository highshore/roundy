'use client';

import { createContext,useCallback,useContext,useEffect,useRef,useState } from 'react';
import { CheckCircle2,Info,X,XCircle } from 'lucide-react';

type ToastKind='success'|'error'|'info';
type Toast={id:number;message:string;kind:ToastKind;duration:number};
type ToastContextValue={showToast:(message:string,kind?:ToastKind,duration?:number)=>void;dismissToast:()=>void};

const ToastContext=createContext<ToastContextValue|null>(null);

export function ToastProvider({children}:{children:React.ReactNode}){
 const [toast,setToast]=useState<Toast|null>(null);
 const idRef=useRef(0);

 const dismissToast=useCallback(()=>setToast(null),[]);
 const showToast=useCallback((message:string,kind:ToastKind='info',duration=2800)=>{
  if(!message)return;
  idRef.current+=1;
  setToast({id:idRef.current,message,kind,duration});
 },[]);

 useEffect(()=>{
  if(!toast)return;
  const timer=window.setTimeout(()=>setToast(current=>current?.id===toast.id?null:current),toast.duration);
  return()=>window.clearTimeout(timer);
 },[toast]);

 return <ToastContext.Provider value={{showToast,dismissToast}}>
  {children}
  <div className="global-toast-viewport" aria-live="polite" aria-atomic="true">
   {toast&&<div className={'global-toast '+toast.kind} role={toast.kind==='error'?'alert':'status'}>
    <span className="global-toast-icon">{toast.kind==='success'?<CheckCircle2 size={19}/>:toast.kind==='error'?<XCircle size={19}/>:<Info size={19}/>}</span>
    <span className="global-toast-copy">{toast.message}</span>
    <button type="button" aria-label="Dismiss notification" onClick={dismissToast}><X size={18}/></button>
    <span className="global-toast-progress" style={{animationDuration:toast.duration+'ms'}}/>
   </div>}
  </div>
 </ToastContext.Provider>;
}

export function useToast(){
 const value=useContext(ToastContext);
 if(!value)throw new Error('useToast must be used inside ToastProvider');
 return value;
}
