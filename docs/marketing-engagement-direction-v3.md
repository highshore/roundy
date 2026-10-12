# Roundy Instagram reader-first editorial direction v3

The existing research, verified citations, photo copyright and manual approval
checks remain authoritative. Newly generated Growth Carousels are not event
directories: a truthful hook addresses a real reader problem, each swipe offers
a new scene or insight, and the final card is useful enough to save.

## Editorial allocation (100 planned slots)
- 35 Seoul / date discovery
- 30 real relationship, first-meeting and conversation situations
- 10 practical Seoul/Korea social-life observations
- 10 original relatable social humor
- 15 Roundy and face-to-face meeting culture

Existing bounded Meta performance learning changes editorial weights only after
sufficient real sample data. It cannot automatically approve or publish posts.

## Generation stages
1. Five distinct ideas compete on novelty, reader usefulness, curiosity and
   shareability; recent duplicate topics are excluded.
2. The writer develops a relatable hook with a truthful promise. Existing
   answer-first, citations and fact verification remain mandatory.
3. A three- or five-slide arc progresses scene -> insight -> consequence ->
   useful closing, rather than dividing an event notice into arbitrary pages.
4. Seoul topic photo search uses actual text cues (night, art exhibition,
   waterfront, season, cafe). Reusing a previous approved generic image
   automatically requires recorded scene-compatible search metadata. Existing
   explicitly selected images stay assigned. All new external photographs still
   require copyright verification and explicit admin approval. Metadata alone
   never proves a stock image depicts a named event.
5. Engagement heuristic v2 now covers every newly generated immersive Growth
   Carousel category, including previously exempt verified Seoul trends. The
   existing maximum one repair and no-infinite-retry guarantee still applies.

Admins have an optional reader-first direction selector in manual Growth
Carousel generation. Existing drafts and historical published content are not
rewritten; publishing remains manual. No migration, external retry, AI budget
increase or publishing gate relaxation is introduced.

## Verification
- `scripts/test-marketing-editorial-quality.mjs` tests the weak night-exhibition
  example and human-centred stronger storytelling.
- `scripts/test-marketing-photo-intent.mjs` rejects a reused autumn daytime
  photo for a night art exhibition.
- `scripts/test-marketing-growth.mjs` validates planning allocations and
  preserves statistical thresholds and capped feedback.
- Existing marketing rights, preflight, source provenance and authorization
  suites remain the release blockers.


## Independent editor & story-first mode (proposed release)

- Generate up to five topic angles with historical duplicate screening. The writer's
  self-ratings are not passed to the independent topic critic. The critic scores
  curiosity, scene, originality, usefulness, and shareability; all reviewed keys
  must match eligible topic candidates exactly. Low-quality ideas fail closed.
- New non-research human/social Growth Carousel topics (conversation prompts,
  archetypes, MBTI, original relatable humor, Seoul/Korea daily life, mini quizzes)
  use **story-first** writing. Research, verified venue, book, trend, and event
  content retain answer-first/source-first constraints. Story-first permits an
  honest question as a cover but never clickbait, fake anecdotes, or invented facts.
- After ordinary research/format checks, a **second independently prompted AI
  editor** reviews the actual slide texts. Its weighted rating is computed by
  the server, not accepted from the writer. Required: >=80 overall and >=4/5
  on hook, originality and progress across slides.
- A weak **premise** may swap once to the next independently approved,
  source-free idea; a fixable **draft** may get one quality-targeted rewrite.
  There are at most **two** copy-critic calls per job. No automatic retry is
  performed after invalid responses, exhausted alternatives or review failure.
  All source/rights, copy-length, duplicate, card-count and manual approval
  gates remain in force.
- Keep the existing 3/5 reservation immutable. A thin five-card premise is
  rejected or replaced, never shortened after reservation or padded with filler.
- Critic scores and remarks are stored on **newly generated** content and
  surfaced in the Admin Editorial Studio. Human changes require the existing
  manual review workflow. Existing content remains intact.
- The additional short critique calls use the existing request-token accounting
  and job budget reservation (which is an estimate, not provider billing).
  Make NO extra paid photo request until the editorial copy is accepted.
- CI runs a **mocked, offline** regression test covering weak-vs-strong review,
  independent re-ranking, malformed model output, language-mode selection
  and the fail-closed review/repair wiring. Real provider costs, judgments,
  runtime limits and final image quality still need a bounded smoke test.

## Independent-editor failure recovery (2026-10-12)

- The `EDITORIAL_INDEPENDENT_REVIEW_REJECTED` result is a **copy gate**, not a cache or photo error. The rejected copy is held in the job snapshot and will not publish.
- Verified news/Seoul trend carousels use a separate fact-first critic brief. A human-interest scene may be a reader deciding between verified programs; invented visitor quotes or forced romantic conversations are not required. Each slide must deliver different information tied to the same cover promise.
- On the **one existing copy repair** the writer now receives the independent editor's concise reason, itemized defects, lowest-scoring dimensions and a length-specific storyboard. It can rewrite the full narrative while keeping approved subject, source IDs, uncertainty, role order and exact 3/5-card reservation. No third critic review, unbounded retry, extra automatic web research, image expense or lowered publication threshold is introduced.
- The admin Generation History displays a compact failure explanation, with long raw editor notes in a disclosure. Retry remains manual, may incur charges, and generates a new unapproved draft. Historical posts, source records and admin approvals are unchanged.
- Offline regression coverage: `scripts/test-marketing-independent-critic.mjs` plus existing magazine, source and marketing tests. A fully successful live AI generation cannot be guaranteed by static tests; failed copy remains blocked from publication.
