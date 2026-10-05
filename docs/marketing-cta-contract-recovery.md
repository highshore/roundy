# CTA contract repair and saved-output recovery

## Incident

The compact editor normalized the final CTA *slide* to server-owned brand copy, but retained the separate top-level `cta` field written by the model. That schema field had no length constraint even though the downstream validator required at most 70 characters. Two saved failures had otherwise valid captions and top-level CTA paragraphs of 88 and 99 characters. The combined error message incorrectly left it unclear whether the caption or CTA was at fault.

The fix uses a single short generated action label: `Roundy 둘러보기` (Korean) or `Explore Roundy` (English). The structured output schema and normalization agree on this value. The model is told that `cta` is a button/action label, not the brand paragraph or contact block. Contacts remain separately rendered. The 70-character limit is not removed or enlarged; manually edited draft CTAs are still checked. Validation now distinguishes missing caption, long caption, missing CTA and long CTA, with actual counts.

## Recover without paying for another AI generation

Generation History offers **저장된 결과로 무료 복구 / Recover saved result — no AI charge** for the narrowly identifiable saved CTA-contract failure. The retry API chooses the path server-side, never from client-supplied result content.

Recovery:

1. Requires an authenticated administrator through the existing admin API, the latest failed manual attempt, the matching generation thread, and an editable working draft.
2. Reads the saved compact result from the original failed attempt. It requires that the single prior quality issue is the known caption/CTA contract failure and that the saved CTA is empty or exceeds 70 characters. Manual quality rejections, uncertain outcomes, paid photos and incomplete research are not eligible.
3. Normalizes only the server-owned action label and re-runs all normal content, bilingual, length and source checks. Missing/invalid substantive content is not fabricated or silently truncated.
4. Reserves operation `render` at $0 in the existing reservation gate, preserving concurrency, cooldown and render-count limits. No OpenAI endpoint is called. Existing paid reservations are not erased or refunded by the app.
5. Renders the saved content using the existing approved card renderer, stores a new completed attempt in the SAME thread, and records its source job and zero additional paid calls. The original failed attempt and its snapshot are retained unchanged.
6. Does not import, approve, schedule or publish automatically. The administrator reviews the new result and then imports it into Drafts.

A failed local recovery cannot silently fall back to paid generation. A subsequent render retry retains its saved source pointer. A stale, mismatched or incomplete result returns an error before any provider request. Source snapshots can remain visible in history even after a later recovery succeeds.

## Separate research failure

A blank-direction research request previously sent only a generic relationship/conversation category to the search model. A saved dating-myth failure asked for a specific topic and explained statistical methods instead of citing relevant research. The new task builder supplies a concrete editorial question before searching when the creative direction is empty. For dating myths, the default question concerns asking questions/follow-up questions and liking during first conversations. For research posts, it concerns perceived versus reported liking after adult conversations. These are questions to investigate, not asserted findings.

The existing high-context search cap stays at TWO tool calls and no automatic paid retry is added. User-provided creative directions override the default subject. Cache identity includes the task-builder version; cached research must have a completed search and nonempty cited sources. Empty-source responses remain blocked and cannot be repaired into factual posts without valid research.

## Validation boundaries

Regression checks cover 88-, 99- and zero-character saved CTAs in both languages and both affected six-card content types; schema/action agreement; zero-provider recovery; preserved original snapshots; thread/attempt lineage; idempotency; no paid fallback; and rejection of changed threads/topics, automatic/photo requests, missing language and missing sources. Existing app, compact layout and renderer tests remain in CI.

No production content is automatically regenerated or published by this code release. No budget, pause setting, quota or database schema migration is changed. Actual live OpenAI generation and Instagram publication are not part of the tests.
