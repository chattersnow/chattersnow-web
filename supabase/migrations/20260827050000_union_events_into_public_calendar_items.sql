-- Community Calendar: surface Chatter-hosted portal events (issue #359).
-- public_calendar_items previously only read public.calendar_items, so
-- events created in the portal Events module (public.events) never appeared
-- on the public Community Calendar -- the two modules have no other link.
-- Union in published/public events, shaped to match the calendar_items
-- columns, tagged item_type 'chatter_event' and category 'chatter_events'
-- so the existing type badge and category filter keep working unchanged.
create or replace view public.public_calendar_items as
select
  id,
  title,
  item_type,
  starts_at,
  ends_at,
  time_zone,
  summary,
  (
    select array_agg(c.category)
    from public.calendar_item_categories c
    where c.item_id = calendar_items.id
  ) as categories,
  public_url
from public.calendar_items
where visibility = 'public' and calendar_status in ('active', 'complete')
union all
select
  id,
  name as title,
  'chatter_event' as item_type,
  starts_at,
  ends_at,
  timezone as time_zone,
  description as summary,
  array['chatter_events']::text[] as categories,
  ('/events/' || id::text) as public_url
from public.events
where visibility = 'public' and status = 'published';
