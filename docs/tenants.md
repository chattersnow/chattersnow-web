# Serving more than one organization

**Updated:** 2026-09-06

The operator's runbook for tenants (#707 Phase 4): how a second organization
is provisioned, put on its own domain, branded, supported, exported and
deleted. The model behind it -- `tenants`, `tenant_id` on every table,
membership instead of a super-admin -- is in `docs/technical-spec.md` §6 and
in the planning repo's `decisions/2026-09-05-multi-tenancy-model.md`.

Most of it can also be done from the portal, at Administration → **Platform**
(#707 Phase 5c) — provisioning, the domain, the status and the export. That
page resolves only inside Chatter Snow's own tenant: the RPCs behind it require
`platform_tenants:manage` **and** a full (non-support) membership **and** a
tenant on the `internal` plan, so a customer's admin granting themselves the
resource in their own matrix — which they can, they own their matrix — still
gets nothing. Deletion and support grants are deliberately not there; see
below. The commands stay the fallback, and the only route when the portal
itself is what is broken.

Every command below runs as `service_role` against whichever project the
environment names. `bun run tenant:*` reads `.env.local`, which is the local
stack; for the linked project run the script directly with the right env
file:

```bash
bun --env-file=.env.production.local scripts/tenant-cli.ts list
```

## Provisioning a tenant

```bash
bun run tenant:provision \
  --name "Example Nonprofit" \
  --slug example-nonprofit \
  --domain example.org \
  --admin director@example.org
```

`provision_tenant()` creates the tenant and everything it needs to be signed
into:

- the five seeded roles (`admin`, `event_coordinator`, `finance`, `board`,
  `volunteer`) with the **whole** permission matrix, copied from the template
  tenant -- the oldest `internal` tenant, i.e. Chatter Snow -- for those five
  roles only. Every migration that seeds `role_permissions` does so by role
  name across all tenants, so the template's matrix is always the current
  platform default and provisioning never has to be updated when a resource
  is added. Custom roles the template added itself are not copied;
- the catalog defaults a fresh database gets from migrations: the inventory
  category vocabulary, the agenda templates and the content brief templates,
  current versions included;
- the platform-default settings (`finance.*`, `content.*`, `org.*`), and
  nothing else from the template's `app_settings` -- not its images, page
  visibility, branding or site content;
- a staged `pending_role_grants` row for `--admin`, which
  `claim_pending_role_grants()` turns into the admin role and the membership
  the first time that address signs in.

The command then mints the first admin's invite link and prints it. Nothing
is emailed; send it to them yourself. It lands on `https://<domain>/auth/confirm`
(or `NEXT_PUBLIC_SITE_URL` when there is no domain), so the domain has to be
serving before they click it -- see the next section.

`--plan` defaults to `white_label`; `--template <tenant id>` copies from a
different tenant. `tenant:list` shows what exists.

**From the portal:** Administration → Platform → "Provision an organization",
which takes the same name, slug, domain, plan and first-admin email and ends
with the invite link on screen. It does not offer `--template`: choosing a
template is choosing whose permission matrix a customer inherits, and that is
not a dropdown. Use the command when you need one.

### What is not seeded

The public observance calendar, the nonprofit-status milestones and the
volunteer role types describe Chatter Snow, not the platform, so a new tenant
starts without them. Retention policies are still one platform-wide set (see
"Still owed" below).

## Custom domains

The host is what decides which tenant a public request is for
(`public_tenant_id()`, Phase 3): a request's `Host` is matched against
`tenants.custom_domain`, exactly or as a parent domain, longest match wins.
So `custom_domain = 'example.org'` covers `www.example.org` and
`portal.example.org` too, and one column serves both the site and the portal.

To put a tenant on its domain:

1. **Set `custom_domain`** -- `--domain` at provisioning, the **Domain**
   button on Administration → Platform, or later in SQL:
   ```sql
   update public.tenants set custom_domain = 'example.org' where slug = 'example-nonprofit';
   ```
   Store it lowercased; the check constraint refuses anything else. (The
   portal lowercases for you, and shows steps 2 and 3 beside the field, since
   neither can be automated from here.)
2. **Add the domains to the Vercel project**: `example.org`, `www.example.org`
   and `portal.example.org` (Project → Settings → Domains, or
   `vercel domains add`). Vercel issues the certificates. The customer points
   DNS at Vercel -- `A`/`ALIAS` for the apex, `CNAME` for the subdomains --
   as the dashboard instructs.
3. **Allow the domain in Supabase Auth**: Authentication → URL Configuration →
   Redirect URLs, add `https://example.org/**` and
   `https://portal.example.org/**`. Invite links and OAuth callbacks redirect
   back to the tenant's own origin (`getRequestOrigin()` in
   `src/lib/request-origin.ts`), and GoTrue refuses an origin it has not
   been told about. The auth/API hostname itself stays the shared Supabase
   one; a Supabase custom domain is Pro-only and not needed.

