-- A registration deadline only means something while registration is open,
-- and registration can't stay open past the event itself. Events without an
-- end time are bounded by their start instead.

-- Backfill so existing rows satisfy the constraints below.
update public.events
   set registration_deadline = null
 where registration_enabled = false
   and registration_deadline is not null;

update public.events
   set registration_deadline = coalesce(ends_at, starts_at)
 where registration_deadline is not null
   and registration_deadline > coalesce(ends_at, starts_at);

alter table public.events
  add constraint events_registration_deadline_within_event
  check (
    registration_deadline is null
    or registration_deadline <= coalesce(ends_at, starts_at)
  );

alter table public.events
  add constraint events_registration_deadline_requires_registration
  check (registration_enabled or registration_deadline is null);
