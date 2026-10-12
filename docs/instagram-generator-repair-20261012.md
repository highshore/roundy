# Instagram generator and image-editor repair — 2026-10-12

## Reproduced defect

The new-post form and selected existing draft shared basis, topic and language state. Selecting another draft overwrote an unfinished new-post topic. A real React state test against the original component reproduced `dating_myth` changing to `conversation_prompt`. Existing-image regeneration also built its payload from those shared new-post inputs.

The earlier remote-browser run reported a generic error after changing to Growth Carousel. That exact error was not reproduced by the isolated component test; a production-browser recheck remains necessary. Do not equate the confirmed state-coupling defect with a proven diagnosis of that popup.

## Changes

The new-post topic selector now offers dating myths and the other editorial topics directly. Pre-launch and live-event promotion remain in the same selector; there is no separate Growth Carousel selection prerequisite. New-post inputs remain independent of the selected existing draft. Regeneration obtains type, topic, language and event from the saved draft and does not inherit a new-post instruction.

The creation disclosure has explicit open state. The unused internal content-profile paragraph was removed. Generated results still import into the working inbox automatically; the empty-state instructions now reflect that behavior. Successful pre-publication checks are collapsed while failed checks stay visible. A redundant recheck control is hidden when the current checks have already passed.

Photo counts distinguish the story from the independent final Roundy card. Five story cards plus one Roundy card require four reviewed photos with an AI cover, or five photos without AI. Three story cards plus the ending use three reviewed photos. Alternating schedules do not claim a fixed count before reservation. The existing-image editor uses the shared saved photo policy, supports the six-card AI options already accepted by the backend, and retains historical three-photo limits. The all-real option is no longer incorrectly disabled. Images not required by a historic saved layout are not shown as missing slots.

No changes were made to authentication, database schema, approval records, photo licenses, editorial quality thresholds, billing limits, publishing workers, or existing posts. The server remains the authority for whether an operation is allowed.

## Verification

Verification run 38257900641 passed repository typechecking, 31 new Korean/English interaction and photo-layout assertions, and the full `npm test` suite. These tests use the real parent React component and hooks with mocked HTTP and child panels. Existing tests also render fixture cards and exercise the publisher with a mocked Meta API. None constitutes a real new-post publication.

The final tree contains only the tested application/helper/test files and this note. The temporary verification workflow and patching script are intentionally excluded from the release.

## Remaining live acceptance

The authenticated Roundy admin session was confirmed in the preceding browser check, but browser execution is currently blocked by the external browser wallet. No new dating-myth generation job, rendered content or Instagram publication was created in this repair session. A production database read found no new generation jobs since 2026-10-12T12:50:00Z at the time of verification.

Remaining acceptance: create one original Korean dating-myth draft through the page, review sources and copy, assign and review each required real photo, render and inspect every card including the separate Roundy ending, then publish exactly once. Verify the external media ID and permalink. Never count an older post or a mocked publisher test as completion; uncertain submissions remain paused for review rather than being blindly retried.
