# Chatter Snow Website and Operations Portal

## Technical Specification

- **Status:** Draft for team review
- **Version:** 0.9
- **Date:** 2026-08-26
- **Owner:** Chatter Snow
- **Repository:** `chattersnow-web`
- **Canonical domain:** `https://chattersnow.org`

## 1. Purpose

Chatter Snow needs a public website for sharing its mission and programs, plus a secure admin portal for managing events, donations, inventory, expenses, and operational summaries.

The product has two distinct audiences:

> **Public users are primarily consumers of information. Authorized users are operators of the system.**

The public site must remain useful without an account. Operational data must require authentication and role-based authorization.

## 2. Goals and Non-Goals

### Goals

1. Publish accessible information about Chatter Snow, its mission, programs, leadership, contact details, and ways to support it.
2. Publish upcoming and past events with optional registration.
3. Give authorized staff and volunteers a secure place to manage operational records.
4. Treat donations, inventory changes, distributions, and expenses as records with history, rather than silently overwriting facts.
5. Give administrators a dashboard that summarizes events, inventory, donations, and expenses.

### Non-goals for the initial release

- Full accounting software or tax preparation.
- A public view of the internal inventory record (donor/donation linkage, face value, internal notes, status, or movement history). A curated, read-only public catalog of currently available gear is in scope — see §4 and §5.4.
- Automated calendar synchronization.
- Waitlists, capacity automation, confirmation emails, or event photo galleries unless prioritized separately.
- An in-app file upload/attachment solution for documents (expense/reimbursement receipts, governance records). This is a permanent design decision, not an initial-release gap: records store a link to the file in an existing external solution the organization already manages (Google Drive/OneDrive), not the file itself. A `file_attachments` table backed by Supabase Storage is not planned — see §5.6, §5.12, §5.18, §6.

(Giveaway recording and event attendance headcounts, listed as future capabilities in earlier drafts, are now implemented — see §5.5 and §5.8. Volunteer management, previously listed here as a non-goal, is now specified — see §5.17.)

## 3. Technology and Deployment

| Area                     | Decision                                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend and application | Next.js App Router, TypeScript, React                                                                                                              |
| UI components            | shadcn/ui (Tailwind v4 + Base UI primitives), composed with the project's own brand tokens/classes in `globals.css`                                |
| Hosting                  | Vercel                                                                                                                                             |
| Database                 | Supabase PostgreSQL                                                                                                                                |
| Authentication           | Supabase Auth with Google OAuth                                                                                                                    |
| Files                    | Supabase Storage (inventory/gear photos). Document attachments (receipts, governance records) are external links for the initial release — see §2. |
| Data API                 | Supabase-generated API and server-side Next.js routes/actions where orchestration is required                                                      |
| Authorization            | PostgreSQL Row Level Security (RLS), with server-side checks for sensitive workflows                                                               |
| Source control           | GitHub                                                                                                                                             |
| DNS and domain           | Cloudflare DNS; Vercel manages application deployment and domain integration                                                                       |
| Local development        | Next.js development server and Supabase local stack                                                                                                |

The repository started as a minimal Next.js application and has since been built out well past the original "coming soon" skeleton. Supabase Auth, Storage, and API services are enabled in `supabase/config.toml`. Schema exists as 100+ ordered migrations under `supabase/migrations/`, now covering the shared `people` directory (donors, sponsors, volunteers), donations, inventory items/movements, events, event sponsors, event expenses/revenue, event attendance (a simple event-level headcount, not per-attendee), event registrations (with check-in), discount codes, giveaways/giveaway prizes/giveaway winners, programs, volunteer role types/hours, reimbursements, governance (board members, meetings, agendas/agenda templates, minutes, action items, decisions, resolutions, conflict-of-interest disclosures, annual requirements), nonprofit-status milestones, the content and community calendar (calendar items, content opportunities, brief templates, program-suggestion rules), `roles`/`user_roles`/`role_permissions`/`pending_role_grants`/`deactivated_users`, and an append-only `audit_log`, plus curated public views (`public_gear_catalog`, `public_events`, `public_event_sponsors`, `public_volunteer_role_types`, `public_calendar_items`) and abuse-protection primitives (`rate_limit_hits`/`check_rate_limit()`, `contact_messages`) backing the public intake forms. `supabase/seed.sql` populates a local dev database with one test account per role (plus a multi-role and a no-role account, all `@example.test`) and sample operational data, so the role matrix and every workflow below can be exercised locally without touching production.

Authorization is now role-based: `roles`/`user_roles` tables plus `has_role()`/`is_admin()`/`my_roles()` security-definer helper functions back per-table RLS policies that match the entitlement matrix in §5.3, and the two cross-cutting workflow RPCs (`create_donation_with_items`, `record_event_distribution`) are `security definer` with explicit role checks so they work for roles like `volunteer` that only hold `insert` grants on the underlying tables. On the app side, `src/lib/auth/roles.ts` exposes `getCurrentUserRoles`/`requireAnyRole`; the portal layout redirects an authenticated-but-unprovisioned user (zero roles) to a "no access" login state, every section has its own `layout.tsx` calling `requireAnyRole` server-side (not just nav hiding), and `portal-nav.tsx`/`sidebar-quick-actions.tsx` filter what's shown per role. The five roles are still fixed at the database level (`roles.name` is check-constrained to the five in §5.3) and the matrix is still hardcoded into RLS policies and route guards rather than being data-driven — see "what's next" below and in §5.3.

