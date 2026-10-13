type SavedRequest = Record<string, unknown>;

// Audit snapshots explicitly persist unavailable options as null. They are not
// API request bodies: the strict request validator expects omitted options.
const OPTIONAL_NULL_AS_ABSENT = [
  'editorial_lane', 'story_card_count', 'instruction', 'answer_first_enabled',
  'brand_outro_enabled', 'language', 'visual_source', 'topic_type',
  'campaign_pattern', 'campaign_tone', 'launch_date',
  'event_id', 'event_campaign_stage', 'event_campaign_pattern', 'selected_topic_key',
] as const;

/** Reconstruct a request from an already-authorized, server-loaded job snapshot.
 * This does not validate or authorize a retry; all existing route and generation
 * checks still run. Never mutate the original job or strip non-null bad values.
 */
export function restoreSavedGenerationInput(value: unknown): SavedRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('RETRY_PAYLOAD_UNAVAILABLE');
  }
  const input: SavedRequest = {...value as SavedRequest};
  for (const key of OPTIONAL_NULL_AS_ABSENT) {
    if (input[key] === null) delete input[key];
  }

  // Persisted ai_image_slot is the resolved result, not always a request option.
  // Image-only retries read the existing draft's photo policy in runGeneration;
  // uploads / copy-only / photographic outputs also cannot request an AI slot.
  // For eligible card creation, preserve null (explicit all-real) AND zero (cover).
  if (input.mode === 'image' || input.visual_mode === 'photo' ||
      input.visual_source === 'uploaded' || input.visual_source === 'none') {
    delete input.ai_image_slot;
  }
  return input;
}

/** Explicit manual recovery only. No successful copy, automatic job or uncertain
 * external outcome may use the source-review exception. This grants no approval. */
export function canRetryGenerationJob(value:unknown):boolean {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const job=value as Record<string,any>;
 if(job.automatic||!job.request_payload||typeof job.request_payload!=='object'||Array.isArray(job.request_payload))return false;
 if(job.status==='failed')return true;
 const snapshot=job.result_snapshot||{};
 const hasCopy=Boolean(snapshot.content_document&&Array.isArray(snapshot.carousel_slides)&&
  snapshot.carousel_slides.length&&String(snapshot.caption||'').trim());
 return job.status==='completed'&&job.stage==='source_review_required'&&
  job.error_code==='EDITORIAL_SOURCE_REVIEW_REQUIRED'&&!hasCopy;
}
