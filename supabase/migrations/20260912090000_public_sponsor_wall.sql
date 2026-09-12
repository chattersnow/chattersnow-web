-- #914: a tenant-wide sponsor wall for /support/sponsorship.
--
-- `public_event_sponsors` (20260826110000) answers "who sponsored this event",
-- so a sponsor's logo leaves the public site the moment its event drops off
-- the upcoming list. A prospective sponsor landing on the sponsorship page saw
-- tiers and a CTA and no social proof at all.
--
-- This is the same join with `event_id` dropped and one row per sponsoring
-- person instead of one per sponsorship, so the wall is derived from what
-- staff already mark on an event's Sponsors tab rather than curated a second
-- time. Nothing new is written anywhere: `is_public` on the sponsorship is
-- still the only opt-in, and the event still has to be public and published.
--
-- Family A of #887: `event_sponsors`, `people` and `events` all say
-- `for select to authenticated` and the public website reads as `anon`, so the
-- tenant predicate lives in the view body. `people` is the donor directory --
-- the column list is name, logo_url and website and nothing else, exactly as
-- `public_event_sponsors` has it.
create or replace view public.public_sponsor_wall as
select distinct on (p.id)
  p.id as sponsor_id,
  p.name,
  p.logo_url,
  p.website
from public.event_sponsors es
join public.people p on p.id = es.person_id
join public.events e on e.id = es.event_id
where es.is_public = true
  and e.visibility = 'public'
  and e.status = 'published'
  and e.tenant_id = public.public_tenant_id()
-- One row per person: a sponsor who has backed five events belongs on the wall
-- once. The most recent sponsorship wins, so a logo or website updated on the
-- `people` row is what shows -- and the tie-break on `es.id` keeps the choice
-- stable across reads when two events start at the same moment.
order by p.id, e.starts_at desc nulls last, es.id;

comment on view public.public_sponsor_wall is
  'Every organization the resolved tenant has publicly credited as a sponsor, once each, for the sponsor wall on /support/sponsorship (#914). Security definer by design (#887), same reasoning and same column list as public_event_sponsors; isolation is e.tenant_id = public_tenant_id() plus es.is_public and the event''s visibility/status. Derived from event_sponsors rather than curated, so it stays correct as events age out.';

-- The view's own predicates run before any caller-supplied filter, as on every
-- other anon-facing view (20260911010000 section 3).
alter view public.public_sponsor_wall set (security_barrier = true);

grant select on public.public_sponsor_wall to anon, authenticated;
