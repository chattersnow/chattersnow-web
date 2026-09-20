# Permissions: before you add a check

**Updated:** 2026-09-20

The rule for choosing a permission resource, for deciding when a new one is
warranted, and for keeping what a grant means readable by the people who grant
it. Read this before adding a `requirePermission()`, a `has_permission()` in a
policy, or a row to `public.resources` (#1324).

## The rule

> **A permission check is not finished until `src/lib/auth/permission-docs.ts`
> says what it does.**

The catalog is 35 resources across ten sections, each with three levels. What
each one gates is spread over three places — the sidebar tree in
`src/lib/portal/nav.ts`, ~170 route guards and `hasPermission()` call sites
under `src/`, and ~660 `has_permission()` references in
`supabase/migrations/` — and nobody granting a role reads any of them. The
docs module is where the answer lives, and
`src/lib/auth/permission-docs.test.ts` is what stops it going stale.

## Why the one-line description is not enough

`resources.description` is seeded in SQL and printed under a resource label in
the permissions matrix, so it has to fit inside a table cell. It names the
subject area:

```
('finance', 'Finance', 'Finance', 'Donations, expenses, and reimbursements management', 70)
```

It cannot say what changes when the cell moves from None to View to Manage, and
it cannot say that `finance:manage` covers neither event-level expenses
(`event_expenses`), nor approving a submission (`finance_approvals`), nor
approving your own (`finance_self_approval`), nor the reports a board member
reads (`finance_reports`). Those four names are close enough to `finance` that
the split is invisible until somebody is refused.

The prose lives in code rather than in a second seeded column for two reasons:
it is reviewed in the pull request that changes the behaviour it describes, and
it needs more room and more structure than one line that is also the matrix's
inline hint. The database catalog stays the source of truth for _which_
resources exist, their section, their order and their one-line label.

## Choosing a resource

Reach for an existing resource first. Ask which of these the change is:

1. **A new view or action inside a subject area somebody already administers.**
   Use that area's resource. Most changes are this, and a new resource here
   only makes the matrix longer without making anything more grantable.
2. **A narrow per-verb carve-out of an area, for people who must not have the
   area.** A Workflow resource — the section is literally called `Workflow` —
   like `people_intake` (create a person inline without the directory),
   `inventory_intake` (record intake and distribution without the catalog or
   the reports), `volunteer_hours_logging` (log your own hours and nobody
   else's) or `finance_self_approval` (approve your own below-threshold
   submissions). Add the check _alongside_ the wide resource with
   `checkAnyPermission`, never instead of it, so the wide grant keeps working.
3. **Content inside an area that a different audience reads.** Its own
   resource in the area's own section — `event_incidents` is `events` minus the
   sensitive reports, `finance_reports` is the board's read without a ledger.
4. **A whole subject area that did not exist.** Its own resource, and probably
   its own module.

Widening an existing resource to cover a new page is the failure mode this list
exists to prevent: it silently grants that page to every role that already held
the resource, and nothing in the matrix shows it happened.

## Adding a resource

1. Seed it in the migration that creates the feature, with an
   `insert into public.resources` naming `key`, `section`, `label`,
   `description`, `sort_order` and `module_key`. That last column is
   `not null`, so a resource added after the entitlements migration must name
   its module inline — the backfill
   in `20260910010000_tenant_module_entitlements.sql` is an `update` over rows
   that already existed and will never match a later insert.
2. Seed its role defaults by joining on `roles.name`, so every tenant's role is
   covered and not just the template's. **`admin: manage` alone is the
   conservative default** for a resource with no obvious fit; an administrator
   can widen it from the matrix without another migration. Say in a comment why
   you chose what you chose.
3. Write its entry in `src/lib/auth/permission-docs.ts`: what View gives, what
   Manage gives, the adjacent resources it does _not_ include, and anything an
   administrator needs to know before granting it.
4. If it gates a sidebar entry, add it to `src/lib/portal/nav.ts` and keep
   `src/lib/portal/nav-guards.test.ts` green — every way of seeing a link must
   be a way of opening it.

## Writing the docs entry

- **Plain task language, not a restatement of the label.** "Approve, reject or
  mark paid any submitted expense" beats "manage expense approvals".
- **`view: null` / `manage: null` is a real answer.** It means no check
  anywhere asks for that level, so granting it behaves like None — which is
  exactly what an administrator staring at a three-way dropdown wants to know.
  The test holds this to the checks on disk in both directions, so you cannot
  write `null` for a level something asks for, and you cannot document a level
  nothing asks for.
- **Name the neighbour.** `excludes` is the field the whole reference exists
  for. Point at the resource that does cover the thing, and say what that
  thing is.
- **Put inertness in `notes`.** A grant that only resolves inside the platform
  tenant (`platform_tenants`), or only under the org-wide approval threshold
  (the two self-approval resources), is inert in a way the matrix cannot show.

## What the test enforces

`src/lib/auth/permission-docs.test.ts` is a unit test — it reads text off disk
and needs no database. It fails when:

- a resource any migration seeds has no docs entry;
- a docs entry names a resource no migration seeds;
- a resource named by any check in `src/` or in a migration has no entry;
- a level something checks is documented as having no effect;
- a level nothing checks is documented as having one;
- a `does not include` cross-reference points at a resource that doesn't exist,
  at itself, or appears twice.

Run it with `bun test src/lib/auth/permission-docs.test.ts`.

## Where it surfaces

- **Administration → Roles → Permissions** — a help button on each resource row
  opens the explanation beside the matrix, with the roles in this organization
  that hold it, read live from `role_permissions`.
- **Administration → Permission Reference** — the same content for every
  resource, grouped by section and filterable, linked from the portal's help
  panel. It keeps resources whose module is off and marks them inert, because
  "why can nobody reach Reimbursements?" is one of the questions it answers;
  the matrix drops them, because offering a cell that would do nothing reads as
  a bug.

## Related

- [`docs/portal-navigation.md`](portal-navigation.md) — where a new portal
  surface goes. The nav is never the gate; module entitlements and
  `has_permission()` are.
- [`docs/spec/access-control.md`](spec/access-control.md) — §5.3, the
  specification, including the five-role entitlement matrix.
- [`docs/tenants.md`](tenants.md) — modules, entitlements and what a migration
  that seeds tenant rows must do.
