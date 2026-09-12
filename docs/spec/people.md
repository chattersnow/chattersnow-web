# People directory — specification

Part of [`docs/technical-spec.md`](../technical-spec.md) — section numbers are
unchanged. This file holds §5.9. Technology, system boundaries, security, the
route tree and the key workflows stay in the hub. A plain `§N` below is in this
file; a `§N` that lives in another file is always a link.

**Also relevant:** the `people`, `person_role_tags` and `people_with_roles` tables are catalogued in [§6, "Inventory and donations"](inventory.md#6-data-model-inventory-and-donations); `event_staff` is in [§6, "Public and events"](events.md#6-data-model-public-and-events); and linking a sponsor to a person is specified in [§5.5](events.md#55-event-management).

## 5.9 People directory

A person's record in the People directory (`/portal/people`) shall show that individual's full operational history across roles, not just their contact details and roles:

- Donations given, if they are a donor
- Events sponsored and sponsorship details (support type, in-kind description, contribution value), if they are a sponsor
- Volunteer activity (role types, logged hours), if they are a volunteer
- Staff assignments across events, if they are staff
- Partnerships closed as won, if they are a partner

This view should read from the existing donation, event-sponsor, event-volunteer, and event-staff records rather than duplicating that history onto the `people` row.

Role membership itself follows the same principle: it is **derived, not stored**. `public.people_with_roles` (issue #624) is a `security_invoker` view carrying every `people` column plus `is_donor` / `is_sponsor` / `is_volunteer` / `is_attendee` / `is_staff` / `is_partner`, each answered at read time by the `security definer` helper `person_role_flags()` from the records that create the role — donations, monetary donations, giveaway prizes, event sponsors, event registrations, event volunteers, volunteer hours, volunteer applications, event staff, won partnership opportunities — unioned with `person_role_tags`. The helper is definer so a role never depends on the reader's access to the evidence behind it: an event coordinator holds `people:view` and `finance:none` and must still see a donor as a donor. The view is invoker so who may see the person is still decided by the `people` select policy. Reads use the view; every write still goes to `people`, and `person_role_tags` — a staff assertion with a date and an author — is the only place a role is ever written by hand.

The six keys are the platform's; **the words are the tenant's** (#911). Donor, sponsor, volunteer, attendee, staff and partner are nonprofit vocabulary, and an organization that sells things has customers, a studio has students and instructors, a shop has clients and suppliers. Each role's singular and plural live in one `app_settings` map, `people.role_labels`, whose shape is the registry in `src/lib/person-roles.ts`, and are read through the `tenant_person_role_labels` definer view — the audience is anyone holding `people:view`, which is wider than the `manage` permissions `app_settings`' own select policy admits. They resolve through the same `{term}` placeholder engine as the lexicon (`src/lib/lexicon.ts`), so the sidebar's People sub-items, every segment page's heading, "New X" button and empty states, the role facet, the Roles column, the badges on a profile and the aspect cards are one merged vocabulary the portal layout hands down; a tenant that sets nothing reads exactly today's words. What stays platform-owned is everything a key names: the `is_*` columns, `person_role_tags.role`, and the `/portal/donors` routes — a URL is not a label. Dropping a role a tenant has no module for is phase B of #911 and waits on #900; roles beyond the six are phase C.

This replaced four stored boolean columns. They were written by whichever code path happened to create the relationship, so linking an existing person as a sponsor flagged nobody and removing their last sponsorship cleared nothing (issue #620); the intermediate fix, a `sync_person_role_flags()` recompute on triggers over all nine source tables, was retired along with the columns.

A person may also hold a **staff** role — someone who works events in a paid or formally-scheduled capacity, as distinct from a volunteer. Staff are drawn from the same `people` directory (a person can be both staff and a volunteer) and are assigned to individual events the same way sponsors and volunteers are: a Staff tab on the event editor links `people` rows to the event via `event_staff`, with an optional role/title and notes per assignment. Managing event staff requires the same permission as managing the rest of the event ([§5.3](access-control.md#53-authentication-and-authorization)).

A person or an organization may also hold a **partner** role. It is derived from `partnership_opportunities` and only from `stage = 'closed_won'`: that table is a pipeline, so a prospecting or negotiating row records an intention rather than a relationship, and a lost opportunity retracts the role the same way deleting a last sponsorship clears `is_sponsor`. `owner_person_id` is deliberately not part of the derivation — the owner is the internal staff or board member driving the opportunity, which says nothing about the counterparty. Partner is the second type added through the aspect registry, and the first to arrive by _moving_ an existing standalone card in: the person page's Partnerships card became the Partner aspect card, and the halves that are not the role — an organization still in the pipeline, and the internal owner — split off into a Partnership involvement card.

**Implemented** (issue #626). Staff is the fifth _derived_ role rather than the `is_staff` column earlier drafts of this section described: an `event_staff` row makes someone staff, a `'staff'` value in `person_role_tags` covers the person hired before their first assignment, and both come back through `people_with_roles`. It was the first type added through the aspect registry (§C of the people-role decision record) and needed one card file, one actions entry, and one line in the registry.
