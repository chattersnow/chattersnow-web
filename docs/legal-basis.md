# The platform's legal basis

The three documents in `src/lib/legal-defaults.ts` — a privacy policy, terms of
use and a code of conduct — are what a tenant is served when it has published
none of its own. Since #859 `/privacy` is served **unconditionally**, so from
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

| Date       | Version approved   | Approver                | Scope and notes                                                                                                                                                                                                                                                                                                                   |
| ---------- | ------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-21 | September 21, 2026 | Rickie (platform owner) | First recorded approval of all three documents. Covers the text as rendered by `bun run docs:legal` at this version, which is the first to name Sentry in the privacy policy's subprocessor list (#1340). The prior state was not an approval: the documents had been served since #858 and #1291 with no reviewer and no record. |

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
- **Photo and media consent** (#599) and **the participant waiver** (#686) are
  the same shape when they land: a real choice, and a box that can be left
  unticked.

What follows from this:

- No consent checkbox for the privacy policy on any public form. A box that
  cannot be declined dilutes the ones that can.
- No stored pointer to a legal document version on a public submission. Such a
  column would assert an acceptance the interface never obtained.
  `legal_document_versions` (#601) stays evidence-driven; this is not the
  evidence for it.
- Reopening this needs a legal reason rather than a design one — a tenant whose
  terms of use genuinely bind a registrant, say. It would be that tenant's claim
  to make, in that tenant's wording, and conditional on what it has adopted.

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
- **A citable version identity.** `PLATFORM_LEGAL_LAST_UPDATED` is the version
  key in all but name, but there is no archive of superseded text and no
  permalink to one.
