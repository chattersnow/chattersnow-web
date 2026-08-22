# Chatter Snow Website and Operations Portal

## Technical Specification

- **Status:** Draft for team review
- **Version:** 0.4
- **Date:** 2026-08-21
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
- Volunteer management and full accounting software unless prioritized separately. (Giveaway recording and event attendance headcounts, listed as future capabilities in earlier drafts, are now implemented — see §5.5 and §5.8.)

## 3. Technology and Deployment

| Area | Decision |
| --- | --- |
| Frontend and application | Next.js App Router, TypeScript, React |
| UI components | shadcn/ui (Tailwind v4 + Base UI primitives), composed with the project's own brand tokens/classes in `globals.css` |
| Hosting | Vercel |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth with Google OAuth |
| Files | Supabase Storage |
| Data API | Supabase-generated API and server-side Next.js routes/actions where orchestration is required |
| Authorization | PostgreSQL Row Level Security (RLS), with server-side checks for sensitive workflows |
| Source control | GitHub |
| DNS and domain | Cloudflare DNS; Vercel manages application deployment and domain integration |
| Local development | Next.js development server and Supabase local stack |

The repository started as a minimal Next.js application and has since been built out well past the original "coming soon" skeleton, though unevenly across areas. Supabase Auth, Storage, and API services are enabled in `supabase/config.toml`. Schema exists as ordered migrations under `supabase/migrations/` for the shared `people` directory (donors, sponsors, volunteers), donations, inventory items/movements, events, event sponsors, event expenses, event attendance (a simple event-level headcount, not per-attendee), giveaways/giveaway prizes/giveaway winners, and `roles`/`user_roles`, plus the `public_gear_catalog` view; an audit log, governance records, and event registrations have no backing tables yet. `supabase/seed.sql` populates a local dev database with one test account per role (plus a multi-role and a no-role account, all `@example.test`) and sample operational data, so the role matrix and every workflow below can be exercised locally without touching production.

Authorization is now role-based: `roles`/`user_roles` tables plus `has_role()`/`is_admin()`/`my_roles()` security-definer helper functions back per-table RLS policies that match the entitlement matrix in §5.3, and the two cross-cutting workflow RPCs (`create_donation_with_items`, `record_event_distribution`) are `security definer` with explicit role checks so they work for roles like `volunteer` that only hold `insert` grants on the underlying tables. On the app side, `src/lib/auth/roles.ts` exposes `getCurrentUserRoles`/`requireAnyRole`; the portal layout redirects an authenticated-but-unprovisioned user (zero roles) to a "no access" login state, every section has its own `layout.tsx` calling `requireAnyRole` server-side (not just nav hiding), and `portal-nav.tsx`/`sidebar-quick-actions.tsx` filter what's shown per role. The five roles are still fixed at the database level (`roles.name` is check-constrained to the five in §5.3) and the matrix is still hardcoded into RLS policies and route guards rather than being data-driven — see "what's next" below and in §5.3.

The portal's sidebar nav already links to Governance, Volunteers, and Administration sections (`src/app/portal/(app)/governance/*`, `volunteers/*`, `administration/*`). Administration > Users is implemented — it lists every portal account (via a `security definer` `list_portal_users` RPC, since `auth.users` isn't otherwise exposed) and lets an admin assign/revoke roles per user directly against `user_roles`. Administration > Permissions/System settings/Audit log, all of Governance and Volunteers, are still static "Coming soon" placeholders with no data fetching, no server actions, and no backing tables. The public site's Home page (`src/app/(public)/home`) is likewise still a placeholder, so the public marketing homepage (§5.1) is not yet implemented; Contact (§5.1) and the Events list (§5.2) now have working forms/listings, alongside About Us and Gears.

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

**Implemented:** Gears (`/gears`) and Contact Us (`/contact`, form + published email/social) are fully built. Events (`/events`) lists upcoming/past events from Supabase but has no detail page or registration yet. About Us (`/about`) has real mission/story copy and has grown beyond the original team-only sub-page into four sub-pages: `/about/team` (roster, bios still "coming soon"), `/about/programs` (Access/Progression/Community pillars, six named programs), `/about/volunteer` (three volunteer opportunities), and `/about/donations` (in-kind donation info; monetary donations is a placeholder). Home (`/home`) is still the original placeholder — logo and "coming soon" only, none of the content below is live yet.

