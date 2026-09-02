-- Extend public_events (20260823080000) with flier_url so the public event
-- list/detail pages can render an event's flier (issue #168). CREATE OR
-- REPLACE VIEW can append new output columns without dropping the view, as
-- long as existing columns keep their position/type.

create or replace view public.public_events as
select
  id,
  name,
  location,
  starts_at,
  ends_at,
  timezone,
  description,
  event_type,
  venue,
  capacity,
  registration_enabled,
  registration_deadline,
  flier_url
from public.events
where visibility = 'public' and status = 'published';
