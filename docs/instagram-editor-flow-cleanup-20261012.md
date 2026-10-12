# Instagram editor flow cleanup — 2026-10-12

## Scope

This is a presentation/navigation change, not a publishing-engine rewrite.
The three visible phases are create content, finish images, and review/publish.
The original generator, photo-rights checks, quality gates, immutable versions,
quota controls and final manual publishing operation are unchanged.

The studio now leads with the saved card preview. Alternate headlines are a
compact optional list. Editorial scores, reserved/suggested counts and stylistic
feedback no longer appear as additional required steps. Feedback opens when an
editorial review is explicitly required; accepting copy still does not authorize
photos, sources or publishing.

A pending cover update is visible outside every disclosure, including drafts
without headline candidates. An old cover is labeled as an old image. Workflow
navigation opens enclosing disclosures, focuses its destination, respects reduced
motion, and reports missing targets instead of silently doing nothing. Running,
uncertain, scheduled and published items do not show a misleading edit/approval
button. New-format counts distinguish the story from its separate final Roundy
card, without changing historical content.

## Verification performed

- 23 workflow-state/navigation assertions passed locally.
- 23 KO/EN component-tree assertions passed locally using mocked React rendering.
- Strict TypeScript checking passed for the navigation helper and existing state module.
- The new tests are included in `npm test` and `npm run test:marketing-workflow-ui`.

These are not real-browser, full-app build, image-rendering or Instagram-posting
results. No production records, approvals, photos or posts were changed by these
tests. Full repository checks are left to the pull-request CI.

## Outstanding end-to-end acceptance

An authenticated Roundy admin browser session was unavailable, and the deployment
connection did not authorize the Roundy project. Consequently, the requested new
`dating_myth` post was not generated, rendered, or published in this work session.
Do not count existing production posts or other users' generation jobs as evidence
for this test. Deployment is not claimed.

With authorized access, the remaining acceptance test is to create one original
Korean dating-myth draft, review its facts and copy, approve a photo for every story
card, render the cards with the separate Roundy ending, inspect the actual desktop
and mobile UI, and explicitly publish once. Verify the publishing run, external
media ID and permalink before reporting success. Keep uncertain submissions paused
for review rather than repeating the publish request.
