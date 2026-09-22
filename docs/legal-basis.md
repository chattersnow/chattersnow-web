# The platform's legal basis

The three documents in `src/lib/legal-defaults.ts` — a privacy policy, terms of
use and a code of conduct — are what a tenant is served when it has published
none of its own. They are three of the four in `src/lib/legal-documents.ts`;
the fourth, the participant waiver, is the one the platform does not write. See
rule 5. Since #859 `/privacy` is served **unconditionally**, so from
the moment a tenant is provisioned this text is that organization's published
privacy policy, under its own name and its own brand.

That makes it the one thing in the codebase that speaks _as_ a customer rather
than to one, and the reason it needs an approval record at all.

## Reading it

```bash
bun run docs:legal              # every collection surface on: the maximal form
bun run docs:legal --minimal    # every surface off: the shortest a tenant is served
```

The script calls the same `platformLegalDocument()` the public routes call, so
what it prints is what is served. **Do not commit a rendered copy into this
repository.** A copy is correct on the day it is written and wrong at the next
commit, and a stale legal document that looks authoritative is worse than none
— the same argument the `PLATFORM_LEGAL_LAST_UPDATED` date exists to make.

The two renderings differ by a lot, and both matter to a reviewer: bullets,
retention rows and whole sections drop out when the collection surface behind
them is off (#1291), so a tenant running a contact form and nothing else
publishes a much shorter policy than a tenant running everything.

## The rules the prose is written under

Stated in full at the top of `src/lib/legal-defaults.ts`, and worth holding to
in any edit:

1. **Only what the software does.** Every factual claim is about behaviour in
   this repository. Where only the organization can answer — its governing law,
   its charitable status, the risks its activities carry — the section is absent
   rather than vague.
2. **No commitments on a tenant's behalf.** No response-time promises, no
   reviewer counts, no numbers a tenant has not agreed to.
3. **No links to routes that may not exist.** Every public page except the legal
   ones can be hidden per tenant, so the documents name the forms they describe
   rather than linking to them.
4. **Only what _this tenant's_ software does.** A bullet, a retention row or a
   section that belongs to a collection surface drops out when that surface is
   off.
5. **A document the platform cannot write, it does not write.** Rule 2 taken to
   its end. The participant waiver (#686) is a release of legal rights, which
   cannot be asserted for an organization that has not asserted it, so there is
   no `legal.waiver` entry in `PLATFORM_LEGAL_PROSE` and no neutral draft to
   fall back on. A tenant that has written none has nothing: `/waiver` 404s,
   the footer omits it, and its registration form asks about no agreement. The
   registry records this as `hasPlatformDefault: false`, and it is the only
   entry that carries it — `legal-defaults.test.ts` asserts that the flag and
   the prose cannot drift apart, and that a document which is always in force
   must have something to serve.

It is a starting point for an organization's own counsel to rewrite, not legal
advice, and the Site Content editor says so where the slot is edited.

## What approving means

Approving says: _this is what the platform is willing to assert, on behalf of an
organization that has said nothing, until that organization writes its own._

There is no board here. The platform's approver is its owner, unlike a tenant's
documents, which are approved by that tenant's own governance — Chatter Snow's
by its board, tracked in its own ticket.

**An approval is against a `PLATFORM_LEGAL_LAST_UPDATED` value.** Any change to
the prose bumps that constant in the same commit, which supersedes the approval
below and calls for a new row. A change that only removes text a surface no
longer applies to is still a change.

## Approval log

| Date       | Version approved   | Approver                | Scope and notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-23 | September 23, 2026 | Rickie (platform owner) | Adds a section to the terms of use, `items-we-give-away`, carried only by a tenant whose site takes item requests (#1367): what the organization gives away is given as-is, nothing is inspected, tested, serviced, repaired or certified, no safety-critical work is done on it, and having it checked is the recipient's to arrange. Every claim is about what the software and the organization running it do _not_ do, which is rule 1 — cataloguing donated equipment and passing it on is not an inspection, and saying so commits nobody to anything. The snow-sports specifics a first tenant needs (binding mounting, DIN setting, boot fitting) are deliberately absent: they are that tenant's own text. Its heading and its nouns resolve through the lexicon, so an organization that lends tools reads "tools" and has agreed to no different claim. The same paragraphs are what a requester reads above the box they tick on the public cart — one constant, `GEAR_AS_IS_SUMMARY`, held to the document by `legal-defaults.test.ts`. Approval requested in the pull request that adds it. |
| 2026-09-22 | September 22, 2026 | Rickie (platform owner) | Adds the volunteer-screening disclosure (#1360): a paragraph in "What we collect" saying the portal records only the outcome of a screening — which level, the date, and when the clearance runs to — and never the check, its result or anything a provider returns, plus a sentence in "Who can see it" that the outcome sits behind a separate permission from the rest of the volunteers module. Both are claims about the software rather than about any organization's process, checkable against `person_screenings`, which has no column a result could be written into. Adds the matching retention row. Shares its version string with the #686 row below: the constant is a date and both changes landed on it. Approval requested in the pull request that adds it.                                                                                                                                                                                                                                                                                                                           |
| 2026-09-22 | September 22, 2026 | Rickie (platform owner) | Adds one sentence to the privacy policy's event-registration bullet: where the organization asks somebody to accept a participant agreement before registering, the record of that acceptance — that it happened, when, and which version was shown — is kept with the registration (#686). Conditional in its own wording rather than gated on a collection surface, for the reason given in the code comment beside it. No other prose changed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-09-21 | September 21, 2026 | Rickie (platform owner) | First recorded approval of all three documents. Covers the text as rendered by `bun run docs:legal` at this version, which is the first to name Sentry in the privacy policy's subprocessor list (#1340). The prior state was not an approval: the documents had been served since #858 and #1291 with no reviewer and no record.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## What submitting a public form means

**Decided 2026-09-21 by the platform owner (#1318): submitting a public form is
not acceptance of the legal documents.**

The public forms — event registration, volunteer application, gear request,
contact — collect information. They do not take agreement to anything. A privacy
policy is a notice rather than a contract: it binds the organization whether or
not the visitor read it. Since #684 each of those forms says at the point of
collection what is done with what is entered and links `/privacy`, and the
footer links it on every page. That notice is the whole of what a submission
means.

Nothing asserts acceptance of the terms of use or the code of conduct either,
and that is a decision rather than an omission waiting to be fixed. Those two
routes 404 until a tenant adopts them (#859), so a site-wide agreement sentence
would have to disappear per tenant; and blanket assent to three documents nobody
opened is not what consent looks like.

Where the platform does take agreement, it is scoped to the thing being
submitted and worded by the organization for that purpose:

- **Artwork submissions** — an unticked box confirming the work is the artist's
  own, and agreeing to the call's own `rights_note` (#876, #877) where it has
  one. The timestamp is stored on the submission.
- **The participant waiver** (#686) — an unticked box beneath the organization's
  own agreement, shown in full at the point of registration rather than behind a
  link. `event_registrations.waiver_accepted_at` and `waiver_version` record
  when, and which version, both resolved server-side. Taken on the signed-in
  registration path too: holding an account is not agreement to anything.
- **Items given as-is** (#1367) — an unticked box on the public request form,
  beneath a summary in the platform's own words of what taking a donated item
  means. Declining it is declining the item, which is what makes it a gate
  rather than a notice. `gear_requests.as_is_acknowledged_at` records when, and
  `as_is_text` snapshots the wording that was on screen — resolved on the
  server from `src/lib/gear-as-is.ts`, never sent by the browser. Taken on the
  signed-in request path too, for the reason the waiver is: holding an account
  is not agreement to anything.
- **Photo and media consent** (#599) is the same shape when it lands: a real
  choice, and a box that can be left unticked.

What follows from this:

- No consent checkbox for the privacy policy on any public form. A box that
  cannot be declined dilutes the ones that can.
- No stored pointer to a legal document version on a submission **that did not
  obtain one**. Such a column would assert an acceptance the interface never
  made. `event_registrations.waiver_version` is the single exception and the
  only one this shape permits, because the waiver is shown in full where it is
  accepted and its box can be left unticked. Nothing stores a pointer to the
  privacy policy, the terms or the code of conduct, and nothing may.
  A **snapshot** is a different thing and is allowed where an acceptance was
  genuinely obtained: `artwork_submissions.consented_terms` (#1319) and
  `gear_requests.as_is_text` (#1367) each hold the words the person was shown,
  because those words live in a call row or a component constant with no
  version identity and no permalink to point at. The test is #1319's — a
  pointer where the text has an address, a snapshot where it does not, and
  neither where nothing was accepted.
- Reopening this needs a legal reason rather than a design one — a tenant whose
  terms of use genuinely bind a registrant, say. It would be that tenant's claim
  to make, in that tenant's wording, and conditional on what it has adopted.

**Reopened once, on those terms, 2026-09-22 by the platform owner (#686).** The
participant waiver meets all three conditions: it is per tenant, it is in that
tenant's own words, and it exists only where that tenant has adopted one. It
takes a real acceptance and stores a version pointer, and the bullet above is
written to say so. It is not a precedent for the site-wide notices, which take
no acceptance and still store no pointer.

One thing it does not resolve, recorded here because it is a retention decision
rather than an engineering one: `purge_expired_records()` anonymizes a
registration three years after its event, and the acceptance survives while the
name and email do not — so the row ends up reading "Removed accepted waiver
v2". Three years is short against the limitation periods that make a waiver
worth holding. The honest answers are a separate acceptances table with its own
clock, or exempting waiver-bearing registrations from the name and email strip.
Carried to #1320 group E.

## What this does not cover

- **A tenant that has published its own documents.** Those are that tenant's
  `site_content` rows and that tenant's decision; nothing here applies to them.
- **Whether a tenant has read this text.** An approval here is the platform's
  own, and it is not a substitute for somebody in the organization reading the
  words published under their name. Since #1321 that is recorded per tenant per
  document — `legal_acknowledged.<key>` in `app_settings`, holding who
  confirmed it, when, and the `PLATFORM_LEGAL_LAST_UPDATED` value they read —
  and bumping the constant above makes every one of those records stale, which
  is what tells a default-serving organization the text moved. So an approval
  row below is also a decision to ask every such tenant to read the document
  again; that is the intended cost of a prose change, not a reason to avoid
  one.
- **A citable version identity for _this_ text.** `PLATFORM_LEGAL_LAST_UPDATED`
  is the version key in all but name, and there is still no archive of
  superseded platform text and no permalink to one: the default is regenerated
  from the live configuration on every request, so there is no snapshot to
  keep. A **tenant's own** documents have had both since #601 —
  `legal_document_versions` and `/<document>?version=N` — which is what
  `event_registrations.waiver_version` points at.
