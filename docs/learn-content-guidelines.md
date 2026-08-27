# `/learn` content guidelines

Guidance for anyone writing or reviewing articles in the `/learn` ("Snow Sports 101") public section. The goal is informational content that helps newcomers get oriented — not an instructional program, and not a substitute for qualified professionals. See `chattersnow-web#259` and the content-approach decision at `planning/decisions/2026-08-26-learn-section-content-approach.md`.

## Tone

Write as an orientation guide, not a how-to program: explain what a thing is and why it matters, point the reader to the right person or resource for anything that requires judgment specific to them. Avoid language that reads as a certification, lesson plan, or personalized recommendation ("do X," "you should set Y to Z") — prefer "typically," "as a starting point," "a [shop fitter / certified technician / instructor] can confirm."

Every article must be original writing — no copying or lightly paraphrasing third-party sites, brand marketing copy, or other published guides.

## Content categories and rules

- **Technique and safety**: explain the concept and the factors involved, never prescribe a specific setting or instruct a specific physical technique. The existing binding-DIN section (`chattersnow-web/src/app/(public)/gears/sizing/ski-sizing-sections.tsx`) is the reference example — it explains what DIN is and what it depends on, then defers the actual setting to a certified technician.
- **Injury and physical risk**: never diagnose, treat, or suggest a course of action for an injury. Point the reader to "seek medical attention" or a qualified professional and stop there.
- **Pricing**: always label numbers as estimates ("typically," "around," "as of [rough timeframe]"), never as quotes or guarantees. Prices change and vary by region/retailer.
- **Third-party brands, shops, and mountains**: mentions must be editorial (explaining what something is or how it's commonly categorized), never an implied endorsement or recommendation. Don't reproduce brand marketing language, logos, or copyrighted descriptions — describe in our own words.

## Every article should end with

A short disclaimer appropriate to its content (see the binding-DIN example above for tone), in addition to the section-wide `EducationalDisclaimer` banner rendered by `chattersnow-web/src/app/(public)/learn/layout.tsx` on every `/learn` page.

## Review checklist

- [ ] No prescriptive settings, personalized recommendations, or diagnoses
- [ ] Prices (if any) labeled as estimates
- [ ] Third-party mentions are editorial, not promotional, and not copied from another source
- [ ] Original writing, not paraphrased from an external site
- [ ] Reads as informational, not as a certification or lesson plan
