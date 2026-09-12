# Authentication and authorization — specification

Part of [`docs/technical-spec.md`](../technical-spec.md) — section numbers are
unchanged. This file holds §5.3 and the identity/access data model. Technology, system boundaries, security, the
route tree and the key workflows stay in the hub. A plain `§N` below is in this
file; a `§N` that lives in another file is always a link.

## 5.3 Authentication and authorization

Users shall authenticate through Supabase Auth using Google OAuth. The application shall verify the authenticated user's authorization before rendering or changing portal data.

Five portal roles are seeded into every tenant. Each is identified by a stable **key** (`roles.name`) that the platform owns: migrations seed the permission matrix with `join roles r on r.name = '<role>'` across every tenant, so the key must mean the same thing everywhere and is not editable on a seeded role. What an organization _calls_ the role is its own — `roles.label`, tenant-owned and editable for every role including `admin`, null until somebody sets one, in which case the wording below is derived from the key (#910). A tenant may also retire any seeded role it has no use for; only `admin` refuses a rename and a delete.

The keys and their default wording:

- **`admin`** — full access to every section, including Administration (users/permissions/settings/audit log).
- **`event_coordinator`** — manages Events end-to-end (details, sponsors, giveaway, attendance, event-level expenses); view-only on People and Volunteers participation; no access to org-wide Finance, Inventory, Governance, or Administration.
- **`finance`** — manages the Finance section (donations, expenses, reimbursements, reports); view-only on Events (expenses/sponsor amounts, for reconciliation), Inventory reports (valuation), and People (donor contacts); no Governance or Administration access.
- **`board`** — manages the Governance section (board members, meetings, bylaws, policies, conflict of interest, annual requirements); view-only on Finance reports and the dashboard for oversight; no other section access.
- **`volunteer`** — views events and signs up for future events, with no visibility into event financial data (no expenses tab, no sponsor amounts); creates inventory donation-intake records and edits distribution/gear-checkout records, but has no access to Inventory reports (valuation); views own Volunteers participation/hours; no access to Finance, People, Governance, or Administration.

A user may hold more than one role. The full page-by-page breakdown is the entitlement matrix below.

### Entitlement matrix

Role columns below are keyed by `roles.name`; each organization may label them as it likes.

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
| Finance — sales (register, products, ledger)                    | Manage  | Manage              | Manage                 | None                 | None                               |
| People directory                                                | Manage  | View                | View                   | None                 | None                               |
| Volunteers — roles (role-type definitions)                      | Manage  | View                | None                   | None                 | View                               |
| Volunteers — participation                                      | Manage  | View                | None                   | None                 | View/log own                       |
| Volunteers — applications (public intake queue)                 | Manage  | View                | None                   | None                 | View⁴                              |
| Communications — contact messages                               | Manage  | None                | None                   | None                 | None                               |
| Governance — all pages                                          | Manage  | None                | None                   | Manage               | None                               |
| Administration — users, roles, permissions, settings, audit log | Manage  | None                | None                   | None                 | None                               |

¹ Volunteers never see event financial data (expenses, sponsor amounts); event sign-up depends on the not-yet-built event-registration tables noted in [§3](../technical-spec.md#3-technology-and-deployment).
² Volunteers do not get Inventory reports since those surface dollar valuations.
³ `finance` may create and edit expense/reimbursement records and mark them submitted, but cannot approve its own submissions — see [§5.16](finance.md#516-financial-controls-and-approval-workflow).
⁴ Applications reuse the same `volunteers` resource as the role-type catalog and participation rows rather than a narrower carve-out, so a `volunteer`-role user can read every applicant's name/email/phone, not just their own — an intentional reuse of the existing gate (issue #173), not a new information-sharing decision.

**Implemented:** `roles`/`user_roles` tables, plus a data-driven `resources`/`role_permissions` matrix (role × resource → none/view/manage) that RLS policies and route guards consult via `has_permission()` instead of hardcoded role names — see [§6](../technical-spec.md#6-proposed-data-model). Since multi-tenancy Phase 2 (#707) the matrix is per tenant: `has_permission()` answers for the tenant the user has selected (`current_tenant_id()`), a role is a role _in_ a tenant, and an account with several memberships has no permissions until it picks one (see "Multi-tenancy" in [§6](multi-tenancy.md#6-data-model-multi-tenancy)). Route guards (`requirePermission`/`requireAnyPermission` in each section's `layout.tsx`) and nav filtering (`portal-nav.tsx`) both read the same permission map, so unauthorized sections are neither reachable by URL nor shown in the sidebar, and a permission change takes effect immediately without a deploy. Administration > Users lets an admin assign/revoke roles per account, and Administration > Permissions lets an admin edit the matrix and create new roles beyond the initial five (the `roles.name` check constraint has been dropped). A new role starts with no permissions on any resource until explicitly granted.

Resource granularity mostly matches the matrix rows above, with a few narrow "Workflow" resources (`people_intake`, `inventory_intake`, `volunteer_hours_logging`) added to express existing per-verb carve-outs — e.g. a volunteer can record a donation-intake/distribution transaction or create an inline contact from an event/donation form without gaining full People-directory or Inventory-reports access — that a flat view/manage split per matrix row can't otherwise represent without widening those roles' read access.

**Implemented — `communications` resource** (issue #173): added specifically so contact-message routing could be decoupled from full `administration` access — `contact_messages` RLS previously hardcoded `select` to `is_admin()` with no dedicated resource at all (issue #172). Seeded with `admin: manage` only, since no front-desk/communications-coordinator role exists yet; Administration > Permissions can grant it to a new role later without another migration.

Authorization is now role-based: `roles`/`user_roles` tables plus `has_role()`/`is_admin()`/`my_roles()` security-definer helper functions back per-table RLS policies that match the entitlement matrix in §5.3, and the two cross-cutting workflow RPCs (`create_donation_with_items`, `record_event_distribution`) are `security definer` with explicit role checks so they work for roles like `volunteer` that only hold `insert` grants on the underlying tables. On the app side, `src/lib/auth/roles.ts` exposes `getCurrentUserRoles`/`requireAnyRole`; the portal layout redirects an authenticated-but-unprovisioned user (zero roles) to a "no access" login state, every section has its own `layout.tsx` calling `requireAnyRole` server-side (not just nav hiding), and `portal-nav.tsx`/`sidebar-quick-actions.tsx` filter what's shown per role. The five roles are still fixed at the database level (`roles.name` is check-constrained to the five in §5.3) and the matrix is still hardcoded into RLS policies and route guards rather than being data-driven — see "what's next" below and in §5.3.

Administration > Users is implemented — it lists every portal account (via a `security definer` `list_portal_users` RPC, since `auth.users` isn't otherwise exposed), lets an admin assign/revoke roles, deactivate/reactivate an account, and issue an invite link that pre-stages a role grant for an email before the person's first sign-in (`pending_role_grants`, claimed automatically on OAuth callback — see [§6](../technical-spec.md#6-proposed-data-model)).

Administration > Roles (add/edit/delete roles beyond the initial five) and Administration > Permissions (edit the role × resource matrix with staged, confirm-before-save edits) are both implemented and data-driven — see §5.3.

## 6. Data model — Identity and access

Implemented (see §5.3):

- `roles`: named roles — `name` is a stable platform key (the check constraint pinning it to the original five was dropped in `20260822090000`, but migrations still seed `role_permissions` by it across every tenant, so a seeded role's key is not editable), `label` is the tenant's own wording for it and is null until set (#910), plus `description`. Every role but `admin` can be renamed by the tenant that created it, relabelled, and deleted once nobody holds it
- `user_roles`: user-to-role assignments (`user_id`, `role_id`, `unique(user_id, role_id)`), RLS-restricted so a user can only read their own rows and only `admin` can write any
- `has_role(text)`, `is_admin()`, `my_roles()`: `security definer` SQL helper functions used by both RLS policies and the app (`my_roles` backs `getCurrentUserRoles` client-side) to check the calling user's own roles without recursive-policy issues
- `list_portal_users()`: a `security definer` RPC used only by Administration > Users to list `auth.users` (email, roles, created_at) for admins, since `auth.users` isn't otherwise exposed via the API
- `profiles`: still not implemented — not yet needed, since `list_portal_users()` reads email directly from `auth.users`
- `resources`: catalog of permissionable resources (`key`, `section`, `label`, `description`, `sort_order`) edited via Administration > Permissions
- `role_permissions`: role × resource → none/view/manage (`role_id`, `resource_id`, `level`, `unique(role_id, resource_id)`), RLS-restricted the same way as `user_roles`
- `has_permission(resource_key, min_level)`: `security definer` helper used by RLS policies, secured RPCs, and the app (via the `my_permissions()` RPC) to check the calling user's effective permission level for a resource across all their roles in the current tenant; `is_admin()` is now defined in terms of it (`has_permission('administration', 'manage')`) rather than hardcoding the `admin` role name
- `pending_role_grants`: **implemented** (issues #130/#134) — pre-stages a role grant for an email before that person's first sign-in (`email`, `role_id`, `status`: pending/claimed/revoked, `expires_at`, `created_by`, `claimed_by`/`claimed_at`, `revoked_by`/`revoked_at`, `invited_at`/`invited_by`), one active pending grant per `(email, role)` pair via a partial unique index. `claim_pending_role_grants()` (`security definer`) runs on OAuth callback and on every permissions check to convert a matching pending grant into a real `user_roles` row. Backs Administration > Users' "invite" flow, so an admin can grant access to someone who hasn't signed in yet.
- `deactivated_users`: **implemented** — `user_id` (PK → `auth.users`), `deactivated_at`, `deactivated_by`. `has_permission()`/`my_permissions()`/`is_admin()` all check this table and return no permissions for a deactivated user without touching their `user_roles`, so reactivating simply removes the row. Administration > Users exposes deactivate/reactivate controls; an admin cannot deactivate their own account.
