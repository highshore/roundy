# Instagram editor-first authoring

## Scope
New feed editorial generation uses `editorial_workflow_version: 2` and one of three named series. Existing drafts, immutable publishing snapshots, schedules and saved v1 retry contracts are not migrated. No database schema change is required. Brand/event campaigns keep their factual contracts.

## Authoring
- The new composer starts with the series and an explicit subject. Ready-made subject examples are local authored examples, not AI-generated recommendations. Selecting an example makes no API request.
- The normal form defaults to three story cards. Place comparisons suggest five when that series is selected. The administrator confirms length before generating. Existing alternating reservations remain authoritative; historical drafts never change length.
- New subjects bypass five-angle planning, self-scores, independent topic critics, copy critics and automatic rewriting. Non-research copy makes one writing request. Research still runs the existing bounded evidence lookup before writing.
- One cover headline replaces five mandatory alternatives. Single-title saved drafts remain manually editable, and changing the cover invalidates the old render and approval.
- Each series has a short distinct writing brief: dialogue contrasts, two plausible readings, or verified practical comparisons. The source/type schema is retained.
- Only an explicit allowlist of subjective style/narrative checks becomes `suggestions`. Structure, language, unsafe claims, research evidence, references, image rights, current preflight revision and final publishing approval still block publication.
- Missing research is a completed source-review result with retained evidence/subject, not a provider failure or an unrelated fallback. The composer keeps the subject open for additional reference material. Insufficient copy remains available for scoped manual editing.
- Valid copy is saved before photo discovery. New v2 sourcing reuses compatible approved library assets first, then uses only Pexels with the existing two-attempt ceiling. Empty/unavailable discovery produces photo review, not AI filler or a discarded manuscript. Other providers remain available through explicit library operations and historical flows.
- Advanced content types and image options are collapsed. The draft retains the existing unified card editor, selective rewrite/version history, rights checks and final approval.

## Verification
`npm run test:marketing-editor-first` covers pure policy and the injected-provider runtime. New cases exercise all three series in Korean/English and 3/5 story-card layouts, a single writer request despite rejecting legacy critics, source failure without fallback, preserved copy with missing photos, advisory repetition, single-title editing and unchanged source drafts. Existing generator interaction tests also verify the three-series form, local examples and explicit long-photo assignments. No test publishes to Instagram or spends live AI credits.

Live subjective editorial quality and actual account publishing remain separate acceptance checks. The new pipeline does not claim increased reach or measured provider reliability from mocks.
