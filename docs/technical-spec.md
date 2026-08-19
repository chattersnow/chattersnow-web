# Chatter Snow Website and Operations Portal

## Technical Specification

- **Status:** Draft for team review
- **Version:** 0.1
- **Date:** 2026-08-18
- **Owner:** Chatter Snow
- **Repository:** `chattersnow-web`
- **Canonical domain:** `https://chattersnow.org`

## 1. Purpose

Chatter Snow needs a public website for sharing its mission and programs, plus a secure operations portal for managing events, donations, inventory, finances, raffles, volunteers, and reporting.

The product has two distinct audiences:

> **Public users are primarily consumers of information. Authorized users are operators of the system.**

The public site must remain useful without an account. Operational data must require authentication and role-based authorization.

## 2. Goals and Non-Goals

### Goals

1. Publish accessible information about Chatter Snow, its mission, programs, leadership, contact details, and ways to support it.
2. Publish upcoming and past events with optional registration.
3. Give authorized staff and volunteers a secure place to manage operational records.
4. Treat donations, inventory changes, distributions, and financial activity as transactions with history, rather than silently overwriting facts.
5. Establish a foundation for dashboards and reporting without requiring those features in the first release.

### Non-goals for the initial release

- Full accounting software or tax preparation.
- A public view of the complete internal inventory record.
- Automated calendar synchronization.
- Waitlists, capacity automation, confirmation emails, or event photo galleries unless prioritized separately.
- A complete dashboard before the underlying event, inventory, and finance workflows are stable.

## 3. Technology and Deployment

| Area | Decision |
| --- | --- |
| Frontend and application | Next.js App Router, TypeScript, React |
| Hosting | Vercel |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth |
| Files | Supabase Storage |
| Data API | Supabase-generated API and server-side Next.js routes/actions where orchestration is required |
| Authorization | PostgreSQL Row Level Security (RLS), with server-side checks for sensitive workflows |
| Source control | GitHub |
| DNS and domain | Cloudflare DNS; Vercel manages application deployment and domain integration |
| Local development | Next.js development server and Supabase local stack |

The current repository is a minimal Next.js application. Supabase Auth, Storage, and API services are enabled in `supabase/config.toml`; database schema and migrations remain to be implemented.

### Environment configuration

Secrets must be stored in environment variables and Vercel project settings, never in source control.

