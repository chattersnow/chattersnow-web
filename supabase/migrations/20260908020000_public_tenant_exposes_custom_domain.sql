-- #795 Phase 2: the portal login needs the tenant's public domain.
--
-- The login page's "Back to <the organization's site>" link was `href="/home"`,
-- which is dead on every portal host: the proxy rewrites an unprefixed path
-- into /portal/*, so `/home` resolves to the portal dashboard and a signed-out
-- visitor is bounced straight back to the login page they were on. Both of the
-- deployment's portal hosts do this today. It has to be an absolute link to the
-- tenant's own public origin, which means knowing that origin.
--
-- `custom_domain` is the tenant's public promise -- it is what
-- resolve_tenant_id_from_host() matched to serve this very request, and what
-- originFor() already builds invite links from. The view returns one row, the
-- tenant that owns the requested host, so this exposes a domain the visitor
-- has by definition already reached (or its parent, on portal.<domain>).
-- No other tenant's domain is reachable through it.
--
-- It is also what tells a tenant with a public site apart from one without.
-- Chatter Snow's custom_domain is `chattersnow.org` -- an apex this deployment
-- serves. The platform tenant's is `portal.rickiecruz.com`, the portal host
-- itself, because the rickiecruz.com apex is the consulting site and stays
-- outside this deployment. So a custom_domain that is itself a portal host
-- means "no public site to go back to", and the link is not rendered at all.

create or replace view public.public_tenant as
select t.id, t.name, t.slug, t.custom_domain
from public.tenants t
where t.id = public.public_tenant_id();

grant select on public.public_tenant to anon, authenticated;

comment on view public.public_tenant is
  'The tenant a public request is for: the header, footer, page titles and the portal login''s link back to the public site need it, and `tenants` itself is only readable by members. One row, always the tenant that owns the requested host.';
