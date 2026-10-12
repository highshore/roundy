# Instagram editorial workflow repair

This release keeps manual publishing approval, verified facts and source IDs, photo-rights checks, revision checks, immutable publishing snapshots and uncertain-outcome quarantine.

## Changes
- Admin instructions stay separate from model-authored planning and are not shortened when combined with a chosen topic. Research lanes establish evidence before editorial topic scoring. Optional, explicit positive/negative human feedback is used as bounded style reference only, never factual evidence or performance data.
- Rejected structured copy remains in its generation snapshot. The job reports editorial review, not provider failure. Opening that output creates a separate unpublished candidate without changing the original. Source-critical output remains blocked from approval. Incomplete topic batches keep their five proposals; an administrator can explicitly select a non-duplicate saved topic and resume within the same thread without paying for topic planning again.
- Persisted job statuses remain compatible. UI states distinguish system issues, topic/copy/source/translation review, photo selection, rendering and final approval. Empty workspaces are hidden from the editorial inbox, and versions are grouped by their original content.
- Content, Calendar, Performance and Settings group the existing features. Selected posts show the topic → copy → images → approval path. The copy editor focuses on one card, makes other headlines and evaluation notes collapsible, and saves primary-language edits even when translation or reusable artwork is incomplete. Such versions cannot publish until the missing checks pass.
- Manual 3/5 story-card choice is fixed before writing. Existing reservations are unchanged. The brand outro adds one card; all story cards, including the editorial ending, require their assigned imagery. The SQL ledger retains the STORY count while validating the complete image count including the outro.
- Operational counts are drawn from at most 100 recorded steps and grouped by content workflow. Budget reservation amounts are labeled separately from provider account credits and invoices.

## Deployment
Apply the CLI-generated `instagram_editorial_workflow` migration before publishing the frontend release. `scripts/marketing-workflow-schema.sql` is the audited SQL source used by the migration and PostgreSQL regression test. The migration only updates the private scheduler function and preserves its grants. It changes no stored drafts, reservations, published posts or budgets.

## Verification scope
Use TypeScript, all repository tests, mocked provider generation, PGlite scheduler checks, and renderer QA. No live AI generation or Instagram post is part of this test suite. Subjective copy quality must still be assessed from the administrator's future reviews; an internal score is not a reach prediction.

## Deliberate limits
This does not introduce a new durable queue provider or move existing workflows to another platform. Existing server jobs are read on return and polled without restarting paid work. Upload-only art still needs a compatible rights-reviewed photo path before publication. Older failures that contain no structured usable copy cannot be reconstructed without a new authorized generation. Global fixed/alternating scheduling semantics remain intact except explicitly chosen new manual story lengths.
