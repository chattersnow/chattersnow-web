-- Issue #584: whole sections of the public site (Programs, Learn, Support)
-- are hardcoded pages with no visibility gate -- they go live the moment a
-- branch deploys. The board needs to hold them back until it has approved
-- the copy, and needs to do that itself: no developer, no deploy.
--
-- Reuses the existing app_settings key/value store (see
-- 20260823040000_create_app_settings.sql) rather than adding a table, so
-- this inherits its RLS, its admin UI, and its audit_log_row trigger --
-- that audit trail is what makes a toggle defensible as a board decision.
-- Same slice-through-a-view pattern as public_site_images: the public site
-- reads visibility flags as `anon` without gaining access to unrelated
-- settings like the finance approval thresholds. New sections are just new
-- rows under this key prefix, so this view never needs to change.
create view public.public_page_visibility as
select
  substring(key from length('page_visibility.') + 1) as slot,
  value
from public.app_settings
where key like 'page_visibility.%';

grant select on public.public_page_visibility to anon, authenticated;

-- Deliberately seeds nothing. An absent row falls back to the `defaultVisible`
-- flag on the slot's entry in src/lib/page-visibility.ts, which is `false` for
-- the sections still awaiting board approval. That way production hides them
-- from the first request with no manual step, while supabase/seed.sql turns
-- them on for local development and CI so the existing public e2e and a11y
-- suites are unaffected.
