# Constituent area UX audit — `/my`, its four children, and the claim

Findings-only audit of the public constituent area, prompted by `/my` rendering without the margin and padding every other public page has. Run against `origin/development` (`62b8dd74`) on 2026-09-16.

**This is a source audit, not a browser session.** `constituent_accounts` is the first module in the catalog to default to off and the seeded tenant does not have it, so `requireConstituentArea()` 404s all five routes on a stock local stack (`src/lib/constituent/guard.ts`) and `e2e/a11y-routes.ts:53-57` skips every one of them. Nothing below depends on a rendered page — each finding is read off the source and the migrations — but that same gate is why none of it was caught before, and it is finding 3.

**Scope.** The five routes of the area, the claim flow that feeds it, and the staff-visible consequences of what the claim form collects. The area shipped as epic #1160's five sub-issues — #1161 session and shell, #1162 claims, #1163 history, #1164 self-edit, #1165 acting — merged between 2026-09-14 and 2026-09-16. Each added a page or a section to the same area; this is the first pass over it as a whole.

**Status.** Findings 1, 2, 3, 9, 11 and 13 are fixed — #1175 landed the way in and turned the module on for the seed, #1179 gave the area its page shell and its boundaries, #1180 gave it a nav. The rest are open and unowned. The findings below are left as they were written, in the present tense of 2026-09-16; the Status column is the record of what has moved.

