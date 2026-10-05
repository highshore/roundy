# Roundy marketing generation safety

Generation and publishing remain separate. Generation never inserts publishing runs. A reviewed draft is scheduled only through the admin approval endpoint, atomically with its revision check.

## Defaults and costs

Automatic generation: one daily copy/research request, then 2–3 brand cards or 4–6 Growth Carousel cards rendered server-side. No paid photos automatically. Copy model: fixed gpt-4.1-mini, 4,096 output token cap, 16,000 supplied prompt byte cap. Book/research/meme topics allow at most one low-context web search. Other topics do not search. Paid photos require per-request confirmation and use gpt-image-2, low, 1024x1024, n=1, with 1/day and 10/month limits.

Application reservations are conservative estimates, not invoices: copy $0.02; research $0.02; photo $0.05; copy+photo $0.07; render saved cards $0. Paid work stops at $0.25/day, $3/calendar month, 5 paid jobs/day or 90/month. A copy+photo job can make two paid HTTP requests, so the maximum is six paid HTTP requests/day, with at most one photo request. Free render jobs are limited to 10/day. Day/month boundaries use Asia/Seoul. Limits are global, not per process or administrator.

Provider pricing may change. Spending from other routes/projects/users or leaked keys is outside this ledger. Configure provider-side project/key limits independently. Never describe the application reservation budget as an unconditional invoice guarantee.

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
