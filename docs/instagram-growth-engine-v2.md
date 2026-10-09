# Roundy Instagram Growth Engine v2 (opt-in)

## Objective

Grow a relevant, real audience before the Roundy business model is finalized. Roundy cannot control Instagram's recommendation algorithm; this engine controls Roundy's own editorial selection, scheduling and measurement.

Audience: international residents/visitors in Seoul and Koreans interested in cosmopolitan Seoul life. Avoid tying the account solely to dating or any unconfirmed future product offer.

## Editorial experiment

Baseline 100-post distribution; these are NOT Meta ranking weights:

| Pillar | Weight | Implementation |
| --- | ---: | --- |
| Verified Seoul discoveries/trends | 35% | Source-linked seoul_trend fact packs, otherwise evergreen korea_life |
| Korean life/culture | 25% | korea_life, situation-based bilingual editorial |
| Original relatable humor | 20% | meme_remix |
| People/conversation | 15% | conversation_prompt |
| Roundy identity | 5% | Existing prelaunch brand campaign; human claim review |

Day slots use deterministic 100-day weighted round-robin; 5/7 slots are English and 2/7 Korean. Existing research validation, photo licensing, content quality checks, human approval and daily AI cost controls remain in place.

growth_mode_enabled is false by default. Enable via Admin > Marketing > Automation only after the website code deploys. This affects future automatic daily planning, not old drafts or live events.

Growth dashboard: seven-day calendar, topic/language evidence and confidence status. Reel candidate means FORMAT RECOMMENDATION ONLY. The current Meta publisher supports JPEG posts/carousels, not an integrated video production/publish pipeline.

## Learning policy

Only use media insights with observed reach; prefer latest horizon (72h over 24h) per unique marketing run ID. Never sum multiple horizons for the same post. Compute observed saves and shares per 100 reach, with topic and language cohorts.

Until 30 measured posts, 5,000 cumulative reach, and at least 5 posts / 500 reach in each non-brand cohort, retain baseline mix. After minimum evidence, cap each cohort's allocation multiplier to 0.8-1.2, then normalize non-brand weight to 95%, keeping brand at 5%.

Posting-time optimizer ignores snapshots below 50 reach and uses measured slots only after >=15 qualifying posts and >=3,000 total reach. Earlier extremely small-sample interaction rates must not determine posting times.

Account-level followers: production now has an admin-readable, service-role-written daily snapshot table. The Instagram worker attempts a read-only profile query for followers_count only on its existing authenticated scheduler, once per Korea-local date. Missing Meta scopes/fields never write a false zero and never block posting. On deployment, the Growth tab shows the latest count and 7/30-day net changes when historical reference days exist. These totals are NOT per-post follower attribution or a profile-to-follow conversion funnel; the media-insights collection has no such metric. Never represent shares/saves as follower acquisition.

## Human workflow

1. Review source confidence, content relevance and the next seven-day plan.
2. Keep daily guarded content generation within the existing budgets.
3. Human review of all factual claims, translation quality, image licenses, copyright and carousel slide quality.
4. Publish ONLY through the existing explicit approval gate. Use original 9:16 Reels when separately filmed/edited and manually managed; this release does not publish videos.
5. Compare 24h and 72h performance without prematurely naming winners.

No fake followers, bought engagement, scraped personal profiles, unsolicited DM automation, copyrighted meme reposts, invented trend popularity, unverified place information or deceptive testimonials.

## Later implementation

Phase 2: 9:16 native video production (licensed or owned material), subtitle/title cover editor, rights-review queue, Meta Reel publishing action and asynchronous publish reconciliation.

Phase 3: Verify Meta followers_count on the connected account, inspect consecutive daily account snapshots, and consider separate authorized profile-visit metrics if supported by permissions. Do not claim single-post causality from follower count changes.

Phase 4: controlled hook variations, organic creator collaborations with permission, and eventual pivot-relevant conversion tests.
