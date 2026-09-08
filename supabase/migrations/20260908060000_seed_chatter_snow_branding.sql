-- #795 rollout step 3, the branding half: Chatter Snow's palette becomes data.
--
-- Held back from 20260908040000, which seeded the copy, because seeding the
-- palette did not render identically then -- it turned dark mode light. That
-- was #819, in brandingCss() rather than in anything about Chatter Snow: the
-- light block was a bare `:root`, which ties with globals.css's `.dark` on
-- specificity and won on document order, so `--background` resolved to the
-- light `#f7f0ff` on a dark page. Fixed, with the dark accents now derived
-- from the brand's own hue rather than mixed toward white, and
-- `e2e/tenant-branding.spec.ts` holds the line: give the tenant the colours
-- globals.css already hardcodes and every brand token must resolve exactly as
-- it does unbranded, in both themes. That spec is this migration's proof, and
-- it was passing before this file was written.
--
-- The values are BRAND_COLOR_TOKENS' own defaults, DEFAULT_ACCENT_STOPS and
-- DEFAULT_LOGO, generated from those constants rather than retyped. Same
-- scoping rules as the copy: by slug, so the demo and platform tenants inherit
-- nothing and an environment without a `chatter-snow` tenant is a no-op; `on
-- conflict do nothing`, because a colour someone has already set from
-- Administration > System Settings > Branding is newer than a default.
--
-- What this leaves genericizable, which is the point: the purple in
-- globals.css, and DEFAULT_LOGO in src/components/brand-logo.tsx.
--
-- Triggers off for the write, as in 20260908040000: `set_updated_at` would
-- stamp a null actor and `audit_log_row` would write six entries for a change
-- no person made.

alter table public.app_settings
  disable trigger set_updated_at,
  disable trigger audit_log_row;

with tenant as (
  select id from public.tenants where slug = 'chatter-snow'
)
insert into public.app_settings (tenant_id, key, value)
select tenant.id, v.key, v.value::jsonb
from tenant, (values
  ('brand.primary', '"#70419a"'),
  ('brand.primary_deep', '"#32134f"'),
  ('brand.primary_soft', '"#ede1fb"'),
  ('brand.background', '"#f7f0ff"'),
  ('brand.accent_stops', '["#e84855","#f59e42","#f4d35e","#50b878","#38a5db","#8f55ba"]'),
  ('brand.logo_url', '"/chatter-logo-transparent.png"')
) as v(key, value)
on conflict (tenant_id, key) do nothing;

alter table public.app_settings
  enable trigger set_updated_at,
  enable trigger audit_log_row;
