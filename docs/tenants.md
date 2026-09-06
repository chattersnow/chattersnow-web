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

## Still owed

- Per-tenant retention policies: `retention_policies` is one platform-wide
  set and `run_retention_purge()` is one nightly sweep. Any tenant's admin
  can run or reconfigure it from Administration → Data Retention until it is
  scoped, which is the remaining cross-tenant control.
- Nothing in Supabase Storage is per tenant today; if a bucket ever is,
  `delete_tenant()` and the export have to learn about it.
