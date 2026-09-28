# Roundy Design Contract

Roundy is a mobile-first offline social product for people in Seoul. The interface should feel curated, human and confident rather than like a generic SaaS dashboard or dating-app clone.

## Visual system

- Primary accent: `#ff6666`
- Ink: `#20211f`
- Paper: `#fffefa`
- Surface: `#f3f3ee`
- Muted text: `#6b6f65`
- Border: `#dedfd7`
- English type: DM Sans
- Korean type: Noto Sans KR when available, with compact line-height around 1.2 for display/UI copy.
- Prefer flat color, photography, borders and typographic hierarchy. Avoid gradients, glassmorphism, decorative blobs and excessive shadows.
- Use pills only for genuine status/category metadata. Do not make every label or action a pill.

## Layout

- Design for 390–430px mobile widths first.
- Desktop should preserve the same visual hierarchy rather than becoming a separate desktop product.
- Major sections use whitespace and hairline dividers before adding cards.
- Prefer one strong visual idea per section.
- Keep primary actions obvious and limited.
- Photos are center-cropped and should carry more visual weight than decorative UI.

## Product language

### Discover
Discover explains the two Roundy experiences first, then shows events. It is not just an event catalog.

### 1:1 Mingle
Core idea: meet the person before the profile.
- 15-minute 1:1 rotations.
- Random nickname at check-in.
- Age, job and school are not part of the first impression.
- Basic profile appears later in the conversation.
- After all rotations, each attendee may choose up to 3 people.
- Only mutual choices become matches.

### Business Talk
Core idea: skip networking small talk and start with a topic worth discussing.
- English-first small-group conversations.
- One curated topic gives strangers a reason to go deeper quickly.
- No elevator-pitch requirement or forced open networking.
- Built from operating experience from the earlier 1 Cup English community.

## Interaction rules

- Motion should be restrained and functional.
- Respect `prefers-reduced-motion`.
- Touch targets should be at least 44px.
- Focus states must remain visible.
- EN/KR should have equivalent information architecture, not merely mechanically translated text.
- Never expose private participant profiles before the product rules allow it.

## UI review checklist

For every meaningful public UI change:
1. Check 390x844 and 430x932.
2. Check desktop layout.
3. Verify English and Korean.
4. Check text wrapping, overflow, crop, spacing and focus states.
5. Verify primary navigation and calls to action.
6. Compare the rendered page against the intended hierarchy, not just the JSX.
