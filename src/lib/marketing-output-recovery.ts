// Pure recovery planning. No network, storage writes, paid generation or publishing.
import {isCompactDocument, type PresentationRow as Row} from './marketing-presentation';
import {postType, prepareContent} from './marketing-content-policy';

export const LEGACY_CTA_FAILURE='캡션 또는 CTA가 비어 있거나 너무 깁니다.';
export const SAVED_CTA_RECOVERY_VERSION='cta-contract-v1';

export function canRecoverSavedCta(job:Row|null|undefined):boolean {
 if(!job||job.status!=='failed'||job.automatic||job.error_code!=='GENERATION_FAILED')return false;
 if(!['copy','research'].includes(job.operation))return false;
 const input=job.request_payload, snapshot=job.result_snapshot, document=snapshot?.content_document;
 if(!input||input.visual_mode!=='cards'||input.mode==='image'||input.render_only||input.content_mode==='live_event')return false;
 if(!snapshot||!document||!isCompactDocument(document)||!Array.isArray(document.slides)||!document.slides.length)return false;
 if(document.post_type==='seoul_dating'&&(!document.seoul||!Array.isArray(document.seoul.venues)||document.seoul.venues.length!==3||!Array.isArray(snapshot.research_sources)||snapshot.research_sources.length===0))return false;
 const issues=snapshot.quality_report?.issues;
 if(!Array.isArray(issues)||issues.length!==1||issues[0]!==LEGACY_CTA_FAILURE||snapshot.quality_report?.status!=='rejected')return false;
 if(typeof job.error_message!=='string'||!job.error_message.includes(LEGACY_CTA_FAILURE))return false;
 const cta=typeof document.cta==='string'?document.cta.trim():'';
 return cta.length===0||cta.length>70;
}

export function prepareSavedCtaRecovery(job:Row):Row {
 if(!canRecoverSavedCta(job))throw new Error('SAVED_RESULT_RECOVERY_UNAVAILABLE');
 const input=job.request_payload, snapshot=job.result_snapshot, language=input.language==='en'?'en':'ko', type=postType(input);
 if(snapshot.content_document.post_type!==type||snapshot.content_language!==language||snapshot.draft_id!==job.draft_id)throw new Error('SAVED_RESULT_RECOVERY_MISMATCH');
 // All source, language, length and quality checks run again. Only the server-owned CTA is normalized.
 const prepared=prepareContent(snapshot.content_document,type,language,snapshot.research_sources||[]);
 if(prepared.report.status!=='passed')throw new Error('저장된 결과에 추가 검토가 필요합니다: '+prepared.report.issues.join(' '));
 return {
  caption:prepared.caption,cta:prepared.cta,content_document:prepared.document,quality_report:prepared.report,
  carousel_slides:prepared.slides,research_sources:prepared.sources,research_status:snapshot.research_status,
  content_language:language,draft_kind:snapshot.draft_kind,growth_topic_type:snapshot.growth_topic_type,
  content_mode:snapshot.content_mode,content_pillar:snapshot.content_pillar,generation_reason:snapshot.generation_reason,
  event_id:null,destination_url:'https://roundy.team',images:[],
 };
}

// A failed local render can retry the same saved source, never silently switch to paid generation.
export function savedCtaRecoverySource(job:Row|null|undefined):string|null {
 if(canRecoverSavedCta(job))return job!.id;
 if(job?.status==='failed'&&!job.automatic&&job.operation==='render'&&job.error_code==='GENERATION_FAILED'&&typeof job.request_payload?.saved_recovery_of==='string'&&/^[0-9a-f-]{36}$/i.test(job.request_payload.saved_recovery_of))return job.request_payload.saved_recovery_of;
 return null;
}
export const canOfferSavedCtaRecovery=(job:Row|null|undefined)=>Boolean(savedCtaRecoverySource(job));
