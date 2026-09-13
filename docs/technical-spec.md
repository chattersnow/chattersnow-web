# Coven — Website and Operations Portal

## Technical Specification

- **Status:** Draft for team review
- **Version:** 0.10
- **Date:** 2026-09-10
- **Owner:** the platform, which ships as **Coven** (Chatter Snow is its first tenant)
- **Repository:** `chattersnow-web`
- **Hosts:** see §3.1

## How to read this spec

§5 (functional requirements) and §6 (data model) are split by module under
[`docs/spec/`](spec/). **Read this file plus the one or two domain files your work
touches — not the set.** Section numbers are stable and unchanged, so a `§5.17` in a
migration comment or an issue still means what it always did; the index below says
which file it now lives in.

| Sections                                                   | File                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------ |
| §5.3, §6 identity and access                               | [`spec/access-control.md`](spec/access-control.md)     |
| §5.11, §6 audit log                                        | [`spec/audit.md`](spec/audit.md)                       |
| §5.20, §6 content and community calendar                   | [`spec/content-calendar.md`](spec/content-calendar.md) |
| §5.2, §5.5, §6 public and events                           | [`spec/events.md`](spec/events.md)                     |
| §5.6, §5.16, §5.18, §5.21, §5.22, §6 finance and giveaways | [`spec/finance.md`](spec/finance.md)                   |
| §5.8                                                       | [`spec/giveaways.md`](spec/giveaways.md)               |
| §5.12, §6 governance                                       | [`spec/governance.md`](spec/governance.md)             |
| §5.4, §5.7, §5.13, §5.19, §6 inventory and donations       | [`spec/inventory.md`](spec/inventory.md)               |
| §6 multi-tenancy                                           | [`spec/multi-tenancy.md`](spec/multi-tenancy.md)       |
| §5.9                                                       | [`spec/people.md`](spec/people.md)                     |
| §5.14, §5.15, §6 programs and impact                       | [`spec/programs.md`](spec/programs.md)                 |
| §5.17, §6 volunteers                                       | [`spec/volunteers.md`](spec/volunteers.md)             |
| §16, §17 (review addenda)                                  | [`spec/addenda.md`](spec/addenda.md)                   |

§5.1 and §5.10 are cross-cutting rather than per-module and stay in this file, along
with everything else: purpose, goals, technology, system boundaries, security, the route
tree, the key workflows, and the release criteria. There has never been a §10 or a §13.

Throughout the spec, a plain `§N` is in the file you are reading and a `§N` that lives
in another file is a link. A bare `§N` in a migration comment or an issue predates the
split and resolves through the index above.

## 1. Purpose

A small organization needs a public website for sharing what it does, plus a secure admin portal for managing events, money, inventory, people, and operational summaries. That is true of a nonprofit sharing its mission and programs, and equally of a small business — the records are the same shape, and the words differ.

This began as Chatter Snow's own site and is now a **multi-tenant platform**, named **Coven**, serving that need for any number of organizations from one application and one database ([§6, "Multi-tenancy"](spec/multi-tenancy.md#6-data-model-multi-tenancy)). Its market is small nonprofits and small businesses. **Chatter Snow is the first tenant, not the product.** Read every requirement below as a requirement of the platform, satisfied per tenant: "the organization's mission", not "Chatter Snow's mission". Where Chatter Snow appears by name it is an example of a tenant's data, and belongs in that tenant's rows rather than in platform code — `docs/licensing.md` draws the line, and `docs/tenants.md` is the operator's runbook.

Nonprofit vocabulary — donors, programs, volunteers, a board — is the default wording of a platform whose first tenant is a nonprofit, not a statement about who may be a tenant. A business tenant reads the same tables as customers, services, staff and owners. Where a word reaches navigation, it is data (`lexicon.*`, §6 multi-tenancy); everywhere else it is Site Content. Requirements below that name a nonprofit-only concept — §5.12 governance and nonprofit-status tracking above all — are module entitlements a tenant may not hold, not assumptions the platform makes.

The product has two distinct audiences:

