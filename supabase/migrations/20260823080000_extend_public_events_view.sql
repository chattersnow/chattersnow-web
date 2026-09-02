-- Extend public_events (20260821070000) with the columns the new public
-- event detail/registration page needs (issue #25). CREATE OR REPLACE VIEW
-- can append new output columns without dropping the view, as long as
-- existing columns keep their position/type.

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
  registration_deadline
from public.events
where visibility = 'public' and status = 'published';
