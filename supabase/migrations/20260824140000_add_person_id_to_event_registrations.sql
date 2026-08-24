-- Links event_registrations to people (issue #135), so a registrant's info
-- can be found/reused elsewhere (check-in, donations/distribution via the
-- existing PersonPicker) instead of living only as raw text on this table.

alter table public.event_registrations
  add column person_id uuid references public.people(id);

-- Best-effort backfill: match existing registrations to people by
-- normalized email. Unmatched rows stay null. Picks the earliest-created
-- person on an email collision, same tie-break as resolve_current_person_id
-- (20260823140000).
update public.event_registrations er
set person_id = (
  select p.id from public.people p
  where lower(p.email) = lower(er.email)
  order by p.created_at asc
  limit 1
)
where er.person_id is null;
