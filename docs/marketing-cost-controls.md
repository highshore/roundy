# Roundy marketing generation safety

Generation and publishing remain separate. Generation never inserts publishing runs. A reviewed draft is scheduled only through the admin approval endpoint, atomically with its revision check.

## Defaults and costs (updated 2026-10-11)

Generation and publishing remain separate. All Instagram marketing AI jobs share a single KST-bound application budget, regardless of which administrator starts them.

- **Application spending reservations:** $5.00/day and $20.00/calendar month (previously $2.00/day and $6.00/month). These are estimates reserved before calling an AI provider, **not actual billed totals**.
- **Paid generation jobs:** at most 10/day and 180/calendar month (previously 5/day and 90/month). Failed attempts may retain reservations; only running, completed, and uncertain paid jobs count toward these job-count caps.
- **Operations:** copy $0.02; research $0.05; image-only $0.15; combined copy + image $0.20; render saved cards $0. A job may involve more than one provider HTTP request and the reservation is not a per-request charge.
- **Unchanged protections:** 10 saved-card render jobs/day, 30-second generation cooldown, global running-job lock, no automatic paid retries, idempotency keys, administrator pause and the existing quality/photo-rights review.
- A temporary daily limit can override the daily budget while active; it does not override the monthly budget or job-count caps.

OpenAI and other upstream API provider project/organization budgets are **separate**. A provider-side billing cap or rate limit cannot be raised through this application migration, and spending elsewhere is outside this ledger.

## No retry loop

Every paid attempt first takes a PostgreSQL transaction advisory lock and inserts a unique request key. Duplicate keys return their existing job; changed payloads on the same key are rejected. A global running-job lock, 30-second cooldown, 10-minute fingerprint dedupe and draft revision checks cover double clicks, tabs and deployments. Failed or unknown attempts retain their reservation. Clearly rejected pre-tool requests may have their reservation released after verification; successful research calls use the research reservation even if later app validation fails. No SDK retries or gateway fallback.

401/403/404/429, a missing key and unknown network outcomes trip a persistent circuit breaker. Three consecutive failed paid jobs also pause AI. Only explicit admin resume clears it; it cannot reset budgets or replay old jobs. Pause prevents the next stage, not an already-billed in-flight request.

Cron dispatch is once per KST date, including HTTP timeouts. Install only after deployment verification:

```sql
select cron.schedule('roundy-marketing-generation','*/15 * * * *','select roundy_private.dispatch_marketing_generation()');
```

The existing publisher cron is unchanged. The new dispatcher uses the existing secret server-side and calls generation only. Failed dates are never automatically retried. Inspect the recorded error and explicitly start a new manual job within the remaining budget.

## Recovery and permissions

Copy and structured slides are saved before images. Image failure preserves copy. Saved cards can be rendered again with no AI request. UI refresh replaces stale same-ID data. History shows stage, errors, reservations and token usage. GET-only status polling stops after 48 checks or 3 failures; it cannot start generation. Route execution is capped at 240 seconds; individual calls/render steps have shorter limits.

RLS exposes job/control tables only to administrators for reading. Reservation/edit/approval RPCs use SECURITY INVOKER and are service-role-only. Approval and manual edits take the same lock as generation.

## Verification

`node scripts/test-marketing-generation.mjs`: 29 assertions with a mocked provider, zero live API calls. Covers input/consent, normal cards, dedupe, reservation denial, partial copy survival, 403 circuit breaking, unknown outcomes, free recovery, call/output limits.

Production SQL guard tests run in a rolled-back transaction and verify idempotency, key conflicts, concurrency, retained failed reservations, budgets, free rendering, pause and permissions. Actual provider access and JPEG rendering still require a bounded production smoke test; mocks do not verify them.


## Manual retry from history

Failed manual jobs persist their normalized generation settings in `request_payload`. The admin history can retry the same settings without re-entering the prompt, language, topic, mode, or visual choice. A retry always creates a new guarded job and therefore a new explicit provider request; it never replays automatically. The new job links back through `retry_of_job_id`. Completed, running, and uncertain jobs are not retryable from this control. After a retry succeeds, the recovered draft still requires normal review before Approve & schedule or Publish now.


## Research metadata fallback

A completed Web Search no longer fails the draft solely because source metadata is absent. The server collects sources from search-action sources, open-page/find-in-page URLs, result items, and URL citations. If a completed search still has no source metadata, the draft is saved as `generated_without_sources` and the admin UI requires manual fact-checking before publication. This fallback makes no extra provider call.

Deterministic application-validation failures do not trip the global circuit breaker or consume the paid-job safety counter, but their conservative dollar reservation remains in the daily/monthly budget because a provider request may already have incurred cost. Running, completed, and uncertain jobs still count toward the 10-job daily limit; all paid attempts remain bounded by the dollar budget.


## Generation threads

A user-visible generation task is a thread, not an individual provider attempt. The first request owns the thread ID and attempt 1. Explicit retries reuse that thread ID and increment the attempt number while retaining each attempt's error, token usage and reservation. Only the latest failed attempt can be retried. Once any attempt completes, the thread is presented as Completed and historical failures remain nested inside the thread for auditability. New manual generation requests still create new threads even when their settings happen to match an older completed task.


## Immutable generated results

Each completed generation attempt stores an immutable `result_snapshot` containing its caption, cards/images, sources, language, content mode and related draft metadata. Later generations may replace the current working draft, but they do not replace prior snapshots. Generation History exposes View result. An administrator may explicitly restore a completed snapshot into its still-editable draft; restoration increments the draft revision and never publishes automatically. Results generated before this snapshot feature can only be backfilled when the current draft still exactly corresponds to that completed attempt.


Editorial policy v2 supersedes earlier source-less research fallback and single-call research descriptions. Book/study/myth generation now permits one source search followed by one tools-free structured writing call, with a 0.05 USD reservation. Evidence-dependent content without cited evidence is rejected and preserved, not marked publishable. Every new Instagram queue entry is checked against the reviewed current draft revision.
