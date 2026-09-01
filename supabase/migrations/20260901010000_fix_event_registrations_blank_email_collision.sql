-- Bug: createWalkInCheckInAction and addRegistrantAction fall back to
-- email = '' when the picked person has no email on file. Two different
-- people with no email registered to the same event both collided on
-- event_registrations_event_email_key (event_id, lower(email)), throwing a
-- duplicate-registration error for what looked like the *previous*
-- selection but was actually a second, unrelated person.
--
-- Scope the email uniqueness check to non-blank emails (blank email carries
-- no real identity to dedupe on), and add the uniqueness staff paths
-- actually rely on - one registration per known person per event - as its
-- own partial index. Every insert path (register_for_event RPC, walk-in
-- check-in, add-registrant) already sets person_id, so this is a strict
-- improvement, not a relaxation: registrations with a real email are still
-- deduped by email, and now every registration with a known person is also
-- deduped by person, regardless of email.

drop index public.event_registrations_event_email_key;

create unique index event_registrations_event_email_key
  on public.event_registrations (event_id, lower(email))
  where email <> '';

create unique index event_registrations_event_person_key
  on public.event_registrations (event_id, person_id)
  where person_id is not null;
