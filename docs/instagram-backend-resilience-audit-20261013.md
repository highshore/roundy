# Instagram backend resilience audit

Scope: backend inspection requested after editor-first rollout. Production logs and SQL contracts were read without mutating drafts, approvals, reservations, credentials or published posts. This patch is a reviewable correction, not a claim that all upstream services always succeed.

## Findings and changes

1. **Research completion and evidence were conflated.** A completed cited response with one successful search was rejected when any other tool item was incomplete, or the response contained more than three tool items. Usability now requires a completed final response, no unfinished message, a successful search and actual URL annotations. Tool count remains diagnostic; the request still limits tools to three. Missing citations, unsuccessful searches and incomplete final responses remain blocked.
2. **Source review was a recovery dead end.** The generation handler persisted source-only results as `completed/source_review_required`, while the retry API and UI admitted failed jobs only. A narrow manual-retry predicate now admits only that source-only review exception. Automatic, uncertain, running, successful-copy and superseded attempts remain blocked. The authorized retry-parent ID participates in the fingerprint so the completed-parent DB deduplication rule does not block same-revision recovery.
3. **Repeated retries lost research caching.** Cache hits now persist the original cache and original verification timestamp on the new attempt, without extending its TTL.
4. **The complete research brief was omitted from writing.** The writer now receives bounded research notes alongside the source-linked evidence. Optional duplicated notes shrink if the request byte budget is reached. The before-you-go comparison series does not randomly become a sequential itinerary.
5. **Every 429 paused all AI work.** Transient rate limits no longer trip the permanent global pause. Authentication and billing failures still do. No paid automatic retries were introduced. Unreadable HTTP-success bodies are uncertain outcomes, not safely replayable failures.
6. **Credit overflow was checked after paid imagery and rendering.** Caption and attribution constraints now run first, without silently discarding required credit or source text.
7. **Photo selection used delete followed by insert.** One atomic upsert replaces that gap. Fill-missing does not overwrite concurrent administrator selections; failed replacements cannot erase previous rows. Existing rights, uniqueness and publication checks remain enforced.
8. **A font failure poisoned the warm cache.** Incomplete font sets are not accepted or cached. The next explicit attempt can load fonts again. The required regular Latin font is explicitly traced into deployment output. Invalid OTF responses are rejected before image generation.
9. **Per-call timeouts did not fit the handler deadline.** The optional stock-plus-AI-card path checks remaining execution time before loading assets and again before the paid image request. It can save a render-review result with copy and photo selections intact, for the existing image-only completion action.
10. **Diagnostic information was insufficient.** Saved research diagnostics include response status, incomplete reason, successful/total tool counts, citation count and a bounded response ID, rather than raw provider payloads or credentials. Known font, stock and image-validation codes are retained instead of all becoming `GENERATION_FAILED`.

## Verified boundaries

- Production topic and JSON/revision constraints were inspected. `korea_life` is already allowed; no duplicate migration is proposed.
- The production quality RPC expects version 2, which the current prepared-copy report provides. The source-review report is not submitted to that RPC.
- Final approval, immutable image/caption checks, rights manifests, duplicate publication and unknown-outcome safeguards were not relaxed.
- Regression fixtures cover the real generator and retry route, failed research/writer chains, bounded request fitting, rate limits, malformed success responses, credit overflow, deadline deferral, cache failures and concurrent photo writes. Existing media/publishing suites remain in place.

## Remaining limits

The old incident did not retain its raw Responses status/tool history, so the exact failed completion condition for that individual request cannot be reconstructed solely from saved citations. New diagnostic fields address this gap. Real provider timeouts, genuinely missing evidence, revoked credentials and unavailable photo sources can still require intervention. Fonts still use a remote download on a cold worker; bundling/pinning them would remove that dependency. An AI image that was returned but lost before durable persistence may still require a separately authorized regeneration. No live paid AI generation, authenticated end-to-end admin session or Instagram publication is claimed by the fixture tests. Historical source-review records are not rewritten or automatically replayed.
