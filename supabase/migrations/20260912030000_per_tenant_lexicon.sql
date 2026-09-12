-- #896: the words an organization uses for what it lends.
--
-- "Gear" is Chatter Snow's word for the concept this schema calls inventory.
-- Another organization reads the same tables and calls it a tool library, a
-- lending library, a pantry. Until now it could rename one heading -- the
-- `gears.library_heading` slot in site_content -- and the nav item directly
-- above that heading still said "Gear", because every other surface carried
-- the word as a literal in TypeScript.
--
-- So the four words that appear in navigation become rows, on the same pattern
-- as `brand.%`: which terms exist is the registry in src/lib/lexicon.ts, a
-- tenant stores the ones it wants under `lexicon.<term>`, and an unset term
-- falls through to the platform's own neutral word. Adding a term is a
-- registry entry, not another migration -- which is why these two views match
-- the prefix rather than enumerating keys.
--
-- Two views for the two audiences, exactly as branding has: the public site
-- reads the tenant its *host* resolves to, so an admin of one organization
-- looking at another's site reads that site's words; the portal shell reads
-- the tenant the *session* has selected, so the sidebar renames itself when
-- the switcher moves.
--
-- Definer views, like their siblings and for the same two reasons (#887):
-- `anon` has no policy on app_settings at all, and that table's select policy
-- for `authenticated` requires one of six `manage` permissions -- a volunteer
-- would otherwise see a portal labelled in the platform's words while
-- everyone else saw the organization's. Isolation is the tenant predicate
-- below rather than RLS.
--
-- What this deliberately does not rename: the `gears` visibility slot key, the
-- `gears.*` content slot keys, the `inventory` permission resource, the
-- `inventory_items` table and the `gear-photos` bucket. Those are names the
-- code calls things, not names anybody reads.

create or replace view public.public_lexicon as
select substring(key from length('lexicon.') + 1) as term, value
from public.app_settings
where key like 'lexicon.%'
  and tenant_id = public.public_tenant_id();

create or replace view public.tenant_lexicon as
select substring(key from length('lexicon.') + 1) as term, value
from public.app_settings
where key like 'lexicon.%'
  and tenant_id = public.current_tenant_id();

alter view public.public_lexicon set (security_barrier = true);

grant select on public.public_lexicon to anon, authenticated;
grant select on public.tenant_lexicon to authenticated;

-- SELECT and nothing else. The hosted project predates the CLI's current
-- default and still auto-exposes a new entity in `public` with ALL privileges
-- to both roles, and a definer view over a simple body is auto-updatable --
-- which would be a write to any tenant's app_settings with no RLS in the way.
-- 20260911010000 revoked those on the eighteen views that existed then and
-- `tenant_isolation_gaps()` refuses one; these two lines keep this pair from
-- being the first finding. A no-op wherever the grants were never made.
revoke insert, update, delete on public.public_lexicon from anon, authenticated;
revoke insert, update, delete on public.tenant_lexicon from anon, authenticated;

comment on view public.public_lexicon is
  'The resolved tenant''s words for what it lends, keyed by the registry in src/lib/lexicon.ts (#896). An unset term renders the platform''s own word. Security definer by design (#887), same reasoning as public_branding, over the lexicon.% key prefix. RESERVED NAMESPACE (#888): lexicon.% is public, so nothing that is not meant for anon may be stored under it -- register every key in src/lib/lexicon.ts, which test/public-namespaces.integration.test.ts checks the table against.';

comment on view public.tenant_lexicon is
  'The current tenant''s words for what it lends, for the portal shell (#896). Security definer by design (#887): the audience is any signed-in member, and app_settings'' select policy requires one of six `manage` permissions. Isolation is tenant_id = current_tenant_id() over the lexicon.% prefix. RESERVED NAMESPACE (#888): the same lexicon.% rule as public_lexicon applies, one audience narrower.';

-- Chatter Snow's own words, by slug -- so the demo and platform tenants
-- inherit nothing and an environment without a `chatter-snow` tenant is a
-- no-op -- and `on conflict do nothing`, because a word someone has already
-- typed into Administration is newer than this.
--
-- These four are what the codebase said in literals before this ticket, which
-- is what makes the change invisible on Chatter Snow's own site: the public
-- nav still reads "Gear", the library page "Gear Library", the portal section
-- "Gear". Every other tenant gets Inventory / Library / Item / Items, which is
-- what a nonprofit that lends tools or food should have been reading all along.
--
-- Triggers off for the write, as in 20260908060000: `set_updated_at` would
-- stamp a null actor and `audit_log_row` would write four entries for a change
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
  ('lexicon.collection', '"Gear"'),
  ('lexicon.collection_public', '"Gear Library"'),
  ('lexicon.item', '"Gear item"'),
  ('lexicon.item_plural', '"Gear"')
) as v(key, value)
on conflict (tenant_id, key) do nothing;

alter table public.app_settings
  enable trigger set_updated_at,
  enable trigger audit_log_row;
