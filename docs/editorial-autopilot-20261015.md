# Editorial Autopilot — source-to-story automation

## What runs without human intervention
Daily KST research discovers public dating opinions/interviews and Seoul dating guides. The worker checks provider-backed links, excludes duplicates, scores editorial relevance (not projected engagement), and generates three original hooks and an editable three-card storyline. It saves each valid candidate for editorial review. No third-party media is downloaded or republished.

## Required human approvals
1. **Editorial story selection:** Approve or reject a proposed hook/angle/storyboard. Approving automatically starts the existing unpublished canonical content workflow.
2. **Media rights:** The existing photo library requires explicit approval for newly sourced photography.
3. **Publication:** The existing final approval gate still owns all Instagram publications. There is no content posting schedule in this feature.

## Schedule, safeguards, and limitations
The Supabase hourly job wakes only in the configured Seoul hour, defaults to 08:20 KST, and reserves a unique key per KST date. Administrators may pause automated discovery or explicitly request an extra scan. The default daily limit is two scans, $0.12 accounting reservation each, within existing global AI budget controls. Completed and uncertain external calls are never automatically retried.
OpenAI web search collects source URLs with verified annotations. Formatting is a separate strict-schema request. Seoul guide candidates need a second independent source. Source dates, likes, views, shares, and venue details are not invented. Public posts are editorial inspiration rather than reusable commercial footage.
New records use RLS, administrator read access, service-role writes, immutable scan audit, and explicit review attribution. Approved content still passes the existing research, media sourcing, rendering and manual publication checks.

## Deployment
Apply 20261015090000_editorial_autopilot.sql and 20261015090100_editorial_autopilot_cron.sql in order. Deploy the verified main commit. The new autopilot initially starts disabled; enable only after production route/security checks. Run an optional bounded manual scan, confirm original URLs, approved review state, and resulting *unpublished* content record. No real Instagram publication is part of the smoke test.