> **Public users are primarily consumers of information. Authorized users are operators of the system.**

The public site must remain useful without an account. Operational data must require authentication and role-based authorization. Both are per tenant: the request host decides which organization a public visitor is looking at, and a membership decides which one an operator is working in.

## 2. Goals and Non-Goals

### Goals

1. Publish accessible information about the organization, its mission, programs, leadership, contact details, and ways to support it.
2. Publish upcoming and past events with optional registration.
3. Give authorized staff and volunteers a secure place to manage operational records.
4. Treat donations, inventory changes, distributions, and expenses as records with history, rather than silently overwriting facts.
5. Give administrators a dashboard that summarizes events, inventory, donations, and expenses.

### Non-goals for the initial release

- Full accounting software or tax preparation.
- A public view of the internal inventory record (donor/donation linkage, face value, internal notes, status, or movement history). A curated, read-only public catalog of currently available gear is in scope — see §4 and [§5.4](spec/inventory.md#54-inventory-and-donation-management).
- Automated calendar synchronization.
- Waitlists, capacity automation, confirmation emails, or event photo galleries unless prioritized separately.
- An in-app file upload/attachment solution for documents (expense/reimbursement receipts, governance records). This is a permanent design decision, not an initial-release gap: records store a link to the file in an existing external solution the organization already manages (Google Drive/OneDrive), not the file itself. A `file_attachments` table backed by Supabase Storage is not planned — see [§5.6](spec/finance.md#56-expense-management), [§5.12](spec/governance.md#512-governance), [§5.18](spec/finance.md#518-reimbursements), §6.

(Giveaway recording and event attendance headcounts, listed as future capabilities in earlier drafts, are now implemented — see [§5.5](spec/events.md#55-event-management) and [§5.8](spec/giveaways.md#58-giveaways). Volunteer management, previously listed here as a non-goal, is now specified — see [§5.17](spec/volunteers.md#517-volunteer-management).)

## 3. Technology and Deployment

| Area                     | Decision                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend and application | Next.js App Router, TypeScript, React                                                                                                                                                                                                                                                                                                                                                          |
| UI components            | shadcn/ui (Tailwind v4 + Base UI primitives), composed with the project's own brand tokens/classes in `globals.css`                                                                                                                                                                                                                                                                            |
| Hosting                  | Vercel                                                                                                                                                                                                                                                                                                                                                                                         |
| Database                 | Supabase PostgreSQL                                                                                                                                                                                                                                                                                                                                                                            |
| Authentication           | Supabase Auth with Google OAuth                                                                                                                                                                                                                                                                                                                                                                |
| Files                    | Supabase Storage. **Implemented**: a public `gear-photos` bucket (issue #781), `{tenant_id}/{uuid}.jpg`, RLS-gated write; and a private `artwork-submissions` bucket (issue #870) written only through server-minted signed upload URLs and read only through signed URLs — see §7.5. Document attachments (receipts, governance records) are external links for the initial release — see §2. |
| Data API                 | Supabase-generated API and server-side Next.js routes/actions where orchestration is required                                                                                                                                                                                                                                                                                                  |
| Authorization            | PostgreSQL Row Level Security (RLS), with server-side checks for sensitive workflows                                                                                                                                                                                                                                                                                                           |
| Source control           | GitHub                                                                                                                                                                                                                                                                                                                                                                                         |
| DNS and domain           | Cloudflare DNS; Vercel manages application deployment and domain integration                                                                                                                                                                                                                                                                                                                   |
| Local development        | Next.js development server and Supabase local stack                                                                                                                                                                                                                                                                                                                                            |

### 3.1 Hosts and tenants

One deployment serves every tenant. Which one a request belongs to is resolved from its `Host` against `tenants.custom_domain` ([§6, "Multi-tenancy"](spec/multi-tenancy.md#6-data-model-multi-tenancy)), so adding an organization is a DNS entry plus a row — never a branch, a build, or a deploy.

| Host                         | Tenant                     | What it serves                                                                                                                                                                                                                                                                            |
| ---------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chattersnow.org`            | Chatter Snow               | Redirects to `www`                                                                                                                                                                                                                                                                        |
| `www.chattersnow.org`        | Chatter Snow               | Public site                                                                                                                                                                                                                                                                               |
| `portal.chattersnow.org`     | Chatter Snow               | Operations portal                                                                                                                                                                                                                                                                         |
| `demo.rickiecruz.com`        | Demo (`demo` plan)         | Public site of the demo tenant                                                                                                                                                                                                                                                            |
| `demo.rickiecruz.com/portal` | Demo (`demo` plan)         | Demo portal, one click from the login screen, reset nightly (§6, "The demo tenant"; `docs/tenants.md`)                                                                                                                                                                                    |
| `portal.rickiecruz.com`      | Platform (`internal` plan) | The platform operator's own portal. No public site — the `rickiecruz.com` apex is a separate consulting site and is not served from this deployment                                                                                                                                       |
| `uat.chattersnow.org`        | Chatter Snow               | The `development` branch, deployed as a Vercel **Preview** (the free plan has no separate Development environment). Parent-domain matching resolves it to Chatter Snow without an override; a raw `*.vercel.app` preview host matches no `custom_domain` and needs `TENANT_HOST_OVERRIDE` |

The demo and platform tenants sit on `rickiecruz.com` subdomains rather than `chattersnow.org` because neither is Chatter Snow's: putting a demo of the platform on a customer's domain would present one tenant's brand as the product's. The eventual product brand gets its own domain, and because host → tenant resolution is data-driven, that move is a `custom_domain` update rather than a code change.

The repository started as a minimal Next.js application and has since been built out well past the original "coming soon" skeleton. Supabase Auth, Storage, and API services are enabled in `supabase/config.toml`. Schema exists as 100+ ordered migrations under `supabase/migrations/`, now covering the shared `people` directory (donors, sponsors, volunteers), donations, inventory items/movements, events, event sponsors, event expenses/revenue, event attendance (a simple event-level headcount, not per-attendee), event registrations (with check-in), discount codes, giveaways/giveaway prizes/giveaway winners, programs, volunteer role types/hours, reimbursements, governance (board members, meetings, agendas/agenda templates, minutes, action items, decisions, resolutions, conflict-of-interest disclosures, annual requirements), nonprofit-status milestones, the content and community calendar (calendar items, content opportunities, brief templates, program-suggestion rules), `roles`/`user_roles`/`role_permissions`/`pending_role_grants`/`deactivated_users`, and an append-only `audit_log`, plus curated public views (`public_gear_catalog`, `public_events`, `public_event_sponsors`, `public_sponsor_wall`, `public_event_programs`, `public_volunteer_role_types`, `public_calendar_items`) and abuse-protection primitives (`rate_limit_hits`/`check_rate_limit()`, `contact_messages`) backing the public intake forms. `supabase/seed.sql` populates a local dev database with one test account per role (plus a multi-role and a no-role account, all `@example.test`) and sample operational data, so the role matrix and every workflow below can be exercised locally without touching production.

The portal's sidebar nav links to every section named in §8's route tree. Administration > System settings is a real page backed by an `app_settings` key/value table, holding the org's fiscal year ([§5.21](spec/finance.md#521-fiscal-year)), the expense and reimbursement approval thresholds ([§5.16](spec/finance.md#516-financial-controls-and-approval-workflow), [§5.18](spec/finance.md#518-reimbursements)), the register's default sales tax rate (`finance.sales_tax_rate`, [§5.22](spec/finance.md#522-sales-point-of-sale)), and the content calendar's default lead time ([§5.20](spec/content-calendar.md#520-content-and-community-calendar)), with more settings added incrementally as features need them. The public site's Home page is implemented with mission copy, CTAs, and an upcoming-event highlight; Contact, Events (list, detail, registration, check-in), Gears (catalog and request flow), and the public Community Calendar all have working forms/data, alongside About Us, Get Involved, and Support — see §4.

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
- **About** (`/about`): the organization's mission and story, plus a **Meet the Team** sub-page (`/about/team`) with staff/leadership profiles. Since issue #917 a tenant chooses how those profiles are arranged: **Cards** (the default, and what every tenant that has said nothing keeps) or **Rows** — full-width roster rows that set a long biography at a readable measure and clip it to three lines with an in-page expander — set in Website › Layout as `layout.team_layout`. Each member also carries an optional role, shown in both arrangements.
- **Events** (`/events`): upcoming and past events with detail pages, plus `/events/community` — the public Community Calendar ([§5.20](spec/content-calendar.md#520-content-and-community-calendar)). Initial release renders events as a list; a calendar view is a possible future enhancement pending further research.
- **Gear** (`/inventory/library`, `/inventory/donate`): the curated, read-only gear availability catalog with a request flow, and a donate-gear informational page.
- **Get Involved** (`/get-involved/attend`, `/get-involved/volunteer`, `/get-involved/partner`): attending events, volunteering (opportunities plus an application form), and partnering.
- **Support** (`/support/donations`, `/support/sponsorship`): monetary giving (placeholder) and sponsorship information, the latter closing with a wall of the organization's past sponsors ([§5.5](spec/events.md#55-event-management)). Since issue #1013 a tenant chooses how that wall is presented: **Cards** (the default, and what every tenant that has said nothing keeps) or **Band** — one quiet centred row of logos at a single height, for a short wall or one that should support the donate call to action below it — set in Website › Layout as `layout.sponsor_wall_layout`.
- **Contact Us** (`/contact`): a rate-limited contact form that persists inquiries for staff follow-up, plus the organization's published email address and social media links.

A `/programs` page also exists (the pillar/program content originally under `/about/programs`). It is in the nav, and its cards come either from Site Content or from the Programs module — see [§5.14](spec/programs.md#514-program-management).

Public routes must not expose donor contact details, private event data, internal notes, financial records, the internal inventory record (donation linkage, face value, notes, status, or movement history), individual recipient information, or inventory history. The gear availability catalog above is the sole approved exception, and only through its curated field list.

**Implemented:** all seven sections above are built. Gear (`/inventory/library`) includes a request flow ([§5.4](spec/inventory.md#54-inventory-and-donation-management)); Get Involved > Volunteer is fed live from `volunteer_role_types` plus a public application form ([§5.17](spec/volunteers.md#517-volunteer-management)); Events includes public registration, check-in-eligible listings, public sponsor display, and the Community Calendar ([§5.2](spec/events.md#52-public-events), [§5.20](spec/content-calendar.md#520-content-and-community-calendar)); Contact and the volunteer-application/event-registration paths are rate-limited (§7). About Us (`/about`) has real mission/story copy and a team roster (bios still "coming soon"). Support > Donations remains a monetary-giving placeholder (in-kind donation info only).

**What's next:** Replace the monetary-donations placeholder with a real giving path. Write real team bios and an explicit values section.

`/programs` is reachable from the nav (the claim that its entry is commented out predates `src/lib/public-nav.ts`), and since issue #898 a tenant chooses where its cards come from: **Site Content** (the default, and what every tenant that has said nothing keeps) or the **Programs module**, set in Website › Layout as `layout.programs_source`. See [§5.14](spec/programs.md#514-program-management).

### Operations portal

The authenticated admin portal supports:

- Dashboard summary
- Event management
- Donation and inventory management
- Expense management

Giveaway recording (prizes, winners, ticket totals) and event attendance headcounts are implemented as part of event management. Role-based access control ([§5.3](spec/access-control.md#53-authentication-and-authorization)) is implemented as a data-driven permissions matrix, including Administration > Users/Roles/Permissions for managing accounts, roles, and the permission matrix itself. An audit log ([§5.11](spec/audit.md#511-audit-and-history)) is implemented for donations, inventory items/movements, event expenses, user role changes, calendar items, and content opportunities; events and giveaways are not yet covered. Volunteers (role types, hours logging), governance record-keeping (board members, meetings, agendas, resolutions, bylaws, policies, conflict-of-interest disclosures, annual requirements, nonprofit-status tracking), programs and impact reporting ([§5.14](spec/programs.md#514-program-management), [§5.15](spec/programs.md#515-impact-tracking-and-reporting)), reimbursements ([§5.18](spec/finance.md#518-reimbursements)), and the content and community calendar ([§5.20](spec/content-calendar.md#520-content-and-community-calendar)) are all implemented. What remains planned or placeholder: inventory valuation reporting ([§5.19](spec/inventory.md#519-inventory-valuation-reporting)) and the financial approval workflow's dollar thresholds ([§5.16](spec/finance.md#516-financial-controls-and-approval-workflow)).

## 5. Functional Requirements

The requirements below that belong to a single module live in that module's file under
[`docs/spec/`](spec/) — see the index above. The two that are cross-cutting stay here:
§5.1 (public content) and §5.10 (dashboard and reporting).

### 5.1 Public content

The site shall allow visitors to:

- View a home page introducing Chatter Snow and linking into About Us, Events, Gears, and Contact Us.
- Learn about Chatter Snow, its mission, and its programs on the About Us page.
- Meet the team or leadership on an About Us sub-page.
- Submit a contact inquiry through a form that is persisted for staff follow-up.
- Find the organization's published contact email address and social media links.
- Reach whatever the organization is currently asking for from a social profile's single bio link, through `/links` (#937) — an unlisted page of admin-configured buttons, each one publishable and reorderable from Administration > Site Content.
- Learn how to support the organization.

Content management is not required to be self-service in the first release. The initial implementation may use repository-managed content, while the data model should leave room for a future CMS or admin-managed content. The contact form is a public write path: it must be rate-limited, validated server-side, and must not create or expose any authenticated-only record.

**Implemented:** Home page content (mission summary, upcoming event highlight, Join/Get Involved/Donate CTAs — see §4), About Us (mission/story), team roster (bios pending), programs (`/about/programs`), volunteer opportunities (`/about/volunteer`), in-kind donation info (`/about/donations`), and a server-mediated, rate-limited contact form (`/contact`) with published email addresses and an Instagram link.

**What's next:** real leadership bios and an explicit values section on About Us; a real monetary-donation path (currently a "coming soon" stub).

### 5.10 Dashboard and reporting

The initial admin dashboard shall summarize:

- Upcoming events
- Inventory by status and type
- Donation inventory totals
- Expenses for a selected period
- Giveaway sales associated with events
- Revenue for a selected period, which since #909 means event revenue plus completed merchandise sales ([§5.22](spec/finance.md#522-sales-point-of-sale)) — the dashboard tile and the Financial Reports Income figure are derived from the same `get_finance_report_data` rollup so the two can never disagree

Dashboard values should be derived from stored records and clearly indicate the relevant date range. Expanded reports may later include filters, exports, and pending tasks.

## 6. Proposed Data Model

The following is a logical model, not a final migration. IDs should be UUIDs and all
material records should include `created_at`, `updated_at`, and the creating/updating user
where appropriate.

The model is grouped by module and each group lives in that module's file under
[`docs/spec/`](spec/) — see the index above. A reference of the form "§6, 'Multi-tenancy'"
means the group of that name, now the "Data model" section of the matching file.

Foreign keys should enforce relationships. Monetary amounts should use a fixed-precision numeric type, not floating-point values. Dates should be stored with timezone-aware timestamps; event display timezone is an event or organization configuration decision.

## 7. Security and Privacy

### 7.1 RLS on every exposed table

Enable RLS on every exposed application table; do not rely on frontend route hiding as authorization.

### 7.2 Public read access is limited to published records

Public read access should be limited to records explicitly marked published/public.

### 7.3 Permissions follow roles

Authenticated users should receive only the permissions associated with their roles.

- **Tenant isolation** (#707): every tenant table carries `tenant_id`, permissions are evaluated per tenant, and platform access is a time-boxed `support` membership rather than a bypass. Phase 3 enforces it: every policy filters on the tenant, every foreign key between tenant tables is composite, the `security definer` RPCs answer for the caller's tenant, the public surface resolves from the request host, and the generated isolation suite (plus `tenant_isolation_gaps()`) asserts all of it on every run. Since #887 that report also covers the construct which bypasses the policies it checks -- a `security definer` view over a tenant table with no tenant predicate, and any write grant on one (see "Multi-tenancy" in [§6](spec/multi-tenancy.md#6-data-model-multi-tenancy)). A gap there is a release blocker for serving a second organization.

### 7.4 No sensitive data for the anonymous role

Financial, donor, recipient, internal note, and audit data must not be available to the anonymous role.

- The corollary for settings and copy (#888): `brand.`, `page_visibility.`, `layout.`, `legal_publication.`, `lexicon.` and `site_images.` are reserved public key namespaces and the whole of `site_content` is public, because the views serving them match a prefix (or nothing at all) rather than an enumerated list. Nothing that is not meant for `anon` may be stored under them; see "Multi-tenancy" in [§6](spec/multi-tenancy.md#6-data-model-multi-tenancy) for the registries and the test that enforces it.

### 7.5 Storage buckets are private by default

Storage buckets must be private by default. Use signed URLs for authorized files and transformed/public assets only where intentionally approved. **The `gear-photos` bucket is the one approved exception** (issue #781). Gear photos are already public — they were anyone-with-the-link Google Drive files, and they render for `anon` on `/inventory` — so a public bucket exposes nothing a signed URL was protecting, while giving stable URLs and clean `next/image` edge caching with no signing step. Objects are named `{tenant_id}/{uuid}.jpg`: unguessable, one folder level deep, and tenant-scoped. Writes stay gated by policies on `storage.objects` (`inventory:manage` or `inventory_intake:manage`, within the caller's own tenant, and never from the demo tenant, whose admin is an anonymous visitor). Two consequences are accepted deliberately: the tenant's UUID appears in every public photo URL (opaque, and it grants nothing on its own), and an object uploaded to an abandoned intake outlives it until the daily `/api/cron/gear-photo-purge` sweep collects it. Nothing private is ever intended to enter this bucket; anything that is gets its own private one. **The `artwork-submissions` bucket (issue #870) is the first of those, and the pattern to follow.** It is private, and it carries no `anon` policy at all: an unauthenticated visitor still has to hand over a 10 MB file, and both obvious routes are closed -- Next caps a Server Action body at 1 MB by default and Vercel caps a serverless request body at 4.5 MB, while an `anon` insert policy on `storage.objects` would be an unauthenticated write faucet on the same project as production. So a rate-limited Server Action (`claim_artwork_upload_slots`, 20/15min) mints a one-shot signed upload URL, with the service-role client, for a path the _server_ chooses (`{tenant_id}/{event_id}/{draft_id}/{uuid}.jpg`), and the browser PUTs directly to Storage; `submit_artwork()` then re-checks each recorded path against a pattern built from the resolved tenant and event, so nothing outside them can be named. Reviewers read through one-hour signed URLs minted server-side under an `artwork_submissions:view` policy. Each artwork is stored twice -- the untouched original, because the zine is printed, and a 1600px thumbnail, without which one page of the review grid would pull close to a gigabyte of egress. Abandoned objects are collected by the same daily `/api/cron/gear-photo-purge` sweep, which runs both buckets because the Hobby plan allows one cron a day.

### 7.6 Re-validate authorization in multi-step writes

Validate authorization again in server actions or API routes that perform multi-step writes.

### 7.7 Transactions or RPCs for multi-record workflows

Use database transactions or RPCs for workflows such as receiving donations and distributing inventory so related records cannot be partially written.

### 7.8 Validate client input with shared schemas

Validate all client input with shared schemas and enforce database constraints for quantities, amounts, statuses, and required relationships.

### 7.9 Rate-limit public write endpoints

Rate-limit public registration and other write endpoints; add bot protection if abuse appears. **Implemented** (issue #172): a shared `rate_limit_hits` table (`route`, `ip_address`, `created_at`) and `check_rate_limit(route, ip_address, max_attempts, window)` `security definer` RPC (sliding window, fails open on a null IP) back per-route limits on `submit_contact_message()` (5/15min), `register_for_event()` (8/15min, plus a honeypot field), and `submit_volunteer_application()` (5/15min by IP, plus its existing 24h per-email throttle and a honeypot field), and (issue #870) `submit_artwork()` (5/15min, plus a honeypot field), `claim_artwork_upload_slots()` (20/15min, which is what caps how much can be written into the bucket) and `get_artwork_call()` (30/15min).

### 7.10 Log security-sensitive actions safely

Log security-sensitive actions without placing secrets or unnecessary personal data in logs.

### 7.11 Retention, deletion, export, and access procedures

Define retention, deletion, export, and access procedures for donor and recipient personal information before production use. **Implemented** (issue #602): the periods published at `/privacy` are held in `retention_policies` (one row per category, each with its own `off`/`dry_run`/`enforce` mode) and applied by `run_retention_purge()`, scheduled nightly by `pg_cron`. Rows are anonymized rather than deleted wherever the aggregate still feeds impact reporting -- event registrations keep `party_size`, `checked_in_at` and the rider snapshot while losing every identifying field -- and a person is retained whenever any foreign key outside `retention_purgeable_person_refs` still points at them, which is how the donation and financial exemption is enforced. Every run writes counts and sample ids to `retention_runs`/`retention_run_tables`, readable at Administration > Data Retention; a deletion request for a rider profile is actioned there or from the person record via `delete_rider_profile()`. Portal accounts are deactivated and their portal record cleared rather than deleted: `audit_log.actor_id` and ~120 other actor columns reference `auth.users` with no `ON DELETE`, so removing the identity of anyone who has written a row is not possible, and the audit trail is retained separately for governance, security, audit, insurance and legal purposes. **Extended** (issue #720): the two append-only stores that hold copies the purge could not reach -- `audit_log.old_data`/`new_data` and `person_merges.merged_snapshot`/`survivor_before` -- are redacted rather than deleted, by two more rules in the same job, on the same modes and the same run log. Seven years on, the values of the columns registered in `retention_snapshot_personal_columns` are cleared inside those snapshots (the key stays, holding null) and `redacted_at` is stamped; the records themselves are kept permanently. A deletion request does not wait for that clock: `delete_rider_profile()` redacts the merge snapshots naming the person and the audit entries whose snapshot carries their id, at the time of the request and regardless of policy mode. Both periods are proposals pending board approval, recorded in the planning repo, and both rules ship in `dry_run`.

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
    inventory/
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
  links/                        # link-in-bio page (#937) — one URL for a social profile's
                                # single bio link, its buttons edited at Administration >
                                # Site Content. Outside `(public)` on purpose: that group's
                                # layout is the header nav and footer this page does without.
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
      finance/                  # donations, expenses, reimbursements, revenue, reports, sales/ (ledger + register/ + products/)
      people/                   # shared donor/sponsor/volunteer directory
      programs/                 # program CRUD (issue #45) + reports/ (season/program impact rollup, issue #48)
      governance/               # board-members, meetings (incl. agendas), resolutions, bylaws, policies, conflict-of-interest, annual-requirements, nonprofit-status — all implemented
      volunteers/                # roles (role types) + participation (hours logging) + applications (public intake queue, issue #173) — implemented (issues #49/#50/#173)
      communications/            # contact-form message queue — implemented (issue #173)
      calendar/                 # content & community calendar (§5.20) — implemented, incl. program-suggestions/, templates/, work-queue/, reports/ (annual planning review, issue #111)
      administration/           # users (incl. invite links, deactivation), roles, permissions, audit-log — implemented; organization-settings — implemented (app_settings; System Settings until #992)
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
3. Server stores the inquiry in `contact_messages` for staff follow-up, then notifies the ops-inbox role holders who have opted in (issue #742 — see §6).
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
