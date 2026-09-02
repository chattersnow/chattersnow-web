-- Role-scoped RLS for the new event-workflow tables, per docs/technical-spec.md
-- §5.3. event_logistics and event_volunteers/event_volunteer_hours follow the
-- same shape as event_sponsors (admin/event_coordinator manage; finance and
-- volunteer view). event_incidents is restricted to admin/event_coordinator
-- only since incident detail is sensitive operational data.

create policy "event_logistics select" on public.event_logistics for select to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator')
      or public.has_role('finance') or public.has_role('volunteer'));
create policy "event_logistics insert" on public.event_logistics for insert to authenticated
  with check (public.has_role('admin') or public.has_role('event_coordinator'));
create policy "event_logistics update" on public.event_logistics for update to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator'))
  with check (public.has_role('admin') or public.has_role('event_coordinator'));
create policy "event_logistics delete" on public.event_logistics for delete to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator'));

create policy "event_volunteers select" on public.event_volunteers for select to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator')
      or public.has_role('finance') or public.has_role('volunteer'));
create policy "event_volunteers insert" on public.event_volunteers for insert to authenticated
  with check (public.has_role('admin') or public.has_role('event_coordinator'));
create policy "event_volunteers update" on public.event_volunteers for update to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator'))
  with check (public.has_role('admin') or public.has_role('event_coordinator'));
create policy "event_volunteers delete" on public.event_volunteers for delete to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator'));

-- volunteer may log their own hours (insert) per the §5.3 matrix ("log own"),
-- but only admin/event_coordinator can manage (update/delete) any entry —
-- there's no auth-user-to-people link yet to scope "own" more precisely
-- (same open gap noted in §5.17).
create policy "event_volunteer_hours select" on public.event_volunteer_hours for select to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator')
      or public.has_role('finance') or public.has_role('volunteer'));
create policy "event_volunteer_hours insert" on public.event_volunteer_hours for insert to authenticated
  with check (public.has_role('admin') or public.has_role('event_coordinator') or public.has_role('volunteer'));
create policy "event_volunteer_hours update" on public.event_volunteer_hours for update to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator'))
  with check (public.has_role('admin') or public.has_role('event_coordinator'));
create policy "event_volunteer_hours delete" on public.event_volunteer_hours for delete to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator'));

create policy "event_incidents select" on public.event_incidents for select to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator'));
create policy "event_incidents insert" on public.event_incidents for insert to authenticated
  with check (public.has_role('admin') or public.has_role('event_coordinator'));
create policy "event_incidents update" on public.event_incidents for update to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator'))
  with check (public.has_role('admin') or public.has_role('event_coordinator'));
create policy "event_incidents delete" on public.event_incidents for delete to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator'));
