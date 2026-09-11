-- #888: reserve the app_settings and site_content key prefixes that anon reads.
--
-- Five of the views that serve the public site match a key *prefix* rather than
-- an enumerated list of keys:
--
--   public_branding            brand.%              app_settings
--   public_page_visibility     page_visibility.%    app_settings
--   public_site_layout         layout.%             app_settings
--   public_legal_publication   legal_publication.%  app_settings
--   public_site_images         site_images.%        site_content
--
-- That is deliberate. Which slots exist is decided by the registries in
-- TypeScript -- src/lib/branding.ts, src/lib/page-visibility.ts,
-- src/lib/site-layout.ts, src/lib/legal-documents.ts and
-- src/lib/site-content.ts -- so adding one is a registry entry rather than a
-- migration, which is the whole reason the prefix form was chosen.
--
-- The cost is that **any row inserted under one of those prefixes is
-- world-readable the moment it exists**: no migration to the view, no review of
-- the public surface, no signal anywhere. Every key under them today is
-- legitimately public. The risk is the next one -- `brand.` and `layout.` are
-- generic enough that a `brand.internal_notes` or a `layout.admin_only_flag` is
-- a plausible thing for a future migration to add, and it would ship straight
-- to anon.
--
-- The same holds one level up for public_site_content, which has no prefix
-- filter at all: it exposes every site_content row of the resolved tenant, by
-- design, with drafts protected by the column list (`draft_value` is simply not
-- selected) rather than by a predicate.
--
-- So the rule, stated rather than left implicit: **the five prefixes above are
-- public namespaces, and nothing that is not meant for anon may be stored under
-- them or anywhere in site_content.** The database cannot see the registries,
-- so it cannot tell a registered slot from a typo or from a secret; what
-- enforces this is src/lib/public-namespaces.ts, which collects the registries,
-- and test/public-namespaces.integration.test.ts, which reads every key out of
-- both tables -- every tenant's, through the service-role client -- and fails on
-- one no registry claims.
--
-- Enumerating the keys in SQL (a join against a small public_setting_keys
-- table, or `key = any(array[...])`) is the stronger guarantee and was
-- considered: it duplicates the registry in two places and forces a migration
-- per new slot, which is exactly the cost the prefix design avoids. It is the
-- answer the day a genuinely non-public setting has to live under one of these
-- prefixes; until then the rule plus the test is the trade this schema makes.
--
-- Comments only. No view definition, grant or predicate changes here: the rule
-- is written where the next reader of the SQL will find it, alongside the
-- `security definer by design` rationale 20260911010000 added.

comment on view public.public_branding is
  'The resolved tenant''s brand tokens for the public site (registry src/lib/branding.ts). Security definer by design (#887): `app_settings` has one select policy requiring a `manage` permission, and everything from brand colours to approval thresholds lives in that table. This view hands `anon` the brand.% prefix rather than widening that OR-chain. Isolation is tenant_id = public_tenant_id(). RESERVED NAMESPACE (#888): brand.% is public, so nothing that is not meant for anon may be stored under it -- register every key in src/lib/branding.ts, which test/public-namespaces.integration.test.ts checks the table against.';

comment on view public.public_page_visibility is
  'Which public pages the resolved tenant has switched on (#594). Security definer by design (#887), same reasoning as public_branding, over the page_visibility.% key prefix. RESERVED NAMESPACE (#888): page_visibility.% is public, so nothing that is not meant for anon may be stored under it -- register every key in src/lib/page-visibility.ts, which test/public-namespaces.integration.test.ts checks the table against.';

comment on view public.public_site_layout is
  'Per-tenant public site layout settings, keyed by the slot registry in src/lib/site-layout.ts (#846). An unset slot renders the registry default. Security definer by design (#887), same reasoning as public_branding, over the layout.% key prefix. RESERVED NAMESPACE (#888): layout.% is public, so nothing that is not meant for anon may be stored under it -- register every key in src/lib/site-layout.ts, which test/public-namespaces.integration.test.ts checks the table against.';

comment on view public.public_legal_publication is
  'Per-tenant legal document publication state, keyed by the registry in src/lib/legal-documents.ts (#859). An absent row means the document is not in force and its route 404s; the privacy policy is served regardless. Security definer by design (#887), same reasoning as public_branding, over the legal_publication.% key prefix. RESERVED NAMESPACE (#888): legal_publication.% is public, so nothing that is not meant for anon may be stored under it -- register every key in src/lib/legal-documents.ts, which test/public-namespaces.integration.test.ts checks the table against.';

-- The registry path in this one was src/lib/site-images.ts, which does not
-- exist; the image slots are ordinary entries in the site content registry.
comment on view public.public_site_images is
  'The resolved tenant''s published site images, keyed by the `image` slots of the registry in src/lib/site-content.ts. Security definer by design (#887), same reasoning as public_site_content, over the site_images.% key prefix. RESERVED NAMESPACE (#888): site_images.% is public -- as is the rest of site_content, see public_site_content -- so every key must be a registered slot, which test/public-namespaces.integration.test.ts checks the table against.';

comment on view public.public_site_content is
  'The resolved tenant''s published public site copy. Security definer by design (#887): since #793 `site_content` admits `authenticated` only and its value column is not writable by one at all. Isolation is tenant_id = public_tenant_id() plus a published value; `draft_value` is outside the column list, which is the whole point of the view. A write grant here would bypass both RLS and those column grants in one line -- tenant_isolation_gaps() now refuses one. RESERVED TABLE (#888): there is no prefix filter, so every site_content row of the resolved tenant is public. Nothing non-public may ever be stored in this table, and every key must be a slot in src/lib/site-content.ts, which test/public-namespaces.integration.test.ts checks the table against.';

comment on view public.tenant_branding is
  'The current tenant''s brand tokens for the portal shell. Security definer by design (#887): the audience is any signed-in member, and `app_settings`'' select policy requires one of six `manage` permissions -- a volunteer would otherwise see an unbranded portal. Isolation is tenant_id = current_tenant_id() over the brand.% prefix. RESERVED NAMESPACE (#888): the same brand.% rule as public_branding applies, one audience narrower -- every signed-in member reads this, whatever their permissions.';
