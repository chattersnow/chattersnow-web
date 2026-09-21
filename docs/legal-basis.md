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
