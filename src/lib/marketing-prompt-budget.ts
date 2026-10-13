// Deterministic, no-cost preflight for the paid editorial writing request.
// Keep strict schemas and source-linked facts intact; shrink only optional
// style examples and lengthy source excerpts before enforcing the hard cap.
type Row=Record<string,any>;
export const EDITORIAL_REQUEST_MAX_BYTES=48_000;

export function editorialRequestBytes(instructions:string,schema:Row,payload:Row):number {
 return Buffer.byteLength(instructions,'utf8')+
  Buffer.byteLength(JSON.stringify(schema),'utf8')+
  Buffer.byteLength(JSON.stringify(payload),'utf8');
}

export function fitEditorialWritingRequest(instructions:string,schema:Row,originalPayload:Row):Row {
 const payload:Row={...originalPayload};
 const oversized=()=>editorialRequestBytes(instructions,schema,payload)>EDITORIAL_REQUEST_MAX_BYTES;
 // Human-approved examples improve voice, but they are never required facts.
 if(oversized())payload.human_style_references=[];
 // Preserve source IDs, exact URLs, titles and the verified Fact Pack. Only
 // shorten redundant, model-readable evidence excerpts when space is tight.
 const capEvidence=(maxCharacters:number)=>{
  if(!Array.isArray(payload.evidence))return;
  payload.evidence=payload.evidence.map((source:Row)=>{
   const excerpt=typeof source?.evidence==='string'?source.evidence:'';
   return {...source,evidence:Array.from(excerpt).slice(0,maxCharacters).join('')};
  });
 };
 if(oversized())capEvidence(1200);
 if(oversized())capEvidence(600);
 // The source-linked excerpts remain intact; shrink the duplicated narrative brief only if required.
 if(oversized()&&typeof payload.research_notes==='string')payload.research_notes=payload.research_notes.slice(0,3000);
 if(oversized()&&typeof payload.research_notes==='string')payload.research_notes=payload.research_notes.slice(0,1200);
 // On a bounded rewrite the earlier editorial evaluations are not facts and
 // need not be sent back; keep original slides, sources and other fields.
 if(oversized()&&payload.original_document&&typeof payload.original_document==='object'&&!Array.isArray(payload.original_document)){
  const {editorial_critic_history,editorial_topic_reviews,...core}=payload.original_document as Row;
  payload.original_document=core;
 }
 if(oversized())throw new Error('PROMPT_SIZE_LIMIT');
 return payload;
}
