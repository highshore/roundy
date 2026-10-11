# Editorial quality v2

Every supported type has a separate role sequence and content brief in marketing-content-policy.ts. Book, study and myth posts require a cited research brief. Other types avoid factual research/percentage/current-trend claims. Meme posts are original situational jokes, not copied or asserted current trends.

Search is isolated from brand/event copy. One plain-text Responses research request may use up to three targeted web-search tool calls with high search context to verify identity, evidence and limitations before yielding cited notes. A separate tools-free strict-schema Chat Completions call writes the carousel. Book Insight skips live web research and selects only from a server-owned verified book catalog with official publisher/author sources. Only cited evidence IDs are accepted; arbitrary search-result URLs and model-invented labels are not evidence. Exact book title and author must occur in the cited evidence. Automated checks do NOT prove factual truth, and all publication still requires the administrator's editorial review.

Checks cover role/order/schema, duplicate and near-duplicate titles/bodies, cover density, field lengths, source IDs, book attribution, concrete conversation questions, quiz options, language, excessive promotion and unsupported statistical/trend claims. Failures are classified as Critical, Quality, or Formatting. Safe formatting is normalized locally. Non-critical copy can receive exactly one bounded repair pass using the same evidence. Critical source/fact/event failures still fail closed.

Rendering uses role-specific cover, book attribution, evidence, dialogue, contrast/choices, practice and CTA compositions, not color swaps. Captions carry source URLs; book/claim cards carry server-derived attribution. Every visual generation creates a fresh three-image editorial photo set from the current carousel context; static marketing photography is not reused.

If a research-only topic cannot obtain usable cited evidence, generation falls back at most once to a safe non-research topic (Conversation Prompt or Dating Archetype) instead of repeatedly searching. A database trigger blocks ALL new Instagram publishing queue entries unless the current draft revision passed quality checks. Editing or restoring content invalidates the pass. Free rechecks do not call AI. The old source-less success fallback is no longer used for evidence-dependent content.

Reservations: copy $0.02; research (up to three targeted searches + one writing call, plus at most one copy-only repair when needed) $0.05; fresh visual set $0.15; copy + fresh visual set $0.20. The normal $0.25/day cap remains; the monthly app guard is $6 to support recurring fresh visual generation. Identical explicit retries can reuse valid saved research (books 7 days, studies 1 day). Reservations are conservative app accounting, not provider invoice guarantees. No paid API calls are made by CI tests.


## Human copy and branded visuals

Policy v3 explicitly avoids generic AI-ad language. The writing prompt uses type-specific tone guides and bans recurring abstract marketing phrases such as "meaningful connection", "premium experience", "진정한 인연", "품격 있는 만남" and similar stock language. The quality gate rejects these phrases and common formulaic AI openings before publication.

Copy should prefer observable scenes, concrete actions, usable questions and short natural sentences over motivational abstractions. Growth posts remain editorial-first: Roundy appears only on the final CTA/caption unless the post itself is an event/brand announcement.

Every server-rendered card includes the real Roundy vector mark. Photography is generated at content-generation time rather than selected from reusable assets. One bounded gpt-image-2.5-flare request asks for three low-quality 1024x1280 editorial photos tailored to the current carousel. The server then overlays the approved logo and typography. Automatic generation uses the same fresh-visual path.


## Topic discovery and duplicate protection (Stage 2)

For a **new magazine Growth Carousel** (excluding a pinned, already verified Seoul Trend and the fixed verified-book lane), generation first requests exactly five editorial topic angles in one bounded chat-completions request. The new topic-planner module keeps the existing category allocation, marketing admin routes, source-research pipeline, image approval rules and manual publication gate unchanged.

Each candidate contains a short hook, precise English \`angle_key\`, relatable scene, non-obvious observation and a specific reader payoff. The server applies a fixed 100-point screen: novelty 30, reader value 30, curiosity 20, shareability 20, with a minimum score of 80 and minimum novelty/reader-value ratings of 4/5 each. Generic advice, missing specificity and duplicate candidates are rejected regardless of the model's self-assigned scores. **These are internal triage heuristics, not observed engagement predictions or a substitute for human review.**

Before the candidate request, the server reads at most 120 recent active drafts and 120 completed generation snapshots from the previous 60 days. Recent headlines, selected angle keys and core insights inform the AI brief and independent server-side near-duplicate checks. Imported drafts and their source jobs are deduplicated in the history set. The rules are best-effort similarity detection, not full semantic equivalence; a human still reviews novel but potentially overlapping stories.

A selected angle is passed only as **editorial direction**, not as factual evidence. Research topics must still establish facts and source IDs independently. All five candidate results, scores and discarded reasons are saved in the protected \`marketing_generation_jobs.request_payload.topic_selection\`; a successful draft also embeds the selection in \`content_document.editorial_topic_selection\`. Admin → Marketing → Generation history shows the review record. If all five candidates fail, the job is marked failed with the reasons preserved and does **not** proceed to research, copy, stock imagery, or publishing. No historical drafts are modified or published automatically.

**Costs and reliability:** The new stage makes at most one extra paid text-model request per eligible generation, with no automatic retry; its token usage is included in the existing job counters and reservation controls. Budget reservations are still coarse fixed costs rather than invoices for actual tokens. On API uncertainty the existing circuit breaker and manual reconciliation remain in force. The user should monitor real usage before increasing the daily generation frequency.
