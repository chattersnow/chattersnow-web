-- #1260: typography becomes a brand token.
--
-- Colour, the accent gradient, the logo and the app icon have all been data
-- since #707 Phase 4 -- `brand.*` rows in app_settings, turned into a `<style>`
-- block by `brandingCss()`. Typography was the one axis still hard-coded:
-- Quicksand and Rock Salt were imported in src/app/layout.tsx and named
-- directly in the `body`, `.brand-display` and `.app-eyebrow` rules, so every
-- organization on the platform wrote in the first tenant's typeface.
--
-- The value is a key from the registry in src/lib/branding.ts, never a family
-- name an admin typed. `next/font/google` is a compile-time transform, so the
-- families the platform can offer are the ones declared in the root layout and
-- the list is closed by construction; and a `<style>` block is an injection
-- surface, so this gets the equivalent of the colours' hex check -- membership
-- in the registry, with an unknown key falling back to the default rather than
-- being interpolated.
--
-- No view changes: `public_branding` and `tenant_branding` match the `brand.%`
-- prefix rather than an enumerated list, which is exactly so that a new token
-- is a registry entry in TypeScript. What does have to move is `BRAND_TOKENS`
-- in src/lib/branding.ts -- the reserved namespace's key list (#888), which
-- test/public-namespaces.integration.test.ts checks the table against.
--
-- One row, on the same pattern as 20260912030000_per_tenant_lexicon.sql: the
-- stylesheet's default becomes the platform's own set (Inter, no script
-- accent), and Chatter Snow carries what it has today as a row like any other
-- tenant, so its site does not change by one pixel. Nobody else gets a row --
-- an unset tenant resolving to the neutral set is the point of the ticket.
--
-- By slug, so the demo and platform tenants inherit nothing and an environment
-- without a `chatter-snow` tenant is a no-op, and `on conflict do nothing`,
-- because a set someone has already picked in Administration is newer than
-- this.
--
-- Triggers off for the write, as in 20260912030000: `set_updated_at` would
-- stamp a null actor and `audit_log_row` would write an entry for a change no
-- person made.

alter table public.app_settings
  disable trigger set_updated_at,
  disable trigger audit_log_row;

insert into public.app_settings (tenant_id, key, value)
select t.id, 'brand.typography', '"rounded"'::jsonb
from public.tenants t
where t.slug = 'chatter-snow'
on conflict (tenant_id, key) do nothing;

alter table public.app_settings
  enable trigger set_updated_at,
  enable trigger audit_log_row;
