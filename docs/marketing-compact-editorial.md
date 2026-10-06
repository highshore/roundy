# Roundy compact editorial generation

Preset: `roundy_compact_editorial_v1`.

## Production path

The existing guarded generation job still owns idempotency, concurrency, reservation, retry lineage and result snapshots. Research is separate from structured writing. The writing request keeps bilingual structured fields for caption parity and evidence handling, but the image renderer displays only the selected post language.

`generateEditorialCopy` -> `contentSchema(type, language)` / `writingInstructions` -> `normalizeCompactDocument` -> evidence and compact-text checks -> `prepareContent` -> `renderCards` -> immutable result snapshot.

Generated results stay in Generation history. An administrator explicitly imports a passed result into an independent editable draft. Existing snapshots, publications and account limits are not rewritten by this release.

## Visual contract

* 1080 x 1350 output, 4:5 aspect ratio.
* Magazine-editorial direction: minimal, readable, photo-led, with varied layouts instead of repeated UI cards.
* Official four-path Roundy mark, geometrically checked against `roundy-brand.tsx`.
* Brand colors remain #ff6666, #20211f and #fffefa.
* Korean cards use Noto Sans KR. English cards and the Roundy wordmark use DM Sans.
* Cover: real Roundy logo at the top, full-bleed lifestyle photograph, short large headline, restrained coral keyword emphasis and one short subtitle. No `Roundy Notes`, page number, Instagram handle or website on the cover.
* Content cards: only the selected post language is visible. Korean posts do not render the English `secondary_body`; English posts do not render the Korean translation. There are no `국문본문` or `영어본문` labels.
* Content layouts vary deterministically between split editorial, photo-band and text-led compositions. Option/list cards use typography and rules rather than pill/button UI.
* Coral is used as a restrained emphasis color, not as a large card background.
* Research attribution remains in caption metadata. A sourced card uses a language-specific note such as `출처는 캡션에서 확인` or `Sources in caption`, avoiding bilingual source labels on-image.
* Outro: no photo-heavy sales layout. It contains only the real Roundy logo, a short language-specific service description, `@roundy.meet` and `https://roundy.team`.

## Photography

Static/local marketing photography is no longer used. Whenever visuals are requested, the generation worker creates one fresh content-specific visual set containing three distinct editorial photographs. The current carousel title/body context is included in the image prompt, so the scenes are created for that post rather than selected from a reusable photo library.

The three generated photographs are used as a coherent campaign set across the cover and body-card layout variants. The server still adds all typography and the official Roundy logo afterward, so the image model never generates brand text or copy.

## Copy and caption

The selected post language controls every visible image field. `secondary_body` remains a storage-only faithful translation for validation/caption parity and is not rendered on the image. Slide options/highlights are instructed to use the primary post language.

Caption generation remains bilingual as a publishing caption contract. Each language uses a short hook and concise context. The server appends exactly one content-type CTA plus the fixed `@roundy.meet | roundy.team` footer. Research/book posts add Sources only when actual cited sources exist. Hashtags remain topic-curated rather than claimed live-volume rankings.

## Cost and release boundaries

There is no change to daily/monthly budgets, temporary override expiry, daily call limits, photo limits, pause control, no-fallback rule or explicit-retry policy. Default card rendering is local and does not add image-model calls.

Release checks cover both primary languages, source/evidence rules, actual Roundy logo geometry, absence of the old bilingual body labels and page counter, Noto Sans KR and DM Sans availability, local photo-bank availability, 1080x1350 output, distinct rendered cards, and the simplified cover/outro contract.
