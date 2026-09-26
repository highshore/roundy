'use client';

import { FormEvent,useEffect,useRef,useState } from 'react';
import { Camera,Keyboard,X } from 'lucide-react';
import { tr,type Locale } from '@/lib/locale';

type DetectedBarcode={rawValue:string};
type BarcodeDetectorInstance={detect:(source:HTMLVideoElement)=>Promise<DetectedBarcode[]>};
type BarcodeDetectorConstructor=new (options:{formats:string[]})=>BarcodeDetectorInstance;

function tokenFromValue(value:string){
 const trimmed=value.trim();
 const direct=trimmed.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
 if(direct)return direct[0];
 try{
  const url=new URL(trimmed);
  const match=url.pathname.match(/\/check-in\/([0-9a-f-]{36})(?:\/)?$/i);
  return match?.[1]??null;
 }catch{return null;}
}

export function AdminQrScanner({locale,onScan,onClose}:{locale:Locale;onScan:(token:string)=>Promise<void>;onClose:()=>void}){
 const videoRef=useRef<HTMLVideoElement>(null);
 const [cameraSupported,setCameraSupported]=useState<boolean|null>(null);
 const [cameraError,setCameraError]=useState('');
 const [manual,setManual]=useState('');
 const [scanning,setScanning]=useState(false);
 const scanningRef=useRef(false);

 useEffect(()=>{
  let cancelled=false;
  let stream:MediaStream|null=null;
  let raf=0;
  const Detector=(window as unknown as {BarcodeDetector?:BarcodeDetectorConstructor}).BarcodeDetector;
  if(!Detector){setCameraSupported(false);return;}

  setCameraSupported(true);
  void navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false}).then(async media=>{
   if(cancelled){media.getTracks().forEach(track=>track.stop());return;}
   stream=media;
   const video=videoRef.current;
   if(!video)return;
   video.srcObject=media;
   await video.play();
   const detector=new Detector({formats:['qr_code']});

   const tick=async()=>{
    if(cancelled)return;
    try{
     if(video.readyState>=2&&!scanningRef.current){
      const codes=await detector.detect(video);
      const token=codes.map(code=>tokenFromValue(code.rawValue)).find(Boolean);
      if(token){
       scanningRef.current=true;
       setScanning(true);
       await onScan(token);
       return;
      }
     }
    }catch{/* Keep scanning; camera frames can transiently fail. */}
    raf=requestAnimationFrame(()=>void tick());
   };
   void tick();
  }).catch(e=>{setCameraSupported(false);setCameraError(e instanceof Error?e.message:'Camera unavailable.');});

  return()=>{cancelled=true;cancelAnimationFrame(raf);stream?.getTracks().forEach(track=>track.stop());};
 },[onScan]);

 async function submit(e:FormEvent){
  e.preventDefault();
  const token=tokenFromValue(manual);
  if(!token){setCameraError(tr(locale,'Enter a valid Roundy check-in link or code.','올바른 Roundy 체크인 링크 또는 코드를 입력해 주세요.'));return;}
  setScanning(true);
  await onScan(token);
 }

 return <div className="qr-scanner">
  <div className="qr-scanner-head"><div><p className="eyebrow">{tr(locale,'QR CHECK-IN','QR 체크인')}</p><h3>{tr(locale,'Scan attendee QR','참가자 QR 스캔')}</h3></div><button type="button" className="icon-button" onClick={onClose} aria-label={tr(locale,'Close scanner','스캐너 닫기')}><X size={20}/></button></div>
  {cameraSupported!==false?<div className="qr-camera"><video ref={videoRef} playsInline muted/><span className="qr-camera-frame"/><p><Camera size={16}/>{scanning?tr(locale,'Checking in…','체크인 중…'):tr(locale,'Point the camera at the attendee QR.','참가자 QR을 카메라 중앙에 맞춰 주세요.')}</p></div>:<div className="qr-camera-fallback"><Camera size={28}/><b>{tr(locale,'Use your phone Camera','휴대폰 카메라를 사용하세요')}</b><p>{tr(locale,'On iPhone, scan the Roundy QR with the Camera app and tap the Roundy link. It will check the attendee in after admin authentication.','iPhone에서는 카메라 앱으로 Roundy QR을 스캔한 뒤 Roundy 링크를 누르세요. 관리자 인증 후 참가자가 체크인됩니다.')}</p></div>}
  <form className="qr-manual-entry" onSubmit={submit}><label><Keyboard size={16}/><span>{tr(locale,'Paste link or code','링크 또는 코드 붙여넣기')}</span></label><div><input value={manual} onChange={e=>setManual(e.target.value)} placeholder="https://roundy.team/check-in/…"/><button type="submit" disabled={scanning}>{tr(locale,'Check in','체크인')}</button></div></form>
  {cameraError&&<p role="alert" className="admin-error">{cameraError}</p>}
 </div>;
}
