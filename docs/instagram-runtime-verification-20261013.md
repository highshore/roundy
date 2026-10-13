# Runtime verification contract

This release extends the backend audit in `instagram-backend-resilience-audit-20261013.md`.

- The regular CI job must test the exact final PR head: generation and retry fault injection, private asset integrity, failed-save recovery, the existing safety suites, a production build, 20 actual bilingual story/brand renders, and server-file traces containing the required local fonts.
- Optional AI-image metadata writes use the current draft revision as an optimistic concurrency guard without incrementing it. This metadata is not an editorial revision. The actual-generator failure/recovery test asserts that saving the metadata does not consume an extra content revision.
- Temporary patch and write-enabled verification workflows must not remain in the merged tree.
- A production smoke test must use an existing authenticated generation entry point. It must preserve normal request deduplication, spending limits, source checks and approval requirements. It must not publish, approve content, alter scheduled posts, impersonate a user or disclose credentials.
- A fixture-provider test, actual CPU image rendering, a server-side production request and an authenticated browser session are different evidence. Report only the levels actually completed; none establishes a universal zero-error guarantee.
