# Volunteer management — specification

Part of [`docs/technical-spec.md`](../technical-spec.md) — section numbers are
unchanged. This file holds §5.17 and the volunteer data model. Technology, system boundaries, security, the
route tree and the key workflows stay in the hub. A plain `§N` below is in this
file; a `§N` that lives in another file is always a link.

**Also relevant:** event-scoped sign-ups (`event_volunteers`, `event_shifts`) are in [§6, "Public and events"](events.md#6-data-model-public-and-events); volunteer hours feed the impact rollups in [§5.15](programs.md#515-impact-tracking-and-reporting).

## 5.17 Volunteer management

Authorized users shall be able to track volunteer participation, per the "Volunteers — roles"/"participation" rows already named in the entitlement matrix ([§5.3](access-control.md#53-authentication-and-authorization)) and the reporting need described in `planning/drafts/BUSINESS_PLAN.md` §10–§11:

- A catalog of volunteer role types (e.g. Ride Buddy, Event Setup, Basecamp Staffing) that events can be tagged with.
- Volunteer profiles, reusing the existing `people` directory and its derived volunteer role rather than a separate contact record.
- Hours logging: person, optional event, date, hours, role type, and who logged the entry. The `volunteer` role may log and view their own hours; `admin` and `event_coordinator` may view all.

Volunteer hours feed the Impact Tracking rollups in [§5.15](programs.md#515-impact-tracking-and-reporting) (e.g. "290 volunteer hours" in a season report).

**Implemented** (issues #49/#50): `volunteer_role_types` and `volunteer_hours` back `/portal/volunteers/roles` and `/portal/volunteers/participation`, gated by the `volunteers` resource per [§5.3](access-control.md#53-authentication-and-authorization). As of 20260904010000 `volunteer_hours` is also what the event editor's Volunteers tab writes — `event_volunteer_hours` was folded into it — so that tab is now an event-scoped view of the same ledger and its entries flow into Participation, the person profile's Volunteer activity card, and the [§5.15](programs.md#515-impact-tracking-and-reporting) rollup. Event-scoped access is preserved through the surviving `event_volunteer_hours` resource key rather than a second table. The role-type view/edit flow (`role-type-details-dialog.tsx`) still uses the Dialog-based pattern rather than the Sheet-based pattern used elsewhere for viewing/editing an existing record (people, inventory, expenses, events) — see the convention note in [§8](../technical-spec.md#8-application-structure); this should be brought in line the same way as the Programs page ([§5.14](programs.md#514-program-management)).

**Implemented — public volunteer opportunities** (issue #60): `/get-involved/volunteer` reads live from `public_volunteer_role_types`, a curated view (`id`, `name`, `description` — no icon field) granted to `anon`/`authenticated` over `volunteer_role_types` rows flagged `is_public`, following the same pattern as `public_gear_catalog`/`public_events`. The hardcoded opportunities array is gone.

**Implemented — public volunteer application form** (issue #161): the same page also renders an application form backed by `volunteer_applications` (`person_id`, `name`, `email`, `phone`, free-text `role_interest`, `availability`, `status`: new/being reviewed/contacted/placed/declined/closed) and a `security definer` `submit_volunteer_application()` RPC. Applications are not auto-converted into `people`/volunteer records — they're triaged from the portal instead (see below). This is a separate intake path from the role-type catalog above — it captures interest, not a role assignment.

**Implemented — portal application queue** (issue #173): `/portal/volunteers/applications` lists submissions (search by name/email, filter by status), gated by the same `volunteers` resource as the rows above. A details sheet shows the full submission and, for `volunteers:manage` holders, an inline status control; view-only holders see the status as plain text. New (`status = 'new'`) applications are flagged in the notification bell and the dashboard's "Needs your attention" card, linking to the queue pre-filtered to `?status=new`. **Implemented — outbound notice** (issue #742): submitting an application also emails every opted-in `volunteers:manage` holder in that application's tenant, deep-linked to the application (`?application=<id>`, which opens its details sheet even when the row is not on the current page of the list). Recipients are resolved by `people_with_permission()`, the sessionless counterpart to `has_permission()`; the send is scheduled with `after()` so it cannot delay or fail the public submission.

Volunteers (role types, hours logging) is fully implemented, not a placeholder.

## 6. Data model — Volunteers

**Implemented** (issues #49/#50) — see §5.17.

- `volunteer_role_types`: catalog of role-type definitions (e.g. Ride Buddy, Event Setup, Basecamp Staffing) — named to avoid colliding with the existing RBAC `roles` table in "Identity and access" above, which is a different concept (portal permissions, not volunteer job types). Currently `name`/`description` only.
- `volunteer_hours`: `person_id` (→ `people`), optional `event_id`, date, hours, `volunteer_role_type_id`, the user who logged the entry, and `updated_at`/`updated_by`. Since 20260904010000 this is the single hours ledger behind both entry points — Volunteers > Participation and the event editor's Volunteers tab (an event-scoped view of the same rows) — with dual permission gates: `volunteers` for the ledger as a whole, `event_volunteer_hours` for rows where `event_id is not null`. Rows logged from the event tab carry no `volunteer_role_type_id`; that tab has no role picker.
- `volunteer_role_types.is_public` + `public_volunteer_role_types`: **implemented** (issue #60) — a public-facing flag on `volunteer_role_types` and a curated view (`id`, `name`, `description`) granted to `anon`, backing `/get-involved/volunteer`.
- `volunteer_applications`: **implemented** (issue #161) — public intake, separate from the role-type catalog above: `person_id` (→ `people`), `name`, `email`, `phone`, free-text `role_interest`, `availability`, `status` (new/being reviewed/contacted/placed/declined/closed), submitted via the `security definer` `submit_volunteer_application()` RPC. Also carries `updated_at`/`updated_by` (issue #173, backing the portal triage queue at `/portal/volunteers/applications` — see §5.17) via the same shared `set_updated_at` trigger used elsewhere in the schema.
