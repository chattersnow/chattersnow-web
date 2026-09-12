-- #897: the public section moved from `/gears/...` to `/inventory/...`, so the
-- links already written into tenant content move with it.
--
-- The rename itself is code (`src/app/(public)/inventory/**` plus a permanent
-- redirect in `next.config.ts`), and that redirect is why nothing breaks if
-- this never runs -- an old link would take one extra hop. It runs anyway
-- because the stored copy is what an editor sees in Administration > Site
-- Content, and a link to a URL that exists only as a redirect is a thing to
-- explain to every future editor.
--
-- Not scoped to one tenant, unlike the seeding migrations around it: this
-- rewrites a platform route wherever it was written down, and a tenant that
-- adopted a content pack carrying the old link needs the same fix. Rows
-- without the string are left alone by the `like` filter, so on a database
-- where nobody linked to the section this is a no-op.
--
-- `/gears-and-more` is deliberately not matched: the pattern carries the
-- trailing slash, so only the section's own paths are rewritten -- the same
-- segment-boundary rule `slotsForHref()` applies in `src/lib/public-nav.ts`.
--
-- Drafts are rewritten alongside published copy: an unpublished draft is
-- someone's work in progress, and publishing it later should not put a dead
-- link back on the site.
--
-- The triggers come off for the same reason 20260908000000 took them off for
-- its backfill. There is no session in a migration, so `set_updated_at` would
-- stamp every touched row with now() and a null actor -- erasing who last
-- edited the copy -- and `audit_log_row` would write an actorless "update"
-- into each tenant's audit log for a change no person made.

alter table public.site_content
  disable trigger set_updated_at,
  disable trigger audit_log_row;
alter table public.articles
  disable trigger set_updated_at,
  disable trigger audit_log_row;
alter table public.article_categories
  disable trigger set_updated_at,
  disable trigger audit_log_row;

update public.site_content
set value = replace(value::text, '/gears/', '/inventory/')::jsonb,
    draft_value = replace(draft_value::text, '/gears/', '/inventory/')::jsonb
where value::text like '%/gears/%'
   or draft_value::text like '%/gears/%';

update public.articles
set value = replace(value::text, '/gears/', '/inventory/')::jsonb,
    draft_value = replace(draft_value::text, '/gears/', '/inventory/')::jsonb
where value::text like '%/gears/%'
   or draft_value::text like '%/gears/%';

update public.article_categories
set value = replace(value::text, '/gears/', '/inventory/')::jsonb,
    draft_value = replace(draft_value::text, '/gears/', '/inventory/')::jsonb
where value::text like '%/gears/%'
   or draft_value::text like '%/gears/%';

alter table public.site_content
  enable trigger set_updated_at,
  enable trigger audit_log_row;
alter table public.articles
  enable trigger set_updated_at,
  enable trigger audit_log_row;
alter table public.article_categories
  enable trigger set_updated_at,
  enable trigger audit_log_row;
