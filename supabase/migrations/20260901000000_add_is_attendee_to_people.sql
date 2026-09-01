-- Event registrants/check-ins already land in `people` via
-- resolve_or_create_person_by_email (register_for_event RPC) and the portal
-- walk-in check-in flow, but no role flag is ever set for them the way
-- is_donor/is_sponsor are for the donation/donor paths. That leaves them
-- with every role flag false, so they get no "Attendee" tag in the People
-- Roles column and can't be filtered to on the People/Attendees pages.
--
-- Attendance isn't known at person-creation time the way donor/sponsor
-- status is (resolve_or_create_person_by_email has no event context), and a
-- pre-existing person (e.g. a donor) can later register for an event, so
-- this is set via an AFTER INSERT trigger on event_registrations rather than
-- inline in resolve_or_create_person_by_email. Every event_registrations row
-- gets its person_id at insert time (both register_for_event and the portal
-- walk-in check-in path), so no UPDATE trigger is needed.

alter table public.people
  add column is_attendee boolean not null default false;

update public.people
set is_attendee = true
where id in (select person_id from public.event_registrations where person_id is not null);

-- security definer so this still works when the triggering insert comes
-- from the anon-callable register_for_event RPC, whose caller has no direct
-- update grant on people (same reasoning as audit_log_row, 20260822120000).
create or replace function public.set_person_is_attendee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.person_id is not null then
    update public.people set is_attendee = true where id = NEW.person_id and not is_attendee;
  end if;
  return NEW;
end;
$$;

create trigger set_person_is_attendee after insert on public.event_registrations
  for each row execute function public.set_person_is_attendee();
