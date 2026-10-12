# Stage 5 — Observed Instagram Performance and Safe Editorial Feedback

## Official measurements and availability

The existing Roundy scheduler still captures confirmed Instagram publications at 24h and 72h. Stage 5 adds optional per-media follows/profile visits (Feed where supported) and Reel average/total watch time. A dedicated parser marks each returned metric as observed; missing Meta fields are never presented as zero. Historic saved/shares columns have NOT NULL defaults, so the new metric_availability map is mandatory for any learning. Previously stored official media reach/views can still be shown without assuming historic share/save availability.

Non-follower reach is a daily ACCOUNT-level optional follow_type reach breakdown, never a per-post or per-Reel conversion claim. Only a complete and consistent FOLLOWER + NON_FOLLOWER response is stored as captured. Unsupported or permission-denied responses produce unavailable, not invented numbers. A daily unique-key claim prevents repeated calls after unsupported results.

Account followers_count snapshots show net account changes. Per-post conversion is shown only if Meta explicitly returns media follows for that Feed post, computed as media_follows / media reach. Reels do not borrow account follower change. Aggregate sum-of-post reach is not deduplicated unique account reach.

## Learning safeguards

Only confirmed sent runs, source=insights, 72-hour horizon, Meta-observed reach + shares + saved, non-abnormal ratios and at least 50 reach per post are eligible. New observations do not replace or rewrite historic rows. Read-only 90-day reporting de-duplicates 24h/72h records by run ID.

Feed topic/language: minimum 18 measured posts and 8000 summed post reach, with two cohorts of at least 6 posts/1500 reach each. Reel hook/language: minimum 16 measured posts and 6000 reach, with two cohorts of at least 5 posts/1200 reach. A leading cohort must have a meaningful absolute/relative improvement, conservative nonoverlapping post-level score intervals, and remain ahead in both earlier and recent halves. The samples are observational; they cannot establish causal effects.

Without these conditions, existing content mix and prompt guidance remain unchanged. With sufficient evidence, the AI topic or hook ideation prompt receives only a short reference to a historically better-performing topic family. It is never a factual citation, forced recommendation, new article, automatic publish, or change to an approved asset.

## UI and security

The Marketing > Growth Analytics panel displays official per-post reach, shares/reached, saves/reached, Reel average watch ratio, optional Feed media follows and conversion, plus an account-only follower/non-follower breakdown. A dash means not observed. The report is read-only, bilingual, mobile-responsive, and administrator protected by the existing Marketing API authorization checks.

Database migration 20261012103000_instagram_performance_learning.sql is additive and does not alter existing post/media data. Edge function roundy-marketing imports insight-parser.ts and insights-worker.ts while retaining the prior publisher, approval logic and custom scheduler authentication. Old signed publications and uncertain Meta publishing attempts are unchanged.

Verification includes TypeScript, full npm test, Meta worker mocks (missing vs zero, unsupported APIs, once-daily account claims), stable cohort/outlier learning tests, publishing mocks, UI mobile layout and image QA. After DB migration deploy updated Edge files and confirm active version, merge after CI, verify Vercel READY and exact roundy.team production Git SHA.

Meta Instagram API reference: https://www.postman.com/meta/instagram/collection/6yqw8pt/instagram-api