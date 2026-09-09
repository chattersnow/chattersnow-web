-- Public site layout settings (#846).
--
-- How the public site is arranged, for the parts that are neither copy nor
-- colour: page visibility decides whether a section exists, `layout.*` decides
-- how much of it a page shows. The registry lives in src/lib/site-layout.ts,
-- so a new setting is a new entry there rather than another migration -- this
-- view exposes the whole prefix, exactly as public_page_visibility and
-- public_site_images expose theirs.
--
-- No rows are seeded. Every slot's default lives in the registry, which is what
-- decides the layout on a fresh deploy and for every tenant that never opens
-- the panel.
--
-- Definer view, like its two siblings and unlike the security_invoker views
-- elsewhere in this schema: the public site reads it as `anon`, which has no
-- policy on app_settings, and the tenant scoping is the `public_tenant_id()`
-- predicate below rather than RLS.

create or replace view public.public_site_layout as
select substring(key from length('layout.') + 1) as slot, value
from public.app_settings
where key like 'layout.%'
  and tenant_id = public.public_tenant_id();

comment on view public.public_site_layout is
  'Per-tenant public site layout settings, keyed by the slot registry in src/lib/site-layout.ts (#846). An unset slot renders the registry default.';

grant select on public.public_site_layout to anon, authenticated;
