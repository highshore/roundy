# Roundy Reel Studio — 9:16 MP4 production and safe publication

## Surface
Admin > Marketing > Reel Studio (Instagram only). Code branch builds on Instagram Growth Engine v2. All actions are admin-authenticated and mutation routes use the same origin checks as the existing Marketing API.

## Creative workflow
1. Create a Reel draft with one editorial angle, language, content pillar, 2-second hook, caption and hook experiment type.
2. Choose **Suggest an editorial idea** to load a zero-cost local brief. Seoul trend suggestions only use the latest already verified server-owned trend Fact Pack, never invented new trends.
3. Either upload a finished vertical MP4, or build a local 9-second video from three original text scenes and up to three original/licensed images. Rendering uses a 720×1280 Canvas, 30 fps and native H.264 MP4 MediaRecorder with silent audio when supported. It does not use a paid video generation model. The browser does not support native MP4 MediaRecorder everywhere; those browsers must upload a previously edited MP4 instead.
4. The browser validates file type and video metadata. The server independently downloads the private upload and validates the MP4 container's video track, coded frame dimensions, codec and duration when available. Supported orientation is 9:16 within a small tolerance. Duration 3–90 seconds, MP4 maximum 40 MB. Fragmented MP4 movie duration can be unspecified, in which case browser duration is checked but the Meta transcoder remains authoritative.
5. Review the stored private preview (not only the local file). Confirm source rights, factual/editorial accuracy, captions and visual/subtitle presentation. Editing or uploading a replacement video invalidates previous human review.
6. Explicit **Approve and queue** records immutable video path/caption/revision and schedules via transactionally validated RPC. No posting happens on draft creation, auto generation, upload or review.
7. The existing Roundy marketing scheduler dispatches an approved Reel. Private video storage supplies a 60-minute read-only signed URL to Meta solely during container creation. The original stays private; the browser sees only short-term signed preview URLs.
8. Meta Reel media processing is asynchronous. The worker saves the returned creation/container ID in the durable attempts table. Pending processing schedules a follow-up check without creating another container. A final media_publish attempt is marked before the API call; unknown outcomes become needs_review, never automatic retries. The existing database watchdog and a run-state trigger reconcile stale or manually resolved outcomes.
9. Published, failed, and uncertain statuses are shown in Reel Studio. Confirm the actual Instagram account state before manually resolving an uncertain publish. A safely failed pre-publish attempt can be reopened only through explicit manual retry and full re-review.

## Measurement
At approximately 24h and 72h (when the existing scheduler runs), the worker retrieves available official media reach, views, saves, shares, likes and comments, plus optional Reel average/total watch-time metrics. Missing metrics remain NULL, not fabricated as zero. Reel Studio uses only the latest observation per run, grouping by hook type. Reach <30 is excluded from hook learning; no hook recommendation until at least 12 qualifying posts, 6,000 total reached accounts and each hook type has at least 3 qualifying posts / 500 reach. These are Roundy's experimental thresholds, not Instagram algorithm ranking weights.

## Security/rights
- Storage bucket marketing-reels is PRIVATE, 40 MiB maximum, MP4-only. Authenticated admins can upload and read; ordinary users have no read permissions. Raw uploads do not become public.
- Reel draft and attempt tables are service-role-write, admin-read with RLS; the queue RPC is security-invoker, service-role-only, and checks revision and review.
- The metadata/approval API verifies user/admin via the existing authenticated Marketing route; it never accepts arbitrary URLs to publish, and server metadata must refer to a Reel ID scoped upload path.
- User must confirm rights for source footage, photos and audio. Stock asset approvals from the image carousel system are NOT automatically reused as Reel media rights.
- Reels should be original. No buying followers, engagement bait, mass messaging, watermark removal or unauthorized creator footage.

## Operational notes
- The private Supabase Storage signed URL must be downloadable by Meta's server within its expiry; some integrations may reject signed URLs despite being publicly fetchable. A production smoke test with an owned short Reel is necessary.
- Only Meta account @roundy.meet with the configured Instagram content publishing permission can post. No tokens appear in client-side code or stored draft captions.
- The existing scheduler runs approximately every 15 minutes; pending transcoding can delay publication. The UI makes no promise of exact-to-the-minute posting.
- Uploading a file does not create follower growth or guarantee Meta publishing. Review actual content and Meta media processing response.
- It does not automate music licensing, soundtrack selection, AI video generation, influencer collaboration or advanced watch-retention attribution. Those require separate systems/permissions.