**What's next:** build out Home with a mission summary, the next upcoming event, and Join/Get Involved/Donate CTAs. Add event detail pages and registration (§5.2, §9). Replace the monetary-donations placeholder with a real giving path, and add sponsorship/partnership content (currently absent). Write real team bios and an explicit values section. Consider promoting Programs and a consolidated Get Involved page to top-level nav instead of About Us sub-pages, since their content now stands on its own — this would also mean updating this section's five-item IA list, which does not currently name them.

### Operations portal

The authenticated admin portal supports:

- Dashboard summary
- Event management
- Donation and inventory management
- Expense management

Giveaway recording (prizes, winners, ticket totals) and event attendance headcounts are implemented as part of event management. Role-based access control (§5.3) is implemented, including Administration > Users for assigning roles to accounts. Volunteers, governance record-keeping, admin-configurable permissions/custom roles, an audit log, and expanded reporting remain planned capabilities, are not required for the initial portal, and currently have placeholder pages with no backing tables.

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

**Implemented:** About Us (mission/story), team roster (bios pending), programs (`/about/programs`), volunteer opportunities (`/about/volunteer`), in-kind donation info (`/about/donations`), and a working contact form (`/contact`) with published email addresses and an Instagram link.

**What's next:** Home page content (mission summary, upcoming event highlight, Join/Get Involved/Donate CTAs — see §4); real leadership bios and an explicit values section on About Us; a real monetary-donation path (currently a "coming soon" stub) and sponsorship/partnership content, neither of which exists yet.

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
| Inventory — items, donations (intake), distribution | Manage | None | None | None | Add donations + edit distribution² |
| Inventory — reports (valuation) | Manage | None | View | None | None |
| Finance — donations, expenses, reimbursements, reports | Manage | None | Manage | View (reports only) | None |
| People directory | Manage | View | View | None | None |
| Volunteers — roles (role-type definitions) | Manage | View | None | None | View |
| Volunteers — participation | Manage | View | None | None | View/log own |
| Governance — all pages | Manage | None | None | Manage | None |
| Administration — users, permissions, settings, audit log | Manage | None | None | None | None |

¹ Volunteers never see event financial data (expenses, sponsor amounts); event sign-up depends on the not-yet-built event-registration tables noted in §3.
² Volunteers do not get Inventory reports since those surface dollar valuations.