`portal.<anything>` is a portal host: `src/proxy.ts` rewrites bare paths on
it into the `/portal` route group, exactly as it does for
`portal.chattersnow.org`. The apex → `portal.` redirect for `/portal/*` paths
is Chatter Snow's own, because it assumes the subdomain exists; on another
tenant's apex, `/portal/...` simply works as a path.

Locally there is no custom domain on the Chatter Snow tenant, so everything
resolves through the sole-active-tenant fallback. A second _active_ tenant on
the local stack switches that fallback off: sessionless reads then need a
host (the integration suites pass `x-tenant-host`), which is why the tests
that provision one delete it again when they finish.

## Branding and content

Both are the tenant admin's, not the operator's:

- **Administration → System Settings → Branding**: the colour tokens, the
  accent gradient and the logo, stored as `brand.*` rows in `app_settings`
  and applied as a `<style>` over `globals.css` (`src/lib/branding.ts`). Blank
  means the platform default, which is Chatter Snow's palette.
- **Administration → Site Content**: every organization-specific line of copy
  on the public site, page by page, stored in `site_content`. The registry of
  slots and Chatter Snow's copy as each default is `src/lib/site-content.ts`;
  a new tenant renders that until it rewrites a slot. The three legal pages
  are published whole as structured documents under `legal.*` -- a tenant
  either publishes its own or the platform's renders.

The `site_content` resource is separate from `administration`, so writing
for the site can be granted to a role without handing it the rest.

## Support access

Platform staff have no standing access anywhere. To work inside a tenant
they hold a `support` membership: time-boxed (at most 90 days), carrying a
reason, and -- this is the Phase 4 decision -- **granted by the tenant's own
admin** from Administration → Users → Support access. The tenant sees who is
in and until when, and can end it early. A support account cannot grant,
extend or end support access, for itself or anyone; the RPCs refuse a caller
whose own membership is a support grant, and the table policies still refuse
any direct write to a support row.

Before it can be granted, the staff member's account has to exist: they sign
in once (they land on the "no organization" screen), and the tenant admin
enters that email.

The operator can _see_ whether a tenant currently has support open, on
Administration → Platform — read-only, and deliberately so: who is in and
until when is the operator's business, letting themselves in is not.

The fallback, for an organization that has locked itself out, is the
service-role script -- with their agreement, and for as short a time as the
work needs:

```bash
bun run tenant:support example-nonprofit --email staff@platform.org \
  --reason "Ticket #123: restore admin access" --days 2 --role admin
```

It writes the same membership row the UI would, so it shows on the tenant's
Support access list and in their audit log, and the isolation suite covers
it like any other membership.

## Users that belong to several tenants

An account is platform-wide; a membership is per tenant. Deactivation
(`deactivated_users`) is therefore platform-wide too, so the users screen
only offers it for an account whose _only_ membership is the current
tenant. An account that also belongs elsewhere shows "Remove" instead, which
drops its roles and membership here and touches nothing else
(`remove_tenant_member()`). The database enforces the same split: the
`deactivated_users` write policies check `user_is_only_in_current_tenant()`.

## Export

A tenant's admin downloads everything from Administration → System Settings
→ Data (`export_current_tenant_data()`); the operator can do it for any
tenant:

```bash
bun run tenant:export example-nonprofit --out example.json
```

**From the portal:** Administration → Platform → **Export**, on any tenant's
row.

One JSON document: the tenant row, its memberships with account emails, its
audit trail, and every row of every table that carries `tenant_id`, keyed by
table name. The table list comes from the catalog, so a table added later is
in the export without anyone remembering. It contains personal data; handle
it accordingly.

## Deletion

Two steps, on purpose:

```bash
bun run tenant:archive example-nonprofit
bun run tenant:delete example-nonprofit --confirm example-nonprofit
```

The **status** dropdown on Administration → Platform does the archiving half
(and suspend, and reactivate) — but not the deletion, which is why this is
still two commands. It refuses to suspend or archive Chatter Snow's own
tenant: platform access is a membership there rather than a bypass, so taking
it off the air takes that page down with it, and there is no second door. The
CLI can still do it.

Archiving takes the tenant off its hosts and out of every member's switcher
immediately and is reversible (`status = 'active'` again). Deletion is not:
`delete_tenant()` refuses any tenant that is not archived, then deletes
every row of every tenant table by `tenant_id` -- retrying tables whose rows
are still referenced until their children are gone, since every foreign key
between tenant tables is composite -- then the audit rows, then the tenant.
Memberships cascade. Accounts are not touched: `auth.users` is platform-wide
and the person may belong to another tenant; remove orphaned accounts from
the Supabase dashboard if they should go too.

