// Admin direction is kept separately from model-authored plans. Neither is evidence.
type Row=Record<string,any>;
export const EDITORIAL_BRIEF_VERSION=1;
export function translationPendingAfterEdit(doc:Row,index:number,primaryChanged:boolean,newSecondary:unknown,oldSecondary:string):number[]{
 const pending=new Set<number>(Array.isArray(doc.translation_pending_indices)?doc.translation_pending_indices:[]);
 const supplied=typeof newSecondary==='string'&&newSecondary.trim().length>0;
 if(primaryChanged&&(!supplied||newSecondary.trim()===oldSecondary.trim()))pending.add(index);
 else if(supplied&&newSecondary.trim()!==oldSecondary.trim())pending.delete(index);
 return [...pending].sort((a,b)=>a-b);
}
