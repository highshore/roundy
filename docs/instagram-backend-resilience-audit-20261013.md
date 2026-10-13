# Instagram backend resilience audit

Scope: backend correction after editor-first rollout. Production logs, SQL contracts and storage configuration were inspected without changing existing drafts, approvals, reservations, credentials or published posts. External services can still fail; no universal success-rate claim is made.

## Findings and changes

1. **Research completion and evidence were conflated.** A completed cited response with one successful search could be rejected when another tool item was incomplete or there were more than three tool items. Usability now requires a completed final response, no unfinished message, a successful search and actual URL annotations. The request still limits tool calls to three. Missing citations, unsuccessful searches and incomplete final responses remain blocked.
2. **Source review was a recovery dead end.** Source-only results were saved as `completed/source_review_required`, while the retry API and UI admitted failed jobs only. A narrow manual-retry predicate admits this source-only exception. Automatic, uncertain, running, successful-copy and superseded attempts remain blocked. The authorized retry-parent ID is included in the fingerprint so completed-parent deduplication does not block same-revision recovery.
3. **Repeated retries lost research caching.** Cache hits retain the original cache and verification timestamp on the next attempt, without extending the TTL.
4. **The research brief was omitted from writing.** The writer receives bounded research notes alongside source-linked evidence. Duplicated optional notes shrink before mandatory facts when the byte budget is reached. The before-you-go comparison does not randomly become an itinerary.
5. **Every 429 paused all AI work.** Transient rate limits no longer set a permanent global pause. Authentication and billing failures still do. There are no paid automatic retries. Unreadable HTTP-success bodies are uncertain outcomes, not safely replayable failures.
6. **Caption credit overflow was checked too late.** Caption and attribution constraints are checked before paid imagery and rendering, without silently discarding required source credit.
7. **Photo selection used delete then insert.** One atomic upsert replaces that gap. Fill-missing does not overwrite concurrent administrator choices, and failed replacements cannot erase previous assignments.
8. **Runtime font downloads caused avoidable failures.** The build downloads a commit-pinned font set and license, verifies Git blob hashes, and includes them in the deployment. Runtime uses only literal local paths. Missing/corrupt fonts fail closed, failed loads do not poison the warm cache, and tracing no longer expands to the entire project.
9. **Per-call timeouts did not fit the handler deadline.** The optional stock-plus-AI-card path checks remaining time before loading assets and again before an image request. It can preserve copy and photos as render-review for image-only completion.
10. **Paid optional AI images were not durable before rendering.** The optional card is now stored in private `marketing-images` storage before final rendering, with an exact prompt/model hash and content digest in the draft. A matching image-only completion reuses it. A missing or corrupt recorded image stops instead of silently purchasing another image. Changed context cannot reuse an unrelated image.
11. **Diagnostic information was insufficient.** Research diagnostics retain response status, incomplete reason, successful/total tool counts, citation count and a bounded response ID, not raw provider payloads or credentials. Known font, stock and generated-image errors retain their specific codes.

## Verification coverage

- Production topic, JSON, revision, quality-report and private/public storage limits were inspected. No schema migration is required.
- Full generation-module and retry-route fixtures cover source-only recovery, partial search history, incomplete responses, three-attempt writer failures, cache TTL, request fitting, rate limits, malformed success responses, caption overflow and deadline deferral.
- Photo-write fixtures cover failure without data loss and concurrent administrator choices.
- Generated-image fixtures use real Sharp decoding and verify exact-context reuse, integrity, path validation, missing data and failed uploads.
- The real `runGeneration` module is run through an injected final-image upload failure. Its subsequent image-only completion produces six cards with only one original image API request and one original copy request. This uses fixture providers/storage, not production AI calls.
- An actual ImageResponse/Sharp test renders 20 Korean/English 3/5-story-plus-brand cards using bundled fonts. Font loading is prohibited from using the network. Production-build file traces must include all four fonts and exclude repository tooling.
- The regular read-only CI workflow includes type checking, the full existing test suite, production build and bundled-renderer checks. Superseded CI runs are cancelled. Temporary write-enabled patch workflows are removed.
- Final approval, source/rights manifests, immutable caption/image checks, duplicate publication and unknown-outcome safeguards remain in place.

## Verification limits

The old incident did not retain raw response/tool statuses, so its precise failed completion condition cannot be reconstructed solely from saved citations. Provider timeouts, genuinely missing evidence, revoked credentials and unavailable photo sources can still require intervention. Build-time static font downloads remain an external dependency, with immutable pinning and bounded retries; there is no runtime font download. An image lost before its first durable save is not recoverable from these fixtures. The durable raw-image cache covers the optional single AI card, not every legacy all-AI workflow.

Fixture tests do not establish a live end-to-end success rate. A live server-side generation smoke test, if performed for this release, must be reported separately from an authenticated browser test or an Instagram publication. Existing failed requests are not rewritten or automatically replayed, and final publication is not authorized by generation or testing.
