# Portal navigation: where a new surface goes

**Updated:** 2026-09-12

The rule for deciding how a portal surface exposes its parts — sidebar entry,
tab, rail or card — and the boundary between Administration and a feature
section. Derived from the IA audit in the planning repo's
`decisions/2026-09-12-portal-information-architecture-audit.md` (#955).

Read this before adding a route, a tab strip, or a sidebar entry.

## Why there is a rule

The portal grew seven different patterns for "this thing has parts", each a
reasonable local decision made without a convention to follow. The result was
measurable: destinations per sidebar entry ranged from **0.5** (People: eight
entries over four of its own routes) to **19** (Events: nineteen cards behind a
single entry). Events and Governance had arrived at opposite strategies for
comparable complexity.

Neither strategy was wrong. Having both, with nothing to say which applies, was.

## The rule

> **Navigation for different jobs. Tabs for different views of one object.
> Cards for parts of one view.**

The question to ask first is not "how many parts is this?" but **"is this a
different job, or a different view of the same thing?"** Roles and Permissions
were two sidebar entries because they look like two topics; they are one object
— a role — seen twice, so they are tabs.

### Three thresholds

1. **A tab must have a URL.** Use `useUrlTabState`
   (`src/components/portal/use-url-tab-state.ts`). It validates the URL value
   against what the reader can actually see, falls back safely when a value is
   stale or hand-edited, and uses `history.pushState` rather than `router.push`
   so a tab click does not re-run the page's server component and its queries.
   A tab without a URL cannot be linked, bookmarked, or returned to with Back.

2. **Past roughly ten parts, switch to a rail with search.** This is Site
   Content's answer to 15 pages and 121 slots (`website/content-outline.tsx`)
   and, since #1008, Events' answer to 19 cards
   (`events/[eventId]/event-section-rail.tsx`). The pill strip Site Content
   replaced took six stacked rows at 390px, and with no overview and no search,
   "where does this sentence live?" meant opening every page.

3. **A lifecycle is something to group by, not a level to navigate through.**
   Events tried the second level first: 19 cards behind four phase tabs — basic,
   planning, during, after — each with its own strip of cards (#958). It read
   well on paper and cost two things in use (#1008). Nothing on screen said
   which phase held Sponsors or Discount codes, so finding a card you had not
   used lately meant opening phases until it turned up; and the lifecycle is not
   one-way, so a coordinator correcting a budget or a venue a week after the
   event was working against a control that models the job as a sequence. The
   rail keeps the phases as **headings** and stops making the reader select one.

The thresholds are soft. The first is not.

Threshold 2's "homogeneous" turned out to be doing less work than it looked.
Site Content's 15 pages are alike and Events' 19 cards are not, and the rail
suits both — what actually decides it is how many parts there are and whether
the reader can be expected to know where each one lives.

## The models

Two existing surfaces are the reference implementations. Copy them rather than
inventing a third answer.

**Event detail** (`events/[eventId]/event-detail-view.tsx`) — one sidebar entry,
19 cards under four phase headings in a rail, one card on screen at a time and
one URL parameter naming it. Copy it for the permission handling above all: the
rail's contents are resolved against the reader's permissions on the server
_before_ the URL value is validated, so a deep link to a card the reader cannot
see opens the first one they can rather than an empty card. Copy the rail's
search too — each card declares `keywords`, so "budget" finds Registration &
planning and "raffle" finds Giveaway, which is how a list of 19 stays usable by
someone who does not already know it.

**Site Content** (`website/`) — one entry, a left rail carrying the page list, a
cross-page search and an outline of the page being edited. The search runs over
every page's copy, not just the current one, because that is the question it
exists to answer. (It lived under `administration/site-content/` until #944/#990
moved the website into a section of its own.)

## What the rule decides

| Surface               | Parts                                 | Answer                                    |
| --------------------- | ------------------------------------- | ----------------------------------------- |
| Event detail          | 19 cards over 4 phases                | left rail, phases as headings — the model |
| Site Content          | 15 pages, 121 slots                   | left rail + search — the model            |
| Organization Settings | 5 configuration panels                | tabs, via `useUrlTabState`                |
| Website site settings | Layout, visibility, legal documents   | sidebar entries, grouped                  |
| Roles + Permissions   | 2 views of one role                   | one entry, two tabs                       |
| Governance            | 10 distinct jobs                      | sidebar entries, grouped                  |
| Finance → Sales       | Sales, Register, Products             | Register and Products nest under Sales    |
| People segments       | 7 views of one directory              | segments of one page                      |
| Users page            | table, pending access, support access | stacked cards                             |

## Two things the rule forbids

- **A tab that is not in the URL.** See threshold 1.
- **A real destination that appears in no navigation surface.** A page reachable
  only by a link inside its parent is invisible to the sidebar, the command
  palette (`portal/(app)/command-palette.tsx`) and breadcrumbs
  (`src/components/portal/breadcrumbs.tsx`). If it is a destination, it belongs
  in at least one of them.

## Page titles

`metadata.title` names **the page**, matching its `h1` — not the section it
sits in, and not a word invented for the tab. Three pages said the section
because `/portal/administration`, `/portal/finance` and `/portal/governance`
are redirect stubs, but the URL a reader lands on is the child's.

Where a page's name is ambiguous portal-wide, qualify it with the section
using a middle dot, rather than coining a different name for it:

| Page                   | Title                    |
| ---------------------- | ------------------------ |
| `administration/roles` | `Roles · Administration` |
| `volunteers/roles`     | `Roles · Volunteers`     |
| `finance/donations`    | `Donations · Finance`    |
| `inventory/donations`  | `Donations · Inventory`  |

Qualify only what actually collides — everything else is just its own name.
The portal layout appends the tenant's name (`%s | <tenant>`), so a title
never repeats it, and the middle dot keeps the qualifier from reading as a
second level of that pipe.

## Where configuration lives

> Administration holds what governs the organization as a whole — identity,
> org-wide configuration, and oversight. Configuration that only shapes one
> feature's vocabulary lives with that feature.

So `calendar/categories`, `inventory/categories`, `volunteers/roles` and
`finance/sales/products` stay with their features, while fiscal year, lexicon
and branding stay in Administration. When a setting could plausibly go either
way, ask whether a reader who never opens that feature would still need it.

**The public website is a feature in this sense** (#990). Layout, Page
visibility and Legal documents were System Settings tabs until the website got
a section of its own in #944; they configure one feature, and they now live in
it. Branding did not move: `getTenantBranding` is read by the portal's own
layouts, so it is what the organization looks like everywhere rather than what
its website looks like.

That move is also the worked example of the audience question the rule does not
by itself answer. Page visibility is a board control — the board holds
`system_settings:manage` and no `site_content` at all — so filing it under
Website would have taken it away from the people who use it. The answer was to
widen the section's gate to `site_content:view` **or** `system_settings:manage`,
and to gate each moved route on the resource its writes actually require, rather
than to grant the board the whole CMS. **When a setting moves, the gate to check
is the server action's, not the section's.**

What was left of System Settings after that was five panels, none of them about
"the system", so #992 renamed the page **Organization Settings** and its first
tab **General**. The `system_settings` resource key did not change: it is an
identifier in `role_permissions` rows in every environment, not a label.

Per-user preferences are not configuration in this sense: they live at
`/portal/account`, which every signed-in user can reach. Where an org-wide
default and a per-user override both exist — notifications is the current case —
each surface should name the other.

## Invariants

- `src/lib/portal/nav-guards.test.ts` reads every layout file and asserts each
  sidebar link survives the guard chain on the route it points at. Any nav
  change keeps it green; it is what stops the sidebar offering a link the route
  then refuses.
- **Module entitlements gate visibility, not the nav layer.** A section a tenant
  has not been sold disappears because `has_permission()` says so and
  `visibleNavItems()` filters it, never because the nav hides it. See the
  planning repo's `decisions/2026-09-10-per-tenant-module-entitlements.md`.
- All modules currently ship `default_enabled = true` and every plan seeds
  identically from that flag, so **a tenant sees every section by default**. The
  nav cannot rely on entitlements to keep itself short.
- Moving a route needs a redirect. These URLs are bookmarked and cross-linked.

## Related

- `docs/portal-ux-audit.md` — the 2026-09-02 audit (task flow, a11y, performance)
- Planning repo: `decisions/2026-09-12-portal-information-architecture-audit.md`,
  `decisions/2026-09-12-event-detail-rail-over-phase-tabs.md`,
  `decisions/2026-09-12-administration-section-ia.md`,
  `decisions/2026-09-12-portal-top-level-navigation.md`,
  `decisions/2026-09-12-governance-finance-ia.md`,
  `decisions/2026-09-12-system-settings-and-website-boundary.md`
