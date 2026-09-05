-- Signups still record their role as free text, so the same job accumulates as
-- "Setup crew" / "Setup Crew" / "setup" across events and can never be rolled
-- up. 20260827040000 gave event_shifts an FK to the volunteer_role_types
-- catalog for exactly this reason; this does the same for the signups that
-- aren't tied to a shift, so the event editor can offer a picker instead of a
-- text box.
--
-- `role` is kept, not dropped: existing rows carry text that has no catalog
-- entry to map onto, and the display rule (shift's role type, else the
-- signup's own, else the free text -- see src/lib/volunteer-roles.ts) still
-- reads it. New writes go to the FK.
alter table public.event_volunteers
  add column volunteer_role_type_id uuid references public.volunteer_role_types(id) on delete set null;
