-- Two pairs of redundant fields on `events`, collapsed.
--
-- `venue` (20260822010000) and `location` (20260819010000) described the same
-- thing twice, and every reader already treated them as one: both public event
-- surfaces rendered `venue ?? location`. `location` survives as the single
-- place field. `venue` fills it only where `location` is blank -- where a row
-- recorded both, `location` is the more complete value and `venue` is dropped.
update public.events
set location = venue
where nullif(trim(location), '') is null
  and nullif(trim(venue), '') is not null;

-- public_events selects both columns, so it has to go first -- and create or
-- replace view cannot drop output columns anyway, so it is rebuilt below
-- rather than replaced. Nothing else in the schema selects from it, so the
-- drop is safe.
drop view public.public_events;

-- `event_type` was unconstrained text backed by a UI-only vocabulary
-- (src/lib/event-types.ts, deleted with this change). Now that an event can
-- carry several programs (20260905000000), the programs are the
-- categorisation, so the column and its curated list both go. There is no
-- type -> program mapping, so existing values are not preserved anywhere.
alter table public.events
  drop column venue,
  drop column event_type;

create view public.public_events as
select
  id,
  name,
  location,
  starts_at,
  ends_at,
  timezone,
  description,
  capacity,
  registration_enabled,
  registration_deadline,
  flier_url
from public.events
where visibility = 'public' and status = 'published';

grant select on public.public_events to anon, authenticated;

-- The public event pages showed the event type as the eyebrow above the title;
-- they now show program names. `programs` itself is authenticated-only and
-- permission-gated, so this curated view is the only thing anon may read from
-- it -- name only, and only for events that are already public and published.
-- Status, description and every audit column stay behind the RLS policy on the
-- base table. Same shape as public_event_sponsors (20260826110000).
create view public.public_event_programs as
select
  ep.event_id,
  p.id as program_id,
  p.name
from public.event_programs ep
join public.programs p on p.id = ep.program_id
join public.events e on e.id = ep.event_id
where e.visibility = 'public'
  and e.status = 'published';

grant select on public.public_event_programs to anon, authenticated;
