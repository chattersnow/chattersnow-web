# Chatter Snow Website and Operations Portal

## Technical Specification

- **Status:** Draft for team review
- **Version:** 0.8
- **Date:** 2026-08-24
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
- An in-app file upload/attachment solution for documents (expense/reimbursement receipts, governance records). The initial release relies on an existing external solution the organization already manages (Google Drive/OneDrive): records store a link to the file, not the file itself. In-app upload to Supabase Storage (the `file_attachments` table) is a candidate for a later release — see §5.6, §5.12, §5.18, §6.

(Giveaway recording and event attendance headcounts, listed as future capabilities in earlier drafts, are now implemented — see §5.5 and §5.8. Volunteer management, previously listed here as a non-goal, is now specified — see §5.17.)

## 3. Technology and Deployment

| Area | Decision |
| --- | --- |
| Frontend and application | Next.js App Router, TypeScript, React |
| UI components | shadcn/ui (Tailwind v4 + Base UI primitives), composed with the project's own brand tokens/classes in `globals.css` |
| Hosting | Vercel |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth with Google OAuth |
| Files | Supabase Storage (inventory/gear photos). Document attachments (receipts, governance records) are external links for the initial release — see §2. |
| Data API | Supabase-generated API and server-side Next.js routes/actions where orchestration is required |
| Authorization | PostgreSQL Row Level Security (RLS), with server-side checks for sensitive workflows |
| Source control | GitHub |
| DNS and domain | Cloudflare DNS; Vercel manages application deployment and domain integration |
| Local development | Next.js development server and Supabase local stack |

The repository started as a minimal Next.js application and has since been built out well past the original "coming soon" skeleton, though unevenly across areas. Supabase Auth, Storage, and API services are enabled in `supabase/config.toml`. Schema exists as ordered migrations under `supabase/migrations/` for the shared `people` directory (donors, sponsors, volunteers), donations, inventory items/movements, events, event sponsors, event expenses, event attendance (a simple event-level headcount, not per-attendee), giveaways/giveaway prizes/giveaway winners, `roles`/`user_roles`, and an append-only `audit_log`, plus the `public_gear_catalog` view; governance records and event registrations have no backing tables yet. `supabase/seed.sql` populates a local dev database with one test account per role (plus a multi-role and a no-role account, all `@example.test`) and sample operational data, so the role matrix and every workflow below can be exercised locally without touching production.

Authorization is now role-based: `roles`/`user_roles` tables plus `has_role()`/`is_admin()`/`my_roles()` security-definer helper functions back per-table RLS policies that match the entitlement matrix in §5.3, and the two cross-cutting workflow RPCs (`create_donation_with_items`, `record_event_distribution`) are `security definer` with explicit role checks so they work for roles like `volunteer` that only hold `insert` grants on the underlying tables. On the app side, `src/lib/auth/roles.ts` exposes `getCurrentUserRoles`/`requireAnyRole`; the portal layout redirects an authenticated-but-unprovisioned user (zero roles) to a "no access" login state, every section has its own `layout.tsx` calling `requireAnyRole` server-side (not just nav hiding), and `portal-nav.tsx`/`sidebar-quick-actions.tsx` filter what's shown per role. The five roles are still fixed at the database level (`roles.name` is check-constrained to the five in §5.3) and the matrix is still hardcoded into RLS policies and route guards rather than being data-driven — see "what's next" below and in §5.3.

