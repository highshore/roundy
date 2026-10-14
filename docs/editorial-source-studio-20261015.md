# Editorial Source Studio — first implementation

## Scope and location
The second Admin navigation item, \`/admin/editorial\`, focuses on producing original Instagram **carousels** from externally discovered dating discussions or Seoul venue guides. No Reel production, automatic publishing, content cadence, scheduler or existing published post is changed.

The original \`/admin/marketing\` retains the final media-rights, rendering, quality, approval and publication controls. Handoff creates a canonical \`marketing_contents\` request with a stable \`editorial:<idea-id>\` key and creates **no** scheduled/published run.

## Production flow
1. Discover: import a public source URL, author/creator, title and a short summary manually. Relevant existing Seoul Trend Radar links can prefill this form. No Instagram media is scraped, copied or uploaded from an external post.
2. Create idea: one editable editorial angle, three editable hook candidates and three starting storyboard cards. The initial strings are explicitly **placeholders**, not AI-generated or trending claims.
3. Suggest (optional): one explicit paid \`gpt-6-luna\` structured-editorial request proposes exactly three hooks and a three-card storyboard. One idempotency key per idea revision. The cost reservation is $0.02 from the shared Marketing control budget; unknown results are quarantined and never retried automatically. Four reservations maximum per Korea-local day.
4. Edit: choose a hook and make each card contribute specific reader value; three or five storyboard cards are supported. The selected hook and storyboard are saved with optimistic concurrency via \`revision\`.
5. Handoff: link the source and selected brief to the existing \`startContentWorkflow\`. Seoul guides enter the evidence-dependent \`seoul_dating\` research lane and must independently verify real venue facts. Dating opinions enter \`dating_archetype\` as original illustrated scenes, **not** purported real interviews. Media remains unpublished until the existing rights review and human approval.

## Boundaries
- Import does not independently verify source engagement, popularity, rights, facts or posting date. These are administrator-supplied research leads, not an Instagram ranking API.
- \`inspiration_only\` status never authorizes copying external photographs, clips, scripts or testimonials. All resulting media goes through the existing approved-asset checks.
- The handoff brief preserves the preferred hook, content angle and storyboard titles as editorial direction. The downstream generator may still need human refinement of its rendered copy. The URL is not factual proof.
- An existing source currently has one editable associated editorial idea; multi-source briefs and automated external discovery integrations are future enhancements.
- An explicitly chosen 3/5 storyboard count overrides the old alternating carousel allocation **only** for this new source-originated handoff.
- Generated-source cost reservations are guarded by the current \`marketing_ai_control\` budget and also account for existing generator reservations at reservation time. The legacy generation reservation function does not yet include these new costs in its own budget sum; operations should monitor aggregate spending when both types of paid jobs run concurrently.

## Deployment and verification
1. Apply the additive \`20261015000100_editorial_source_studio.sql\` migration using the approved Supabase migration workflow. It creates three RLS-enabled, admin-read/service-write tables and one service-only reservation RPC.
2. Deploy the Next.js app and check \`/admin/editorial\` as an authorized administrator. Confirm anonymous/non-admin callers receive 401/403 from the existing Marketing API boundary.
3. Import a source, create an idea, edit/save all three hooks and cards, optionally request an AI suggestion, then hand off one **unpublished** draft and confirm it appears in Marketing's Content Library.
4. Run \`node scripts/test-editorial-source-studio.mjs\`, \`npm run typecheck\`, \`npm test\`, \`npm run build\`. CI tests use no real paid AI requests or Instagram posts.
5. Explicitly inspect source verification, photo licenses, draft revision, rendering and approval before ever publishing. This release does not authorize publication or merge/deploy itself.
