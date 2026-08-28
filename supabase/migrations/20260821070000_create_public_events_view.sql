-- Public events: a curated view over events for the anonymous /events page.
-- Only published events marked public are surfaced, and only the columns
-- needed for a listing. Draft/private events and audit columns stay behind
-- the authenticated-only RLS policy on the base table.
-- auto_expose_new_tables is off in this project's config, so the grant below
-- is required alongside the view definition.

create view public.public_events as
select
  id,
  name,
  location,
  starts_at,
  ends_at,
  timezone
from public.events
where visibility = 'public' and status = 'published';

grant select on public.public_events to anon, authenticated;
