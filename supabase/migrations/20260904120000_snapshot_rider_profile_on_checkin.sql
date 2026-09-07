-- Issue #653: freeze the rider level onto the registration at check-in.
--
-- The Impact card's "Beginner participants" figure (#651/#652) reads
-- people.ski_experience_level / people.snowboard_experience_level live through
-- event_registrations.person_id. The rider profile is a point-in-time person
-- attribute, not an event fact: somebody who was a beginner in December is not
-- a beginner in March, so a past event's figure drifts under a grant report
-- every time that person edits their profile.
--
-- These columns record who the attendee was on the day. They are written by a
-- trigger rather than by the check-in server actions because check-in happens
-- from two RLS-scoped call sites (checkInRegistrantAction and
-- createWalkInCheckInAction) run by a role that holds events:manage but not
-- necessarily people:view -- a read-then-write in the action would silently
-- snapshot nothing for exactly the door role. The trigger runs as the table
-- owner and covers every current and future check-in path.
--
-- preferred_mountain is deliberately not snapshotted: it feeds no metric.

alter table public.event_registrations
  add column riding_discipline_at_event text
    check (riding_discipline_at_event in ('ski', 'snowboard', 'both')),
  add column ski_experience_level_at_event text
    check (ski_experience_level_at_event in ('beginner', 'intermediate', 'advanced')),
  add column snowboard_experience_level_at_event text
    check (snowboard_experience_level_at_event in ('beginner', 'intermediate', 'advanced'));

comment on column public.event_registrations.riding_discipline_at_event is
  'people.riding_discipline as it stood when this registrant was checked in. Null means no profile was on file then; impact metrics fall back to the live people row.';

-- Fires on the checked_in_at null -> not-null transition, and on an insert that
-- already carries checked_in_at (the walk-in path). A person with no profile
-- leaves the columns alone rather than stamping nulls, so a profile entered
-- after the fact still counts through the coalesce in the impact RPCs.
create function public.snapshot_rider_profile_on_checkin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_discipline text;
  v_ski text;
  v_snowboard text;
begin
  if new.person_id is null or new.checked_in_at is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.checked_in_at is not null then
    return new;
  end if;

  select riding_discipline, ski_experience_level, snowboard_experience_level
    into v_discipline, v_ski, v_snowboard
  from public.people
  where id = new.person_id;

  if v_discipline is null then
    return new;
  end if;

  new.riding_discipline_at_event := v_discipline;
  new.ski_experience_level_at_event := v_ski;
  new.snowboard_experience_level_at_event := v_snowboard;

  return new;
end;
$$;

create trigger snapshot_rider_profile_on_checkin
  before insert or update of checked_in_at on public.event_registrations
  for each row
  execute function public.snapshot_rider_profile_on_checkin();

-- Backfill history with the best value available today. Registrations checked
-- in before this migration have no record of the level at the time, so the
-- person's current profile is the closest honest approximation -- and it stops
-- drifting from here on.
update public.event_registrations r
set riding_discipline_at_event = p.riding_discipline,
    ski_experience_level_at_event = p.ski_experience_level,
    snowboard_experience_level_at_event = p.snowboard_experience_level
from public.people p
where p.id = r.person_id
  and r.checked_in_at is not null
  and r.riding_discipline_at_event is null
  and p.riding_discipline is not null;
