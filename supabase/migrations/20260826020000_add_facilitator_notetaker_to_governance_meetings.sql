-- Adds facilitator/notetaker to governance meetings (issue #166), matching
-- the standard board meeting agenda template's header fields. References
-- people (like governance_meeting_action_items.owner_person_id) rather than
-- free text, so meeting roles stay consistent with how action item owners
-- are recorded.

alter table public.governance_meetings
  add column facilitator_person_id uuid references public.people(id),
  add column notetaker_person_id uuid references public.people(id);
