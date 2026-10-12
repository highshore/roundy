# Roundy Reel Studio — Stage 4 (AI ideas, 15–30s timeline, licensed mixed media)

Stage 4 extends the existing admin-only Reel Studio without replacing the existing 9-second quick Reel, native MP4 upload, Reel approval, Meta asynchronous publishing, or unresolved-publish quarantine. New creative work is a separate *unapproved* Reel version: original Reel IDs, approved videos and publication snapshots remain untouched.

## Creative workflow

1. In Reel Studio select pillar and KO/EN, create a blank Reel draft, then request **five distinct AI ideas**. One paid, explicitly confirmed text-model request generates five formats: myth vs reality, three quick tips, awkward moment fix, say this instead and relatable observation. Novelty, reader value, sharing potential and three-second readability are independently screened. Failed ideas cannot be selected. Recent Reel headlines are supplied as repeat-avoidance context, not facts.
2. Select an eligible idea and request a **15–30-second script**. This uses one more paid model call, no automatic retries. The script contains an exact 3-second opening scene, short overlay captions, optional voiceover lines, a caption, soft Roundy ending and 4–5 total scenes. The hook receives a server-checked editorial score; generic or sensational hooks are rejected. Results are inserted as a new unapproved Reel draft (copy-on-write) with lineage.
3. Inspect the 9:16 scene preview, adjust captions, voiceover lines, background asset and duration. Save scene changes as another unapproved draft version. The selected media IDs, human-readable script and duration are versioned together. Old source draft and its video storage path are never overwritten. The first scene remains 3 seconds, and the whole story must stay between 15 and 30 seconds.
4. Add source media through the private **Reel asset library**. Licensed video and licensed photo uploads demand creator, permissions and license evidence. New uploads are pending until explicitly reviewed. Original/previously approved Roundy photos may be separately imported from their existing immutable storage copies. AI images use a separately confirmed paid image-generation request, are archived with model metadata, and remain pending until reviewed.
5. Assign only approved media to scenes. The native local browser composer draws real video frames as background, or composits approved photographs/AI images with branded text at 720×1280 (9:16). It takes 15–30 seconds to record a silent MP4. Native H.264 MP4 MediaRecorder support is browser-dependent; elsewhere manually upload a finished MP4. *Voiceover is supplied as a script only, not claimed to be generated audio.*
6. Use the existing **Upload and verify MP4** and preview actions. The server validates uploaded MP4 bytes, coded dimensions, codec and duration, and stores a hash of the saved script + scene-to-media bindings. Missing/invalid footage approvals or mismatched script/revision block human review and publishing. The database checks approved asset references on the draft transition to \`queued\`.
7. The existing separate rights, copy and video-preview confirmations remain mandatory. The original explicit approval-and-queue RPC is the **only** publication step. The publisher uses its preexisting durable Meta attempts; unknown outcomes are quarantined and never automatically republished.

## Risk and cost controls

- One request key per user-confirmed paid AI operation, no automatic retries, status recording and shared daily/monthly marketing budget reservations. Daily limits: 8 text requests per kind and 2 image requests. A failed or uncertain outcome is not retried with the same or a fresh request without explicit user action.
- Existing approved media is immutable. The Reel asset archive uses a separate private storage bucket with admin-upload/preview policies; no browser update or deletion rights. Pending assets require explicit review. Imported photo bytes are separately copied; old archives are not modified.
- Only draft/needs_review Reel rows without any posting run can create another creative version. Published, queued, approved, failed-publish and uncertain reels remain locked.
- No generation, script selection, media approval or rendering step publishes a post. Last-mile rights and media-preview review remain mandatory.
- Internal idea/hook scores are heuristics, not Instagram ranking predictions. Do not manufacture live trending stats, place facts, named testimonials or research findings.

## Release

New migration \`20261012090000_reel_studio_creative_assets.sql\` adds:
- \`creative_plan\`, version metadata and rendered-plan hash to Reel drafts (additive)
- immutable, provenance-controlled \`marketing_reel_assets\` with private \`marketing-reel-assets\` storage
- \`marketing_reel_ai_runs\` and an atomic shared-budget/idempotency reservation RPC
- a DB asset-rights guard before queued Reel publication

Run \`npm run typecheck\`, \`npm test\` with \`scripts/test-marketing-reel-creative.mjs\`, existing MP4/Meta mocks, source/video safety and responsive layout checks. Deploy to production after migration and passing CI; inspect the deployment's git SHA on \`roundy.team\`.

This work adds a silent local editor, not a background video synthesis engine. Third-party footage must be uploaded with verified rights; it is never scraped or pulled from an unverified external URL.
