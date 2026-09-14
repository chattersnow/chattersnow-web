-- #813 Phase 2: a public request can name its tenant without a Host.
--
-- `public_tenant_id()` (20260906060000) resolves a sessionless request's
-- tenant from `x-tenant-host`, which the app stamps from the request's own
-- Host. That works because the only consumer of a tenant's public content is
-- this Next.js app running on that tenant's domain. A second consumer -- an
-- events embed on a customer's own site, a mobile app, a per-tenant static
-- build -- has no meaningful Host to offer: it is served from somewhere else
-- entirely, and its `Host` names that somewhere.
--
-- So a request may name the tenant instead, with an `x-tenant-slug` header
-- carrying `tenants.slug`. The slug was chosen over a per-tenant public key
-- because it already exists, is already unique and stable, needs no issuance
-- UI, and is what an embed snippet would hardcode anyway. A key can be layered
-- on later if attribution ever warrants it; it would be an addition here, not
-- a replacement.
--
-- Three rules, and the second and third are the ones worth stating:
--
--   1. **Slug beats host.** A request that names a tenant gets that tenant.
--   2. **A slug that resolves to nothing resolves to nothing.** It does not
--      fall through to the host, and it does not fall through to the
--      sole-active-tenant fallback. A typo in an embed snippet must render an
--      empty site, not quietly serve whichever tenant happens to be the only
--      active one -- which on a fresh database, in CI and in local
--      development is the template tenant holding all the sample data.
--   3. **Suspended and archived tenants stay unreachable**, exactly as they
--      are by host: both lookups require `status = 'active'`.
--
-- Module gating (#902) needs no change and gets this for free: every
-- anon-readable view and every intake RPC resolves through
-- `public_tenant_id()` and then asks `module_enabled_for_tenant()` about
-- *that* tenant, so a slug pointing at a tenant whose Inventory is off is
-- refused the gear library the same way its host is.
--
-- Trusting the header: the same argument 20260906060000 made for
-- `x-tenant-host`, and no weaker. A forged slug can only choose which
-- tenant's *public* surface the caller is talking to, which is precisely what
-- visiting that tenant's site does. Nothing session-scoped consults it --
-- `has_permission()` and every policy predicate go through
-- `current_tenant_id()`, which is membership-checked -- and the portal's
-- host pin (#956) is decided in the application from the request Host, not
-- from this header.
--
-- Nothing sends the header yet: the HTTP layer that will is Phase 3. What
-- lands here is the resolution it needs, and the integration tests that hold
-- the three rules above.

create or replace function public.request_tenant_slug()
returns text
language sql
stable
set search_path = public
as $$
  select nullif(
    lower(btrim(coalesce(
      current_setting('request.headers', true)::json ->> 'x-tenant-slug',
      ''
    ))),
    ''
  );
$$;

comment on function public.request_tenant_slug() is
  'The x-tenant-slug request header, normalised (lowercase, trimmed). Null outside a PostgREST request, when no header was sent, or when it was sent empty -- a proxy that always sets the header but leaves it blank must fall through to the host rather than resolve nothing (#813 Phase 2).';

create or replace function public.resolve_tenant_id_from_slug(p_slug text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select t.id
  from public.tenants t
  where p_slug is not null
    and t.slug = p_slug
    and t.status = 'active';
$$;

comment on function public.resolve_tenant_id_from_slug(text) is
  'The active tenant with this slug; null when there is none. `tenants.slug` is unique, so there is no longest-match rule to apply as there is for a host (#813 Phase 2).';

create or replace function public.public_tenant_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select case
    -- A request that names a tenant gets that tenant or nothing. Falling back
    -- to the host or to the sole active tenant here would turn a typo in an
    -- embed snippet into somebody else's content served under the customer's
    -- name.
    when public.request_tenant_slug() is not null then
      public.resolve_tenant_id_from_slug(public.request_tenant_slug())
    else coalesce(
      public.resolve_tenant_id_from_host(public.request_host()),
      (select t.id
         from public.tenants t
        where t.status = 'active'
          and (select count(*) from public.tenants where status = 'active') = 1)
    )
  end;
$$;

comment on function public.public_tenant_id() is
  'Tenant a public-site (sessionless) request is for: the tenant the x-tenant-slug header names (#813 Phase 2), else the one resolved from the request host, else the sole active tenant, else null. A slug that names no active tenant resolves to null rather than falling through. Used by the public_* views and the anon intake RPCs.';

grant execute on function public.request_tenant_slug() to anon, authenticated, service_role;
grant execute on function public.resolve_tenant_id_from_slug(text) to anon, authenticated, service_role;