Take an export first. Chatter Snow's own tenant is deleted the same way;
there is no special case.

## Writing migrations on a multi-tenant database

Since Phase 2 the `tenant_id` column default resolves to the caller's tenant,
else the host's, else the sole active tenant, else null. A migration runs
with none of those, so on a database with more than one tenant **a seed
insert into a tenant table that does not name a tenant fails** on the
`not null` constraint. Seed per tenant instead:

```sql
insert into public.app_settings (tenant_id, key, value)
select t.id, 'some.key', to_jsonb(1) from public.tenants t
on conflict (tenant_id, key) do nothing;
```

Permission rows already work this way (`join public.roles r on r.name = ...`
reaches every tenant's role of that name), which is what keeps
`provision_tenant()` correct without maintenance.

## Data retention

Every tenant has its own rules, its own runs and its own log (#707 Phase 5b,
`20260906160000`). A tenant gets the platform-default clocks the moment it is
created -- an `after insert` trigger on `tenants` copies them from the oldest
tenant -- and every one of them arrives in `dry_run`, whatever the source
tenant has set. Turning a rule on is a decision each organization makes for
itself after reviewing a few nights of its own counts (#722); inheriting
somebody else's answer is the one thing provisioning must not do.

Administration → Data Retention therefore shows an organization its own rules
and its own history and nothing else. `trigger_retention_run()` sweeps the
caller's tenant; `set_retention_policy_mode()` changes the caller's rule, and
reports a key that exists only in another tenant as unknown.

Before this, both of those RPCs were granted to `authenticated`, gated only on
`administration:manage`, and acted on one global table -- so any tenant's admin
could turn on and run an enforcing purge over every tenant's donor and
participant data. That was the last standing cross-tenant control.

The nightly `pg_cron` job (`20260905140000`) is unchanged and must not be
rescheduled: it calls `run_retention_purge(p_dry_run => false, p_trigger =>
'cron')`, the new fourth argument `p_tenant_id` defaults to null, and null
means every active tenant -- one run row, one log and one status per tenant, so
one organization's bad clock cannot discard another's sweep.

One rule is deliberately platform-wide. `rate_limit_hits` holds an IP address
and a route and has no tenant to belong to, so the sweep purges it once and
takes the **shortest** period any tenant has set -- the privacy-correct
direction for that data, and the reason the page labels that row as shared.
Each tenant's run still logs the rule, so the page explains it rather than
appearing to have skipped it.

## The demo tenant

The portal's login screen offers a one-click demo (#604). It is not a special
mode: it is a tenant whose `plan` is `demo`, with an ordinary account holding
the admin role inside it, kept apart by the same policies and composite foreign
keys as any paying tenant. `DEMO_EMAIL` and `DEMO_PASSWORD` are server-only, so
the button is rendered by `src/app/portal/login/page.tsx` only when both are
set and the credentials themselves never reach the browser;
`demoSignInAction()` signs in on the server and redirects to `/portal/home`.

### The rollout order is load-bearing

`public_tenant_id()` falls back to "the sole active tenant" **only while
exactly one is active**, and `20260905190000` creates the Chatter Snow tenant
with no `custom_domain`. The moment a second tenant goes active, that fallback
switches off — and until the first tenant has a domain of its own, nothing
replaces it. The public site would lose events, the calendar, the gear
catalogue, sponsors, programs, branding and the organization's own name;
`page_visibility` would come back empty so `/programs`, `/learn` and `/support`
would 404; every anonymous intake RPC would fail; and `default_tenant_id()`
would return null so any sessionless insert would violate `not null`. The
portal is unaffected throughout — `current_tenant_id()` is membership-based and
never consults the host.

The failure is invisible until it isn't, so the domain goes first and is
verified **positively** while the fallback is still masking any mistake:

1. `update public.tenants set custom_domain = 'chattersnow.org' where slug =
'chatter-snow';` — lowercase, per the check constraint. The parent-domain
   match in `resolve_tenant_id_from_host()` covers `www.` and `portal.`.
2. Confirm `resolve_tenant_id_from_host('www.chattersnow.org')` and
   `resolve_tenant_id_from_host('portal.chattersnow.org')` both return that
   tenant's id. A null here is the whole failure, and it is silent until the
   demo goes live.
3. Set `TENANT_HOST_OVERRIDE` on the Vercel **Preview** and **Development**
   environments. `vercel.json` deploys `development` and `main` against the
   same Supabase project, and a request to
   `chattersnow-web-git-development-*.vercel.app` matches no `custom_domain` —
   which is a single unique column, so a second host cannot simply be listed
   against the tenant. `src/lib/supabase/server.ts` prefers the override over
   the request `Host` when it is set.
4. Add `demo.chattersnow.org` to the Vercel project and to the Supabase Auth
   redirect allowlist. Longest-suffix matching means it beats
   `chattersnow.org`. `src/proxy.ts` needs no change: it is not a `portal.`
   host, so `/portal/login` passes through as a path.
5. Only then run the reset against the linked project.

### Resetting it

```bash
DEMO_EMAIL=… DEMO_PASSWORD=… DEMO_SLUG=demo DEMO_HOST=demo.chattersnow.org \
  bun --env-file=.env.production.local scripts/demo-reset.ts
```

`.github/workflows/demo-reset.yml` runs exactly that nightly, on a `Demo`
GitHub environment with **no required reviewers** — an environment gate blocks
a whole job before any step runs, so a `Production`-gated cron job would sit
pending approval forever and the demo would quietly stop resetting. Its
secrets are `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `DEMO_EMAIL`,
`DEMO_PASSWORD`, `DEMO_SLUG` and `DEMO_HOST`. No Supabase CLI and no database
password: everything goes through PostgREST and the GoTrue admin API as
`service_role`.

A run re-asserts the fixed `DEMO_PASSWORD` on the demo account every time
rather than rotating it — nothing here can write a new password back into
Vercel's environment, and re-asserting is what undoes a visitor changing it at
`/portal/set-password`. It then archives and `delete_tenant()`s the old demo
tenant, provisions a new one with `p_plan: 'demo'` and `p_admin_email: null`
(so no `pending_role_grants` row is ever staged, and the claim-by-email hazard
does not arise), grants the demo account admin directly, and calls
`seed_demo_tenant()`.

Two independent guards stand between a mistyped `DEMO_SLUG` and somebody's live
data: `assertDemoTenant()` in `scripts/demo/guards.ts` refuses any tenant whose
plan is not `demo` and refuses the `chatter-snow` slug outright, and
`seed_demo_tenant()` refuses a non-demo tenant in its first statement.

**Never leave a demo tenant on the local stack.** The integration and e2e
suites depend on the sole-active-tenant fallback, and a second active tenant
switches it off. `demo-reset.ts` refuses a local URL unless `--local` is passed
and warns loudly when it is; `bun run demo:teardown` removes it again.

### What is blocked inside a demo tenant

A visitor holds admin there anonymously, so every control that still reaches
outside the tenant is closed by `current_tenant_is_demo()`:

| Surface                                          | Block                                                                                                                                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staging a `pending_role_grants` row              | Both the insert policy and `createInviteLinkAction`. #759 is the general fix; this is defence in depth                                                                              |
| `grant_support_access` / `revoke_support_access` | Refused before the address lookup, so the error taxonomy is not an account-existence oracle and no real account gets a membership in its switcher                                   |
| `deactivated_users` insert                       | The demo account's only membership is the demo tenant, so `user_is_only_in_current_tenant()` is true and a visitor could otherwise deactivate it platform-wide until the next reset |

Three things are deliberately **not** blocked, each checked: retention (#760
scoped `trigger_retention_run` and `set_retention_policy_mode` per tenant),
export (already `current_tenant_id()`-scoped, and exporting invented data is
worth showing off), and renaming the tenant (the update policy grants `name`
only — `custom_domain`, `slug`, `status` and `plan` are `service_role`).

## Storage

One bucket holds per-tenant data: `gear-photos` (#781), laid out flat as
`{tenant_id}/{uuid}.jpg`. It is public to read and RLS-gated to write, and the
tenant prefix is the isolation -- enforced by policies on `storage.objects`
(20260907160000), not by anything `tenant_isolation_gaps()` can see, since that
function only scans `public`. `src/lib/storage/gear-photos.integration.test.ts`
is what asserts it instead.

**Deleting a tenant has to sweep the bucket first.** `delete_tenant()` cannot:
removing `storage.objects` rows in SQL leaves the underlying files on disk on
hosted Supabase. Run `deleteTenantGearPhotos(serviceRoleClient(), tenantId)`
from `src/lib/storage/orphan-purge.ts` **before** `delete_tenant()` -- afterwards
the tenant id is gone and there is nothing left to derive the prefix from.

**The export deliberately carries no bytes.** `inventory_items.photo_url` holds
a public, durable URL that resolves with no credentials, so a receiving
organization can fetch every photo from the export as it stands. Inlining
megabytes of base64 into a JSON document would be worse in every way.

## Still owed

- Nothing beyond `gear-photos` is per tenant in Supabase Storage today. A second
  bucket needs the same two things: a tenant prefix with policies to enforce it,
  and a line in the teardown procedure above.