**Implemented:** `roles`/`user_roles` tables and per-table RLS policies enforcing the matrix above, plus server-side route guards (`requireAnyRole` in each section's `layout.tsx`) and nav filtering so unauthorized sections are neither reachable by URL nor shown in the sidebar. Administration > Users lets an admin assign/revoke roles per account; see §6.

**What's next:** the matrix above and the five roles it lists are still hardcoded — RLS policies check `has_role('admin') or has_role('event_coordinator') or ...` directly, and route guards pass the same fixed role arrays. Administration > Permissions is planned to make this data-driven: a `role_permissions` table (role × resource → none/view/manage) that RLS and route guards consult instead of hardcoded role names, an admin UI to edit that matrix per role, and support for creating new roles beyond the initial five. Because route/nav gating would need to read the same data (a new role only granted DB access but not surfaced in the app would be a broken experience), this is a full-stack change, not just a new admin page.

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

For distribution, the system should eventually record who received the gear, when, at which event, and who distributed it. Personally identifying recipient information must be protected by RLS and should not be public.

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
- Receipt
- Optional event association
- Entering user

Receipts should be stored in a private Supabase Storage bucket. Expense records are operational data and do not replace the organization's accounting controls.

### 5.7 Donations

The initial inventory workflow is the primary way administrators manage donated gear. Donation records should retain donor and donation context where needed, while inventory records retain the item-level details. Donor personal information must be restricted to authorized users with a legitimate operational need.

### 5.8 Giveaways

Giveaway recording is implemented for the initial release: authorized users can record, per event, tickets sold and revenue, prizes (name, prize donor as free text, estimated value), and winners (name, contact, distribution status/date, drawing date), via the event editor's Giveaway tab (`giveaways`, `giveaway_prizes`, `giveaway_winners` tables). This is a manual recording tool only — there is no public ticket-purchase flow, and the prize donor field is not yet linked to the `people` directory the way event sponsors are.

Public online ticket sales remain out of scope and must be reviewed for applicable legal, tax, and jurisdictional requirements before being enabled.

### 5.9 People directory

A person's record in the People directory (`/portal/people`) shall show that individual's full operational history across roles, not just their contact details and role flags:

- Donations given, if `is_donor`
- Events sponsored and sponsorship details (support type, in-kind description, contribution value), if `is_sponsor`
- Volunteer activity, if `is_volunteer`, once volunteer tracking exists

This view should read from the existing donation, event-sponsor, and (future) volunteer records rather than duplicating that history onto the `people` row.

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

The content of an individual governance record (a policy's text, a set of minutes, a signed bylaws amendment, etc.) is not required to take one fixed form. A record may hold an uploaded file attachment, an external link (e.g. to a shared drive), a free-text body, or any combination of the three, so staff can start with a quick note or link and attach a scanned/signed file later without changing record type. See `file_attachments` in §6.

Governance records contain sensitive organizational and personal information and must not be public. Access is limited to the `admin` and `board` roles — see the entitlement matrix in §5.3.

### 5.13 Open questions

- **Volunteer-facing donation/distribution recording**: recording a donation or distribution from an event should be quick and easy for a volunteer to reach in the field, not just from the main inventory workflow.
- **Quick edit from the events list**: editing a donation/distribution via the events list may only need to collect a number and notes tied to the event, rather than the full inventory workflow.
- **Giveaway prizes drawn from in-kind donations**: when a donated item is used as a giveaway prize, decide whether it should still follow the standard in-kind donation/inventory process (receipt, status, movement) or a separate giveaway-specific path.

## 6. Proposed Data Model

The following is a logical model, not a final migration. IDs should be UUIDs and all material records should include `created_at`, `updated_at`, and the creating/updating user where appropriate.

### Identity and access

Implemented (see §5.3):

- `roles`: named roles — currently check-constrained to the fixed set `admin`, `event_coordinator`, `finance`, `board`, `volunteer` defined in §5.3, with `description`
- `user_roles`: user-to-role assignments (`user_id`, `role_id`, `unique(user_id, role_id)`), RLS-restricted so a user can only read their own rows and only `admin` can write any
- `has_role(text)`, `is_admin()`, `my_roles()`: `security definer` SQL helper functions used by both RLS policies and the app (`my_roles` backs `getCurrentUserRoles` client-side) to check the calling user's own roles without recursive-policy issues
- `list_portal_users()`: a `security definer` RPC used only by Administration > Users to list `auth.users` (email, roles, created_at) for admins, since `auth.users` isn't otherwise exposed via the API
- `profiles`: still not implemented — not yet needed, since `list_portal_users()` reads email directly from `auth.users`

Planned next: a `resources` + `role_permissions` (role × resource → none/view/manage) pair of tables so the entitlement matrix becomes data the Administration > Permissions page can edit, rather than hardcoded role-name checks in RLS policies and route guards — see "what's next" in §5.3. This would also let `roles.name` drop its fixed check constraint so new roles can be created.

### Public and events

- `pages` or repository content: approved public content
- `events`
- `event_sponsors`: links an event to a `people` record via `person_id` (one row per event/person pair), plus per-event sponsorship details — support type, in-kind description, contribution value, public visibility, notes. Sponsor/partner name and contact info are not duplicated here; they live on the linked `people` row.
- `event_registrations`: optional future capability

### Inventory and donations

- `people`: shared directory of donors, sponsors, and volunteers (name, email, phone, notes, `is_donor`/`is_sponsor`/`is_volunteer` flags), so the same contact can be reused across roles instead of being duplicated per context
- `donations`
- `donation_items`
- `inventory_items`: donation-managed inventory records with description, size, type, gender, condition, face value, photo, and status
- `inventory_movements`: receipt, distribution, adjustment, and retirement transactions
- `public_gear_catalog`: read-only view over `inventory_items` limited to `status = available` rows and a curated column set (description, size, type, gender, condition, photo); granted to the `anon` role so it can back the public gear gallery without relaxing RLS on the base table
- `inventory_photos`
- `distribution_recipients`: protected recipient records, if needed

### Finance and giveaways

- `event_revenue`: not yet implemented
- `event_expenses`: implemented, with an optional `event_id` (nullable — expenses may or may not be tied to an event)
- `file_attachments`: not yet implemented
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
- `audit_log`

`agendas`, `minutes`, `resolutions`, `bylaws`, `policies`, `conflict_of_interest_disclosures`, and `annual_requirements` each hold their substantive content via nullable `file_attachment_id` (→ `file_attachments`), `external_link`, and `body_text` columns, populated in any combination per §5.11.

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
      governance/                # placeholder — no backing tables
      volunteers/                # placeholder — no backing tables
      administration/            # placeholder — no backing tables, no roles
  auth/
```

The exact route structure may evolve, but authenticated portal layouts must verify the session and authorization before rendering protected data. Use server components for read-heavy pages where practical and keep service-role operations server-only.

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
3. Optional receipt is uploaded to private storage.
4. Expense and attachment metadata are saved.
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
- Sensitive uploaded files are private and access-controlled.
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
