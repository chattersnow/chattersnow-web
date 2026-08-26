-- Public event sponsors: a curated view for the anonymous event detail page.
-- Only sponsors explicitly marked is_public, on events that are themselves
-- public and published, are surfaced -- and only name/logo/website. Support
-- type, in-kind description, contribution value, notes, and follow-up fields
-- stay behind the authenticated-only RLS policy on the base table.
-- auto_expose_new_tables is off in this project's config, so the grant below
-- is required alongside the view definition.

create view public.public_event_sponsors as
select
  es.id as sponsor_id,
  es.event_id,
  p.name,
  p.logo_url,
  p.website
from public.event_sponsors es
join public.people p on p.id = es.person_id
join public.events e on e.id = es.event_id
where es.is_public = true
  and e.visibility = 'public'
  and e.status = 'published';

grant select on public.public_event_sponsors to anon, authenticated;
