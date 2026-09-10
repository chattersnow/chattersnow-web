-- The demo button belongs to the demo tenant's host, and nowhere else.
--
-- `src/app/portal/login/page.tsx` rendered "Explore the demo" whenever the
-- deployment held DEMO_EMAIL and DEMO_PASSWORD -- which is a property of the
-- deployment, not of the tenant being served. One deployment serves every
-- tenant, so the button appeared on every tenant's login page: a white-label
-- customer's staff were offered a one-click sign-in to somebody else's sample
-- organization, and Chatter Snow's own portal advertised a demo of itself.
--
-- The condition it should have been asking is "is the tenant that owns this
-- host the demo tenant", and `plan` is the constrained enum that answers it
-- (`tenants_plan_check`, 20260905180000). The slug is not: it is a free choice
-- at provisioning time, which is the same reason `current_tenant_is_demo()`
-- and `seed_demo_tenant()` both read `plan`.
--
-- `public_tenant` returns exactly one row -- the tenant that owns the requested
-- host -- so this exposes one fact about a tenant the visitor has by definition
-- already reached, in the same spirit as `custom_domain` (20260908020000). No
-- other tenant's plan is reachable through it.

create or replace view public.public_tenant as
select t.id, t.name, t.slug, t.custom_domain, t.plan
from public.tenants t
where t.id = public.public_tenant_id();

grant select on public.public_tenant to anon, authenticated;

comment on view public.public_tenant is
  'The tenant a public request is for: the header, footer, page titles, the portal login''s link back to the public site and its demo button all need it, and `tenants` itself is only readable by members. One row, always the tenant that owns the requested host.';