| Route               | Purpose                     | Ends with                         |
| ------------------- | --------------------------- | --------------------------------- |
| `/my`               | history, claim, and hub     | `<SignOutButton />`               |
| `/my/details`       | 14 self-editable fields     | underlined "Back to your account" |
| `/my/hours`         | log volunteer hours (#1165) | underlined "Back to your account" |
| `/my/notifications` | email preferences (#1165)   | underlined "Back to your account" |
| `/my/sign-in`       | Google + email/password     | —                                 |

---

## Summary

| #   | Finding                                                                            | Area        | Severity | Status               |
| --- | ---------------------------------------------------------------------------------- | ----------- | -------- | -------------------- |
| 1   | No `PageShell` on any of the five routes: no padding, no column, no `<main>`       | Layout/a11y | Serious  | Fixed (#1179)        |
| 2   | Four destinations, no navigation surface — a `<p>` of buttons and three back links | IA          | Serious  | Fixed (#1180, #1175) |
| 3   | The area is excluded from every automated scan and has no e2e spec                 | Test infra  | Serious  | Fixed (#1175, #1179) |
| 4   | Fourteen self-edit fields under a card titled "Everything else"                    | IA          | Moderate | Open                 |
| 5   | Form errors are page-bottom alerts, bound to no field                              | Forms       | Moderate | Open                 |
| 6   | The claim form implies the typed email and phone affect matching; they do not      | Content     | Moderate | Open                 |
| 7   | The claim form is also an enrollment form and never says so                        | Content     | Moderate | Open                 |
| 8   | Address line 2 has no visible label                                                | a11y        | Moderate | Open                 |
| 9   | Sign-out is a button in the page body, not in chrome                               | IA          | Moderate | Fixed (#1175)        |
| 10  | Required markers typed into label strings, defeating `FieldLabel required`         | a11y        | Minor    | Open                 |
| 11  | No `loading.tsx`/`error.tsx`; sign-in's Suspense fallback is `null`                | Perf/feel   | Minor    | Fixed (#1179)        |
| 12  | Pending affordances differ between the area's forms                                | Consistency | Minor    | Open                 |
| 13  | No `robots: { index: false }` on a signed-in private area                          | Semantics   | Minor    | Fixed (#1179)        |
| 14  | `review_person_claim` discards the phone and handle the claimant typed             | Data        | Moderate | Open                 |
| 15  | "Preferred mountain" and ski/snowboard levels are hardcoded in a multi-tenant form | Tenancy     | Minor    | Open (out of scope)  |

---

## 1. No `PageShell` on any route — Serious

`src/app/(public)/my/layout.tsx:21-22` returns `children` bare after the module gate. Every other public segment wraps its pages in `PageShell` (`src/components/page-shell.tsx:12-20`) — in the segment's own `layout.tsx` for ten of them (`(public)/contact/layout.tsx:10` is the canonical one), per-page for the rest. All five `/my` pages are a bare `<div className="space-y-8">` (`my/page.tsx:49`), except sign-in's `<div className="mx-auto w-full max-w-md space-y-8">` (`my/sign-in/page.tsx:30`).

`PageShell` is four things at once, so its absence is four defects rather than one:

| What `PageShell` supplies                | Where                  | Consequence of its absence                                                                                                                                        |
| ---------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `px-6 py-8 sm:px-10`                     | `page-shell.tsx:17`    | Content sits flush against the viewport edge — the reported symptom.                                                                                              |
| `mx-auto max-w-6xl`                      | `page-shell.tsx:6,19`  | Prose and cards run the full window width on a desktop monitor.                                                                                                   |
| `app-shell` → `flex: 1`                  | `globals.css:158`      | `<body>` is `min-h-full flex flex-col` (`src/app/layout.tsx:41`), so a page shorter than the viewport does not grow and the footer rides up under the content.    |
| `<main id="main-content" tabIndex={-1}>` | `page-shell.tsx:12-16` | The layout's `<SkipLink href="#main-content" />` (`(public)/layout.tsx:111`) jumps to a target that does not exist, and the page ships no `main` landmark at all. |

The last one is the serious half. `src/components/skip-link.tsx` documents that the target must be focusable or the jump does nothing; here there is no target. `src/components/page-shell.dom.test.tsx:6` pins the invariant for the component and `e2e/skip-link.spec.ts:10,53` pins it for three routes ("exactly one main landmark per page") — neither covers `/my`, which is why five merged pull requests did not notice.

**Suggested fix.** Keep `my/layout.tsx` as gate-and-slot and give each page its own `PageShell`, following the precedent `(public)/events/layout.tsx:3-18` already documents: the pages do not share a column width, and wrapping in the layout would force one and risk nesting a second `<main>`.

| Route               | `maxWidth`  | Why                                                        |
| ------------------- | ----------- | ---------------------------------------------------------- |
| `/my`               | `max-w-3xl` | One column of cards; `max-w-6xl` sets 120-character lines. |
| `/my/details`       | `max-w-2xl` | Public type runs larger than the portal's `max-w-xl`.      |
| `/my/hours`         | `max-w-2xl` | Single form.                                               |
| `/my/notifications` | `max-w-2xl` | Single form.                                               |
| `/my/sign-in`       | `max-w-md`  | Delete the page's own `mx-auto w-full max-w-md` wrapper.   |

Same defect, different section, worth folding in: `(public)/artwork/[code]/page.tsx:70` hand-rolls the padding and the column but still ships no `<main>`.

## 2. Four destinations and no navigation surface — Serious

The area had one child when #1164 landed and has four now. #1165 answered the growth with a row of outline links inside a paragraph (`my/page.tsx:75-96`):

```tsx
<p className="mt-4 flex flex-wrap gap-3">
  <Link
    href={`${MY_PATH_PREFIX}/details`}
    className={buttonVariants({ variant: "outline" })}
  >
    Edit your details
  </Link>
  {history.volunteering.length > 0 && (
    <Link
      href={`${MY_PATH_PREFIX}/hours`}
      className={buttonVariants({ variant: "outline" })}
    >
      Log your hours
    </Link>
  )}
  <Link
    href={`${MY_PATH_PREFIX}/notifications`}
    className={buttonVariants({ variant: "outline" })}
  >
    Your emails
  </Link>
</p>
```

Three problems, worst first:

- **It is not a navigation landmark.** A `<p>` used as a flex container of links is not announced as navigation and cannot be jumped to. The area has no `<nav>` of its own anywhere.
- **Its membership changes per person.** "Log your hours" renders only when `history.volunteering.length > 0` (`my/page.tsx:82`). A control that is sometimes absent cannot be learned — and it is absent for exactly the person who is about to volunteer for the first time and wants to know whether logging hours is a thing here.
- **It exists only on the hub.** Each of the three children ends with a plain `app-muted text-sm underline` "Back to your account" as the last element of the page (`details/page.tsx:95`, `hours/page.tsx:71`, `notifications/page.tsx:68`). So `/my/details` → `/my/notifications` costs two navigations, and the two ends of one hop are different species of control: an outline button out, an underlined text link back.

The comment above that block argues the links earn a place there "rather than in a nav bar of three", citing `docs/portal-navigation.md:112-119`. That rule forbids a destination that appears in **no navigation surface** — and a paragraph is not one. With four sibling jobs the rule's first clause now governs instead: _navigation for different jobs_.

Separately, and the half **#1175 owns**: nothing on the public site links _into_ the area. `NAV_GROUPS` (`src/lib/public-nav.ts`) has no entry, the footer derives from the same list, and every inbound reference is an internal redirect (`src/proxy.ts`, `src/app/auth/callback/route.ts`, `(public)/confirm-email-change/page.tsx`).

**Suggested fix.** One `src/app/(public)/my/my-nav.tsx`: a real `<nav aria-label="Your account">` rendered in the same position on all four signed-in pages — directly below the intro paragraph, inside the header `<section>`, `flex flex-wrap gap-3`, every control `min-h-11` per this repo's touch-target standard (`docs/public-site-ux-audit.md` finding 8). The current page's own entry renders as text with `aria-current="page"` rather than as a link. Show every destination always and let `/my/hours` explain itself to someone with no volunteering yet, rather than hiding the entry. The three bottom back links go away; keep one repeat of the nav at the bottom of `/my/details` alone, since it is the only page long enough that returning from the bottom is real.

Give it a `showSignOut` prop. That is the seam with #1175: if the header account menu lands, `MyNav` renders no sign-out.

## 3. The area is scanned by nothing — Serious

`e2e/a11y-routes.ts:53-57` skips all five routes, each with the same reason — the seeded tenant does not have `constituent_accounts` on:

```
"/my":               "module off for the seeded tenant (#1161)",
"/my/sign-in":       "module off for the seeded tenant (#1161)",
"/my/details":       "module off for the seeded tenant (#1164)",
"/my/hours":         "module off for the seeded tenant (#1165)",
"/my/notifications": "module off for the seeded tenant (#1165)",
```

There is no e2e spec for the area either. Every finding in this document survived five merged pull requests because nothing looks at these pages, and finding 1 in particular is precisely the class of defect `test:a11y` exists to catch.

**Suggested fix.** #1175 already scopes enabling the module in `supabase/seed.sql` and deleting the skips, and its own comment at `a11y-routes.ts:44-52` says that is the whole change. Land that first; re-record `e2e/a11y-baseline.json` **before** fixing anything else, so the baseline captures the damage rather than hiding it. Then add `/my/sign-in` to `e2e/skip-link.spec.ts`'s `ROUTES` (it is reachable signed out) and a signed-in variant covering the other four.

## 4. Fourteen fields under a card titled "Everything else" — Moderate

`set_my_contact_details()` takes fourteen columns, and that argument list _is_ the self-edit allowlist — `docs/spec/people.md` §5.9 makes the point that the writable set is fixed at migration time because there is no field map (`supabase/migrations/20260916080000_constituent_contact_details.sql:398-412`): preferred name, phone, pronouns, Instagram handle, preferred mountain, riding discipline and two experience levels, and six address columns.

`my/details/page.tsx` renders them as two cards: **"Email"** (`:70-72`) and **"Everything else"** (`:85-87`). The second title is doing no work, and it is a strange sibling for the first — one names a field, the other names a remainder.

The grouping already exists one level down. `details/contact-form.tsx` has three `FieldLegend`s — "How to reach you" (`:100`), "Where to send things" (`:156`), "What you ride" (`:231`) — separated by `FieldSeparator`s. The card title throws that structure away and then the form rebuilds it.

**Suggested fix.** Four cards, and let the existing legends be the headings:

| Card | Heading                  | Fields                                                          |
| ---- | ------------------------ | --------------------------------------------------------------- |
| 1    | **Sign-in email**        | `EmailChangeForm`, unchanged                                    |
| 2    | **How to reach you**     | preferred name, pronouns, phone, Instagram                      |
| 3    | **Where to send things** | street address, apartment/suite, city, region, postal, country  |
| 4    | **What you ride**        | rides, preferred mountain, ski experience, snowboard experience |

Cards 2–4 take no `CardHeader`; the `FieldLegend` is the visible heading, styled to match `CardTitle`, which is also what a screen reader announces on entering any control in the group. Drop the `FieldSeparator`s — the card borders now do that job.

Keep cards 2–4 inside **one `<form>` with one save**. `saveMyContactDetailsAction` writes the whole allowlist, so a per-card partial payload would clobber unsent columns unless the action learns field presence first. Do not make it sticky: a sticky action bar exists nowhere in this codebase, and the public convention is explicit — submit is the last child of the `FieldGroup`, left-aligned `w-full sm:w-fit`. What makes one save survivable at the foot of a long page is dirty-gating it the way `/portal/account`'s `AccountForm` does, so the button is never a live control you scrolled to for nothing.

## 5. Errors are bound to nothing — Moderate

Every form in the area surfaces one `Alert variant="destructive"` above the submit and binds nothing to a field. On the fourteen-field contact form the alert is at `details/contact-form.tsx:337`, while the message it carries may be about the Instagram handle (`src/lib/constituent/contact.ts:93-98`) whose input is hundreds of pixels above it. Nothing gets `aria-invalid`, nothing gets `aria-describedby`, and focus does not move.

`FieldError` already exists and is exported (`src/components/ui/field.tsx:204`).

**Suggested fix.** Have `saveMyContactDetailsAction` return `{ error, fieldErrors? }`. Render a `FieldError` per field with `aria-invalid` and `aria-describedby` on its input; keep the summary alert above the submit but list the failing fields as in-page anchors; move focus to the first invalid input on a failed submit.

While here: success is currently a bare `role="status"` paragraph reading "Saved." beside the button (`details/contact-form.tsx:353-354`). Make it an inline `Alert` with the `rainbow-accent mb-2 w-10` the public forms use. This is an edit form rather than a send form, so it must **not** follow the other half of that convention and replace itself — the record view has to stay on screen. Worth a comment saying so, since it is the one deliberate deviation.

## 6. The claim form describes matching it does not perform — Moderate

`person_claim_candidates()` (`supabase/migrations/20260916060000_person_claims.sql:225-317`) matches on exactly three things, in tiers:

1. the **verified** address from `auth.users` — `v_verified_email`, never the `stated_email` typed into the form (`:269,289`);
2. the normalized Instagram handle;
3. trigram similarity on `name`/`preferred_name`, threshold `0.45`.

So typing a different address into the form's Email field changes nothing about who is proposed, and the phone number is never consulted at all. Both are evidence for the human reviewer and nothing else.

The form presents all five fields as peers in one flat `FieldGroup` (`claim-form.tsx:64-112`), prefills Email from the verified address (`:85`), and its own doc comment says "Three fields do the matching" (`:16`) — true only in the case where the claimant leaves the prefill alone.

**Suggested fix.** Two fieldsets, which say which fields do the matching without saying whether anything matched:

- **"What we match on"** — the name we'd have on file (required), and Instagram. Promote the handle here and give it the reason the code already knows (`claim-form.tsx:17-19`): it is often the only identifier on a record created from an event registration.
- **"For the person reviewing"** — another email you may have used, phone, and what would help us find you.

Turn the verified address into a read-only "Signed in as …" line above the form rather than a prefilled input, because prefilling implies that typing an address is what matches you. Keep the typed email, relabelled and demoted — see finding 7 for why removing it would lose something.

The constraint on any copy change is the one `claim-actions.ts:13-24` and the migration at `:326-334` set out: **every visible string must be identical for every reader and conditioned on nothing.** "We already have a record for this address" answers "is this person a donor here?" for anyone who asks. Describing the _mechanism_ is safe; describing an _outcome_ is not. Two static fieldset legends leak nothing.

## 7. The claim form is also an enrollment form and never says so — Moderate

`review_person_claim()` with a null `p_person_id` does not refuse — it **creates a `people` row** from the claim (`20260916060000_person_claims.sql:497-509`). The staff-side copy is explicit about this (`portal/(app)/people/claims/claim-review.tsx`: "Nothing in the directory resembles what they told us. Approving will create a new record for them."). The claimant-side copy is not: the form says "Tell us who you are and we will connect this account to your history with us" (`claim-form.tsx:60-63`) and the success alert says "Someone will check it against our records and link your account" (`:48-52`). Both describe one of the two outcomes.

**Suggested fix.** State both, unconditionally, in the intro and again in the success alert — something like "If we can't find you, we'll start a record from what you tell us here. Either way, a person checks this and you'll hear back." That is true for every reader and reveals nothing about whether a record exists, so it satisfies finding 6's constraint. Give the success alert the `rainbow-accent mb-2 w-10` the public convention uses.

## 8. Address line 2 has no visible label — Moderate

`details/contact-form.tsx:159-171` is one `Field` holding two inputs: "Address" with a real `FieldLabel`, and a second input underneath carrying only `aria-label="Address line 2"` (`:167`). A sighted user gets an unexplained second box; anyone using speech gets a label that never appears on screen, so the two populations are working from different documents.

**Suggested fix.** Split it into two `Field`s with real labels — "Street address" and "Apartment, suite, etc." Structural, and it falls out of finding 4's regrouping for free.

## 9. Sign-out is a button in the page body — Moderate — **#1175 owns this**

`<SignOutButton />` is the last child of `/my` (`my/page.tsx:138`), an outline button hanging below the history cards with nothing separating it, and it appears on no other page in the area. Ending a session therefore means navigating back to the one page that has the button. The portal puts sign-out in shell chrome instead — `portal/(app)/shell/portal-shell-desktop.tsx:93-108` (SidebarFooter) and `shell/mobile-nav.tsx:325-330` — behind a confirmation dialog the constituent area does not have.

It sits in the page body because the area has no shell of its own; that is the actual gap, and it is what #1175 closes.

**Do not fix here.** `sign-out-button.tsx:10-24` is load-bearing and must survive the move: `scope: "local"` is deliberate, because one account serves both surfaces and a global sign-out from the public site would also end an administrator's portal session in another tab.

## 10. Required markers are typed into label strings — Minor

`FieldLabel` grew a `required` prop in #1070, and the reason is in its own comment (`src/components/ui/field.tsx:114` onward): the marker is `aria-hidden` because the control already carries `required`/`aria-required`, and an "(required)" in the label on top of that is announced twice — "Name required, required".

Three labels in this area type the asterisk into the string instead, which is exactly what that prop exists to prevent: `claim-form.tsx:66` ("Your name \*"), `sign-in/sign-in-form.tsx:195` ("Email \*") and `:206` ("Password \*").

Both forms also put `<RequiredFieldsNote />` at the bottom of the `FieldGroup` (`claim-form.tsx:114`, `sign-in-form.tsx:218`). Everywhere else in the codebase it is the first child — a legend read after the fields is a legend read too late.

**Suggested fix.** `<FieldLabel required>` in all three, and move both notes to the top.

## 11. No loading or error boundaries — Minor

There is no `loading.tsx` and no `error.tsx` anywhere under `src/app/(public)/my/`, while every other public section has at least the former. `/my` does two sequential waves of Supabase reads — the claim and session reads, then history and vocabulary once a `personId` is known — so navigation blocks on all of them with nothing on screen.

`my/sign-in/page.tsx:48` uses `<Suspense fallback={null}>` around the form (required, because the form reads `useSearchParams`), so the card renders as an empty box and then pops.

**Suggested fix.** A `loading.tsx` per route on the pattern of `(public)/contact/loading.tsx`, an `error.tsx` at `/my`, and a form-shaped skeleton in place of the sign-in `null`.

## 12. Pending affordances disagree — Minor

"Send request" keeps its label and prepends a `Spinner` (`claim-form.tsx:123-124`). "Save", "Send a confirmation link", "Sign out" and "Confirm this address" all swap the label to "…ing…". The claim form is the only outlier in the area.

**Suggested fix.** Swap it to "Sending…".

## 13. No `robots` directive on a private area — Minor

Three public routes that are private in spirit set `robots: { index: false, follow: false }` in their metadata — `(public)/confirm-email-change/page.tsx:11`, `confirm-notification-email/page.tsx:9`, `artwork/[code]/page.tsx:31`. None of the five `/my` routes does, and there is no `robots.ts` or `public/robots.txt` in the repository to cover them.

A crawler reaching `/my` is redirected to `/my/sign-in` by `requireConstituentSession()`, so nothing leaks. But `/my/sign-in` itself is indexable, and an organization's sign-in page turning up in search results under its own domain is not what anyone chose.

**Suggested fix.** Add the directive to all five `generateMetadata` functions.

## 14. Approval discards the phone and handle the claimant typed — Moderate

`person_claims` stores `stated_phone` and `stated_instagram_handle` (`20260916060000_person_claims.sql:56-60`), and the form asks for both. When a claim is approved against an existing record they are ignored, which is right — the directory's own values win. When it is approved against **no** record, `review_person_claim()` creates the row from `stated_name` and `stated_email` only (`:497-509`); the phone and the handle are dropped on the floor.

So a new constituent is asked for a phone number and an Instagram handle, a staffer approves them, and the record that results has neither. Since the handle is the identifier most likely to be the only one on a record made from an event registration — the reason the form asks for it at all — losing it on the create path is the worst case.

**Suggested fix.** Carry both onto the insert. This is a migration, not a copy change, and it wants its own ticket.

## 15. Chatter Snow's vocabulary is hardcoded in a multi-tenant form — Minor — out of scope

"Preferred mountain", "Rides", "Ski experience" and "Snowboard experience" are columns in the self-edit allowlist and labels in `details/contact-form.tsx:231-332`. `src/lib/lexicon.ts` carries four terms and none of them covers this, so a tenant that is a food pantry or a tool library shows its constituents a snowboarding profile.

Recorded because it is visible on the page this audit covers. It belongs with the lexicon and `people.role_labels` work rather than here, and the fix is a schema question before it is a UI one.

---

## Related

- `docs/public-site-ux-audit.md` — the 2026-09-01 audit this one is shaped after
- `docs/portal-navigation.md` — the navigation rule findings 2 and 4 turn on
- `docs/spec/people.md` §5.9 — the self-edit allowlist behind finding 4
- #1160 (epic), #1175 (the way in — owns findings 2's inbound half, 3 and 9), #1176 (spec home; §4 still forbids what `/my` does)
