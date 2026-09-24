'use client';
import { useState } from 'react';
import Image from 'next/image';
import { FileText } from 'lucide-react';
import { tr,type Locale } from '@/lib/locale';
import { uploadFile } from '@/lib/uploads';
import { LoadingScreen } from './loading-screen';
export function VerificationFields({locale}:{locale:Locale}) {
 const [method,setMethod]=useState('instagram');const [document,setDocument]=useState('');const [name,setName]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 return <fieldset className="verification-options"><legend>{tr(locale,'Choose just one verification method','아래 세 가지 중 하나만 선택하세요')}</legend><div className="verification-methods">{[['instagram','Instagram','인스타그램'],['linkedin','LinkedIn profile','링크드인 프로필'],['document','Work or student proof','재직 또는 재학 증빙']].map(([v,en,ko])=><label key={v} className={method===v?'selected':''}><input type="radio" name="verification_method" value={v} checked={method===v} onChange={()=>{setMethod(v);setError('');}}/><span>{v==='document'?<FileText size={20} aria-hidden="true"/>:<Image src={`/images/${v}.svg`} width={20} height={20} alt=""/>}{tr(locale,en,ko)}</span></label>)}</div>
 {method==='instagram'&&<label className="field"><span>{tr(locale,'Public Instagram handle','공개 인스타그램 아이디')}</span><input name="instagram" required pattern="@?[A-Za-z0-9_.]{1,30}" maxLength={31} placeholder="@kimsookyum" autoCapitalize="none"/><small>{tr(locale,'Enter your handle only. Your account must be public for review.','아이디만 입력하세요. 검토할 수 있도록 공개 계정이어야 해요.')}</small></label>}
 {method==='linkedin'&&<label className="field"><span>{tr(locale,'LinkedIn profile','링크드인 프로필')}</span><input name="linkedin" type="url" required placeholder="https://www.linkedin.com/in/yourname"/></label>}
 {method==='document'&&<><label className="document-upload"><strong>{tr(locale,'Upload work or student proof','재직 또는 재학 증빙 업로드')}</strong><span>{tr(locale,'Only you and authorized reviewers can open this file. Hide any ID numbers.','본인과 담당 관리자만 열람할 수 있어요. 주민등록번호 등은 가려 주세요.')}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy} required={!document} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;setBusy(true);setError('');try{setDocument(await uploadFile(f,'wis-verification-documents'));setName(f.name);}catch(e){setError(e instanceof Error?e.message:'Upload failed');}finally{setBusy(false);}}}/><small>PDF, JPEG, PNG, WebP · {tr(locale,'Max 5 MB','최대 5 MB')}</small>{name&&<b>✓ {name}</b>}</label><input type="hidden" name="document_path" value={document}/></>}
 <p className="note">{tr(locale,'Verification must be approved before you attend. Your verification details are never shared with attendees.','참석 전 인증이 완료되어야 해요. 인증 정보는 다른 참가자에게 공개되지 않아요.')}</p>{error&&<p role="alert" className="admin-error">{error}</p>}{busy&&<LoadingScreen/>}</fieldset>;
}
