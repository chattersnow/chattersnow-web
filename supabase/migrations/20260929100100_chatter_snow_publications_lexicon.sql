-- #1471: Chatter Snow calls its publication a zine.
--
-- The two publications terms in src/lib/lexicon.ts default to "Publication" and
-- "Publications", which is the right word for a tenant that publishes a
-- newsletter or a magazine. Chatter Snow's is a seasonal zine (#1470), and its
-- nav reads "Zine".
--
-- Scoped by slug, so the demo and platform tenants inherit nothing and a fresh
-- local or CI database (which bootstraps as `example-nonprofit`) is a no-op;
-- `on conflict do nothing`, because a word someone has already typed into
-- Administration is newer than this. Triggers off for the write, as in
-- 20260912030000: `set_updated_at` would stamp a null actor and `audit_log_row`
-- would log a change no person made.
--
-- This names the section only. It does not show it: the `publications`
-- page-visibility slot stays off until Chatter Snow turns it on in the portal
-- once its first issue is published.

alter table public.app_settings
  disable trigger set_updated_at,
  disable trigger audit_log_row;

with tenant as (
  select id from public.tenants where slug = 'chatter-snow'
)
insert into public.app_settings (tenant_id, key, value)
select tenant.id, v.key, v.value::jsonb
from tenant, (values
  ('lexicon.publication', '"Zine"'),
  ('lexicon.publication_plural', '"Zine"')
) as v(key, value)
on conflict (tenant_id, key) do nothing;

alter table public.app_settings
  enable trigger set_updated_at,
  enable trigger audit_log_row;
