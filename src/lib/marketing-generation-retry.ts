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
