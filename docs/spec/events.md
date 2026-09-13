# Events — specification

Part of [`docs/technical-spec.md`](../technical-spec.md) — section numbers are
unchanged. This file holds §5.2, §5.5 and the public/events data model. Technology, system boundaries, security, the
route tree and the key workflows stay in the hub. A plain `§N` below is in this
file; a `§N` that lives in another file is always a link.

## 5.2 Public events

The site shall allow visitors to:

- View upcoming events.
- View past events.
- Open an event detail page.
- See date/time, location, and description.
- See sponsors or partners when marked for publication.
- Register when registration is enabled.

Events are presented as a list in the initial release. A calendar view is a possible future enhancement, pending research into a suitable approach; the data model should not preclude it.

**Implemented:** `/events` lists upcoming and past events read live from Supabase (`public_events`) and opens event details in a sheet (with `/events/[id]` kept as a direct-link detail page) showing date/time, location, description, and public sponsors/partners (`public_event_sponsors`, sourced from `event_sponsors`/`people` and limited to sponsors marked `is_public`), plus a public registration form (when `registration_enabled` and within the registration window) backed by `event_registrations` and the `register_for_event()` RPC (see [§6](../technical-spec.md#6-proposed-data-model)).

An event must support these fields:

- Name
- Description
- Start and end date/time, including timezone
- Location or location description
- Status: draft, published, completed, cancelled, or archived
- Public/private visibility
- Registration enabled/disabled
- Optional capacity
- Optional public registration deadline

Future event capabilities may include registration status, waitlists, confirmations, calendar integration, and event photos.

## 5.5 Event management

Authorized users shall be able to create and manage events, including:

- Name
- Location
- Date and time, including timezone
- Sponsors
- Associated expenses
- Giveaway sales
- Public/private visibility and publication status

The event record should support a public/private boundary so internal planning details do not become public accidentally. Registration, volunteers, and inventory distributions may be added as later capabilities. Attendance is implemented as a simple event-level headcount (`attendance_count`, `attendance_notes`) rather than per-attendee records — a deliberate product decision, not a placeholder.

**Also implemented, on `events` itself:** an event lead (`event_lead_id` → `auth.users`), capacity, and an after-phase report workflow (`report_status`: not_started/in_progress/submitted, `report_summary`, `lessons_learned`, `feedback_notes`, `content_notes`, `report_submitted_at`), surfaced on the event editor's Report tab. `location` is the single place field: a `venue` column described the same thing a second time — the public pages already rendered `venue ?? location` — and was merged into it. There is no event-type field either: the programs an event counts toward _are_ its categorisation, so `event_type` and its curated `src/lib/event-types.ts` list were both removed. **An event can belong to any number of programs**, through the `event_programs` join table rather than a single `program_id` — one access day can serve two programs, and the Program Impact Report counts it in full for each, since both genuinely ran it.

**Also implemented, as separate per-event tables/tabs on the event editor:** planning-phase logistics (`event_logistics` — meeting point, gear requirements, transportation, food, supplies, emergency contact, notes; one row per event) and a during-phase incident log (`event_incidents` — description, severity: minor/moderate/serious, people involved, occurred-at, reporting user; restricted to `admin`/`event_coordinator` since incident detail is more sensitive than the rest of the events cluster). This event-scoped incident log satisfies the operational need described in [§16.1](addenda.md#161-incident-problem-documentation), though it is narrower than that addendum's proposed cross-cutting `incident_reports` table (no inventory-item linkage, no open/resolved workflow) — see [§16.1](addenda.md#161-incident-problem-documentation) for the remaining gap.

### Sponsor and partner selection

Event sponsors/partners are people or organizations that already live in the shared `people` directory (the same table backing donors and volunteers, see [§6](../technical-spec.md#6-proposed-data-model)) rather than free text typed per event. Managing an event's sponsors shall work as follows:

1. The event editor's Sponsors tab provides a type-ahead search (matching on name and email) over `people`. Staff pick an existing person/organization from the results to link them to the event.
2. If no existing record matches, the same control lets staff create a new `people` record inline (name required; email, phone, and notes optional) and link it to the event in one step, without leaving the event editor.
3. Linking a person makes them a sponsor in the People directory (`/portal/people`) going forward, and their other roles are unaffected. **Implemented** by the derived role model described in [§5.9](people.md#59-people-directory) rather than by the sponsor-linking code: the `event_sponsors` row _is_ what makes them a sponsor, and unlinking their last sponsorship stops it. While the roles were stored flags each caller had to remember to set, linking an _existing_ person set nothing and `/portal/sponsors` was missing sponsors (issue #620).
4. Per-event sponsorship details — support type (cash, in-kind, both, other), in-kind description, contribution value, public visibility, and notes — are stored on the event-sponsor link, not on the person record, since the same sponsor can support different events differently.
5. A person may be linked to a given event only once; re-selecting an already-linked person edits the existing link rather than creating a duplicate.
6. An in-kind sponsorship is mirrored into `donations` + **one `inventory_items` row per item** (issue #1005) so the goods are tracked and valued like any other donation. A sponsor hands over several distinct things at once — a board, goggles, five tees, four lift tickets — and each has its own fate, so the Sponsors tab records a list: description, value and destination per row. The items _are_ the inventory rows under `event_sponsors.donation_id`; there is no sponsor-items table, which is what makes the rest of the app work on them unchanged. Each appears separately in the Giveaway tab's prize-source picker (`list_available_giveaway_sources` already lists every inventory item on the event's donations), so items can be combined across prizes and buckets however the draw is run.

   Each item's `intended_use` defaults to `giveaway`: sponsor contributions are usually vouchers, gift cards or lift tickets destined for an event giveaway, not gear for the community to take home, so by default they reach neither the public gear catalog, the public request flow, nor the rider distribution picker. An item the staffer sends to `gear_library` does reach all three — that is the point of the per-item destination, and it is how a sponsor's gear gets onto the public site. Items can still be reclassified afterwards from Inventory › Items.

   Removing an item is refused while a giveaway prize names it (`giveaway_prizes.source_inventory_item_id` is `on delete set null`, so an unguarded delete would empty the prize in place) or while it carries movement history beyond its intake. The tab disables that row's remove control rather than letting the staffer hit the error.

   `in_kind_description` is derived from the item descriptions rather than typed, so the two can never disagree, and `contribution_value` stays a manual figure that defaults to the items total. `'both'` mirrors its in-kind half on the same terms; its cash half remains unmirrored, since one `contribution_value` cannot be split into cash and goods without inventing a number.

**Where a public sponsorship shows** (issue #914): on its event's detail page, and on the tenant's `/support/sponsorship` page, through the `public_sponsor_wall` view -- the same join as `public_event_sponsors` with the event dropped and one row per person, so a logo no longer leaves the public site when its event ages out. Derived rather than curated: `is_public` on the sponsorship stays the only opt-in and there is no second list for staff to maintain. The heading and intro above the logos are tenant-owned copy (`support.sponsor_wall_heading`, `support.sponsor_wall_intro`), and a tenant with no public sponsors renders no section at all.

## 6. Data model — Public and events

- `pages` or repository content: approved public content
- `events`
- `event_sponsors`: links an event to a `people` record via `person_id` (one row per event/person pair), plus per-event sponsorship details — support type, in-kind description, contribution value, public visibility, notes. Sponsor/partner name and contact info are not duplicated here; they live on the linked `people` row. `donation_id` and `monetary_donation_id` point at the records the sponsorship mirrors (§5.5); the in-kind items are the `inventory_items` rows under that donation, any number of them, each with its own value and `intended_use` (#1005). A `inventory_item_id` column named a single mirrored item until #1005 dropped it — it could only ever name one of several, and it is derivable from `donation_id`.
- `event_volunteers`: links an event to a `people` record via `person_id`, with an optional free-text `role` and notes; a lightweight, event-scoped sign-up list, separate from the `volunteer_role_types`/`volunteer_hours` catalog in "Volunteers" below. Optional `shift_id` (issue #70) assigns the volunteer to a time-bounded `event_shifts` row.
- `event_logistics`: **implemented** — one row per event (`event_id` PK/FK): meeting point, gear requirements, transportation, food, supplies, emergency contact name/phone, notes. A separate table rather than more `events` columns, matching the `event_sponsors`/`event_expenses` per-tab pattern.
- `event_incidents`: **implemented** — see §5.5/[§16.1](addenda.md#161-incident-problem-documentation): `event_id`, `occurred_at`, `description`, `severity` (minor/moderate/serious), `people_involved`, `reported_by`. Restricted to `admin`/`event_coordinator`.
- `event_shifts`: **implemented** (issue #70) — time-bounded shifts within an event (e.g. basecamp AM/PM on a multi-day trip): `event_id`, `label`, `starts_at`/`ends_at`, optional `target_headcount`, notes. Scoped to `event_volunteers`; staff-side shift assignment is still a follow-up now that `event_staff` ([§5.9](people.md#59-people-directory)) exists. Managed from the event editor's Volunteers tab, gated by the `events` resource.
- `event_volunteer_hours`: **retired** (20260904010000) — was a lightweight, event-scoped hours log running in parallel with the org-wide `volunteer_hours` table under "Volunteers" below. The split was a silent reporting bug, not just redundancy: the [§5.15](programs.md#515-impact-tracking-and-reporting) rollup, Volunteers > Participation, and the person profile's Volunteer activity card all read `volunteer_hours` only, so hours logged from the event editor's Volunteers tab appeared on that tab and nowhere else. Its rows were backfilled into `volunteer_hours` (id-preserving, `volunteer_role_type_id` null) and the table dropped. The **resource key** `event_volunteer_hours` survives as the event-scoped permission gate — admin/event_coordinator manage, finance view, board none, volunteer view — OR'd into `volunteer_hours`' RLS wherever `event_id is not null`, so the event tab's access is unchanged and the org-wide ledger is not widened.
- `event_staff`: **implemented** (issue #626) — mirrors `event_volunteers` (`event_id`, `person_id`, optional role/title, notes, unique per event/person pair), gated on the same `events` resource, and is itself what derives the staff role ([§5.9](people.md#59-people-directory)). Managed from the event editor's Staff tab.
- `event_registrations`: **implemented** — public registration for an event (name, email, phone, party size, notes), submitted via the anon-callable `register_for_event()` RPC (validates the event is public/published, registration is open, and capacity). Links to a `people` record via `person_id`, resolved-or-created by normalized email inside the RPC (`resolve_or_create_person_by_email()`, since there's no signed-in user to drive a `PersonPicker`); existing rows were backfilled by matching `people.email` where possible. `create_donation_with_items` uses the same helper to resolve an existing `people` row by email instead of always inserting a duplicate. `checked_in_at`: explicit per-registrant check-in (set by staff from the portal, not derived from `events.attendance_count`/`attendance_notes`, which remain a separate manual estimate — see [§5.9](people.md#59-people-directory)-adjacent event-day tooling). A walk-in who never pre-registered gets their own `event_registrations` row, created at check-in time via `PersonPicker`, rather than a separate table.
- `discount_codes`: manual tracking of discount codes a partner/vendor issues for an event (code, description, source) and which registrant each was given to (`registration_id` → `event_registrations.id`, single-use via a unique constraint on `registration_id`, plus a unique `(event_id, lower(code))` index). No payment/pricing integration — redemption happens outside chattersnow-web. No automatic assignment at registration time (needs board input; tracked separately).
- `contact_messages`: **implemented** (issue #172) — `name`, `email`, `topic`, `message`, persisted via the `security definer` `submit_contact_message()` RPC (honeypot + rate-limited — see [§7.9](../technical-spec.md#79-rate-limit-public-write-endpoints)). **Implemented — portal triage** (issue #173): a `status` column (new/read/resolved) plus `updated_at`/`updated_by`, gated by the dedicated `communications` resource ([§5.3](access-control.md#53-authentication-and-authorization)) rather than the original `is_admin()`-only `select` policy. Staff review submissions at `/portal/communications`; opening a message auto-marks it read, and new messages are flagged in the notification bell and dashboard. **Implemented — outbound notice** (issue #742): the Server Action schedules an email with `after()` once the RPC commits, so a failed or slow send can never delay or roll back the visitor's submission. It goes to everyone holding `communications:manage` or `administration:manage` in that message's tenant who has opted in at `/portal/account`, and deep-links to the message (`?message=<id>`). The email carries the sender's name, address and topic but never the message body — `run_retention_purge` cannot reach an inbox — and sets `Reply-To` to the sender.
- `rate_limit_hits`: **implemented** (issue #172) — shared abuse-protection primitive (`route`, `ip_address`, `created_at`) behind `check_rate_limit()`; not exposed to `anon`/`authenticated` directly. See [§7.9](../technical-spec.md#79-rate-limit-public-write-endpoints) for which public RPCs use it and at what thresholds.
