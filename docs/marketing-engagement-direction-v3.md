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
