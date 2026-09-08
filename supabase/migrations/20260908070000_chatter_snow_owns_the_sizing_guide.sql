-- #795 Phase 3: the ski and snowboard sizing guide stops being every tenant's
-- page.
--
-- `/gears/sizing` sat under the `gears` slot, which is `defaultVisible: true`
-- because a gear library is chrome any organization can use. The sizing guide
-- is not: it is ski lengths, mondopoint conversions and DIN settings, written
-- by Chatter Snow, held in `src/app/(public)/gears/sizing/sizing-data.ts` with
-- no slot behind it and no way to edit it from the portal. Every tenant
-- provisioned since #707 has been publishing it under their own brand, on by
-- default, and it was the last piece of Chatter Snow's content still doing
-- that -- provisioning copies no site content, and `learn` and `programs`
-- already default to hidden.
--
-- The code side of this adds a `gears-sizing` slot, `defaultVisible: false`.
-- That flips the page dark everywhere, chattersnow.org included, because
-- production deliberately holds no `page_visibility.*` rows at all -- every
-- section there resolves to its registry default. So the same change that
-- protects every other tenant would take a live page off Chatter Snow's site,
-- and this migration is what keeps it up: the one tenant the guide was written
-- for gets an explicit `true`.
--
-- Scoped by slug, like 20260908040000 and 20260908060000: the demo and
-- platform tenants must not inherit a nonprofit's content, and on an
-- environment with no `chatter-snow` tenant the CTE matches nothing and this
-- is a no-op. `on conflict do nothing` because a value someone has already set
-- from Administration > System Settings is a deliberate choice and newer than
-- this one.
--
-- Local development and CI are seeded separately, in supabase/seed.sql, which
-- is where the other three non-default visibilities already live.

with tenant as (
  select id from public.tenants where slug = 'chatter-snow'
)
insert into public.app_settings (tenant_id, key, value)
select tenant.id, 'page_visibility.gears-sizing', to_jsonb(true)
from tenant
on conflict (tenant_id, key) do nothing;
