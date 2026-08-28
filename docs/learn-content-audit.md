# Learn module content audit

Resolves the "define scope" blocker in `chattersnow-web#361`. Maps epic `chattersnow-web#256`'s proposed IA, priority order, and legal-risk tiers into a concrete per-category article list for the 7 categories that currently render the "Articles for this category are coming soon." placeholder in `src/app/(public)/learn/[slug]/page.tsx`. `park-riding-safety` is excluded — it already has content, shipped via the later, separately-scoped epic `chattersnow-web#269`, and was never part of #256's original 7-category IA.

Authors: follow `docs/learn-content-guidelines.md` for tone, per-topic risk rules, and the required per-article disclaimer.

Implementation pattern to replicate per category (already shipped for `park-riding-safety`): a `{category}-data.ts` typed article array + a `{category}-sections.tsx` renderer built on the shared `LearnSection`/`LearnDisclaimer` components (`src/app/(public)/learn/learn-section.tsx`), registered via two-line additions to the `CATEGORY_CONTENT`/`CATEGORY_NAV` maps in `src/app/(public)/learn/[slug]/page.tsx`. See `src/app/(public)/learn/park-riding-safety/park-riding-safety-data.ts` and `park-riding-safety-sections.tsx` for the reference implementation.

Risk tiers (per `docs/learn-content-guidelines.md`): 🟢 low-risk. 🟡 needs care — explain the concept, defer specifics/settings/diagnoses to a qualified professional, and end with an appropriate disclaimer.

This is a working backlog, not a final content list — adjust as categories are implemented.

## Getting Started (`getting-started`)

1. 🟢 First Day Guide: What to Expect at the Mountain — orientation to arrival, tickets/passes, the lessons desk, base area logistics. *(#256 priority topic: "First Day Guide")*
2. 🟢 What to Pack for Your First Day — clothing layers, essentials, what the resort typically provides vs. what to bring yourself. *(#256 priority topic: "What to Pack")*
3. 🟡 Skiing 101: The Absolute Basics — what skiing involves at a concept level; defers technique instruction to a lesson. *(#256 priority topic: "Beginner Ski/Snowboard Guides")*
4. 🟡 Snowboarding 101: The Absolute Basics — same framing, snowboard-specific. *(#256 priority topic: "Beginner Ski/Snowboard Guides")*
5. 🟢 Booking a Lesson vs. Going It Alone — decision factors to weigh, not a recommendation either way. *(extrapolated)*

## Gear & Sizing (`gear-and-sizing`)

1. 🟢 Gear 101: What You Actually Need for Your First Day. *(#256 priority topic: "Gear 101")*
2. 🟢 Buying vs. Renting: How to Decide. *(#256 priority topic: "Buying vs. Renting")*
3. 🟢 Skis vs. Snowboard: Choosing Your Sport. *(extrapolated)*
4. 🟡 Understanding Binding DIN Settings — explains the concept and what it depends on, defers the actual number to a certified technician (reference pattern: `src/app/(public)/gears/sizing/ski-sizing-sections.tsx`). *(extrapolated; explicitly named as the reference example in the content guidelines)*
5. 🟡 Helmets & Protective Gear Basics — safety-adjacent, informational only. *(extrapolated)*
6. 🟢 Used & Secondhand Gear: What to Check For. *(extrapolated)*

## Mountain Basics (`mountain-basics`)

1. 🟢 Trail Ratings Explained: Green, Blue, Black & Beyond. *(#256 priority topic: "Trail Ratings & Mountain Basics")*
2. 🟢 Reading a Trail Map. *(#256 IA)*
3. 🟢 Lift Types & How to Ride Them. *(extrapolated)*
4. 🟡 Terrain Types: Groomed, Moguls, Trees & Backcountry Basics — touches on conditions/risk, informational framing only. *(extrapolated)*
5. 🟢 Mountain Signage & Closures: What They Mean. *(extrapolated)*

## Snow Sports on a Budget (`budget`)

1. 🟡 What Skiing/Snowboarding Actually Costs — all figures labeled as estimates. *(#256 priority topic: "Cost of Skiing/Snowboarding")*
2. 🟡 Budget Guide: Getting on the Mountain for Less. *(#256 priority topic: "Budget Guide")*
3. 🟡 Discount Passes, Deals & Off-Peak Timing — pricing-adjacent, estimates only. *(extrapolated)*
4. 🟢 Renting vs. Buying on a Budget — budget-first framing, cross-links the Gear & Sizing article. *(extrapolated)*
5. 🟢 Finding Used Gear Without Overpaying. *(extrapolated)*

## Mountain & Lift Etiquette (`etiquette`)

1. 🟢 Mountain & Lift Etiquette Basics. *(#256 priority topic: "Mountain Etiquette")*
2. 🟢 Lift Line Etiquette. *(extrapolated)*
3. 🟢 Sharing the Trail: Right-of-Way Basics. *(extrapolated)*
4. 🟢 Uphill/Downhill Traffic & the Responsibility Code — links out to the published responsibility code, same pattern as the shipped park-riding-safety etiquette article. *(extrapolated)*

## Gear Care (`gear-care`)

1. 🟢 Gear Care 101: Between-Trip Basics. *(#256 IA)*
2. 🟢 Waxing & Base Care Explained. *(#256 IA)*
3. 🟡 Edge Tuning: What It Is and When to See a Shop — explains the concept, defers the actual tune to a shop (same deferral pattern as binding DIN). *(#256 IA)*
4. 🟢 Off-Season Storage Basics. *(#256 IA)*
5. 🟢 Knowing When Gear Needs Replacing. *(extrapolated)*

## Community & Inclusion (`community-and-inclusion`)

1. 🟢 Finding Your Place in the Snow Sports Community. *(#256 IA)*
2. 🟢 Beginner Buddy Guide: Riding with a Mentor. *(#256 IA)*
3. 🟢 Riding with Mixed Skill Levels in Your Group. *(#256 IA)*
4. 🟢 Overcoming First-Timer Intimidation. *(extrapolated)*
