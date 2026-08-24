-- Add an optional outbound link for public calendar items (issue #105).
-- With no per-item detail page on the public site, this is the only way a
-- viewer gets from a calendar entry to more information (registration,
-- partner site, campaign page, etc).
alter table public.calendar_items add column public_url text;

-- Append it as the last column of public_calendar_items, mirroring the
-- append-only precedent in 20260823080000_extend_public_events_view.sql.
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
where visibility = 'public' and calendar_status in ('active', 'complete');
