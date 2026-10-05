# Roundy compact editorial generation

Preset: `roundy_compact_editorial_v1`.

## Production path

The existing guarded generation job still owns idempotency, concurrency, reservation, retry lineage and result snapshots. Research is separate from structured writing. The writing request uses the existing role/provenance schema extended with concise bilingual fields. Whitespace is normalized locally; content is not silently truncated or passed through automatic paid rewrite loops.

`generateEditorialCopy` -> `contentSchema(type, language)` / `writingInstructions` -> `normalizeCompactDocument` -> existing evidence checks + compact text checks -> `prepareContent` -> `renderCards` -> immutable result snapshot.

Generated results stay in Generation history. A user explicitly imports a passed result into an independent editable draft. Existing snapshots, publications and account limits are not rewritten by this release.

## Visual contract

* 1080 x 1350 output, 4:5 aspect ratio.
* Official four-path Roundy mark, geometrically checked against `roundy-brand.tsx`.
* Brand colors are #ff6666, #20211f and #fffefa, matching the site; no reference-brand blue.
* Gothic/sans-serif typography, with regular and extra-bold Nanum Gothic assets and DM Sans for the wordmark. Fixed font URLs are fetched with timeouts and cached in the warm server. When unavailable, the renderer uses Next/OG sans-serif fallback, not a paid image retry.
* Cover: photograph, dark legibility gradient, a short large headline, one coral emphasis line, concise subtitle. No sidebar, chart, mock Instagram controls or large bibliography.
* Content: coral heading, concise Korean paragraph, one optional takeaway, concise English paragraph, and a small source footnote. Full citations remain in the caption and source metadata.
* Outro: photograph plus a server-owned Roundy introduction, Instagram `@roundy.meet`, website `roundy.team`, and an explore CTA. The service is not described as English-only.

The default uses the existing `discovery-hero-v2-poster.webp` brand asset; this does not spend an image API call. The explicitly selected New Flare option retains `gpt-image-2.5-flare`, low quality, 1024x1280 JPEG and n=1. That one background is reused for cover and outro; body cards are rendered locally, producing the full carousel rather than just a single cover. It is not one image API call per slide.

## Copy and caption

Primary language controls the cover and heading. Content bodies are bilingual and compact. A card contains one distinct editorial idea. Source identity, source IDs, study limitations and uncertainty cannot be discarded to satisfy text length. Overlength or unsupported content is held for manual review, not auto-regenerated.

Caption order is Korean body, English body, Sources, then tagline/contact details and five relevant hashtags. Hashtags come from a topic-relevant catalog, accepting suitable model suggestions within that catalog. `hashtag_selection.search_volume_verified` is false: no live hashtag-volume feed is connected, and no claim of measured popularity is made. Punctuation-invalid tags such as `#1:1밍글` are not emitted.

## Cost and release boundaries

No change to the daily/monthly budgets, temporary override expiry, daily call limits, photo limits, pause control, no-fallback rule or explicit-retry policy. Default rendering reuses assets. Research remains at most two targeted search-tool calls within its existing guarded request and one structured writing request. No automatic compression model call is added.

The release checks mocked paid endpoints, full application tests, both primary languages, schema fields, caption ordering, source URLs, absence of obsolete positioning, relevant valid tags, logo geometry, image dimensions and distinct output cards. Render fixtures are fictional QA material; they are not real book citations and are never published. A passing mock test is not a claim that a live OpenAI generation or Instagram publication has been performed.
