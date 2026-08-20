# Chatter Snow Website and Operations Portal

## Technical Specification

- **Status:** Draft for team review
- **Version:** 0.1
- **Date:** 2026-08-18
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
- Raffles, volunteer management, attendance tracking, and full accounting software unless prioritized separately.

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

The repository started as a minimal Next.js application and is being built out incrementally. Supabase Auth, Storage, and API services are enabled in `supabase/config.toml`. Schema exists as ordered migrations under `supabase/migrations/` for donors, donations, inventory items/movements, events, and the public gear catalog view; roles/permissions, event sponsors/registrations, expenses, raffles, and the audit log remain to be implemented.

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

Public routes may expose approved content and explicitly public records:

- About, mission, programs, team, contact, and support pages
- Upcoming events
- Past events and event details
- Registration form when enabled
- Public event information marked for publication
- Gear availability catalog: a curated, read-only list of items with `status = available`, limited to description, size, type, gender, condition, and photo

Public routes must not expose donor contact details, private event data, internal notes, financial records, the internal inventory record (donation linkage, face value, notes, status, or movement history), individual recipient information, or inventory history. The gear availability catalog above is the sole approved exception, and only through its curated field list.

### Operations portal

The authenticated admin portal supports:

- Dashboard summary
- Event management
- Donation and inventory management
- Expense management

Raffles, volunteers, attendance, and expanded reporting are planned capabilities and are not required for the initial portal.

## 5. Functional Requirements

### 5.1 Public content

The site shall allow visitors to:

- Learn about Chatter Snow and its mission.
- Review programs and initiatives.
- Meet the team or leadership.
- Find contact information.
- Learn how to support the organization.

Content management is not required to be self-service in the first release. The initial implementation may use repository-managed content, while the data model should leave room for a future CMS or admin-managed content.

### 5.2 Public events

The site shall allow visitors to:

- View upcoming events.
- View past events.
- Open an event detail page.
- See date/time, location, and description.
- See sponsors or partners when marked for publication.
- Register when registration is enabled.

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

The initial portal role is `admin`. Admin users may access the dashboard, events, expenses, and inventory workflows. Additional roles and narrower permissions may be introduced when operational needs are confirmed.

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
- Raffle sales
- Public/private visibility and publication status

The event record should support a public/private boundary so internal planning details do not become public accidentally. Registration, attendance, volunteers, and inventory distributions may be added as later capabilities.

### 5.6 Expense management

Authorized users shall be able to record expenses with:

- Description
- Date
- Amount and currency
- Receipt
- Optional event association
- Entering user

Receipts should be stored in a private Supabase Storage bucket. Expense records are operational data and do not replace the organization's accounting controls.

### 5.7 Donations

The initial inventory workflow is the primary way administrators manage donated gear. Donation records should retain donor and donation context where needed, while inventory records retain the item-level details. Donor personal information must be restricted to authorized users with a legitimate operational need.

### 5.8 Raffles

Raffles are a planned capability and may be delivered after the initial release. The model should support:

- Raffle associated with an event
- Tickets sold and revenue
- Prizes
- Prize donor
- Prize item and estimated value
- Winner
- Drawing date
- Prize distribution status/date

The implementation must be reviewed for applicable legal, tax, and jurisdictional requirements before enabling public ticket sales.

### 5.9 Dashboard and reporting

The initial admin dashboard shall summarize:

- Upcoming events
- Inventory by status and type
- Donation inventory totals
- Expenses for a selected period
- Raffle sales associated with events

Dashboard values should be derived from stored records and clearly indicate the relevant date range. Expanded reports may later include filters, exports, and pending tasks.

### 5.10 Audit and history

The system shall preserve who changed what and when for material operational records, including:

- Inventory quantity and status
- Donations
- Distribution records
- Events
- Income and expenses
- Raffles
- User role changes

Audit history should be append-only for normal application users. At minimum, store actor, action, entity type, entity ID, timestamp, and a structured before/after or change payload. Audit data must be visible only to authorized roles.

## 6. Proposed Data Model

The following is a logical model, not a final migration. IDs should be UUIDs and all material records should include `created_at`, `updated_at`, and the creating/updating user where appropriate.

### Identity and access

- `profiles`: application profile linked one-to-one with `auth.users`
- `roles`: named roles
- `user_roles`: user-to-role assignments

### Public and events

- `pages` or repository content: approved public content
- `events`
- `event_sponsors`
- `event_registrations`: optional future capability

### Inventory and donations

- `donors`
- `donations`
- `donation_items`
- `inventory_items`: donation-managed inventory records with description, size, type, gender, condition, face value, photo, and status
- `inventory_movements`: receipt, distribution, adjustment, and retirement transactions
- `public_gear_catalog`: read-only view over `inventory_items` limited to `status = available` rows and a curated column set (description, size, type, gender, condition, photo); granted to the `anon` role so it can back the public gear gallery without relaxing RLS on the base table
- `inventory_photos`
- `distribution_recipients`: protected recipient records, if needed

### Finance and raffles

- `event_revenue`
- `event_expenses`
- `file_attachments`
- `raffles`, `raffle_prizes`, and `raffle_winners`: planned future capability

### Governance

- `audit_log`

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

Use the Next.js App Router with route groups that make the public/portal boundary visible in the codebase:

```text
src/app/
  (public)/
    about/
    events/
    support/
    gears/                    # public gear availability catalog
  (portal)/
    portal/
      page.tsx                 # admin dashboard
      events/
      inventory/
      expenses/
  auth/
  api/
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
| Roles become too broad | Create a permission matrix and review access with real operators before launch |
| Registration creates privacy or capacity problems | Start with minimal fields and add capacity/confirmation rules explicitly |
| Raffle functionality creates compliance exposure | Complete legal review before enabling ticket sales |
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
