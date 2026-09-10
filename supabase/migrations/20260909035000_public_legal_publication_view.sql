-- Which legal documents a tenant serves (#859).
--
-- Renamed off 20260909030000, which #864 had already taken. Both PRs picked
-- the same slot while open side by side, and neither run saw the other: the
-- collision only exists once both are in one tree, and it surfaces as
-- `duplicate key value violates unique constraint "schema_migrations_pkey"`
-- on the *second* file, which stops the reset before any later migration is
-- reached. This half is the one that moves because the hosted database has
-- 20260909030000 recorded against #864's file, applied on its merge -- moving
-- that one would orphan a version already in production, while this one had
-- never been applied anywhere. The two are independent (one edits
-- site_content rows, this creates a view over app_settings), so the order
-- between them carries no meaning.
--
-- `LEGAL_PAGES_PUBLISHED` in src/lib/legal-pages.ts was one boolean compiled
-- into the application, and it made one board's legal review the gate on every
-- tenant's privacy policy: a tenant whose own counsel had signed off still
-- could not serve one, and the day Chatter Snow's board approved, all three
-- documents would have gone live for every tenant at once.
--
-- The state that replaces it is per tenant and per document, one `app_settings`
-- row each, and this view is how the public site reads it as `anon`. The
-- registry lives in src/lib/legal-documents.ts, so a document is a new entry
-- there rather than another migration -- exactly as public_page_visibility,
-- public_site_images and public_site_layout expose their prefixes.
--
-- Definer view, like its three siblings and unlike the security_invoker views
-- elsewhere in this schema: `anon` has no policy on app_settings, and the
-- tenant scoping is the `public_tenant_id()` predicate below rather than RLS.
--
-- **No rows are seeded, and that is the whole point.** Absent means not in
-- force, so this migration publishes nothing: every tenant, Chatter Snow
-- included, is left exactly where it was -- /terms and /code-of-conduct 404 and
-- are absent from the footer until somebody says the text is theirs. Chatter
-- Snow's board review (#769) is still outstanding, and this is now its
-- position, recorded as the absence of a row rather than as a constant.
--
-- The privacy policy has no row and never will: `resolveInForce()` serves it
-- whatever the database says, because it has to stay reachable while the public
-- forms are collecting personal information, and since #858 there is always
-- something honest to serve -- the tenant's own document or the platform's
-- default.

create or replace view public.public_legal_publication as
select substring(key from length('legal_publication.') + 1) as document, value
from public.app_settings
where key like 'legal_publication.%'
  and tenant_id = public.public_tenant_id();

comment on view public.public_legal_publication is
  'Per-tenant legal document publication state, keyed by the registry in src/lib/legal-documents.ts (#859). An absent row means the document is not in force and its route 404s; the privacy policy is served regardless.';

grant select on public.public_legal_publication to anon, authenticated;