Required application configuration:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` for trusted server-only operations, if required
- Site URL and redirect URLs for local, preview, and production environments

The secret key must never be exposed to browser code. Production and preview environments should use separate Supabase projects or clearly separated configuration and data policies.

## 4. System Boundaries

### Public website

Public routes may expose approved content and explicitly public records:

- About, mission, programs, team, contact, and support pages
- Upcoming events
- Past events and event details
- Registration form when enabled
- A curated view of gear available for distribution, if approved

Public routes must not expose donor contact details, private event data, internal notes, financial records, individual recipient information, or complete inventory history.

### Operations portal

Authenticated routes support:

- Event management
- Inventory and distribution management
- Monetary and in-kind donation records
- Event income and expenses
- Raffle records
- Volunteer and attendance records
- Reports and future dashboard views
- User and role administration for authorized administrators

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

### 5.3 Public inventory availability

The recommended product behavior is **Option B: show gear available for distribution**, not the entire internal inventory.

The public view should be a derived, curated availability view grouped by item type and size. It may show values such as “Skis, 155 cm: 2 available” without exposing:

- Donor identity
- Purchase or estimated value
- Internal location
- Item-level notes
- Condition history
- Distribution recipients
- Complete stock movement history

This decision requires team confirmation before implementation. Until confirmed, inventory remains portal-only.

### 5.4 Authentication and authorization

Users shall authenticate through Supabase Auth. The application shall use named roles rather than treating every authenticated user as an administrator.

Candidate roles:

- `admin`: user and system administration
- `officer`: organization-wide operational and financial access
- `operations`: inventory and distribution workflows
- `event_manager`: event, registration, and event bookkeeping workflows
- `inventory_manager`: inventory and donation item workflows
- `volunteer`: explicitly limited operational access

The exact role set and permission matrix are decisions for the team. A user may have more than one role if that is useful operationally.

### 5.5 Inventory management

#### Receive a donation

Authorized users shall be able to:

1. Record donor information or select an existing donor.
2. Record donation date and source type.
3. Record one or more donated items.
4. Record item type, brand, model, size, quantity, condition, estimated value, photos, event/source, and notes as applicable.
5. Create an inventory receipt transaction.

Source types should distinguish individual, brand, organization, event, and other sources.

#### Update inventory

Authorized users shall be able to update item metadata and create controlled stock adjustments. The system shall support increasing or decreasing quantity, changing condition, adding photos, marking gear unavailable, and correcting errors.

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

Available quantity should be derived from valid inventory transactions and reservations, subject to an explicit policy for damaged, lost, retired, and reserved stock.

### 5.6 Event management

Authorized users shall be able to create and manage events, including:

- Basic information and publication status
- Sponsors and partners
- Registration and attendance
- Volunteers
- Inventory distributed
- Donations associated with the event
- Income and expenses
- Raffle activity

The event record should support a public/private boundary so internal planning details do not become public accidentally.

### 5.7 Event bookkeeping

Authorized users shall be able to record event income:

- Donations
- Raffle ticket sales
- Other revenue

Authorized users shall be able to record event expenses:

- Venue
- Food
- Transportation
- Equipment
- Marketing
- Supplies
- Other

Each expense should support amount, date, category, description, vendor/payee, receipt, event, and entering user. Receipts should be stored in a private Supabase Storage bucket.

The system shall calculate, at minimum:

```text
Event net = event revenue - event expenses
```

This is operational reporting and does not replace the organization's accounting controls.

### 5.8 Donations

Donations shall distinguish monetary donations from gear or other in-kind donations because they have different operational and reporting treatment.

Monetary donation fields:

- Donor
- Date
- Amount and currency
- Payment method
- Optional event
- Notes
- Recording user

In-kind donation fields:

- Donor
- Date
- Items and quantities
- Condition
- Estimated value
- Optional event/source
- Notes
- Recording user

Donor personal information must be restricted to authorized users with a legitimate operational need.

### 5.9 Raffles

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

### 5.10 Dashboard and reporting

A future operations dashboard may show:

- Upcoming events
- Available gear
- Donations for a selected period
- Expenses for a selected period
- Raffle revenue
- Pending tasks

Future reports should be based on transaction history and include filters, date ranges, event, category, and export requirements defined by the team.

### 5.11 Audit and history

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
- `event_registrations`
- `event_attendance`
- `volunteers`
- `event_volunteers`

### Inventory and donations

- `donors`
- `donations`
- `donation_items`
- `inventory_items`: canonical item/category and descriptive data
- `inventory_movements`: receipt, distribution, reservation, adjustment, and retirement transactions
- `inventory_reservations`: optional future reservation records
- `inventory_photos`
- `distribution_recipients`: protected recipient records, if needed

### Finance and raffles

- `event_revenue`
- `event_expenses`
- `file_attachments`
- `raffles`
- `raffle_prizes`
- `raffle_winners`

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
    inventory/
    support/
  (portal)/
    portal/
      events/
      inventory/
      donations/
      finance/
      raffles/
      reports/
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

1. Authorized user selects available gear and quantity.
2. Server checks current availability and permissions.
3. User records event, recipient information if required, and reason.
4. Server creates the distribution movement atomically.
5. Available quantity reflects the movement.
6. Audit entry records who distributed what and when.

### Record event expense

1. Authorized user selects an event and enters expense details.
2. Server validates amount, category, and event access.
3. Optional receipt is uploaded to private storage.
4. Expense and attachment metadata are saved.
5. Audit entry records the action.

## 10. Delivery Phases

### Phase 0: Decisions and foundation

- Confirm public inventory policy: portal-only, or curated available-for-distribution view.
- Confirm roles, permission matrix, donor privacy rules, and organization timezone.
- Confirm event registration data and retention requirements.
- Establish environments, GitHub workflow, Vercel project, Cloudflare DNS, and Supabase project configuration.
- Add migrations, typed database access, Auth session handling, and RLS test strategy.

### Phase 1: Public launch

- Replace the coming-soon page with About, programs, team, contact, support, and events pages.
- Add published upcoming/past event views and event details.
- Add registration only if the minimum registration workflow is agreed.
- Keep inventory private unless the public availability decision is approved.

### Phase 2: Operations foundation

- Add authentication and role management.
- Add event management.
- Add donors and monetary/in-kind donation records.
- Add inventory receipt, update, and movement workflows.
- Add private file storage for photos and receipts.
- Add audit history for material actions.

### Phase 3: Finance and event operations

- Add event revenue and expenses with net calculation.
- Add attendance and volunteer records.
- Add inventory distributions linked to events.
- Add initial operational reports.

### Phase 4: Extended operations

- Add raffles after legal review.
- Add dashboard, exports, calendar integration, waitlists, confirmations, and event photos as prioritized.

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
- An authorized user can authenticate and access only the portal areas allowed by their role.
- Donation receipt and inventory distribution workflows preserve transaction history.
- Inventory counts cannot become negative through normal application workflows.
- Sensitive uploaded files are private and access-controlled.
- RLS and authorization behavior are covered by automated tests or documented repeatable checks.
- Production deployment works through Vercel with Cloudflare DNS and environment-specific Supabase configuration.

## 13. Open Decisions

1. Is public inventory visibility approved, and does it mean all gear or only available gear for distribution?
2. What exact roles are needed at launch, and which permissions does each role have?
3. Which event registration fields are required, and is registration open to minors?
4. Is online payment collection required for donations or raffle tickets, or are those records entered manually?
5. What accounting system, reporting format, and tax treatment must event finance data support?
6. Which donor and recipient data may be stored, for how long, and who may access it?
7. Are event locations public for every event, or can some locations remain private until registration?
8. What are the organization timezone, currency, email sender, and notification requirements?
9. Which content should be editable by staff, and is a CMS needed after the public launch?
10. What jurisdictional requirements apply to raffles and public fundraising?

## 14. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Public exposure of internal inventory or donor data | Curated public views, private-by-default tables/storage, and RLS tests |
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
