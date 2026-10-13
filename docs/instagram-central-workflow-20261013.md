# Central Instagram content workflow

## Architecture and compatibility

New manual and automatic Feed content uses `marketing_contents` as the authoritative stage/status/action record. Its stable ID is also the compatibility draft ID. It is allocated once and is visible from creation, so new content does not need a hidden workspace followed by import.

`marketing_content_versions` holds immutable input and copy snapshots. `marketing_content_steps` is both a durable task outbox and attempt history, with exact version, active-step pointer, fencing lease, external-request marker, checkpoint, result and failure reason. Old `marketing_generation_jobs` remains the cost/provider ledger, not the authority for managed content status. Existing photo libraries, private storage, preflight checks and `marketing_runs` publication queue are retained.

The controller queues one stage at a time: optional discovery, copy, media, render, review. The internal authenticated worker executes exactly one claimed task per request. Completion and the next task insertion are committed in one database transaction. A best-effort `pg_net` wake-up plus a one-minute cron dispatch queued tasks even after the browser closes. Delivery retries cannot automatically replay a paid or uncertain stage.

Discovery is saved separately from writing; writing retries use the completed research context while its original 24-hour validity permits. The copy worker makes one strict-schema writing request without topic planning, independent critic cycles or subject fallback. Media starts with approved library assets, then Pexels discovery. New photos require explicit rights review. Render uses the approved archive and optional privately persisted AI image. A failed render resumes only rendering. Final review does not grant publication approval.

## State and safety

Only controller RPC transactions write the canonical record or its managed draft projection. Browser table access is admin read-only; mutation RPCs are service-only behind the existing origin/member/admin API gate. Other users and anonymous callers cannot read the new tables or call mutation/dispatch RPCs. The private scheduler secret remains in the database and is not returned by the narrow dispatcher.

`state_version` rejects stale UI writes. Content version and active task/lease reject stale worker completions. Completed copy snapshots cannot be overwritten. Every semantic edit creates a new version and invalidates downstream rendering/approval. A version reference is not equivalent to approval. Scheduled and published content remains immutable; legacy posts and reservations are not rewritten.

Rendered output is bound to a photo manifest. Review and final approval recheck IDs, approved hashes and provenance against the rendered manifest and current photo records. JSONB key order is not treated as a semantic difference. Global source/rights, revision, caption, spend, one-running-paid-job, cooldown and duplicate-publication safeguards remain enforced.

Unknown upstream outcomes or expired leases after an external request require explicit reconciliation. A known checkpointed result can be committed after worker loss without buying it again. Optional AI image metadata is checkpointed before rendering, with digest validation. Saved image recovery uses a zero-cost render reservation. Missing/corrupt recorded media is not silently regenerated.

The existing publisher updates canonical status only through the exact approved run and content version. Publication retry/reconciliation stays in the existing publishing queue. There is no automatic final approval, Instagram publication or human photo approval introduced by this change.

## Administrator experience

The marketing page defaults to Content Library. Each item shows its canonical current stage, action, stable ID, versions and attempt history. A pending create key is retained in browser session storage, so a lost HTTP response or refresh can recover the same request. Editing, source refinement, rights review, photo replacement, stage retry and explicit final publication approval are available there.

Historical unlinked drafts remain in the existing editor and publishing queue. An explicit adoption action moves a compatible unapproved magazine/independent-brand draft into the new workflow without changing its ID or copy. Incompatible old formats remain in the legacy editor. No bulk backfill or mutation of historical approvals is performed.

## Rollout

1. Apply the additive core migration with `marketing_content_workflow_control.enabled=false`.
2. Install the authenticated dispatcher and one-minute cron; the disabled flag prevents dispatch.
3. Deploy the tested app commit and verify route/assets.
4. Enable the central control flag. Paused new automatic creation returns skipped and never falls back to the old synchronous generator.
5. Run a bounded unpublished production smoke request and compare protected-record fingerprints.

Existing global AI budgets/cooldown may leave a stage queued until the next dispatch. This is intentional and visible, not a lost job. Disabling the new control pauses new claims and external calls while durable data remains recoverable. It does not roll back published posts or rewrite reservations.

## Verification boundary

Local tests cover 35 state-machine/SQL cases against PostgreSQL (PGlite), 34 runtime cases using the actual application migrations/controller/workers and legacy budget/preflight/approval functions, and 10 bilingual React/HTTP interaction cases. The runtime tests substitute provider requests, hosted `pg_net` delivery and final-image transport; they do not claim real Instagram publishing or a signed-in browser E2E session.

The runtime suite exercises 3+1 and 5+1 content, separate research/writer retries, retained AI-image recovery after render failure, manual versioning, explicit approval and real SQL feed-slot reservation, source refinement, photo-manifest drift, legacy compatibility and no legacy fallback when paused. A deliberately overlong English book fixture correctly remains editable copy-review rather than weakening the mobile text validator.

Normal CI additionally runs existing generation, publishing-safety and UI suites, the production Next build, 20 actual ImageResponse/Sharp bilingual story+brand card renders and font trace verification, including the new worker route. No production credentials or font files are included in QA artifacts. Production rollout and smoke results are recorded separately in the PR; passing fixtures alone is not a live success-rate claim.