The portal's sidebar nav already links to Governance, Volunteers, and Administration sections (`src/app/portal/(app)/governance/*`, `volunteers/*`, `administration/*`). Administration > Users is implemented — it lists every portal account (via a `security definer` `list_portal_users` RPC, since `auth.users` isn't otherwise exposed) and lets an admin assign/revoke roles per user directly against `user_roles`. Administration > Audit log (issue #18) is also implemented: a URL-filtered, server-paginated view over the `audit_log` table (see §5.11, §6) with a before/after diff drawer per entry. Administration > Permissions, all of Governance and Volunteers, are still static "Coming soon" placeholders with no data fetching, no server actions, and no backing tables; Administration > System settings is now a real page backed by an `app_settings` key/value table, currently holding the expense approval threshold (§5.16), with more settings expected to be added incrementally as features need them rather than as one upfront build. The public site's Home page (`src/app/(public)/home`) is now implemented with mission copy, CTAs, and an upcoming-event highlight, so the public marketing homepage (§5.1) is built; Contact (§5.1) and the Events list (§5.2) now have working forms/listings, alongside About Us and Gears.

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

Public routes may expose approved content and explicitly public records. The public site has five top-level sections:

- **Home** (`/`): a landing page, primarily imagery/highlights linking into the other sections.
- **About Us** (`/about`): the organization's mission and programs, plus a **Meet the Team** sub-page (`/about/team`) with staff/leadership profiles.
- **Events** (`/events`): upcoming and past events with detail pages. Initial release renders events as a list; a calendar view is a possible future enhancement pending further research.
- **Gears** (`/gears`): the curated, read-only gear availability catalog (`status = available`), limited to description, size, type, gender, condition, and photo.
- **Contact Us** (`/contact`): a contact form that sends an email to the organization, plus the organization's published email address and social media links.

Public routes must not expose donor contact details, private event data, internal notes, financial records, the internal inventory record (donation linkage, face value, notes, status, or movement history), individual recipient information, or inventory history. The gear availability catalog above is the sole approved exception, and only through its curated field list.

**Implemented:** Gears (`/gears`) and Contact Us (`/contact`, form + published email/social) are fully built. Events (`/events`) lists upcoming/past events from Supabase but has no detail page or registration yet. About Us (`/about`) has real mission/story copy and has grown beyond the original team-only sub-page into four sub-pages: `/about/team` (roster, bios still "coming soon"), `/about/programs` (Access/Progression/Community pillars, six named programs), `/about/volunteer` (three volunteer opportunities), and `/about/donations` (in-kind donation info; monetary donations is a placeholder). Home (`/home`) is built: mission summary, Join/Get Involved/Donate CTAs, and an upcoming-event highlight.

**What's next:** Add event detail pages and registration (§5.2, §9). Replace the monetary-donations placeholder with a real giving path, and add sponsorship/partnership content (currently absent). Write real team bios and an explicit values section. Consider promoting Programs and a consolidated Get Involved page to top-level nav instead of About Us sub-pages, since their content now stands on its own — this would also mean updating this section's five-item IA list, which does not currently name them. A sixth public surface, the Community Calendar, is specified in §5.20 but not yet built or added to this IA list.

### Operations portal

The authenticated admin portal supports:

- Dashboard summary
- Event management
- Donation and inventory management
- Expense management

Giveaway recording (prizes, winners, ticket totals) and event attendance headcounts are implemented as part of event management. Role-based access control (§5.3) is implemented, including Administration > Users for assigning roles to accounts. An audit log (§5.11) is implemented for donations, inventory items/movements, event expenses, and user role changes; events and giveaways are not yet covered. Volunteers, governance record-keeping, admin-configurable permissions/custom roles, expanded reporting, and the content and community calendar (§5.20) remain planned capabilities, are not required for the initial portal, and currently have placeholder pages or no pages at all, with no backing tables.

## 5. Functional Requirements

### 5.1 Public content

The site shall allow visitors to:

- View a home page introducing Chatter Snow and linking into About Us, Events, Gears, and Contact Us.
- Learn about Chatter Snow, its mission, and its programs on the About Us page.
- Meet the team or leadership on an About Us sub-page.
- Submit a contact inquiry through a form that delivers an email to the organization.
- Find the organization's published contact email address and social media links.
- Learn how to support the organization.

Content management is not required to be self-service in the first release. The initial implementation may use repository-managed content, while the data model should leave room for a future CMS or admin-managed content. The contact form is a public write path: it must be rate-limited, validated server-side, and must not create or expose any authenticated-only record.

**Implemented:** Home page content (mission summary, upcoming event highlight, Join/Get Involved/Donate CTAs — see §4), About Us (mission/story), team roster (bios pending), programs (`/about/programs`), volunteer opportunities (`/about/volunteer`), in-kind donation info (`/about/donations`), and a working contact form (`/contact`) with published email addresses and an Instagram link.

**What's next:** real leadership bios and an explicit values section on About Us; a real monetary-donation path (currently a "coming soon" stub) and sponsorship/partnership content, neither of which exists yet.

### 5.2 Public events

The site shall allow visitors to:

- View upcoming events.
- View past events.
- Open an event detail page.
- See date/time, location, and description.
- See sponsors or partners when marked for publication.
- Register when registration is enabled.

Events are presented as a list in the initial release. A calendar view is a possible future enhancement, pending research into a suitable approach; the data model should not preclude it.

**Implemented:** `/events` lists upcoming and past events read live from Supabase (`public_events`).

**What's next:** event detail pages, sponsor/partner display on those detail pages (once marked public), and public registration — the `event_registrations` table in §6 does not exist yet.

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

| Section / page | `admin` | `event_coordinator` | `finance` | `board` | `volunteer` |
| --- | --- | --- | --- | --- | --- |
| Dashboard (Home) | Manage | View (event tiles) | View (financial tiles) | View (summary tiles) | View (own activity) |
| Events — details, sponsors, giveaway, attendance | Manage | Manage | View | None | View + sign up¹ |
| Events — event-level expenses | Manage | Manage | View | None | None |
| Programs | Manage | Manage | View | View | View |
| Impact tracking / reports | Manage | View | View | View | None |
| Inventory — items, donations (intake), distribution | Manage | None | None | None | Add donations + edit distribution² |
| Inventory — reports (valuation) | Manage | None | View | None | None |
| Finance — donations, expenses, reimbursements, reports | Manage | None | Manage | View (reports only) | None |
| Finance — approvals | Manage | None | Submit³ | Manage | None |
| People directory | Manage | View | View | None | None |
| Volunteers — roles (role-type definitions) | Manage | View | None | None | View |
| Volunteers — participation | Manage | View | None | None | View/log own |
| Governance — all pages | Manage | None | None | Manage | None |
| Administration — users, permissions, settings, audit log | Manage | None | None | None | None |

¹ Volunteers never see event financial data (expenses, sponsor amounts); event sign-up depends on the not-yet-built event-registration tables noted in §3.
² Volunteers do not get Inventory reports since those surface dollar valuations.
³ `finance` may create and edit expense/reimbursement records and mark them submitted, but cannot approve its own submissions — see §5.16.

**Implemented:** `roles`/`user_roles` tables, plus a data-driven `resources`/`role_permissions` matrix (role × resource → none/view/manage) that RLS policies and route guards consult via `has_permission()` instead of hardcoded role names — see §6. Route guards (`requirePermission`/`requireAnyPermission` in each section's `layout.tsx`) and nav filtering (`portal-nav.tsx`) both read the same permission map, so unauthorized sections are neither reachable by URL nor shown in the sidebar, and a permission change takes effect immediately without a deploy. Administration > Users lets an admin assign/revoke roles per account, and Administration > Permissions lets an admin edit the matrix and create new roles beyond the initial five (the `roles.name` check constraint has been dropped). A new role starts with no permissions on any resource until explicitly granted.

Resource granularity mostly matches the matrix rows above, with a few narrow "Workflow" resources (`people_intake`, `inventory_intake`, `volunteer_hours_logging`) added to express existing per-verb carve-outs — e.g. a volunteer can record a donation-intake/distribution transaction or create an inline contact from an event/donation form without gaining full People-directory or Inventory-reports access — that a flat view/manage split per matrix row can't otherwise represent without widening those roles' read access.

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

#### Sponsor and partner selection

Event sponsors/partners are people or organizations that already live in the shared `people` directory (the same table backing donors and volunteers, see §6) rather than free text typed per event. Managing an event's sponsors shall work as follows:

1. The event editor's Sponsors tab provides a type-ahead search (matching on name and email) over `people`. Staff pick an existing person/organization from the results to link them to the event.
2. If no existing record matches, the same control lets staff create a new `people` record inline (name required; email, phone, and notes optional) and link it to the event in one step, without leaving the event editor.
3. Linking a person who is not yet tagged `is_sponsor` sets that flag, so they appear correctly in the People directory (`/portal/people`) going forward. Existing donor/volunteer flags on that person are left unchanged.
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

Giveaway recording is implemented for the initial release: authorized users can record, per event, tickets sold and revenue, prizes (name, prize donor as free text, estimated value), and winners (name, contact, distribution status/date, drawing date), via the event editor's Giveaway tab (`giveaways`, `giveaway_prizes`, `giveaway_winners` tables). This is a manual recording tool only — there is no public ticket-purchase flow, and the prize donor field is not yet linked to the `people` directory the way event sponsors are.

Public online ticket sales remain out of scope and must be reviewed for applicable legal, tax, and jurisdictional requirements before being enabled.

### 5.9 People directory

A person's record in the People directory (`/portal/people`) shall show that individual's full operational history across roles, not just their contact details and role flags:

- Donations given, if `is_donor`
- Events sponsored and sponsorship details (support type, in-kind description, contribution value), if `is_sponsor`
- Volunteer activity (role types, logged hours), if `is_volunteer`
- Staff assignments across events, if `is_staff`

This view should read from the existing donation, event-sponsor, event-volunteer, and event-staff records rather than duplicating that history onto the `people` row.

A person may also be tagged `is_staff` — someone who works events in a paid or formally-scheduled capacity, as distinct from `is_volunteer`. Staff are drawn from the same `people` directory (a person can be both staff and a volunteer) and are assigned to individual events the same way sponsors and volunteers are: a Staff tab on the event editor links `people` rows to the event via `event_staff`, with an optional role/title and notes per assignment. Managing event staff requires the same permission as managing the rest of the event (§5.3).

**Not yet implemented.** No `is_staff` column or `event_staff` table exists yet; see §6.

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

**Implemented for donations, inventory items/movements, event expenses, and user role changes** (issue #18); events and giveaways are not yet covered. A generic `security definer` Postgres trigger (`audit_log_row()`) fires `AFTER INSERT OR UPDATE OR DELETE` on the covered tables and writes actor (`auth.uid()`), action, table name, record ID, timestamp, and full before/after `jsonb` row snapshots to `audit_log` — chosen over application-level writes scattered across each mutating RPC/server action so coverage can't be silently skipped by a write path that forgets to log. RLS restricts reads to `has_permission('administration', 'manage')`; no insert/update/delete policy exists for any role, so the table is append-only in practice, not just by convention. See §6 for the schema and Administration > Audit log for the browsing UI (filter by table/action/actor/date, sort, paginate, and view a before/after diff per entry).

### 5.12 Governance

Authorized users shall be able to manage nonprofit governance records:

- **Board members**: linked to `people`, with role/title, term start/end, and active status.
- **Meetings**: date, type (board, committee, annual, other), attendees, and associated:
  - **Agendas**
  - **Minutes**
  - **Resolutions**: motion text, mover/seconder, vote outcome, and effective date
- **Bylaws**: the governing document, with effective date and amendment history.
- **Policies**: named policies (e.g. whistleblower, document retention, conflict of interest policy itself), each with a category and effective date.
- **Conflict of interest**: per-person annual disclosure statements, on-file date, and any noted conflicts.
- **Annual requirements**: recurring compliance items (e.g. annual report, IRS Form 990, state charitable registration renewal) with due date, completion status/date, and responsible party.

The content of an individual governance record (a policy's text, a set of minutes, a signed bylaws amendment, etc.) is not required to take one fixed form. A record may hold an external link (e.g. to a file in the organization's Google Drive/OneDrive), a free-text body, or both, so staff can start with a quick note and add a link to the scanned/signed file once it exists. **For the initial release there is no in-app file upload option** — `agendas` and `minutes` are already implemented this way (`external_link`/`body_text` columns only, no `file_attachment_id`). The `file_attachments` table and an uploaded-file option are deferred past the initial release — see §2 and §6.

Governance records contain sensitive organizational and personal information and must not be public. Access is limited to the `admin` and `board` roles — see the entitlement matrix in §5.3.

### 5.13 Open questions

- **Volunteer-facing donation/distribution recording**: recording a donation or distribution from an event should be quick and easy for a volunteer to reach in the field, not just from the main inventory workflow.
- **Quick edit from the events list**: editing a donation/distribution via the events list may only need to collect a number and notes tied to the event, rather than the full inventory workflow.
- **Giveaway prizes drawn from in-kind donations**: when a donated item is used as a giveaway prize, decide whether it should still follow the standard in-kind donation/inventory process (receipt, status, movement) or a separate giveaway-specific path.

### 5.14 Program management

Authorized users shall be able to define and manage programs — the named, repeatable initiatives events belong to (e.g. Chatter Snow Access Days, Chatter Gear Exchange, Chatter Community Rides), rather than treating every event as freestanding. A program record shall support:

- Name
- Description
- Status: active, pilot, or retired

Each event may optionally be tagged to a program (`events.program_id`, nullable so existing and one-off events remain valid without a program). This is the schema shape `planning/ideas/RUNNING_PROGRAMS.md` calls for — **Programs → Events**, with everything else (expenses, donations, volunteers, impact) continuing to hang off the event as it already does.

**Implemented** (issue #45): `programs` (name, description, status) and `events.program_id` exist, with `/portal/programs` for CRUD, gated by the `programs` resource per the entitlement matrix in §5.3. A program's own record therefore currently offers name, description, and status; everything else about a program — its events, and everything that hangs off those events (expenses, donations, sponsors, giveaways, inventory movements, volunteer/staff assignments) — has to be read via `events.program_id`, not from the `programs` row itself. The `/portal/programs` view/edit flow uses the same Dialog-based pattern as `volunteers/roles`; see the Sheet-based convention note in §8 for the pending cleanup.

**Not yet implemented — events-on-a-program report.** There is no view listing the events tagged to a given program (e.g. from the Programs page or a program detail view); a user currently has to open each event and check its Overview tab to see whether it belongs to a given program. This is a smaller, more basic ask than the full season/program impact rollup in §5.15 (issue #48), which aggregates participation/financial/hours metrics rather than simply listing member events.

The public site's `/about/programs` page is still static content, not driven by this table (issue #46).

### 5.15 Impact tracking and reporting

The system shall produce grant- and board-ready impact summaries by rolling up existing operational data rather than requiring separate manual entry, per `RUNNING_PROGRAMS.md`'s "rolls up automatically" model:

- Per-event and per-program participation: total participants, first-time participants, first-time skiers/snowboarders, beginners, volunteers.
- Financial assistance provided: subsidized tickets/rentals/transportation, dollar total.
- Equipment loaned/distributed, drawn from `inventory_movements`.
- Volunteer hours contributed, once §5.17 is implemented.
- Optional qualitative outcomes from a short post-event survey (see `event_impact_notes` in §6), matching the five-question model in `RUNNING_PROGRAMS.md`.
- A season/program report that rolls individual event reports up to the level shown in `RUNNING_PROGRAMS.md`'s "2026–27 Chatter Snow Access Program" example table.

This is reporting over existing records (events, donations, expenses, inventory movements) plus the small amount of new impact-specific data noted above — not a parallel system duplicating what's already recorded elsewhere.

**Not yet implemented.** No impact rollup views/queries, no `event_impact_notes` table, and no season/program report UI exist yet.

### 5.16 Financial controls and approval workflow

Consistent with the segregation-of-duties model in `planning/governance/roles-and-responsibilities.md` (no single person controls request → approval → payment → accounting), expense and reimbursement records shall carry an approval state distinct from who recorded them:

- `submitted` — recorded by `finance` (or, for event-level expenses, `event_coordinator`), not yet approved.
- `approved` or `rejected` — set by a user other than the submitter, holding `admin` or `board`.
- `paid` — payment has been made against an approved record.

Routine, in-budget expenses may be self-approved by `finance`; expenses above a threshold require a second approval from `admin` or `board`; unbudgeted expenses above that threshold require Board approval. **The dollar thresholds themselves are an open decision** (see `roles-and-responsibilities.md` and issue #13 — not yet recorded in `planning/decisions/`); this section specifies the mechanism, not the specific amounts, so the workflow can be built before the thresholds are finalized and the values tightened later without a schema change.

**Not yet implemented.** `event_expenses` has no approval state — any `finance` or `event_coordinator` user can currently record an expense and it is immediately treated as final.

### 5.17 Volunteer management

Authorized users shall be able to track volunteer participation, per the "Volunteers — roles"/"participation" rows already named in the entitlement matrix (§5.3) and the reporting need described in `planning/drafts/BUSINESS_PLAN.md` §10–§11:

- A catalog of volunteer role types (e.g. Ride Buddy, Event Setup, Basecamp Staffing) that events can be tagged with.
- Volunteer profiles, reusing the existing `people` directory and its `is_volunteer` flag rather than a separate contact record.
- Hours logging: person, optional event, date, hours, role type, and who logged the entry. The `volunteer` role may log and view their own hours; `admin` and `event_coordinator` may view all.

Volunteer hours feed the Impact Tracking rollups in §5.15 (e.g. "290 volunteer hours" in a season report).

**Implemented** (issues #49/#50): `volunteer_role_types` and `volunteer_hours` back `/portal/volunteers/roles` and `/portal/volunteers/participation`, gated by the `volunteers` resource per §5.3. The role-type view/edit flow (`role-type-details-dialog.tsx`) still uses the Dialog-based pattern rather than the Sheet-based pattern used elsewhere for viewing/editing an existing record (people, inventory, expenses, events) — see the convention note in §8; this should be brought in line the same way as the Programs page (§5.14).

**Not yet implemented — public volunteer opportunities.** The public `/get-involved` page's "Volunteer" section is a hardcoded list of three opportunities (`OPPORTUNITIES` array in `get-involved/page.tsx`), unrelated to `volunteer_role_types`. It should instead be fed from the same role-type catalog staff maintain in the portal, so a new role type shows up publicly without a code change. This needs: (a) a way to mark a role type public-facing (an `is_public` flag, plus whatever short public-facing copy/icon is needed — `volunteer_role_types` currently has only `name`/`description`, no icon), and (b) a curated public read path (a view granted to `anon`, following the same pattern as `public_gear_catalog` and `public_events` — not a relaxed policy on the base table, since `volunteer_role_types` RLS is otherwise `volunteers`-permission-gated).

### 5.18 Reimbursements

Authorized users shall be able to request reimbursement for money personally spent on behalf of the organization, separately from organization-paid expenses:

- Requesting person
- Amount and description
- Receipt link
- Optional associated event

As with expenses (§5.6), the receipt for the initial release is a link to a file in an existing external solution (Google Drive/OneDrive), not an in-app upload.

Reimbursements go through the same approval workflow as §5.16 (submitted → approved/rejected → paid) rather than a separate one, since the underlying control question — who may approve spend — is the same.

**Not yet implemented.** `finance/reimbursements` is a static placeholder page with no backing table.

### 5.19 Inventory valuation reporting

Authorized users (`admin`, and `finance`/`board` for view-only oversight per §5.3) shall be able to view a valuation report over existing inventory data:

- Total face value of on-hand inventory, by type and status.
- Value donated and value distributed over a selected period, derived from `inventory_movements`.

This is a reporting view over `inventory_items` and `inventory_movements` — no new tables are required.

**Not yet implemented.** `inventory/reports` is a static placeholder page.

### 5.20 Content and community calendar

A Chatter-specific planning and approval workflow connecting LGBTQ+ community observances, winter/outdoor sports moments, heritage and social-justice dates, Chatter events, partner opportunities, and campaigns to practical content work — not a full social-media publishing suite, and not a replacement for event registration, email marketing, or a CRM. It should help the team decide what's coming up, what's relevant enough to acknowledge, who owns any resulting content and by when, and what has been approved, scheduled, published, or intentionally skipped.

The underlying calendar item model must be generic enough to support future programs, not just this feature. A calendar item has: title, item type (Chatter event, partner/co-hosted event, community observance, heritage/social-justice moment, winter/outdoor sports moment, content campaign, fundraiser/donation drive, partner opportunity, or content opportunity), start/end date, recurrence or annual-observance rule, time zone, summary, priority tier, calendar status, public visibility, owner, related programs, tags/categories, related items, and audit timestamps.

Two independent state machines apply per item:

- **Priority tier** — Tier 1 (Chatter should usually acknowledge or plan around this; target ~15–20/year), Tier 2 (consider when relevant to current programs/capacity/context), or Tier 3 (internal reference/content-bank only, no publication obligation). An admin can change an item's tier and must record a rationale; Tier 1 never auto-creates a publish task without a human decision.
- **Calendar status** (idea/active/complete/archived) is distinct from **content status** (not planned/idea/draft/in review/changes requested/approved/scheduled/published/skipped), since planning a moment and producing content for it are separate concerns. Every status change records the actor and timestamp; a skipped item records a reason.

Categories (LGBTQ+ community; winter and outdoor sports; community and social justice; Chatter events; campaigns and fundraising; partner opportunities) are labels layered on top of item type and priority, not a substitute for either.

**Public surface:** a Community Calendar (month/list view, filterable by month and public category) showing published Chatter events and selected public community moments — never the full internal calendar, and never internal owners, draft copy, review notes, or unpublished assets. A public item can be informational without implying Chatter hosts or owns the observance, and must degrade gracefully for long titles, missing images, date ranges, and no-match filters.

**Portal surface:** month/list/agenda calendar views with the same filter set as the item model above; item CRUD (create/edit/duplicate/archive/restore) with date validation and recurrence-overlap warnings; a content-opportunity brief per planned item (what the moment is, the Chatter connection, recommended formats/channels/CTA, related program/event, owner, reviewer, draft/review/publish due dates) with lead-time defaults that calculate draft/review/publish dates from a target publish date (e.g. a 21-day lead time on a March 31 item defaults to a March 17 draft date, March 24 review date); a small starter template library (community spotlight, awareness/community moment, partner spotlight) that prefills brief structure without auto-publishing; "my work" queues with overdue and Tier-1-no-decision warnings; admin-configurable, editable (never automatic) related-program suggestions; and full audit history (who changed what, approvals, publish/skip decisions) that survives archiving, following the existing `audit_log` pattern in §5.11/§6.

Editorial guardrails apply throughout: community stories require explicit, recorded permission before publication; sensitive topics (e.g. HIV/AIDS remembrance, Transgender Day of Remembrance) require human review with appropriate tone; content should avoid tokenism and generic hashtag-driven posts; and internal notes must never carry sensitive personal data or confidential case details.

The first-year seed is a curated Tier 1/Tier 2 set (see the planning doc's suggested list), not an exhaustive third-party awareness-day database, and requires operations and community-lead sign-off before import; each date is stored with its source, region, and any year-specific exceptions.

**Status.** The item model, portal CRUD/filters/month-list-agenda views, and the content-opportunity brief with its status pipeline and lead-time scheduling are implemented (issues #103, #104, #106 — see §6). The public Community Calendar page, brief templates, work queues/overdue-Tier-1 warnings, and program intelligence are not yet built. Full requirements: `planning/ideas/content_community_calendar.md`. Delivery is planned in three phases — (1) calendar foundation: item model, categories/tiers/statuses/owners/visibility/recurrence/audit fields, portal CRUD, public list; (2) content workflow: opportunities, templates, assignment/review, my-work/overdue/history; (3) program intelligence: configurable program suggestions, related-item recommendations, annual reporting, optional iCal export — tracked as issue #102 and its sub-issues. Several open questions (which roles approve public content; which channels the first brief targets; whether public community moments get detail pages; who owns the annual observance list; notification channel; iCal export phase) are unresolved and tracked in #114.

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

### Audit log

Implemented for the tables listed below (see §5.11, issue #18):

- `audit_log`: `id`, `table_name` (check-constrained to the audited table set), `record_id`, `action` (`insert`/`update`/`delete`), `actor_id` (nullable FK → `auth.users`, null for non-request-scoped writes), `occurred_at`, `old_data`/`new_data` (full-row `jsonb` snapshots; no precomputed diff column — diffing two small `jsonb` objects is computed on read instead)
- `audit_log_row()`: a generic `security definer` `plpgsql` trigger function (`to_jsonb(OLD)`/`to_jsonb(NEW)` keyed on `TG_TABLE_NAME`/`TG_OP`) fired `AFTER INSERT OR UPDATE OR DELETE` on `donations`, `inventory_items`, `inventory_movements`, `event_expenses`, and `user_roles`
- RLS: select-only, restricted to `has_permission('administration', 'manage')`; no insert/update/delete policy exists for any role, so writes only ever happen through the trigger
- Not yet covered: `events`, `giveaways`/`giveaway_prizes`/`giveaway_winners` — named in §5.11's requirement but out of scope for the v1 build; adding a table later only needs a new `create trigger` statement plus widening the `table_name` check constraint, not a new function

### Public and events

- `pages` or repository content: approved public content
- `events`
- `event_sponsors`: links an event to a `people` record via `person_id` (one row per event/person pair), plus per-event sponsorship details — support type, in-kind description, contribution value, public visibility, notes. Sponsor/partner name and contact info are not duplicated here; they live on the linked `people` row.
- `event_volunteers`: links an event to a `people` record via `person_id`, with an optional free-text `role` and notes; a lightweight, event-scoped sign-up list (predates the fuller `volunteer_role_types`/`volunteer_hours` catalog in "Volunteers" below).
- `event_staff`: not yet implemented — see §5.9; mirrors `event_volunteers` (`event_id`, `person_id`, optional role/title, notes, unique per event/person pair) for people tagged `is_staff`.
- `event_registrations`: optional future capability

### Programs and impact

- `programs`: **implemented** (issue #45) — name, description, status (active/pilot/retired)
- `events.program_id`: **implemented** — nullable FK from `events` to `programs`, so existing and one-off events remain valid without a program
- `event_impact_notes`: not yet implemented — optional per-event qualitative outcomes (e.g. the five-question post-event survey described in `RUNNING_PROGRAMS.md`), linked to `events`

Impact rollups themselves (per-event, per-program, and season reports, including a basic list of events tagged to a program — see §5.14) are computed views/queries over these tables plus `donations`, `event_expenses`, `inventory_movements`, and `volunteer_hours` — not separately stored data. None of these rollup views/queries exist yet.

### Inventory and donations

- `people`: shared directory of donors, sponsors, volunteers, and staff (name, email, phone, notes, `is_donor`/`is_sponsor`/`is_volunteer` flags), so the same contact can be reused across roles instead of being duplicated per context. `is_staff`: not yet implemented — see §5.9.
- `donations`
- `donation_items`
- `inventory_items`: donation-managed inventory records with description, size, type, gender, condition, face value, photo, and status
- `inventory_movements`: receipt, distribution, adjustment, and retirement transactions
- `public_gear_catalog`: read-only view over `inventory_items` limited to `status = available` rows and a curated column set (description, size, type, gender, condition, photo); granted to the `anon` role so it can back the public gear gallery without relaxing RLS on the base table
- `inventory_photos`
- `distribution_recipients`: protected recipient records, if needed

### Volunteers

**Implemented** (issues #49/#50) — see §5.17.

- `volunteer_role_types`: catalog of role-type definitions (e.g. Ride Buddy, Event Setup, Basecamp Staffing) — named to avoid colliding with the existing RBAC `roles` table in "Identity and access" above, which is a different concept (portal permissions, not volunteer job types). Currently `name`/`description` only.
- `volunteer_hours`: `person_id` (→ `people`), optional `event_id`, date, hours, `volunteer_role_type_id`, and the user who logged the entry
- Not yet implemented: a public-facing flag/copy on `volunteer_role_types` and a curated `public_volunteer_role_types` view granted to `anon`, to back the public `/get-involved` volunteer opportunities section — see §5.17.

### Finance and giveaways

- `event_revenue`: not yet implemented
- `event_expenses`: implemented, with an optional `event_id` (nullable — expenses may or may not be tied to an event) and `receipt_url` (a plain text link to the file in an external solution, not an upload — see §5.6). **Not yet implemented:** an approval state (`status`: submitted/approved/rejected/paid), `submitted_by`, `approved_by`, `approved_at` — see §5.16.
- `reimbursements`: not yet implemented — requester `person_id`, amount, description, `receipt_url` (external link, same pattern as `event_expenses`), optional `event_id`, and the same approval state as `event_expenses` (see §5.16, §5.18)
- `file_attachments`: deferred past the initial release — see §2, §5.12
- `giveaways`, `giveaway_prizes`, and `giveaway_winners`: implemented (see §5.8); `giveaway_prizes.donor_name` is free text, not a `people` foreign key

### Governance

Not yet implemented — the portal's Governance nav section renders placeholder pages only; none of the tables below exist in migrations.

- `board_members`: links a `people` record with role/title, term start/end, and active status
- `governance_meetings`: date, type (board, committee, annual, other), status; associated `governance_meeting_attendees` link table to `people`
- `agendas`: linked to a `governance_meetings` row
- `minutes`: linked to a `governance_meetings` row
- `resolutions`: linked to a `governance_meetings` row (optional), motion text, mover/seconder (`people`), vote outcome, effective date
- `bylaws`: version, effective date, amendment history
- `policies`: name, category, effective date, version
- `conflict_of_interest_disclosures`: linked to a `people`/`board_members` record, disclosure period, on-file date, notes
- `annual_requirements`: name, due date, completed-at, responsible `people` record

`agendas`, `minutes`, `resolutions`, `bylaws`, `policies`, `conflict_of_interest_disclosures`, and `annual_requirements` each hold their substantive content via nullable `external_link` and `body_text` columns, populated in either or both, per §5.12. `agendas` and `minutes` are already built this way. A nullable `file_attachment_id` (→ `file_attachments`) is a later-release addition, not part of the initial-release column set.

### Content and community calendar

Data model, portal CRUD, and the content-opportunity workflow implemented (issues #103, #104, #106); public surface, templates, work queues, and program intelligence remain planned — see §5.20 and issue #102.

- `calendar_items`: title, item type, `starts_at`/`ends_at`, recurrence/annual-observance rule, time zone, summary, priority tier + rationale, calendar status (idea/active/complete/archived), public visibility (public/internal/unlisted draft), owner (`owner_id` → `auth.users`), `decision`/`decision_note` (plan/skip/defer, per #104 — the requirements doc's base item-management field, distinct from the content-opportunity brief owned by #106), created/updated timestamps and actor columns.
- `calendar_item_categories`: item ↔ category (lgbtq_community, winter_outdoor_sports, community_social_justice, chatter_events, campaigns_fundraising, partner_opportunities), a fixed label taxonomy, not free-text tags.
- `calendar_item_programs`: links a `calendar_items` row to one or more `programs` rows.
- `calendar_item_links`: self-referencing related-item links.
- `public_calendar_items`: curated read-only view (public + active/complete items only, no owner/internal fields), granted to `anon`, mirroring `public_events`.
- RLS via the `content_calendar` resource (admin/event_coordinator manage, finance/board/volunteer view); `audit_log` covers `calendar_items`; `list_calendar_owners()` RPC (mirrors `list_event_leads()`) backs the portal's owner picker.
- `content_opportunities`: **implemented** (issue #106) — one-to-one with a `calendar_items` row (`calendar_item_id` unique), planned for content: content status (not planned/idea/draft/in review/changes requested/approved/scheduled/published/skipped, check-constrained to require `skip_reason` when skipped), Chatter connection, recommended formats/channels, recommended action/CTA, outstanding work, owner/reviewer (`auth.users`), configurable `lead_time_days` (org default seeded in `app_settings` as `content.default_lead_time_days`), draft/review/publish due dates (defaults computed client-side from the target publish date and lead time — draft at two-thirds, review at one-third — editable per item), and a single `status_changed_by`/`status_changed_at` pair for the most recent transition. RLS reuses the `content_calendar` resource, same as `calendar_items`; `app_settings`' select policy was widened to include `content_calendar` managers so `event_coordinator` can read the lead-time default. Full multi-transition history via `audit_log` is deliberately deferred to #109, which depends on this table existing.
- `content_templates`: name, item-type applicability, field schema for the starter library (community spotlight, awareness/community moment, partner spotlight); versioned so editing a template doesn't alter records already built from it.
- `content_permissions`: consent record for a community-spotlight-type item — permitted use, usage limits, on-file date; required before such an item can move to "approved."
- Audit coverage extends the existing `audit_log` pattern (§5.11) to `calendar_items` (already wired, see issue #103) and `content_opportunities` (open, tracked in issue #109) rather than introducing a parallel history mechanism.

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
9. Rate-limit public registration and other write endpoints; add bot protection if abuse appears.
10. Log security-sensitive actions without placing secrets or unnecessary personal data in logs.
11. Define retention, deletion, export, and access procedures for donor and recipient personal information before production use.

## 8. Application Structure

Use the Next.js App Router with route groups that make the public/portal boundary visible in the codebase. The actual tree (current, differs slightly from the original proposal — the portal lives under `/portal/(app)/` rather than a top-level `(portal)` group):

```text
src/app/
  (public)/
    home/                       # public landing page (placeholder)
    about/                      # about us, team, programs, donations, volunteer — implemented
    events/                     # upcoming/past list implemented; no detail page or registration yet
    gears/                      # public gear availability catalog — implemented
    contact/                    # form + published email/social — implemented
  portal/
    login/
    (app)/                      # authenticated portal shell (sidebar layout)
      home/                     # admin dashboard
      events/                   # events, sponsors, expenses tab, giveaway tab, attendance tab
      inventory/
      finance/                  # expenses, donations, reimbursements, reports
      people/                   # shared donor/sponsor/volunteer directory
      programs/                  # program CRUD — implemented (issue #45)
      governance/                # placeholder — no backing tables
      volunteers/                # role types + hours logging — implemented (issues #49/#50)
      administration/            # users, permissions, audit log implemented; system settings placeholder
  auth/
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
3. Server sends the inquiry to the organization's email via a transactional email provider; no record is persisted in the database for the initial release.
4. Visitor sees a confirmation state; failures are surfaced without exposing delivery internals.

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

| Risk | Mitigation |
| --- | --- |
| Public exposure of internal inventory or donor data | Private-by-default tables/storage and RLS tests |
| Inventory counts lose their history | Append-only movement records and controlled correction workflow |
| Financial records are mistaken for formal accounting | Define reporting scope and reconcile with the organization's accounting process |
| No roles exist yet — every authenticated user currently has full portal access | Introduce `roles`/`user_roles`, replace blanket "authenticated full access" RLS policies with role-scoped ones, and review access with real operators before launch |
| Registration creates privacy or capacity problems | Start with minimal fields and add capacity/confirmation rules explicitly |
| Giveaway functionality creates compliance exposure | Complete legal review before enabling ticket sales |
| Production and preview environments share data accidentally | Separate environment variables and Supabase projects or strict project policies |

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

A review against the Director of Operations and Bookkeeping/Finance Administration responsibilities in `planning/governance/roles-and-responsibilities.md` found four operational needs with no corresponding requirement anywhere above — distinct from the sections already marked "not yet implemented" (volunteers, registration, reimbursements, approvals, impact tracking), which at least exist as planned work. These four have never been specified.

### 16.1 Incident / problem documentation

The roles doc calls for "how incidents/problems are documented" as an internal process Operations must establish; no part of this spec gives it a data shape.

The system shall let authorized users record an operational incident (e.g. damaged gear at an event, a safety issue, a lost item, a volunteer no-show) with:

- Description and category
- Date
- Optional related event
- Optional related inventory item
- Severity
- Status: open or resolved, with resolution notes
- Reporting user

**Data model:** `incident_reports` — `id`, `description`, `category`, `severity`, `event_id` (nullable FK), `inventory_item_id` (nullable FK), `status`, `resolution_notes`, `reported_by`, `created_at`, `updated_at`.

**Access:** `admin` and `event_coordinator` manage; `volunteer` may submit (view/edit own) per the pattern already used for volunteer-submitted inventory records in §5.3.

**Not yet implemented.**

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
