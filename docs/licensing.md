# Licensing and the Core / Organization boundary

**Status:** Draft — pending board resolution and attorney review
**Updated:** 2026-09-05

This document exists so the ownership split in `LICENSE` is something you can
actually apply while writing code, rather than a legal abstraction. The decision
behind it is recorded in the Chatter planning repository at
`decisions/2026-09-05-portal-ip-ownership.md`.

Nothing here is in force yet. Chatter Snow, Inc. is not yet incorporated and the
license grant has not been executed. Treat this as the boundary to build toward.

## The two categories

**Core** — the generic nonprofit-operations platform. Anything that would still
make sense if you deployed it for a bike co-op, an adaptive sports program, or a
tool library. Owned by Rickie Cruz McDougal; Chatter Snow, Inc. gets a perpetual
free license to it.

**Organization Material** — anything that is about Chatter Snow specifically.
Owned by Chatter Snow, Inc. outright.

## Where the line falls in this repository

| Path                             | Category         | Notes                                                         |
| -------------------------------- | ---------------- | ------------------------------------------------------------- |
| `supabase/migrations/**`         | Core             | Schema, RLS, permission model, RPCs                           |
| `src/app/portal/**`              | Core             | Portal modules and their UI                                   |
| `src/components/ui/**`           | Core             | Generic component library                                     |
| `src/lib/**`                     | Core             | Domain logic: inventory, fiscal year, permissions, formatting |
| `src/app/(public)/**`            | Mixed            | Page _structure_ is Core; the copy inside it is Organization  |
| `public/**` (logos, photography) | Organization     | Brand assets and program photography                          |
| `docs/technical-spec.md`         | Core             | Describes the platform                                        |
| Seed data, demo accounts         | Mixed            | Generic fixtures are Core; Chatter records are Organization   |
| Any row in any database table    | **Organization** | Always. No exceptions.                                        |

Operational data is never Core, never a product asset, and never used to seed,
demo, test, or populate anything commercial. That includes people, donors,
participants, volunteers, staff, financial records, and anything else that
identifies a person.

## Rules for writing code from here on

These keep the boundary cheap to maintain. Following them now avoids an
expensive untangling later.

1. **Don't hardcode "Chatter Snow" in Core code.** Organization name, mission
   copy, contact details, and social links belong in configuration or content,
   not in component source. Where a string is already inlined, moving it out is
   a welcome cleanup, not urgent.
2. **Don't hardcode Chatter-specific program assumptions in the schema.** Snow
   sports, ski seasons, and rider profiles are one organization's shape.
   Anything that generalizes — programs, events, inventory categories, impact
   metrics — should stay generic and be configured per organization.
3. **Keep brand out of the component library.** Colors, type, and spacing go
   through tokens (see `decisions/2026-08-31-brand-tokens.json` in the planning
   repository). Components read tokens; they don't embed brand values.
4. **Keep program and Learn content in content, not code.** Copy that a
   different organization would rewrite entirely is Organization Material.
5. **Never copy production data into fixtures, tests, or demos.** Generate
   synthetic records instead.

## Copyright headers

Per-file copyright headers are _optional_ and currently not applied. The
repository has roughly 1,000 source files; stamping every one produces a
1,000-file diff and permanent noise in every future review, while adding little
that the root `LICENSE` does not already establish. Default copyright applies to
every file regardless of whether it carries a header.

If headers are wanted — most often because a file is being shared outside the
repository, or because a customer's counsel asks — use:

```
/**
 * Copyright (c) 2026 Rickie Cruz McDougal. All rights reserved.
 * Licensed under the terms in LICENSE at the repository root.
 */
```

`tools/stamp-copyright-headers.mjs` applies this to Core source files. Run
`bun run tools/stamp-copyright-headers.mjs --check` to see what would change
and `--write` to apply it. The script is intentionally not wired into CI or
lint-staged.

## Third-party dependencies

Every dependency is governed by its own license. The stack is permissively
licensed (MIT, Apache-2.0, ISC and similar), which is compatible with
proprietary and commercial distribution. Before the first paying customer,
generate a dependency license report and check for anything copyleft that has
crept in — a single GPL or AGPL dependency in the server bundle would change
what can be distributed.

## Contributions

Any contributor other than the copyright holder must agree to the terms in
`CONTRIBUTING.md` and sign the CLA in `CLA.md` before their first commit is
merged. This is not bureaucracy for its own sake: once a second author's code is
in the repository without an agreement, the repository can no longer be cleanly
relicensed, assigned, or sold.
