import {createHash} from 'node:crypto';
type Row=Record<string,any>;
export function copyFingerprint(draft:Row):string {
 const doc=draft.content_document||{};
 return createHash('sha256').update(JSON.stringify({language:draft.content_language,
  slides:draft.carousel_slides,visible_caption:String(draft.caption||'').replace(/\n\n(?:Photos:|Photo sources \/ 사진 출처:|AI-generated editorial illustration:)[\s\S]*$/,''),caption:doc.caption,caption_ko:doc.caption_ko,caption_en:doc.caption_en,
  sources:draft.research_sources})).digest('hex');
}
export function hasHumanCopyApproval(draft:Row):boolean {
 return draft.content_document?.editorial_human_approval?.fingerprint===copyFingerprint(draft);
}
export async function editorialReferenceSamples(db:any,language:string):Promise<Row[]> {
 // Missing optional history never prevents generation. No write or paid API call.
 try{
  const result=await db.from('instagram_post_drafts').select('content_document,content_language,updated_at')
   .eq('content_language',language).order('updated_at',{ascending:false}).limit(60);
  if(result.error)return [];
  const seen=new Set<string>();let budget=0;
  return (result.data||[]).flatMap((row:Row)=>row.content_document?.editorial_feedback||[])
   .filter((item:Row)=>{if(!item.fingerprint||seen.has(item.fingerprint))return false;seen.add(item.fingerprint);return true;})
   .sort((a:Row,b:Row)=>Date.parse(b.at||'')-Date.parse(a.at||'')).slice(0,6).flatMap((item:Row)=>{
    const sample={decision:item.decision,note:String(item.note||'').slice(0,350),sample:String(item.sample||'').slice(0,900)};
    const bytes=Buffer.byteLength(JSON.stringify(sample),'utf8');if(budget+bytes>3600)return [];budget+=bytes;return [sample];
   });
 }catch{return [];}
}
