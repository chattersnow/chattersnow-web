-- Issue #136: event_registrations has granted `insert` to authenticated
-- since 20260823090000, but never defined an insert RLS policy for it - so
-- with RLS enabled, that grant was inert and every write went through
-- register_for_event() by design. Check-in is the first feature that needs
-- staff to write to this table directly: checking in a pre-registered row,
-- and inserting a new row for a walk-in. Neither needs the RPC's
-- capacity/deadline validation (a walk-in has already shown up), so plain
-- CRUD gated by events:manage - same pattern as event_sponsors/
-- event_volunteers - is used instead of a new RPC.

grant update on public.event_registrations to authenticated;

create policy "event_registrations insert" on public.event_registrations for insert to authenticated
  with check (public.has_permission('events', 'manage'));
create policy "event_registrations update" on public.event_registrations for update to authenticated
  using (public.has_permission('events', 'manage')) with check (public.has_permission('events', 'manage'));
