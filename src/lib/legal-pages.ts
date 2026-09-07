/**
 * Whether the long-form legal documents (/privacy, /terms, /code-of-conduct)
 * are published to the public site.
 *
 * They are written and reviewed in the repository well before the board's
 * legal review signs them off, and an unapproved policy is worse than no
 * policy: it reads as the organization's binding position the moment it is
 * reachable. Production has never served these routes -- they 404 there today
 * -- so this flag exists to let the rest of `development` ship to `main`
 * without carrying them along.
 *
 * `LEGAL_LINKS` in `src/lib/public-nav.ts` stays the canonical list of the
 * three documents regardless: this gate controls exposure, not the content.
 * Two things consume it, and both are needed -- dropping only the footer links
 * would leave the unapproved text reachable at a guessable URL, which is the
 * outcome the review exists to prevent:
 *
 *   1. `src/app/(public)/layout.tsx` omits the footer's legal bar.
 *   2. Each document's own `layout.tsx` calls `notFound()`.
 *
 * To publish once legal approves: flip this to `true` and ship it. That is
 * deliberately a code change rather than an environment variable, so the
 * approval is reviewable and lands in the history with a date and an author
 * next to it.
 */
export const LEGAL_PAGES_PUBLISHED = false;
