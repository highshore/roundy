# Editorial quality v2

Every supported type has a separate role sequence and content brief in marketing-content-policy.ts. Book, study and myth posts require a cited research brief. Other types avoid factual research/percentage/current-trend claims. Meme posts are original situational jokes, not copied or asserted current trends.

Search is isolated from brand/event copy. One plain-text Responses research request may use up to three targeted web-search tool calls with high search context to verify identity, evidence and limitations before yielding cited notes. A separate tools-free strict-schema Chat Completions call writes the carousel. Only cited evidence IDs are accepted; arbitrary search-result URLs and model-invented labels are not evidence. Exact book title and author must occur in the cited evidence. Automated checks do NOT prove factual truth, and all publication still requires the administrator's editorial review.

Checks cover role/order/schema, duplicate and near-duplicate titles/bodies, cover density, field lengths, source IDs, book attribution, concrete conversation questions, quiz options, language, excessive promotion and unsupported statistical/trend claims. Rejected raw output and research are preserved on the attempt; rejection does not overwrite the working draft, publish, auto-retry or trip paid-provider fallback.

Rendering uses role-specific cover, book attribution, evidence, dialogue, contrast/choices, practice and CTA compositions, not color swaps. Captions carry source URLs; book/claim cards carry server-derived attribution. Paid photos remain opt-in and receive a deterministic cover headline overlay.

A database trigger blocks ALL new Instagram publishing queue entries unless the current draft revision passed quality checks. Editing or restoring content invalidates the pass. Free rechecks do not call AI. The old source-less success fallback is no longer used for evidence-dependent content.

Reservations: copy $0.02; research (up to three targeted searches + one writing call) $0.07; photo $0.05; copy+photo $0.07. Existing $0.25/day, $3/month, locks and unknown-outcome protection remain. Identical explicit retries can reuse valid saved research (books 7 days, studies 1 day). Reservations are conservative app accounting, not provider invoice guarantees. No paid API calls are made by CI tests.
