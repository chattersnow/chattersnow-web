# Programs and impact — specification

Part of [`docs/technical-spec.md`](../technical-spec.md) — section numbers are
unchanged. This file holds §5.14, §5.15 and the programs/impact data model. Technology, system boundaries, security, the
route tree and the key workflows stay in the hub. A plain `§N` below is in this
file; a `§N` that lives in another file is always a link.

## 5.14 Program management

Authorized users shall be able to define and manage programs — the named, repeatable initiatives events belong to (e.g. Chatter Snow Access Days, Chatter Gear Exchange, Chatter Community Rides), rather than treating every event as freestanding. A program record shall support:

- Name
- Description
- Status: active, pilot, or retired

Each event may optionally be tagged to any number of programs (`event_programs`, a join table, so existing and one-off events remain valid without a program and an event that serves two programs counts toward both). This is the schema shape `planning/ideas/RUNNING_PROGRAMS.md` calls for — **Programs → Events**, with everything else (expenses, donations, volunteers, impact) continuing to hang off the event as it already does.

**Implemented** (issue #45): `programs` (name, description, status) and the `event_programs` join table exist, with `/portal/programs` for CRUD, gated by the `programs` resource per the entitlement matrix in [§5.3](access-control.md#53-authentication-and-authorization). A program's own record therefore currently offers name, description, and status; everything else about a program — its events, and everything that hangs off those events (expenses, donations, sponsors, giveaways, inventory movements, volunteer/staff assignments) — has to be read via `event_programs`, not from the `programs` row itself. The `/portal/programs` view/edit flow uses the same Dialog-based pattern as `volunteers/roles`; see the Sheet-based convention note in [§8](../technical-spec.md#8-application-structure) for the pending cleanup.

**Implemented — events-on-a-program list** (issue #62): a program's detail view lists every event tagged to it (name, status, visibility). This is a smaller, more basic view than the full season/program impact rollup in §5.15 (issue #48), which aggregates participation/financial/hours metrics rather than simply listing member events.

**Implemented — the public page can read this table** (issue #898, closing what issue #46 asked for): `/programs` (moved from `/about/programs` in the public-site nav restructure — see [§4](../technical-spec.md#4-system-boundaries)) has one setting behind it, `layout.programs_source`, offered in Website › Layout and resolved through `src/lib/site-layout.ts`.

- **Site Content** (the default): the cards are the `programs.items` copy, exactly as before. A tenant that never touches the setting sees no change, which is why the default is load-bearing rather than cosmetic.
- **Programs module**: the cards are this tenant's own `programs` rows, read as `anon` through the `public_programs` definer view ([§6](../technical-spec.md#6-proposed-data-model)). Only rows a person marked `is_public` appear — the flag defaults to `false`, so switching the source can never publish a program nobody reviewed (issue #360) — ordered by `sort_order` nulls last then name.

Either way the pillar headings and taglines stay copy (`programs.pillars`): moving them into the module would make the page a second content system rather than a second source of cards. `programs` therefore gained `is_public`, `pillar`, `emoji` and `sort_order`, and became an audited table, since publishing a program to the website is a governance act the way a `site_content` write is. A program whose `pillar` matches no heading is listed in a trailing ungrouped section rather than dropped, and module mode with nothing published renders the `programs.empty` copy rather than a page of bare headings. `list_program_pillars()` is a `security definer` RPC feeding the form's pillar picker, because `site_content:view` is admin-only while `event_coordinator` manages programs. `status` stays an internal lifecycle field: a retired program left public still shows, and the portal warns rather than the database enforcing.

## 5.15 Impact tracking and reporting

The system shall produce grant- and board-ready impact summaries by rolling up existing operational data rather than requiring separate manual entry, per `RUNNING_PROGRAMS.md`'s "rolls up automatically" model:

- Per-event and per-program participation: total participants, first-time participants, first-time skiers/snowboarders, beginners, volunteers.
- Financial assistance provided: subsidized tickets/rentals/transportation, dollar total.
- Equipment loaned/distributed, drawn from `inventory_movements`.
- Volunteer hours contributed, once [§5.17](volunteers.md#517-volunteer-management) is implemented.
- Optional qualitative outcomes from a short post-event survey, matching the five-question model in `RUNNING_PROGRAMS.md`. Not implemented: the aggregate yes-count columns added for this in `event_impact_notes` were retired in 20260904020000 because no report ever read them and no survey tool feeds them. Revisit when there is a real survey to wire up; the event report's `feedback_notes` carries qualitative outcomes today.
- A season/program report that rolls individual event reports up to the level shown in `RUNNING_PROGRAMS.md`'s "2026–27 Chatter Snow Access Program" example table.

This is reporting over existing records (events, donations, expenses, inventory movements) plus the small amount of new impact-specific data noted above — not a parallel system duplicating what's already recorded elsewhere.

**Implemented** (issues #48, #571): `event_impact_notes` (one row per event) plus two `security definer` RPCs — `get_program_impact_rollup_data(p_program_id)` for the season/program rollup and `get_event_impact_derived_data(p_event_id)` for the per-event Impact and Attendance cards. Both emit the same jsonb shapes and run the same compute functions in `src/lib/portal/impact-metrics.ts`, so a per-event figure and its program total cannot disagree. Since 20260904020000 almost every figure is derived rather than typed: participants (`events.attendance_count`, falling back to checked-in registrations), first-time participants (lifetime check-in history), beginner participants (rider profile, shown against a profiled-attendee denominator), volunteers on site (`event_volunteers` ∪ `volunteer_hours`), assigned discount codes, equipment distributed and volunteer hours. Only rental subsidies, assistance dollars, first-time riders and beginner pairings are still staff-entered, because nothing in the schema records them; the equipment-loan count and the survey yes-counts were retired (this schema has no loan concept — gear is given away, not lent — and nothing read the survey). Volunteer hours in the rollup were under-reported until 20260904010000: the RPC read `volunteer_hours` while the event editor's Volunteers tab wrote the parallel `event_volunteer_hours` table. `/portal/programs/reports` provides a program picker and a metrics grid, gated by the `programs_reports` resource (`admin`/`event_coordinator` manage; `finance`/`board` view; `volunteer` none). Both RPCs are `security definer` because `board` holds `event_impact:view` but `events:none`/`people:none`, so RLS-scoped queries would silently return zeros for the role that most needs the numbers.

## 6. Data model — Programs and impact

- `programs`: **implemented** (issue #45) — name, description, status (active/pilot/retired)
- `event_programs`: **implemented** — `(event_id, program_id)` join table, so existing and one-off events remain valid without a program and an event can count toward several (it replaced a single nullable `events.program_id`, which could only ever attribute a shared event to one program)
- `event_impact_notes`: **implemented** (issues #48, #571) — one row per event, holding only the figures with no system source: first-time riders, rental-subsidy count, assistance dollar total, beginner-pairings count and free-text notes, plus a `legacy_manual_values` jsonb archive of the columns 20260904020000 dropped when they became derived or were retired. Everything else on the Impact tab is computed by `get_event_impact_derived_data`. Gated by the `event_impact` resource; entered via the event editor's Impact tab.

Impact rollups themselves (per-event, per-program, and season reports, including a basic list of events tagged to a program — see §5.14) are computed over these tables plus `donations`, `event_expenses`, `inventory_movements`, and `volunteer_hours`. **Implemented** (issue #48): `get_program_impact_rollup_data(p_program_id)`, a `security definer` RPC bundling this data for every event linked to a program through `event_programs`, backing `/portal/programs/reports` (gated by the `programs_reports` resource).