The portal's sidebar nav links to every section named in §8's route tree. Administration > Users is implemented — it lists every portal account (via a `security definer` `list_portal_users` RPC, since `auth.users` isn't otherwise exposed), lets an admin assign/revoke roles, deactivate/reactivate an account, and issue an invite link that pre-stages a role grant for an email before the person's first sign-in (`pending_role_grants`, claimed automatically on OAuth callback — see §6). Administration > Roles (add/edit/delete roles beyond the initial five) and Administration > Permissions (edit the role × resource matrix with staged, confirm-before-save edits) are both implemented and data-driven — see §5.3. Administration > Audit log (issue #18) is implemented: a URL-filtered, server-paginated view over the `audit_log` table (see §5.11, §6) with a before/after diff drawer per entry, covering donations, inventory, event expenses, user role changes, calendar items, and content opportunities. Administration > System settings is a real page backed by an `app_settings` key/value table, holding the expense and reimbursement approval thresholds (§5.16, §5.18) and the content calendar's default lead time (§5.20), with more settings added incrementally as features need them. Governance (board members, meetings/agendas/minutes/action items/decisions, resolutions, bylaws, policies, conflict-of-interest disclosures, annual requirements, nonprofit-status tracking) and Volunteers (role types, hours logging) are both fully implemented, not placeholders — see §5.12 and §5.17. The public site's Home page is implemented with mission copy, CTAs, and an upcoming-event highlight; Contact, Events (list, detail, registration, check-in), Gears (catalog and request flow), and the public Community Calendar all have working forms/data, alongside About Us, Get Involved, and Support — see §4.

### Environment configuration

Secrets must be stored in environment variables and Vercel project settings, never in source control.

Required application configuration:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` for trusted server-only operations, if required
- Google OAuth credentials configured in Supabase Auth
- Site URL and OAuth redirect URLs for local, preview, and production environments

The secret key must never be exposed to browser code. Production and preview environments should use separate Supabase projects or clearly separated configuration and data policies.

## 4. System Boundaries

### Public website

Public routes may expose approved content and explicitly public records. The public site's nav (`src/app/(public)/site-nav.tsx`) now has seven top-level groups, superseding the original five-section IA (About Us's Programs, Volunteer, and Donations sub-pages were promoted out to their own sections):

- **Home** (`/home`): a landing page, primarily imagery/highlights linking into the other sections.
- **About** (`/about`): the organization's mission and story, plus a **Meet the Team** sub-page (`/about/team`) with staff/leadership profiles.
- **Events** (`/events`): upcoming and past events with detail pages, plus `/events/community` — the public Community Calendar (§5.20). Initial release renders events as a list; a calendar view is a possible future enhancement pending further research.
- **Gear** (`/gears/library`, `/gears/donate`): the curated, read-only gear availability catalog with a request flow, and a donate-gear informational page.
- **Get Involved** (`/get-involved/attend`, `/get-involved/volunteer`, `/get-involved/partner`): attending events, volunteering (opportunities plus an application form), and partnering.
- **Support** (`/support/donations`, `/support/sponsorship`): monetary giving (placeholder) and sponsorship information.
- **Contact Us** (`/contact`): a rate-limited contact form that persists inquiries for staff follow-up, plus the organization's published email address and social media links.

A `/programs` page also exists (the pillar/program content originally under `/about/programs`) but its nav entry is currently commented out in `site-nav.tsx`, leaving it unreachable from navigation — see "What's next."

Public routes must not expose donor contact details, private event data, internal notes, financial records, the internal inventory record (donation linkage, face value, notes, status, or movement history), individual recipient information, or inventory history. The gear availability catalog above is the sole approved exception, and only through its curated field list.

**Implemented:** all seven sections above are built. Gear (`/gears/library`) includes a request flow (§5.4); Get Involved > Volunteer is fed live from `volunteer_role_types` plus a public application form (§5.17); Events includes public registration, check-in-eligible listings, public sponsor display, and the Community Calendar (§5.2, §5.20); Contact and the volunteer-application/event-registration paths are rate-limited (§7). About Us (`/about`) has real mission/story copy and a team roster (bios still "coming soon"). Support > Donations remains a monetary-giving placeholder (in-kind donation info only).

**What's next:** Replace the monetary-donations placeholder with a real giving path. Write real team bios and an explicit values section. Either re-enable `/programs`'s nav entry or fold it into an existing section — it currently has no route to it. Drive `/programs`'s content from the `programs` table (§5.14, issue #46) instead of static copy.

### Operations portal

The authenticated admin portal supports:

- Dashboard summary
- Event management
- Donation and inventory management
- Expense management

Giveaway recording (prizes, winners, ticket totals) and event attendance headcounts are implemented as part of event management. Role-based access control (§5.3) is implemented as a data-driven permissions matrix, including Administration > Users/Roles/Permissions for managing accounts, roles, and the permission matrix itself. An audit log (§5.11) is implemented for donations, inventory items/movements, event expenses, user role changes, calendar items, and content opportunities; events and giveaways are not yet covered. Volunteers (role types, hours logging), governance record-keeping (board members, meetings, agendas, resolutions, bylaws, policies, conflict-of-interest disclosures, annual requirements, nonprofit-status tracking), programs and impact reporting (§5.14, §5.15), reimbursements (§5.18), and the content and community calendar (§5.20) are all implemented. What remains planned or placeholder: inventory valuation reporting (§5.19) and the financial approval workflow's dollar thresholds (§5.16).

## 5. Functional Requirements

### 5.1 Public content

The site shall allow visitors to:

- View a home page introducing Chatter Snow and linking into About Us, Events, Gears, and Contact Us.
- Learn about Chatter Snow, its mission, and its programs on the About Us page.
- Meet the team or leadership on an About Us sub-page.
- Submit a contact inquiry through a form that is persisted for staff follow-up.
- Find the organization's published contact email address and social media links.
- Learn how to support the organization.

Content management is not required to be self-service in the first release. The initial implementation may use repository-managed content, while the data model should leave room for a future CMS or admin-managed content. The contact form is a public write path: it must be rate-limited, validated server-side, and must not create or expose any authenticated-only record.

**Implemented:** Home page content (mission summary, upcoming event highlight, Join/Get Involved/Donate CTAs — see §4), About Us (mission/story), team roster (bios pending), programs (`/about/programs`), volunteer opportunities (`/about/volunteer`), in-kind donation info (`/about/donations`), and a server-mediated, rate-limited contact form (`/contact`) with published email addresses and an Instagram link.

**What's next:** real leadership bios and an explicit values section on About Us; a real monetary-donation path (currently a "coming soon" stub).

### 5.2 Public events

The site shall allow visitors to:

- View upcoming events.
- View past events.
- Open an event detail page.
- See date/time, location, and description.
- See sponsors or partners when marked for publication.
- Register when registration is enabled.

Events are presented as a list in the initial release. A calendar view is a possible future enhancement, pending research into a suitable approach; the data model should not preclude it.

**Implemented:** `/events` lists upcoming and past events read live from Supabase (`public_events`) and opens event details in a sheet (with `/events/[id]` kept as a direct-link detail page) showing date/time, location, description, and public sponsors/partners (`public_event_sponsors`, sourced from `event_sponsors`/`people` and limited to sponsors marked `is_public`), plus a public registration form (when `registration_enabled` and within the registration window) backed by `event_registrations` and the `register_for_event()` RPC (see §6).

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

### 5.3 Authentication and authorization

Users shall authenticate through Supabase Auth using Google OAuth. The application shall verify the authenticated user's authorization before rendering or changing portal data.

Five portal roles are defined:

- **`admin`** — full access to every section, including Administration (users/permissions/settings/audit log).
- **`event_coordinator`** — manages Events end-to-end (details, sponsors, giveaway, attendance, event-level expenses); view-only on People and Volunteers participation; no access to org-wide Finance, Inventory, Governance, or Administration.
- **`finance`** — manages the Finance section (donations, expenses, reimbursements, reports); view-only on Events (expenses/sponsor amounts, for reconciliation), Inventory reports (valuation), and People (donor contacts); no Governance or Administration access.
- **`board`** — manages the Governance section (board members, meetings, bylaws, policies, conflict of interest, annual requirements); view-only on Finance reports and the dashboard for oversight; no other section access.
- **`volunteer`** — views events and signs up for future events, with no visibility into event financial data (no expenses tab, no sponsor amounts); creates inventory donation-intake records and edits distribution/gear-checkout records, but has no access to Inventory reports (valuation); views own Volunteers participation/hours; no access to Finance, People, Governance, or Administration.

A user may hold more than one role. The full page-by-page breakdown is the entitlement matrix below.

#### Entitlement matrix

| Section / page                                                  | `admin` | `event_coordinator` | `finance`              | `board`              | `volunteer`                        |
| --------------------------------------------------------------- | ------- | ------------------- | ---------------------- | -------------------- | ---------------------------------- |
| Dashboard (Home)                                                | Manage  | View (event tiles)  | View (financial tiles) | View (summary tiles) | View (own activity)                |
| Events — details, sponsors, giveaway, attendance                | Manage  | Manage              | View                   | None                 | View + sign up¹                    |
| Events — event-level expenses                                   | Manage  | Manage              | View                   | None                 | None                               |
| Programs                                                        | Manage  | Manage              | View                   | View                 | View                               |
| Impact tracking / reports                                       | Manage  | View                | View                   | View                 | None                               |
| Inventory — items, donations (intake), distribution             | Manage  | None                | None                   | None                 | Add donations + edit distribution² |
| Inventory — reports (valuation)                                 | Manage  | None                | View                   | None                 | None                               |
| Finance — donations, expenses, reimbursements, reports          | Manage  | None                | Manage                 | View (reports only)  | None                               |
| Finance — approvals                                             | Manage  | None                | Submit³                | Manage               | None                               |
| People directory                                                | Manage  | View                | View                   | None                 | None                               |
| Volunteers — roles (role-type definitions)                      | Manage  | View                | None                   | None                 | View                               |
| Volunteers — participation                                      | Manage  | View                | None                   | None                 | View/log own                       |
| Volunteers — applications (public intake queue)                 | Manage  | View                | None                   | None                 | View⁴                              |
| Communications — contact messages                               | Manage  | None                | None                   | None                 | None                               |
| Governance — all pages                                          | Manage  | None                | None                   | Manage               | None                               |
| Administration — users, roles, permissions, settings, audit log | Manage  | None                | None                   | None                 | None                               |

¹ Volunteers never see event financial data (expenses, sponsor amounts); event sign-up depends on the not-yet-built event-registration tables noted in §3.
² Volunteers do not get Inventory reports since those surface dollar valuations.
³ `finance` may create and edit expense/reimbursement records and mark them submitted, but cannot approve its own submissions — see §5.16.
⁴ Applications reuse the same `volunteers` resource as the role-type catalog and participation rows rather than a narrower carve-out, so a `volunteer`-role user can read every applicant's name/email/phone, not just their own — an intentional reuse of the existing gate (issue #173), not a new information-sharing decision.

**Implemented:** `roles`/`user_roles` tables, plus a data-driven `resources`/`role_permissions` matrix (role × resource → none/view/manage) that RLS policies and route guards consult via `has_permission()` instead of hardcoded role names — see §6. Route guards (`requirePermission`/`requireAnyPermission` in each section's `layout.tsx`) and nav filtering (`portal-nav.tsx`) both read the same permission map, so unauthorized sections are neither reachable by URL nor shown in the sidebar, and a permission change takes effect immediately without a deploy. Administration > Users lets an admin assign/revoke roles per account, and Administration > Permissions lets an admin edit the matrix and create new roles beyond the initial five (the `roles.name` check constraint has been dropped). A new role starts with no permissions on any resource until explicitly granted.

Resource granularity mostly matches the matrix rows above, with a few narrow "Workflow" resources (`people_intake`, `inventory_intake`, `volunteer_hours_logging`) added to express existing per-verb carve-outs — e.g. a volunteer can record a donation-intake/distribution transaction or create an inline contact from an event/donation form without gaining full People-directory or Inventory-reports access — that a flat view/manage split per matrix row can't otherwise represent without widening those roles' read access.

**Implemented — `communications` resource** (issue #173): added specifically so contact-message routing could be decoupled from full `administration` access — `contact_messages` RLS previously hardcoded `select` to `is_admin()` with no dedicated resource at all (issue #172). Seeded with `admin: manage` only, since no front-desk/communications-coordinator role exists yet; Administration > Permissions can grant it to a new role later without another migration.

### 5.4 Inventory and donation management

#### Receive a donation

Authorized users shall be able to:

1. Record the donation and donor information when required.
2. Record one or more donated inventory items.
3. Record each item's description, size, type, gender, condition, face value, photo, and status.
4. Create an inventory receipt transaction.

Source types should distinguish individual, brand, organization, event, and other sources.

#### Update inventory

Authorized users shall be able to update item metadata and status, add photos, and create controlled stock adjustments. Inventory status should support at least available, distributed, damaged, lost, retired, and other organization-approved values.

Corrections must record a reason and actor. Quantity should not be changed through an untraceable direct overwrite when a transaction can express the change.

#### Distribute or otherwise remove gear

Inventory changes shall be represented by a stock movement or distribution transaction with:

- Item and quantity
- Movement type: received, distributed, reserved, damaged, lost, retired, corrected, or other
- Date/time
- Reason or notes
- Optional event
- Optional recipient or recipient reference
- User who recorded the transaction

For distribution, the system records who received the gear (`inventory_movements.recipient_person_id`, a nullable FK to `people`), when, at which event (also optional), and who distributed it (`created_by`). Recipient data is protected by the same RLS as the rest of `people`/`inventory_movements` and is not exposed publicly.

Available quantity should be derived from valid inventory transactions, subject to an explicit policy for damaged, lost, and retired stock.

#### Public gear availability

The public site shall let visitors browse a gallery of gear currently available (`status = available`), with filtering by type, condition, and gender, and free-text search by description. The public read path must go through a dedicated, curated database view rather than a relaxed policy on the internal `inventory_items` table, so donor linkage, face value, notes, status, and movement history stay behind authenticated-only access regardless of how the public view's field list evolves.

#### Public gear requests

From the gear library, selecting an available item opens its details in a side panel where a visitor may request it by submitting their name, email, and optional phone/notes. The request is handled by a `security definer` RPC that atomically re-checks availability, flips `inventory_items.status` to `reserved`, and records an `inventory_movements` row (`movement_type = reserved`, `recipient_person_id`) linking the requester into the `people` directory — the same pattern used for public event registration. A reserved item drops out of the public gear catalog until a staff member releases it back to `available` through the existing inventory management flow.

### 5.5 Event management

Authorized users shall be able to create and manage events, including:

- Name
- Location
- Date and time, including timezone
- Sponsors
- Associated expenses
- Giveaway sales
- Public/private visibility and publication status

The event record should support a public/private boundary so internal planning details do not become public accidentally. Registration, volunteers, and inventory distributions may be added as later capabilities. Attendance is implemented as a simple event-level headcount (`attendance_count`, `attendance_notes`) rather than per-attendee records — a deliberate product decision, not a placeholder.

**Also implemented, on `events` itself:** an event lead (`event_lead_id` → `auth.users`), venue, capacity, and an after-phase report workflow (`report_status`: not_started/in_progress/submitted, `report_summary`, `lessons_learned`, `feedback_notes`, `content_notes`, `report_submitted_at`), surfaced on the event editor's Report tab.

**Also implemented, as separate per-event tables/tabs on the event editor:** planning-phase logistics (`event_logistics` — meeting point, gear requirements, transportation, food, supplies, emergency contact, notes; one row per event) and a during-phase incident log (`event_incidents` — description, severity: minor/moderate/serious, people involved, occurred-at, reporting user; restricted to `admin`/`event_coordinator` since incident detail is more sensitive than the rest of the events cluster). This event-scoped incident log satisfies the operational need described in §16.1, though it is narrower than that addendum's proposed cross-cutting `incident_reports` table (no inventory-item linkage, no open/resolved workflow) — see §16.1 for the remaining gap.

#### Sponsor and partner selection

Event sponsors/partners are people or organizations that already live in the shared `people` directory (the same table backing donors and volunteers, see §6) rather than free text typed per event. Managing an event's sponsors shall work as follows:

1. The event editor's Sponsors tab provides a type-ahead search (matching on name and email) over `people`. Staff pick an existing person/organization from the results to link them to the event.
2. If no existing record matches, the same control lets staff create a new `people` record inline (name required; email, phone, and notes optional) and link it to the event in one step, without leaving the event editor.
3. Linking a person makes them a sponsor in the People directory (`/portal/people`) going forward, and their other roles are unaffected. **Implemented** by the derived role model described in §5.9 rather than by the sponsor-linking code: the `event_sponsors` row _is_ what makes them a sponsor, and unlinking their last sponsorship stops it. While the roles were stored flags each caller had to remember to set, linking an _existing_ person set nothing and `/portal/sponsors` was missing sponsors (issue #620).
4. Per-event sponsorship details — support type (cash, in-kind, both, other), in-kind description, contribution value, public visibility, and notes — are stored on the event-sponsor link, not on the person record, since the same sponsor can support different events differently.
5. A person may be linked to a given event only once; re-selecting an already-linked person edits the existing link rather than creating a duplicate.

### 5.6 Expense management

Authorized users shall be able to record expenses with:

- Description
- Date
- Amount and currency
- Category (e.g. branding/marketing, food, transportation, supplies, venue, other)
- Receipt link
- Optional event association
- Entering user

**Implemented as a link, not an upload.** For the initial release, staff record a link to the receipt file in an existing external solution (e.g. Google Drive, OneDrive) rather than uploading it to the portal — `event_expenses.receipt_url` is a plain text URL column. In-app upload to a private Supabase Storage bucket remains a candidate for a later release — see §2. Expense records are operational data and do not replace the organization's accounting controls.

### 5.7 Donations

The initial inventory workflow is the primary way administrators manage donated gear. Donation records should retain donor and donation context where needed, while inventory records retain the item-level details. Donor personal information must be restricted to authorized users with a legitimate operational need.

### 5.8 Giveaways

Giveaway recording is implemented for the initial release: authorized users can record, per event, tickets sold and revenue, prizes (name, prize donor, estimated value), and winners (name, contact, distribution status/date, drawing date), via the event editor's Giveaway tab (`giveaways`, `giveaway_prizes`, `giveaway_winners` tables). This is a manual recording tool only — there is no public ticket-purchase flow.

The prize donor is a `people` foreign key (`donor_person_id`, issue #20), and a prize can additionally record the donation record it came from — either an `inventory_items` row or a `monetary_donations` row (`source_inventory_item_id` / `source_monetary_donation_id`, issue #520). Selecting an in-kind source reserves that inventory item (issue #570), so a donated item allocated to a giveaway stops appearing as available in the distribution picker and the public gear catalog; removing the prize or changing its source releases the item again. Prizes with no inventory record behind them (cash, gift cards) are still entered as free text.

Public online ticket sales remain out of scope and must be reviewed for applicable legal, tax, and jurisdictional requirements before being enabled.

### 5.9 People directory

A person's record in the People directory (`/portal/people`) shall show that individual's full operational history across roles, not just their contact details and roles:

- Donations given, if they are a donor
- Events sponsored and sponsorship details (support type, in-kind description, contribution value), if they are a sponsor
- Volunteer activity (role types, logged hours), if they are a volunteer
- Staff assignments across events, if they are staff

This view should read from the existing donation, event-sponsor, event-volunteer, and event-staff records rather than duplicating that history onto the `people` row.

Role membership itself follows the same principle: it is **derived, not stored**. `public.people_with_roles` (issue #624) is a `security_invoker` view carrying every `people` column plus `is_donor` / `is_sponsor` / `is_volunteer` / `is_attendee`, each answered at read time by the `security definer` helper `person_role_flags()` from the records that create the role — donations, monetary donations, giveaway prizes, event sponsors, event registrations, event volunteers, volunteer hours, volunteer applications — unioned with `person_role_tags`. The helper is definer so a role never depends on the reader's access to the evidence behind it: an event coordinator holds `people:view` and `finance:none` and must still see a donor as a donor. The view is invoker so who may see the person is still decided by the `people` select policy. Reads use the view; every write still goes to `people`, and `person_role_tags` — a staff assertion with a date and an author — is the only place a role is ever written by hand.

This replaced four stored boolean columns. They were written by whichever code path happened to create the relationship, so linking an existing person as a sponsor flagged nobody and removing their last sponsorship cleared nothing (issue #620); the intermediate fix, a `sync_person_role_flags()` recompute on triggers over all nine source tables, was retired along with the columns.

A person may also hold a **staff** role — someone who works events in a paid or formally-scheduled capacity, as distinct from a volunteer. Staff are drawn from the same `people` directory (a person can be both staff and a volunteer) and are assigned to individual events the same way sponsors and volunteers are: a Staff tab on the event editor links `people` rows to the event via `event_staff`, with an optional role/title and notes per assignment. Managing event staff requires the same permission as managing the rest of the event (§5.3).

**Not yet implemented.** No `event_staff` table exists yet; see §6. When it lands, staff becomes a fifth derived role over that table plus a `'staff'` value in `person_role_tags` — not a column on `people`.

### 5.10 Dashboard and reporting

The initial admin dashboard shall summarize:

- Upcoming events
- Inventory by status and type
- Donation inventory totals
- Expenses for a selected period
- Giveaway sales associated with events

Dashboard values should be derived from stored records and clearly indicate the relevant date range. Expanded reports may later include filters, exports, and pending tasks.

### 5.11 Audit and history

The system shall preserve who changed what and when for material operational records, including:

- Inventory quantity and status
- Donations
- Distribution records
- Events
- Income and expenses
- Giveaways
- User role changes

Audit history should be append-only for normal application users. At minimum, store actor, action, entity type, entity ID, timestamp, and a structured before/after or change payload. Audit data must be visible only to authorized roles.

**Implemented for donations, inventory items/movements, event expenses, user role changes** (issue #18), **calendar items** (issue #103), and **content opportunities** (issue #109); events and giveaways are not yet covered. A generic `security definer` Postgres trigger (`audit_log_row()`) fires `AFTER INSERT OR UPDATE OR DELETE` on the covered tables and writes actor (`auth.uid()`), action, table name, record ID, timestamp, and full before/after `jsonb` row snapshots to `audit_log` — chosen over application-level writes scattered across each mutating RPC/server action so coverage can't be silently skipped by a write path that forgets to log. RLS restricts reads to `has_permission('administration', 'manage')`; no insert/update/delete policy exists for any role, so the table is append-only in practice, not just by convention. Because rows are keyed by `record_id` independent of the record's current state, history survives archiving without any extra work. See §6 for the schema and Administration > Audit log for the browsing UI (filter by table/action/actor/date, sort, paginate, and view a before/after diff per entry).

### 5.12 Governance

Authorized users shall be able to manage nonprofit governance records:

- **Board members**: linked to `people`, with role/title, term start/end, and active status.
- **Meetings**: date, type (board, committee, annual, other), facilitator and notes-taker (both `people`), attendees, and associated:
  - **Agendas**: for board meetings, built from a versioned, seeded agenda template (issue #166) covering the standing "Ongoing Board Items" review sections (Finance & Fundraising, Legal & Nonprofit, Events, Community & Partnerships, Marketing & Social, Operations, Technology & Website — each with fixed discussion topics plus per-meeting updates/decisions-needed text), new business, upcoming dates, a parking lot, and next-meeting info, alongside the meeting's action items and decisions/votes.
  - **Minutes**
  - **Action items** and **decisions**: list-based, per meeting; decisions carry an optional topic and vote result alongside the discussion description, so a decision can double as a lightweight "Decisions & Votes" agenda entry.
  - **Resolutions**: motion text, mover/seconder, vote outcome, and effective date
- **Bylaws**: the governing document, with effective date and amendment history.
- **Policies**: named policies (e.g. whistleblower, document retention, conflict of interest policy itself), each with a category and effective date.
- **Conflict of interest**: per-person annual disclosure statements, on-file date, and any noted conflicts.
- **Annual requirements**: recurring compliance items (e.g. annual report, IRS Form 990, state charitable registration renewal) with due date, completion status/date, and responsible party.
- **Nonprofit status tracking**: a phased checklist tracking progress toward 501(c)(3) formation, grouped by the roadmap's Gate/Phase labels, with each item carrying a status (not started / in progress / done), an optional owner (`people`), and an optional due date. Entries are updated manually by admin/board — these are real-world legal filings with no transactional trigger elsewhere in the portal. Not a weighted percent-complete meter; a derived "N of M complete" count is shown per phase and overall instead. Portal-only, gated on the same `governance` resource as other governance records (issues #145/#146).

The content of an individual governance record (a policy's text, a set of minutes, a signed bylaws amendment, etc.) is not required to take one fixed form. A record may hold an external link (e.g. to a file in the organization's Google Drive/OneDrive), a free-text body, or both, so staff can start with a quick note and add a link to the scanned/signed file once it exists. **There is no in-app file upload option, by permanent design** (see §2) — `minutes` is implemented this way (`external_link`/`body_text` columns only, no `file_attachment_id`), and `bylaws`, `policies`, `conflict_of_interest_disclosures`, and `annual_requirements` will follow the same pattern once built; `agendas` keeps the same `external_link` field but replaced its single free-text body with the structured, template-driven columns described above (issue #166), pinned to the template version an agenda was built from so later template revisions don't retroactively change a saved agenda. A `file_attachments` table is not planned — see §2 and §6.

Governance records contain sensitive organizational and personal information and must not be public. Access is limited to the `admin` and `board` roles — see the entitlement matrix in §5.3.

### 5.13 Open questions

- **Volunteer-facing donation/distribution recording**: recording a donation or distribution from an event should be quick and easy for a volunteer to reach in the field, not just from the main inventory workflow.
- **Quick edit from the events list**: editing a donation/distribution via the events list may only need to collect a number and notes tied to the event, rather than the full inventory workflow.
- ~~**Giveaway prizes drawn from in-kind donations**~~: **decided** (issues #520, #570) — a donated item used as a prize stays on the standard inventory path rather than getting a giveaway-specific one. The prize references the `inventory_items` row, and allocating it reserves the item and writes an `inventory_movements` row, so receipt, status and movement history all behave as they do for any other reservation. See §5.8.

### 5.14 Program management

Authorized users shall be able to define and manage programs — the named, repeatable initiatives events belong to (e.g. Chatter Snow Access Days, Chatter Gear Exchange, Chatter Community Rides), rather than treating every event as freestanding. A program record shall support:

- Name
- Description
- Status: active, pilot, or retired

Each event may optionally be tagged to a program (`events.program_id`, nullable so existing and one-off events remain valid without a program). This is the schema shape `planning/ideas/RUNNING_PROGRAMS.md` calls for — **Programs → Events**, with everything else (expenses, donations, volunteers, impact) continuing to hang off the event as it already does.

**Implemented** (issue #45): `programs` (name, description, status) and `events.program_id` exist, with `/portal/programs` for CRUD, gated by the `programs` resource per the entitlement matrix in §5.3. A program's own record therefore currently offers name, description, and status; everything else about a program — its events, and everything that hangs off those events (expenses, donations, sponsors, giveaways, inventory movements, volunteer/staff assignments) — has to be read via `events.program_id`, not from the `programs` row itself. The `/portal/programs` view/edit flow uses the same Dialog-based pattern as `volunteers/roles`; see the Sheet-based convention note in §8 for the pending cleanup.

**Implemented — events-on-a-program list** (issue #62): a program's detail view lists every event tagged to it (name, status, visibility). This is a smaller, more basic view than the full season/program impact rollup in §5.15 (issue #48), which aggregates participation/financial/hours metrics rather than simply listing member events.

The public site's `/programs` page (moved from `/about/programs` in the public-site nav restructure — see §4) is still static content, not driven by this table (issue #46), and its nav entry is currently commented out, leaving the page unreachable from navigation.

### 5.15 Impact tracking and reporting

The system shall produce grant- and board-ready impact summaries by rolling up existing operational data rather than requiring separate manual entry, per `RUNNING_PROGRAMS.md`'s "rolls up automatically" model:

- Per-event and per-program participation: total participants, first-time participants, first-time skiers/snowboarders, beginners, volunteers.
- Financial assistance provided: subsidized tickets/rentals/transportation, dollar total.
- Equipment loaned/distributed, drawn from `inventory_movements`.
- Volunteer hours contributed, once §5.17 is implemented.
- Optional qualitative outcomes from a short post-event survey (see `event_impact_notes` in §6), matching the five-question model in `RUNNING_PROGRAMS.md`.
- A season/program report that rolls individual event reports up to the level shown in `RUNNING_PROGRAMS.md`'s "2026–27 Chatter Snow Access Program" example table.

This is reporting over existing records (events, donations, expenses, inventory movements) plus the small amount of new impact-specific data noted above — not a parallel system duplicating what's already recorded elsewhere.

**Implemented** (issue #48): `event_impact_notes` (one row per event — participation counts, first-time/beginner counts, financial-assistance counts and dollar total, equipment-loan count, and yes-counts for the five-question post-event survey) and a `security definer` RPC, `get_program_impact_rollup_data(p_program_id)`, that bundles impact notes with distributed `inventory_movements`, `volunteer_hours`, and `event_registrations` for every event tagged to a program into one season/program report. `/portal/programs/reports` provides a program picker and a metrics grid (events, participants, first-time/beginner counts, financial-assistance total, equipment loaned, volunteer hours, repeat participants), gated by the `programs_reports` resource (`admin`/`event_coordinator` manage; `finance`/`board` view; `volunteer` none). The per-event survey/impact-notes entry form itself lives on the event editor's Impact tab, gated by the `event_impact` resource.

### 5.16 Financial controls and approval workflow

Consistent with the segregation-of-duties model in `planning/governance/roles-and-responsibilities.md` (no single person controls request → approval → payment → accounting), expense and reimbursement records shall carry an approval state distinct from who recorded them:

- `submitted` — recorded by `finance` (or, for event-level expenses, `event_coordinator`), not yet approved.
- `approved` or `rejected` — set by a user other than the submitter, holding `admin` or `board`.
- `paid` — payment has been made against an approved record.

Routine, in-budget expenses may be self-approved by `finance`; expenses above a threshold require a second approval from `admin` or `board`; unbudgeted expenses above that threshold require Board approval. **The dollar thresholds themselves are an open decision** (see `roles-and-responsibilities.md` and issue #13 — not yet recorded in `planning/decisions/`); this section specifies the mechanism, not the specific amounts, so the workflow was built before the thresholds are finalized and the seeded default can be tightened later without a schema change.

**Implemented** (issue #29): `event_expenses.status` (submitted/approved/rejected/paid) plus `submitted_by`/`approved_by`/`approved_at`/`rejected_by`/`rejected_at`/`rejection_reason`/`paid_by`/`paid_at`, enforced by `approve_expense`/`reject_expense`/`mark_expense_paid` RPCs. A `finance_self_approval` resource gates self-approval of below-threshold submissions; at/above the threshold (`app_settings.finance.expense_approval_threshold`) a second approver holding `finance_approvals` is required. RLS additionally blocks a submitter from approving their own submission at the row level, independent of the RPC check. Reimbursements (§5.18) reuse the same status/RPC pattern with their own threshold key.

### 5.17 Volunteer management

Authorized users shall be able to track volunteer participation, per the "Volunteers — roles"/"participation" rows already named in the entitlement matrix (§5.3) and the reporting need described in `planning/drafts/BUSINESS_PLAN.md` §10–§11:

- A catalog of volunteer role types (e.g. Ride Buddy, Event Setup, Basecamp Staffing) that events can be tagged with.
- Volunteer profiles, reusing the existing `people` directory and its derived volunteer role rather than a separate contact record.
- Hours logging: person, optional event, date, hours, role type, and who logged the entry. The `volunteer` role may log and view their own hours; `admin` and `event_coordinator` may view all.

Volunteer hours feed the Impact Tracking rollups in §5.15 (e.g. "290 volunteer hours" in a season report).

**Implemented** (issues #49/#50): `volunteer_role_types` and `volunteer_hours` back `/portal/volunteers/roles` and `/portal/volunteers/participation`, gated by the `volunteers` resource per §5.3. The role-type view/edit flow (`role-type-details-dialog.tsx`) still uses the Dialog-based pattern rather than the Sheet-based pattern used elsewhere for viewing/editing an existing record (people, inventory, expenses, events) — see the convention note in §8; this should be brought in line the same way as the Programs page (§5.14).

**Implemented — public volunteer opportunities** (issue #60): `/get-involved/volunteer` reads live from `public_volunteer_role_types`, a curated view (`id`, `name`, `description` — no icon field) granted to `anon`/`authenticated` over `volunteer_role_types` rows flagged `is_public`, following the same pattern as `public_gear_catalog`/`public_events`. The hardcoded opportunities array is gone.

**Implemented — public volunteer application form** (issue #161): the same page also renders an application form backed by `volunteer_applications` (`person_id`, `name`, `email`, `phone`, free-text `role_interest`, `availability`, `status`: new/being reviewed/contacted/placed/declined/closed) and a `security definer` `submit_volunteer_application()` RPC. Applications are not auto-converted into `people`/volunteer records — they're triaged from the portal instead (see below). This is a separate intake path from the role-type catalog above — it captures interest, not a role assignment.

**Implemented — portal application queue** (issue #173): `/portal/volunteers/applications` lists submissions (search by name/email, filter by status), gated by the same `volunteers` resource as the rows above. A details sheet shows the full submission and, for `volunteers:manage` holders, an inline status control; view-only holders see the status as plain text. New (`status = 'new'`) applications are flagged in the notification bell and the dashboard's "Needs your attention" card, linking to the queue pre-filtered to `?status=new`.

### 5.18 Reimbursements

Authorized users shall be able to request reimbursement for money personally spent on behalf of the organization, separately from organization-paid expenses:

- Requesting person
- Amount and description
- Receipt link
- Optional associated event

As with expenses (§5.6), the receipt for the initial release is a link to a file in an existing external solution (Google Drive/OneDrive), not an in-app upload.

Reimbursements go through the same approval workflow as §5.16 (submitted → approved/rejected → paid) rather than a separate one, since the underlying control question — who may approve spend — is the same.

**Implemented** (issue #51): `reimbursements` (`person_id` → `people`, optional `event_id`, `description`, `amount`, `currency`, `receipt_url`, `notes`, `status`, `submitted_by`, `approved_by`/`approved_at`, `rejected_by`/`rejected_at`/`rejection_reason`, `paid_by`/`paid_at`) at `/portal/finance/reimbursements`, with `approve_reimbursement`/`reject_reimbursement`/`mark_reimbursement_paid` RPCs mirroring the expense-approval workflow. Gated by dedicated `reimbursements`/`reimbursement_approvals`/`reimbursement_self_approval` resources; the approval threshold is a separate `app_settings` key (`finance.reimbursement_approval_threshold`, seeded at $500) from the expense threshold in §5.16.

### 5.19 Inventory valuation reporting

Authorized users (`admin`, and `finance`/`board` for view-only oversight per §5.3) shall be able to view a valuation report over existing inventory data:

- Total face value of on-hand inventory, by type and status.
- Value donated and value distributed over a selected period, derived from `inventory_movements`.

This is a reporting view over `inventory_items` and `inventory_movements` — no new tables are required.

**Implemented.** `/portal/inventory/reports` computes on-hand face value by type/status and value donated/distributed over a selected period directly from `inventory_items.face_value` and `inventory_movements` (received/distributed movement types) — no new tables.

### 5.20 Content and community calendar

A Chatter-specific planning and approval workflow connecting LGBTQ+ community observances, winter/outdoor sports moments, heritage and social-justice dates, Chatter events, partner opportunities, and campaigns to practical content work — not a full social-media publishing suite, and not a replacement for event registration, email marketing, or a CRM. It should help the team decide what's coming up, what's relevant enough to acknowledge, who owns any resulting content and by when, and what has been approved, scheduled, published, or intentionally skipped.

The underlying calendar item model must be generic enough to support future programs, not just this feature. A calendar item has: title, item type (Chatter event, partner/co-hosted event, community observance, heritage/social-justice moment, winter/outdoor sports moment, content campaign, fundraiser/donation drive, partner opportunity, or content opportunity), start/end date, recurrence or annual-observance rule, time zone, summary, priority tier, calendar status, public visibility, owner, related programs, tags/categories, related items, and audit timestamps. **Implemented** (issue #191): recurrence can optionally be structured as a fixed month-day anchor (a single day, or a month-day range) plus a `series_key` shared across a recurring observance's yearly instances, on top of the always-present free-text `recurrence_rule` description. Only fixed-date/fixed-range observances get structured recurrence; variable weekday-based rules (e.g. "the second Monday of October") or dates an operator confirms by hand each year keep free text only and are excluded from the automation below.

Two independent state machines apply per item:

- **Priority tier** — Tier 1 (Chatter should usually acknowledge or plan around this; target ~15–20/year), Tier 2 (consider when relevant to current programs/capacity/context), or Tier 3 (internal reference/content-bank only, no publication obligation). An admin can change an item's tier and must record a rationale; Tier 1 never auto-creates a publish task without a human decision.
- **Calendar status** (idea/active/complete/archived) is distinct from **content status** (not planned/idea/draft/in review/changes requested/approved/scheduled/published/skipped), since planning a moment and producing content for it are separate concerns. Every status change records the actor and timestamp; a skipped item records a reason.

Categories (LGBTQ+ community; winter and outdoor sports; community and social justice; Chatter events; campaigns and fundraising; partner opportunities) are labels layered on top of item type and priority, not a substitute for either.

**Public surface:** a Community Calendar (month/list view, filterable by month and public category) showing published Chatter events and selected public community moments — never the full internal calendar, and never internal owners, draft copy, review notes, or unpublished assets. A public item can be informational without implying Chatter hosts or owns the observance, and must degrade gracefully for long titles, missing images, date ranges, and no-match filters.

**Portal surface:** month/list/agenda calendar views with the same filter set as the item model above; item CRUD (create/edit/duplicate/archive/restore) with date validation and recurrence-overlap warnings; a content-opportunity brief per planned item (what the moment is, the Chatter connection, recommended formats/channels/CTA, related program/event, owner, reviewer, draft/review/publish due dates) with lead-time defaults that calculate draft/review/publish dates from a target publish date (e.g. a 21-day lead time on a March 31 item defaults to a March 17 draft date, March 24 review date); a small starter template library (community spotlight, awareness/community moment, partner spotlight) that prefills brief structure without auto-publishing; "my work" queues with overdue and Tier-1-no-decision warnings; admin-configurable, editable (never automatic) related-program suggestions; and full audit history (who changed what, approvals, publish/skip decisions) that survives archiving, following the existing `audit_log` pattern in §5.11/§6.

**Recurring-coverage reminder, auto-generate, and bulk import** (`/portal/calendar/import`, issue #191): a repeatable follow-on to the one-time Tier 1/Tier 2 seed below. For every structured-recurrence series, an in-app-only reminder (matching the existing notifications-menu/attention-items pattern, `content_calendar` manage-gated, surfaced from October 1 for the following year) flags Tier 1/2 series with no instance yet dated in the upcoming year. From the same page, an admin can generate a single missing series or all of them at once — each generated row copies everything a human would otherwise retype (title, type, categories, programs, source/region, sensitivity flag/tone guidance) and always lands as an internal draft (`idea` status, no decision, sensitive-topic sign-off reset) pending the usual review, never auto-published; re-running "generate" is a no-op once a year is covered, since missing coverage is recomputed at generation time rather than trusted from the UI. The same page also supports CSV bulk import of new, one-off external observances (distinct from the recurring-series generator): an operator enters one batch-level source (e.g. "GLAAD 2027 calendar") applied to every row plus an optional per-row region, previews per-row validation errors before submitting, and every imported row is force-set to `idea`/internal/no-decision regardless of what the CSV contained — matching the annual observance list's operations-lead-curated-internally decision (`planning/decisions/2026-08-26-content-community-calendar-open-decisions.md`): this is an import aid for a human-reviewed list, not a live external feed sync.

Editorial guardrails apply throughout (implemented, issue #113): a content brief template can be marked `requires_consent` (seeded true for the community spotlight template); a content opportunity built from such a template cannot move to approved/scheduled/published without a recorded `content_permissions` row (permitted use, usage limits, on-file date) — a hard block, not just a warning. A calendar item can be flagged `is_sensitive_topic` (e.g. HIV/AIDS remembrance, Transgender Day of Remembrance) with tone guidance surfaced on its content brief; its content opportunity is likewise blocked from approved/scheduled/published until a reviewer records sign-off distinct from the ordinary content-status approval. A stated Chatter connection is required on a content brief once work moves past not-planned/idea (a lightweight guard against tokenism/generic posts). Content opportunities have an `internal_notes` field carrying a policy-level warning never to record specific personal, medical, legal, or confidential case details there — a policy guardrail, not automated detection.

The first-year seed is a curated Tier 1/Tier 2 set (see the planning doc's suggested list), not an exhaustive third-party awareness-day database, and requires operations and community-lead sign-off before import; each date is stored with its source, region, and any year-specific exceptions. Every subsequent year is no longer a manual one-off: the recurring-coverage reminder/auto-generate/bulk-import tooling described above (issue #191) turns the one-time seed into a repeatable process.

**Status.** The item model, portal CRUD/filters/month-list-agenda views, the content-opportunity brief with its status pipeline and lead-time scheduling, the public Community Calendar page, the starter brief template library, portal work queues/overdue-Tier-1 warnings, full audit history, the Tier 1/Tier 2 seed list, the editorial guardrails above, program intelligence's first three pieces — configurable program suggestions (`calendar_program_suggestion_rules`, `/portal/calendar/program-suggestions`), related-item recommendations (the item editor's Related Items tab), and the annual planning review report (`content_calendar_reports`, `get_calendar_annual_review_data`, `/portal/calendar/reports`) — and the recurring-coverage reminder/auto-generate/bulk-import tooling (`/portal/calendar/import`) are all implemented (issues #103, #104, #105, #106, #107, #108, #109, #110, #111, #112, #113, #191 — see §6). Optional iCal export remains unbuilt (tracked as a follow-up to #111). Full requirements: `planning/ideas/content_community_calendar.md`. Delivery is planned in three phases — (1) calendar foundation: item model, categories/tiers/statuses/owners/visibility/recurrence/audit fields, portal CRUD, public list; (2) content workflow: opportunities, templates, assignment/review, my-work/overdue/history; (3) program intelligence: configurable program suggestions, related-item recommendations, annual reporting, optional iCal export — tracked as issue #102 and its sub-issues, with only iCal export of phase 3 still open. Several open questions (which roles approve public content; which channels the first brief targets; whether public community moments get detail pages; who owns the annual observance list; notification channel; iCal export phase) were resolved 2026-08-26 — see `planning/decisions/2026-08-26-content-community-calendar-open-decisions.md` — with iCal export confirmed as a Phase 3/#111-follow-up item, not pulled forward.

## 6. Proposed Data Model

The following is a logical model, not a final migration. IDs should be UUIDs and all material records should include `created_at`, `updated_at`, and the creating/updating user where appropriate.

### Identity and access

Implemented (see §5.3):

- `roles`: named roles — currently check-constrained to the fixed set `admin`, `event_coordinator`, `finance`, `board`, `volunteer` defined in §5.3, with `description`
- `user_roles`: user-to-role assignments (`user_id`, `role_id`, `unique(user_id, role_id)`), RLS-restricted so a user can only read their own rows and only `admin` can write any
- `has_role(text)`, `is_admin()`, `my_roles()`: `security definer` SQL helper functions used by both RLS policies and the app (`my_roles` backs `getCurrentUserRoles` client-side) to check the calling user's own roles without recursive-policy issues
- `list_portal_users()`: a `security definer` RPC used only by Administration > Users to list `auth.users` (email, roles, created_at) for admins, since `auth.users` isn't otherwise exposed via the API
- `profiles`: still not implemented — not yet needed, since `list_portal_users()` reads email directly from `auth.users`
- `resources`: catalog of permissionable resources (`key`, `section`, `label`, `description`, `sort_order`) edited via Administration > Permissions
- `role_permissions`: role × resource → none/view/manage (`role_id`, `resource_id`, `level`, `unique(role_id, resource_id)`), RLS-restricted the same way as `user_roles`
- `has_permission(resource_key, min_level)`: `security definer` helper used by RLS policies, secured RPCs, and the app (via the `my_permissions()` RPC) to check the calling user's effective permission level for a resource across all their roles; `is_admin()` is now defined in terms of it (`has_permission('administration', 'manage')`) rather than hardcoding the `admin` role name
- `pending_role_grants`: **implemented** (issues #130/#134) — pre-stages a role grant for an email before that person's first sign-in (`email`, `role_id`, `status`: pending/claimed/revoked, `expires_at`, `created_by`, `claimed_by`/`claimed_at`, `revoked_by`/`revoked_at`, `invited_at`/`invited_by`), one active pending grant per `(email, role)` pair via a partial unique index. `claim_pending_role_grants()` (`security definer`) runs on OAuth callback and on every permissions check to convert a matching pending grant into a real `user_roles` row. Backs Administration > Users' "invite" flow, so an admin can grant access to someone who hasn't signed in yet.
- `deactivated_users`: **implemented** — `user_id` (PK → `auth.users`), `deactivated_at`, `deactivated_by`. `has_permission()`/`my_permissions()`/`is_admin()` all check this table and return no permissions for a deactivated user without touching their `user_roles`, so reactivating simply removes the row. Administration > Users exposes deactivate/reactivate controls; an admin cannot deactivate their own account.

### Audit log

Implemented for the tables listed below (see §5.11, issue #18):

- `audit_log`: `id`, `table_name` (FK → `audited_tables.table_name`, issue #421), `record_id`, `action` (`insert`/`update`/`delete`), `actor_id` (nullable FK → `auth.users`, null for non-request-scoped writes), `occurred_at`, `old_data`/`new_data` (full-row `jsonb` snapshots; no precomputed diff column — diffing two small `jsonb` objects is computed on read instead)
- `audited_tables`: registry table (`table_name` PK, `pk_column` defaulting to `'id'`) that both the FK above and `audit_log_row()` key off of — not exposed to the API (RLS enabled, no policies/grants), read only by the trigger function and by migrations. Onboarding a newly-audited table is one additive `insert` into this table plus a `create trigger`, not a check-constraint drop/recreate of the full accumulated list
- `audit_log_row()`: a generic `security definer` `plpgsql` trigger function fired `AFTER INSERT OR UPDATE OR DELETE` on each audited table; looks up the table's `pk_column` from `audited_tables` via `TG_TABLE_NAME` and reads `to_jsonb(NEW/OLD) ->> pk_column` for `record_id` (raising if the table isn't registered or the resolved column doesn't exist on the row), instead of assuming every table's primary key is named `id`
- RLS: select-only, restricted to `has_permission('administration', 'manage')`; no insert/update/delete policy exists for any role, so writes only ever happen through the trigger
- Currently audited: `donations`, `inventory_items`, `inventory_movements`, `event_expenses`, `user_roles`, `app_settings`, `calendar_items`, `pending_role_grants`, `content_opportunities`, `deactivated_users` (`pk_column = 'user_id'`), `event_revenue`, `reimbursements`, `content_permissions`. Not yet covered: `events`, `giveaways`/`giveaway_prizes`/`giveaway_winners` — named in §5.11's requirement but out of scope for the v1 build

### Public and events

- `pages` or repository content: approved public content
- `events`
- `event_sponsors`: links an event to a `people` record via `person_id` (one row per event/person pair), plus per-event sponsorship details — support type, in-kind description, contribution value, public visibility, notes. Sponsor/partner name and contact info are not duplicated here; they live on the linked `people` row.
- `event_volunteers`: links an event to a `people` record via `person_id`, with an optional free-text `role` and notes; a lightweight, event-scoped sign-up list (predates the fuller `volunteer_role_types`/`volunteer_hours` catalog in "Volunteers" below). Optional `shift_id` (issue #70) assigns the volunteer to a time-bounded `event_shifts` row.
- `event_logistics`: **implemented** — one row per event (`event_id` PK/FK): meeting point, gear requirements, transportation, food, supplies, emergency contact name/phone, notes. A separate table rather than more `events` columns, matching the `event_sponsors`/`event_expenses` per-tab pattern.
- `event_incidents`: **implemented** — see §5.5/§16.1: `event_id`, `occurred_at`, `description`, `severity` (minor/moderate/serious), `people_involved`, `reported_by`. Restricted to `admin`/`event_coordinator`.
- `event_shifts`: **implemented** (issue #70) — time-bounded shifts within an event (e.g. basecamp AM/PM on a multi-day trip): `event_id`, `label`, `starts_at`/`ends_at`, optional `target_headcount`, notes. Scoped to `event_volunteers` for now; staff-side shift assignment is left for a follow-up once `event_staff` (§5.9) lands. Managed from the event editor's Volunteers tab, gated by the `events` resource.
- `event_volunteer_hours`: **implemented** — a lightweight, event-scoped hours log (`event_id`, `person_id`, `hours`, `logged_date`, notes, `logged_by`), predating and distinct from the org-wide `volunteer_hours` table under "Volunteers" below (no `volunteer_role_type_id` yet). Logged from the event editor's Volunteers tab and rolled into the impact reporting in §5.15.
- `event_staff`: not yet implemented — see §5.9; mirrors `event_volunteers` (`event_id`, `person_id`, optional role/title, notes, unique per event/person pair), and would itself be what derives the staff role.
- `event_registrations`: **implemented** — public registration for an event (name, email, phone, party size, notes), submitted via the anon-callable `register_for_event()` RPC (validates the event is public/published, registration is open, and capacity). Links to a `people` record via `person_id`, resolved-or-created by normalized email inside the RPC (`resolve_or_create_person_by_email()`, since there's no signed-in user to drive a `PersonPicker`); existing rows were backfilled by matching `people.email` where possible. `create_donation_with_items` uses the same helper to resolve an existing `people` row by email instead of always inserting a duplicate. `checked_in_at`: explicit per-registrant check-in (set by staff from the portal, not derived from `events.attendance_count`/`attendance_notes`, which remain a separate manual estimate — see §5.9-adjacent event-day tooling). A walk-in who never pre-registered gets their own `event_registrations` row, created at check-in time via `PersonPicker`, rather than a separate table.
- `discount_codes`: manual tracking of discount codes a partner/vendor issues for an event (code, description, source) and which registrant each was given to (`registration_id` → `event_registrations.id`, single-use via a unique constraint on `registration_id`, plus a unique `(event_id, lower(code))` index). No payment/pricing integration — redemption happens outside chattersnow-web. No automatic assignment at registration time (needs board input; tracked separately).
- `contact_messages`: **implemented** (issue #172) — `name`, `email`, `topic`, `message`, persisted via the `security definer` `submit_contact_message()` RPC (honeypot + rate-limited — see §7 item 9); no email is sent. **Implemented — portal triage** (issue #173): a `status` column (new/read/resolved) plus `updated_at`/`updated_by`, gated by the dedicated `communications` resource (§5.3) rather than the original `is_admin()`-only `select` policy. Staff review submissions at `/portal/communications`; opening a message auto-marks it read, and new messages are flagged in the notification bell and dashboard.
- `rate_limit_hits`: **implemented** (issue #172) — shared abuse-protection primitive (`route`, `ip_address`, `created_at`) behind `check_rate_limit()`; not exposed to `anon`/`authenticated` directly. See §7 item 9 for which public RPCs use it and at what thresholds.

### Programs and impact

- `programs`: **implemented** (issue #45) — name, description, status (active/pilot/retired)
- `events.program_id`: **implemented** — nullable FK from `events` to `programs`, so existing and one-off events remain valid without a program
- `event_impact_notes`: **implemented** (issue #48) — one row per event: participation counts (total, first-time, first-time riders, beginner, volunteer), financial-assistance counts and dollar total, equipment-loan count, beginner-pairings count, and yes-counts for the five-question post-event survey described in `RUNNING_PROGRAMS.md`. Gated by the `event_impact` resource; entered via the event editor's Impact tab.

Impact rollups themselves (per-event, per-program, and season reports, including a basic list of events tagged to a program — see §5.14) are computed over these tables plus `donations`, `event_expenses`, `inventory_movements`, and `volunteer_hours`. **Implemented** (issue #48): `get_program_impact_rollup_data(p_program_id)`, a `security definer` RPC bundling this data for every event tagged to a program, backing `/portal/programs/reports` (gated by the `programs_reports` resource).

### Inventory and donations

- `people`: shared directory of donors, sponsors, volunteers, and staff (name, email, phone, notes), so the same contact can be reused across roles instead of being duplicated per context. It carries **no role columns**: role membership is derived by `public.people_with_roles` (§5.9), the view every read site uses, from the records that create each role unioned with `person_role_tags`. A role is therefore never stale — it appears with the record behind it and goes away with the last one. `person_type` (`individual` | `organization`, issue #625) is the separate, exclusive axis: it is staff-asserted rather than derived and decides the shape of the record — an organization has a logo, a website, a primary contact and org memberships, an individual has a rider profile — so the person form renders one branch or the other off it. A further type (`household`, for family registrations) is a check-constraint change rather than another boolean.
- `donations`
- `donation_items`
- `inventory_items`: donation-managed inventory records with description, size, type, gender, condition, face value, photo, and status
- `inventory_movements`: receipt, distribution, adjustment, and retirement transactions
- `person_role_tags`: manual role assertions (`person_id`, `role`, `granted_at`, `granted_by`, `notes`) — the half of the derived role model no source record backs, such as a sponsor entered in the directory before any event link exists. Unlike a boolean it carries when the role was asserted and by whom
- `people_with_roles`: `security_invoker` view over `people` adding the four derived role flags via the `security definer` helper `person_role_flags()` (§5.9); granted to `authenticated` only, and read-only — writes go to `people`
- `public_gear_catalog`: read-only view over `inventory_items` limited to `status = available` rows and a curated column set (description, size, type, gender, condition, photo); granted to the `anon` role so it can back the public gear gallery without relaxing RLS on the base table
- `inventory_photos`
- `distribution_recipients`: protected recipient records, if needed

### Volunteers

**Implemented** (issues #49/#50) — see §5.17.

- `volunteer_role_types`: catalog of role-type definitions (e.g. Ride Buddy, Event Setup, Basecamp Staffing) — named to avoid colliding with the existing RBAC `roles` table in "Identity and access" above, which is a different concept (portal permissions, not volunteer job types). Currently `name`/`description` only.
- `volunteer_hours`: `person_id` (→ `people`), optional `event_id`, date, hours, `volunteer_role_type_id`, and the user who logged the entry
- `volunteer_role_types.is_public` + `public_volunteer_role_types`: **implemented** (issue #60) — a public-facing flag on `volunteer_role_types` and a curated view (`id`, `name`, `description`) granted to `anon`, backing `/get-involved/volunteer`.
- `volunteer_applications`: **implemented** (issue #161) — public intake, separate from the role-type catalog above: `person_id` (→ `people`), `name`, `email`, `phone`, free-text `role_interest`, `availability`, `status` (new/being reviewed/contacted/placed/declined/closed), submitted via the `security definer` `submit_volunteer_application()` RPC. Also carries `updated_at`/`updated_by` (issue #173, backing the portal triage queue at `/portal/volunteers/applications` — see §5.17) via the same shared `set_updated_at` trigger used elsewhere in the schema.

### Finance and giveaways

- `event_revenue`: **implemented** (issue #27) — optional `event_id`, `source` (check-constrained to ticket_sales/registration_fees/merchandise/onsite_donations/grants/other — deliberately excludes sponsorship, which is tracked via `event_sponsors` instead), `amount`, `received_date`, `notes`. Plain CRUD (no approval workflow), gated by the `event_revenue` resource, at `/portal/finance/revenue`.
- `event_expenses`: implemented, with an optional `event_id` (nullable — expenses may or may not be tied to an event) and `receipt_url` (a plain text link to the file in an external solution, not an upload — see §5.6). **Implemented** (issue #29): an approval state (`status`: submitted/approved/rejected/paid), `submitted_by`, `approved_by`/`approved_at`, `rejected_by`/`rejected_at`/`rejection_reason`, `paid_by`/`paid_at` — see §5.16.
- `reimbursements`: **implemented** (issue #51) — requester `person_id`, amount, description, `receipt_url` (external link, same pattern as `event_expenses`), optional `event_id`, and the same approval-state shape as `event_expenses` but with its own resources (`reimbursements`, `reimbursement_approvals`, `reimbursement_self_approval`) and `app_settings` threshold (see §5.16, §5.18)
- `file_attachments`: not planned — a permanent design decision, not an initial-release gap; see §2, §5.12
- `giveaways`, `giveaway_prizes`, and `giveaway_winners`: implemented (see §5.8); `giveaway_prizes` references its donor via `donor_person_id` (a `people` foreign key) and, optionally, the donation it was sourced from via `source_inventory_item_id` / `source_monetary_donation_id` (mutually exclusive, both `on delete set null`)

### Governance

Meetings, agendas, minutes, action items, decisions, board members, nonprofit-status tracking, bylaws, policies, conflict-of-interest disclosures, and annual requirements are all implemented.

- `board_members`: links a `people` record with role/title, term start/end, and active status. `bylaws.md` Article VI's Board/Advisory Committees concept (issue #12) is deliberately out of scope for this data model for now — no `committees` entity exists, and committee membership is not tracked here.
- `governance_meetings`: date, type (board, committee, annual, other), status, `facilitator_person_id`/`notetaker_person_id` (both → `people`, issue #166); associated `governance_meeting_attendees` link table to `people`
- `agendas`: linked to a `governance_meetings` row (unique). `external_link` plus a structured, template-driven body (issue #166): `template_id`/`template_version_id` (pinned at save time, → `agenda_templates`/`agenda_template_versions`), `ongoing_items` (jsonb, keyed by template section, holding per-meeting updates/decisions-needed text), `new_business`/`parking_lot` (jsonb string arrays), `upcoming_dates` (jsonb array of date/description/owner), `next_meeting_date`/`next_meeting_topics`, and `body_text` (repurposed as free-form meeting notes).
- `agenda_templates` / `agenda_template_versions`: a small versioned catalog (issue #166), mirroring `content_brief_templates`/`content_brief_template_versions` below — a template's `current_version_id` points at its live `sections` (each `{key, label, topics}`, one per standing "Ongoing Board Items" subsection); revising a template inserts a new version rather than mutating one an existing agenda is pinned to. Seeded with a single `board_meeting` template covering the seven standard sections.
- `minutes`: linked to a `governance_meetings` row
- `governance_meeting_action_items`: linked to a `governance_meetings` row, description, owner (`people`), due date, status (open/done)
- `governance_meeting_decisions`: linked to a `governance_meetings` row, description (the discussion), decision date, and optional `topic`/`vote_result` (issue #166) so a decision can serve as an agenda's "Decisions & Votes" entry — distinct from `resolutions` below, which are formal motions
- `resolutions`: linked to a `governance_meetings` row (optional), motion text, mover/seconder (`people`), vote outcome, effective date
- `bylaws`: **implemented** (issue #38) — `version`, `effective_date`, `amendment_summary`. Each amendment is its own row rather than mutating a shared "current" record, per the app's records-with-history philosophy (§2 goal 4); the row with the latest `effective_date` is the current bylaws, and the full row list is the amendment history — no separate history table. `/portal/governance/bylaws` shows the current version plus a history table of prior versions.
- `policies`: **implemented** (issue #38) — `name`, `category` (free text — spec gives examples, no fixed taxonomy), `effective_date`, `version`. Same one-row-per-revision approach as `bylaws`. `/portal/governance/policies` is a searchable/filterable list.
- `conflict_of_interest_disclosures`: **implemented** (issue #39) — linked to a `people` record, `disclosure_year`, `on_file_date`, `notes`, unique per person/year.
- `annual_requirements`: **implemented** (issue #39) — `name`, `due_date`, `status` (not_started/in_progress/done), `completed_at` (derived from status transitions in app logic), responsible `people` record.
- `nonprofit_status_milestones`: **implemented** (issues #145/#146, #356) — `description`, `phase`, optional `owner_person_id` (→ `people`), `due_date`, `status` (not_started/in_progress/done/cancelled), `sort_order` (stable row order within a phase, since seeded rows share one `created_at`), optional free-text `notes`. A plain checklist (no percent-complete meter, by design), seeded from `planning/governance/NONPROFIT_FORMATION.md`'s Phase 1–5 checklist, gated by the existing `governance` resource (no new resource needed) at `/portal/governance/nonprofit-status`.

`minutes`, `resolutions`, `bylaws`, `policies`, `conflict_of_interest_disclosures`, and `annual_requirements` each hold their substantive content via nullable `external_link` and `body_text` columns, populated in either or both, per §5.12. `minutes` is already built this way; `agendas` moved to the structured, template-driven column set described above. There is no `file_attachment_id` column and none is planned — `file_attachments` is not being built (see §2).

### Content and community calendar

Data model, portal CRUD, the public surface, the content-opportunity workflow, brief templates, work queues, editorial guardrails, audit history, configurable program suggestions, related-item recommendations, the annual planning review report, and the recurring-coverage reminder/auto-generate/bulk-import tooling are all implemented (issues #103, #104, #105, #106, #107, #108, #109, #110, #111, #112, #113, #191); optional iCal export remains planned as a follow-up to #111 — see §5.20 and issue #102.

- `calendar_items`: title, item type, `starts_at`/`ends_at`, recurrence/annual-observance rule, time zone, summary, priority tier + rationale, calendar status (idea/active/complete/archived), public visibility (public/internal/unlisted draft), owner (`owner_id` → `auth.users`), `decision`/`decision_note` (plan/skip/defer, per #104 — the requirements doc's base item-management field, distinct from the content-opportunity brief owned by #106), `source`/`region`/`exceptions` (issue #112, seed provenance), `is_sensitive_topic`/`tone_guidance`/`sensitive_review_by`/`sensitive_review_at` (issue #113 — a sensitive-topic flag with tone guidance and reviewer sign-off, distinct from the content opportunity's own approval step), `series_key`/`recurrence_start_month`/`recurrence_start_day`/`recurrence_end_month`/`recurrence_end_day`/`recurrence_end_is_month_end` (issue #191 — optional structured recurrence: a month-day anchor pair grouped by `series_key` across a recurring series' yearly instances, paired-nullable with each other and independent of the always-present free-text `recurrence_rule`; `recurrence_end_is_month_end` computes the true last day of the end month at generation time rather than storing a hardcoded day, so month-end series resolve correctly in a leap year), created/updated timestamps and actor columns.
- `calendar_item_categories`: item ↔ category (lgbtq_community, winter_outdoor_sports, community_social_justice, chatter_events, campaigns_fundraising, partner_opportunities), a fixed label taxonomy, not free-text tags.
- `calendar_item_programs`: links a `calendar_items` row to one or more `programs` rows.
- `calendar_item_links`: **implemented** (issue #110) — self-referencing related-item links, surfaced on the item editor's Related Items tab alongside suggested links (shared categories/programs).
- `calendar_program_suggestion_rules`: **implemented** (issue #110) — admin-maintained rules (`item_type` and/or `category`, `program_id` → `programs`, `note`, `is_active`; at least one of `item_type`/`category` required) that surface as dismissible, editable program-suggestion chips in the item editor — never an automatic assignment. Gated by the existing `content_calendar` resource; managed at `/portal/calendar/program-suggestions`.
- `get_calendar_annual_review_data(p_year int)`: **implemented** (issue #111) — a `security definer` RPC bundling the selected year's `calendar_items`/`content_opportunities`/`content_permissions` rows into one jsonb payload; app-level TypeScript computes the six planning-cycle success measures from `planning/ideas/content_community_calendar.md` §12 (no SQL views, matching every other report in this codebase — see `get_program_impact_rollup_data` in "Programs and impact" above). Gated by its own `content_calendar_reports` resource (admin/event_coordinator manage, finance/board/volunteer view — same split as `content_calendar`), backing `/portal/calendar/reports`.
- Recurring-coverage reminder/auto-generate/bulk import (issue #191, `/portal/calendar/import`): app-level TypeScript, not a new RPC — unlike `get_calendar_annual_review_data` above, every table this reads/writes is already gated by `content_calendar` for the calling user, so there's no cross-resource RLS gap to paper over (same reasoning as the existing `getContentWorkSummary` dashboard summary). `findMissingCoverageSeries`/`getMissingCoverageSeriesForYear` group structured-recurrence Tier 1/2 items by `series_key` and flag any with no instance dated in the target year; `generateNextYearInstanceAction`/`generateMissingCalendarSeriesInstancesAction` insert the next instance (always `idea`/internal/no-decision, sensitive-topic sign-off reset), re-checking coverage at execution time rather than trusting the caller so re-running is a no-op once a year is covered; `bulkImportCalendarItemsAction` inserts new one-off rows from a CSV batch, force-setting the same idea/internal/no-decision state and stamping `source`/`region` regardless of what the CSV contained.
- `public_calendar_items`: curated read-only view (public + active/complete items only, no owner/internal fields), granted to `anon`, mirroring `public_events`; the editorial-guardrail columns above are internal-only and excluded from this view's explicit column list.
- RLS via the `content_calendar` resource (admin/event_coordinator manage, finance/board/volunteer view); `audit_log` covers `calendar_items`; `list_calendar_owners()` RPC (mirrors `list_event_leads()`) backs the portal's owner picker.
- `content_opportunities`: one-to-one with a `calendar_items` row (`calendar_item_id` unique) — content status (not planned/idea/draft/in review/changes requested/approved/scheduled/published/skipped, check-constrained to require `skip_reason` when skipped; a stated Chatter connection is required, per issue #113, once status moves past not-planned/idea/skipped), recommended formats/channels, recommended action/CTA, outstanding work, `internal_notes` (issue #113 — general staff working notes, carrying a policy warning to never record specific personal/medical/legal/confidential case details), owner/reviewer (`auth.users`), configurable `lead_time_days` (org default seeded in `app_settings` as `content.default_lead_time_days`), draft/review/publish due dates (defaults computed client-side from the target publish date and lead time — draft at two-thirds, review at one-third — editable per item), `template_id`/`template_version_id`/`template_field_values` (issue #107), and a single `status_changed_by`/`status_changed_at` pair for the most recent transition. RLS reuses the `content_calendar` resource, same as `calendar_items`; `app_settings`' select policy was widened to include `content_calendar` managers so `event_coordinator` can read the lead-time default. Full multi-transition history is available via `audit_log` (issue #109).
- `content_brief_templates` / `content_brief_template_versions` (issue #107): name, `is_active`, `requires_consent` (issue #113 — admin-editable, seeded true only for the community spotlight template), and a versioned field schema (`{key, label, help_text}[]`) for the starter library (community spotlight, awareness/community moment, partner spotlight); a content opportunity pins the version it was built from, so revising a template's fields never alters records already built from an earlier version.
- `content_permissions` (issue #113): one-to-one consent record for a content opportunity built from a `requires_consent` template — permitted use, usage limits, consent-on-file date, and who recorded it. A content opportunity gated by `requires_consent` is hard-blocked from moving to approved/scheduled/published without one.
- Audit coverage extends the existing `audit_log` pattern (§5.11) to `calendar_items` (issue #103), `content_opportunities` (issue #109), and `content_permissions` (issue #113) rather than introducing a parallel history mechanism; all three are wired via the generic `audit_log_row()` trigger, and the Administration > Audit log UI's table filter/labels cover all three.

Foreign keys should enforce relationships. Monetary amounts should use a fixed-precision numeric type, not floating-point values. Dates should be stored with timezone-aware timestamps; event display timezone is an event or organization configuration decision.

## 7. Security and Privacy

1. Enable RLS on every exposed application table; do not rely on frontend route hiding as authorization.
2. Public read access should be limited to records explicitly marked published/public.
3. Authenticated users should receive only the permissions associated with their roles.
4. Financial, donor, recipient, internal note, and audit data must not be available to the anonymous role.
5. Storage buckets must be private by default. Use signed URLs for authorized files and transformed/public assets only where intentionally approved.
6. Validate authorization again in server actions or API routes that perform multi-step writes.
7. Use database transactions or RPCs for workflows such as receiving donations and distributing inventory so related records cannot be partially written.
8. Validate all client input with shared schemas and enforce database constraints for quantities, amounts, statuses, and required relationships.
9. Rate-limit public registration and other write endpoints; add bot protection if abuse appears. **Implemented** (issue #172): a shared `rate_limit_hits` table (`route`, `ip_address`, `created_at`) and `check_rate_limit(route, ip_address, max_attempts, window)` `security definer` RPC (sliding window, fails open on a null IP) back per-route limits on `submit_contact_message()` (5/15min), `register_for_event()` (8/15min, plus a honeypot field), and `submit_volunteer_application()` (5/15min by IP, plus its existing 24h per-email throttle and a honeypot field).
10. Log security-sensitive actions without placing secrets or unnecessary personal data in logs.
11. Define retention, deletion, export, and access procedures for donor and recipient personal information before production use.

## 8. Application Structure

Use the Next.js App Router with route groups that make the public/portal boundary visible in the codebase. The actual tree (current, differs slightly from the original proposal — the portal lives under `/portal/(app)/` rather than a top-level `(portal)` group; see §4 for the public-site nav restructure this reflects):

```text
src/app/
  (public)/
    home/                       # public landing page — implemented
    about/                      # mission, story, team (bios pending) — implemented
    programs/                    # pillar/program content — implemented but unlinked from nav (issue #46)
    events/
      [id]/                     # direct-link event detail page
      community/                # public Community Calendar (§5.20)
    gears/
      library/                  # gear catalog + detail/request flow — implemented
      donate/                   # donate-gear info page
    get-involved/
      attend/
      volunteer/                # opportunities (from volunteer_role_types) + application form — implemented
      partner/
    support/
      donations/                # monetary giving — placeholder
      sponsorship/              # implemented
    contact/                    # form + published email/social — implemented
  auth/
    callback/
    confirm/
  portal/
    login/
    set-password/
    (app)/                      # authenticated portal shell (sidebar layout)
      home/                     # admin dashboard
      entry/
      events/                   # events, sponsors, expenses/revenue tabs, giveaway tab, attendance/impact tabs
      inventory/                # items, donations, distribution, reports (valuation) — all implemented
      finance/                  # donations, expenses, reimbursements, revenue, reports (reports still placeholder)
      people/                   # shared donor/sponsor/volunteer directory
      programs/                 # program CRUD (issue #45) + reports/ (season/program impact rollup, issue #48)
      governance/               # board-members, meetings (incl. agendas), resolutions, bylaws, policies, conflict-of-interest, annual-requirements, nonprofit-status — all implemented
      volunteers/                # roles (role types) + participation (hours logging) + applications (public intake queue, issue #173) — implemented (issues #49/#50/#173)
      communications/            # contact-form message queue — implemented (issue #173)
      calendar/                 # content & community calendar (§5.20) — implemented, incl. program-suggestions/, templates/, work-queue/, reports/ (annual planning review, issue #111)
      administration/           # users (incl. invite links, deactivation), roles, permissions, audit-log — implemented; system-settings — implemented (app_settings)
```

The exact route structure may evolve, but authenticated portal layouts must verify the session and authorization before rendering protected data. Use server components for read-heavy pages where practical and keep service-role operations server-only.

**UI convention — view/edit vs. create:** creating a new record uses a `Dialog` (a centered, small-form modal — e.g. `new-person-dialog.tsx`, `new-program-dialog.tsx`, `new-event-dialog.tsx`); viewing/editing an existing record uses a `Sheet` (a side panel, which scales better to a record's full detail and, for events, multiple tabs — e.g. `edit-person-modal.tsx`, `edit-inventory-modal.tsx`, `edit-expense-modal.tsx`, `event-details-dialog.tsx` despite its filename). `programs/program-details-dialog.tsx` and `volunteers/roles/role-type-details-dialog.tsx` still use the older Dialog-based view/edit pattern and should be converted to match.

Supabase database changes should be implemented as ordered migrations under `supabase/migrations/`. Seed data should be safe for local development and must not contain real donor or recipient information.

## 9. Key Workflows

### Public event registration

1. Visitor opens a published event.
2. Application verifies registration is enabled and accepts the submitted form.
3. Server validates capacity/deadline rules if enabled.
4. Registration is stored with minimal necessary personal data.
5. Confirmation behavior is applied when the feature is implemented.

### Receive donation

1. Authorized user opens the donation workflow.
2. User records donor and donation type.
3. User records donation items and condition.
4. Server creates donation, donation items, and receipt movements atomically.
5. Inventory availability updates from the new movement.
6. Audit entry records the actor and created records.

### Distribute gear

1. Authorized user selects inventory and quantity.
2. Server checks current availability and permissions.
3. User records event, recipient information if required, and reason.
4. Server creates the distribution movement atomically.
5. Available quantity reflects the movement.
6. Audit entry records who distributed what and when.

### Public contact inquiry

1. Visitor submits the contact form on the Contact Us page.
2. Server validates input and applies rate limiting/bot protection.
3. Server stores the inquiry in `contact_messages` for staff follow-up; no email is sent in the initial release.
4. Visitor sees a confirmation state; failures are surfaced without exposing delivery internals.
5. A `communications`-permission holder triages the message at `/portal/communications`: opening it marks it read, and it can be marked resolved once handled.

### Record event expense

1. Authorized user selects an event and enters expense details.
2. Server validates amount and event access when an event is associated.
3. User optionally pastes a link to the receipt file stored in an external solution (Google Drive/OneDrive) — no upload for the initial release.
4. Expense record and receipt link are saved.
5. Audit entry records the action.

## 11. Non-Functional Requirements

- **Accessibility:** Meet WCAG 2.2 AA targets for public and portal interfaces, including keyboard access, focus states, form errors, labels, and color contrast.
- **Responsive behavior:** Support current desktop and mobile browsers; operational tables must have a usable mobile treatment.
- **Performance:** Public pages should use optimized images, predictable loading states, and cacheable reads where safe. Private data must not be accidentally cached publicly.
- **Reliability:** Multi-record operational actions must be atomic and recoverable.
- **Observability:** Capture deployment errors, failed workflows, and security-relevant events without exposing personal data.
- **Backups:** Use Supabase backup and recovery capabilities appropriate to the selected plan and document restore ownership and testing.
- **Maintainability:** Keep schema changes in migrations, use TypeScript types generated from the database where practical, and require review through GitHub pull requests.

## 12. Acceptance Criteria for Initial Release

The initial release is ready when:

- An unauthenticated visitor can navigate approved public content without being redirected to sign in.
- Published upcoming and past events render correctly with their public details.
- Private or draft events do not appear publicly.
- A user cannot read donor, recipient, financial, inventory history, or audit data through the anonymous client.
- An unauthenticated visitor can browse the public gear availability catalog (filter/search included) and never sees donor, financial, notes, or status/movement data in the page or its network responses.
- An administrator can authenticate with Google and access the dashboard, events, expenses, and inventory portal areas.
- Donation receipt and inventory update workflows preserve transaction history.
- Inventory counts cannot become negative through normal application workflows.
- Sensitive uploaded files (e.g. inventory/gear photos) are private and access-controlled where applicable; expense/reimbursement/governance records store external file links rather than uploads for the initial release, and those links are only readable by the roles authorized for that record.
- RLS and authorization behavior are covered by automated tests or documented repeatable checks.
- Production deployment works through Vercel with Cloudflare DNS and environment-specific Supabase configuration.

## 14. Risks and Mitigations

| Risk                                                                           | Mitigation                                                                                                                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public exposure of internal inventory or donor data                            | Private-by-default tables/storage and RLS tests                                                                                                                     |
| Inventory counts lose their history                                            | Append-only movement records and controlled correction workflow                                                                                                     |
| Financial records are mistaken for formal accounting                           | Define reporting scope and reconcile with the organization's accounting process                                                                                     |
| No roles exist yet — every authenticated user currently has full portal access | Introduce `roles`/`user_roles`, replace blanket "authenticated full access" RLS policies with role-scoped ones, and review access with real operators before launch |
| Registration creates privacy or capacity problems                              | Start with minimal fields and add capacity/confirmation rules explicitly                                                                                            |
| Giveaway functionality creates compliance exposure                             | Complete legal review before enabling ticket sales                                                                                                                  |
| Production and preview environments share data accidentally                    | Separate environment variables and Supabase projects or strict project policies                                                                                     |

## 15. Success Measures

After launch, the team should evaluate:

- Public event and support page engagement.
- Registration completion and attendance reconciliation.
- Time required to record a donation and distribute gear.
- Inventory reconciliation accuracy.
- Completeness of event revenue and expense records.
- Number and severity of unauthorized access attempts or policy violations.
- Staff and volunteer feedback on portal usability.

## 16. Addendum: Gaps From Role Review (2026-08-22)

A review against the Director of Operations and Bookkeeping/Finance Administration responsibilities in `planning/governance/roles-and-responsibilities.md` found four operational needs with no corresponding requirement anywhere above. As of this review, volunteers, registration, reimbursements, approvals, and impact tracking have all since shipped (see §5.14–§5.18); these four remain the only genuinely unspecified gaps.

### 16.1 Incident / problem documentation

The roles doc calls for "how incidents/problems are documented" as an internal process Operations must establish. This is now **partially implemented**: `event_incidents` (description, severity: minor/moderate/serious, people involved, occurred-at, reporting user, restricted to `admin`/`event_coordinator`) covers event-scoped incidents — see §5.5.

**Remaining gap.** `event_incidents` has no category field, no `open`/`resolved` status or resolution notes, no optional inventory-item linkage, and no incident that isn't tied to a specific event (e.g. a storage-location issue). If those are needed, either extend `event_incidents` or add the originally-proposed cross-cutting `incident_reports` (`category`, `inventory_item_id` nullable FK, `status`, `resolution_notes`, and `event_id` made nullable) alongside it.

### 16.2 Inventory storage locations

The roles doc lists "storage locations" under Director of Operations inventory duties. §5.4 and §6 give `inventory_items` no location field — the current model has no way to record where a physical item actually is.

The system shall let authorized users define named storage locations (e.g. a storage unit, an event trailer, a volunteer's garage) and assign each inventory item to one.

**Data model:** `storage_locations` — `id`, `name`, `description`, `notes`. `inventory_items.location_id` — nullable FK to `storage_locations`. A location change should be recorded as a movement (extending the `inventory_movements` movement-type set in §5.4) so relocation history isn't lost, consistent with the append-only pattern already used for stock changes.

**Not yet implemented.**

### 16.3 Low-stock identification

The roles doc lists "identifying low-stock items" under Director of Operations inventory duties. Neither the inventory valuation reporting in §5.19 nor any other section surfaces stock levels against a threshold — only total value.

The system shall flag inventory item types whose current available quantity has fallen below a defined threshold, surfaced on the dashboard (§5.10) and/or the inventory reports page (§5.19).

**Data model:** a `low_stock_threshold` column (nullable, per item type/category) plus a computed view comparing current available quantity (derived from `inventory_movements` per §5.4) against that threshold. No new transactional tables required.

**Not yet implemented.**

### 16.4 Donated vs. purchased inventory tracking

The roles doc lists "tracking donated vs. purchased items" under Director of Operations inventory duties. §6 describes `inventory_items` as "donation-managed inventory records" fed from `donation_items` — there's no path for inventory the organization buys directly rather than receives as a donation, so the two can't currently be distinguished in reporting.

The system shall record each inventory item's acquisition type (donated vs. purchased vs. other) independent of whether a `donation`/`donation_items` record exists, and let valuation/impact reporting (§5.15, §5.19) break totals out by acquisition type.

**Data model:** `inventory_items.acquisition_type` (donated/purchased/other). A purchased item is created via a direct inventory receipt movement (§5.4) with no donor linkage, rather than through the donation workflow; if a purchase has an associated expense record (§5.6), link `inventory_items` to the originating `event_expenses` row so the item's cost basis is traceable.

**Not yet implemented.**

## 17. Addendum: Access Management Requirements Review (2026-08-28)

A detailed requirements draft for a new Administration > Access Management module (an external asset/access registry — tracks who has access to what and whether it's been reviewed; explicitly not a credential/secrets store) was reviewed against the existing codebase before ticketing. Two issues came out of that review: [#421](https://github.com/chattersnow/chattersnow-web/issues/421) (prerequisite — the `audit_log.table_name` check-constraint allowlist has already caused two production bugs and needs a registry-table replacement before more audited tables are added) and [#424](https://github.com/chattersnow/chattersnow-web/issues/424) (MVP — `services`/`assets`/`access_grants` tables, Administration sub-tab). The sections below record what the original draft proposed that was deliberately left out of both tickets, and why, so it isn't mistaken for an oversight later.

### 17.1 Parallel portal-role tier system

The draft proposed new portal permission tiers (Super Admin / Board Admin / Director / Standard User) specific to this module. **Not adopted.** The portal already has a data-driven `resources`/`role_permissions` matrix (§6, `has_permission()`) that every other module uses for authorization; #424 adds resource keys to that matrix instead of introducing a second RBAC system.

### 17.2 Access requests (self-service request/approval workflow)

The draft's request workflow (requester → asset owner notified → approve/deny → portal record updated) was excluded from #424. At the organization's current size, asking an asset's administrator directly (email/Slack) serves the same purpose without a new `access_requests` table, approval routing, or notification UI. **Not yet implemented** — revisit if request volume ever makes the informal path a bottleneck.

### 17.3 Persisted access-review and offboarding-case records

The draft modeled access reviews and offboarding as their own tables (review items, offboarding cases/tasks). #424 instead records a review as an `audit_log` entry plus an updated `last_verified`/`last_reviewed` date on the grant/asset, and derives an offboarding checklist live from `access_grants where person_id = X and status = 'active'` rather than persisting a case object. **Not yet implemented** — worth a real case-tracking table if offboarding checklists ever need to persist partial progress across sessions or be assigned/tracked independently of the live grant list.

### 17.4 Nested asset category taxonomy

The draft's roughly six-category, thirty-subcategory taxonomy (Technology/Communications/Operations/Finance/Administration/Marketing, each with subtypes) was replaced with a single flat `category` enum on `assets` in #424. **Not adopted** — the organization's actual asset count (the draft's own estimate: under 25) doesn't justify a nested taxonomy; revisit only if the flat enum becomes unwieldy in practice.

### 17.5 MFA verification against each service

MFA status is a manually-updated field in #424 (required/enabled/disabled/unknown), not verified against each service's actual state. Per-service API integration (Cloudflare, GitHub, Vercel, etc.) to verify MFA automatically, and eventual automated provisioning/deprovisioning, were explicitly deferred in the original draft. **Not yet implemented.**

### 17.6 Onboarding packages, access-matrix report, service integrations

The draft's onboarding-recommendation UI, a person × asset access-matrix report, and any service API integrations (Cloudflare/GitHub/Vercel/Google Workspace/password-manager) were excluded from #424 entirely — no ticket exists for these yet. **Not yet implemented** — revisit once the MVP registry has real data in it.
