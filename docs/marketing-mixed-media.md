# Roundy Instagram Mixed-Media & Approved Photo Reuse

## Editorial media contract

New 5-card Magazine Editorial carousels can explicitly choose which visual card is AI-generated (cover, context or one of the two insights). The remaining three visual cards use real licensed photographs. Selecting no AI instead requires **four** reviewed photographs (cover, context and two insight cards). The fifth Editorial Closing stays text-only. A 3-card carousel retains two real-photo visual cards and a text-only closing; it cannot quietly lower the real-photo minimum to insert AI. Cards are 1080×1350 (4:5).

This is one carousel containing both media types. The editor no longer requires choosing either real photos or AI for the entire carousel. The AI image is an editorial illustration, never factual evidence of a specific real venue or event. The caption records the AI card number and full original real-photo credits.

## Human-operated reuse

In **Admin → Marketing → Content studio → Draft**, the image composer shows every visual card, its type, assigned photo, approval state, source and license. **Choose approved photo** opens a searchable library containing previously reviewed archived photos (not newly sourced random candidates). The admin can explicitly assign an eligible photo to an eligible card even if its original topic differs or it has been used recently. The chosen archive file, source metadata, and review status remain immutable. The same photo cannot occupy two slots in a carousel.

The automatic **Find photos for missing slots** action fills only unassigned positions and never displaces manually selected photos. New provider results remain pending until a human reviews the original license, rights and people/trademarks. Missing photos never silently become AI filler.

Changing the AI card or assigned photo on an unapproved draft clears previously rendered images and invalidates quality approval, requiring a fresh render and seven publication checks. Scheduled and published snapshots cannot be altered. All writes use admin-only routes and service-role DB functions with revisions and source-rights checks.

## Existing assets and production guardrails

- Old draft v1 `ai_thumbnail_enabled` policies still resolve to AI on cover (slot zero).
- No changes are made to the original images in Instagram, to approved image archives, or to already scheduled publications.
- The photo library provides archived, time-limited preview URLs for previously approved assets. Failed preview signing does not disable browsing.
- Existing 90-day automatic reuse cooldown remains in effect for unattended search. Intentional admin reuses bypass automatic selection rules but never rights checks.
- The default uses no new image AI. Mixed posts require three approved photos before generating their one selected AI card; photo-only five-card posts require four approved photos and do not call image AI.
- Tests: `npm test` (mixed-media policies, source preservation, UI regression), `npm run typecheck`, `npm run build`.
