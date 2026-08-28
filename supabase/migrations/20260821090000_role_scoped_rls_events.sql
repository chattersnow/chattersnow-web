-- Replace the blanket "authenticated full access" policy on the events
-- cluster with role-scoped policies matching the entitlement matrix in
-- docs/technical-spec.md §5.3: admin/event_coordinator manage; finance and
-- volunteer view (volunteer view covers events, sponsors, raffle, attendance
-- per the matrix); board has no access to this cluster.

drop policy "authenticated full access" on public.events;
drop policy "authenticated full access" on public.event_sponsors;
drop policy "authenticated full access" on public.raffles;
drop policy "authenticated full access" on public.raffle_prizes;
drop policy "authenticated full access" on public.raffle_winners;
drop policy "authenticated full access" on public.event_expenses;

create policy "events select" on public.events for select to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator')
      or public.has_role('finance') or public.has_role('volunteer'));
create policy "events insert" on public.events for insert to authenticated
  with check (public.has_role('admin') or public.has_role('event_coordinator'));
create policy "events update" on public.events for update to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator'))
  with check (public.has_role('admin') or public.has_role('event_coordinator'));
create policy "events delete" on public.events for delete to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator'));

create policy "event_sponsors select" on public.event_sponsors for select to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator')
      or public.has_role('finance') or public.has_role('volunteer'));
create policy "event_sponsors insert" on public.event_sponsors for insert to authenticated
  with check (public.has_role('admin') or public.has_role('event_coordinator'));
create policy "event_sponsors update" on public.event_sponsors for update to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator'))
  with check (public.has_role('admin') or public.has_role('event_coordinator'));
create policy "event_sponsors delete" on public.event_sponsors for delete to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator'));

create policy "raffles select" on public.raffles for select to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator')
      or public.has_role('finance') or public.has_role('volunteer'));
create policy "raffles insert" on public.raffles for insert to authenticated
  with check (public.has_role('admin') or public.has_role('event_coordinator'));
create policy "raffles update" on public.raffles for update to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator'))
  with check (public.has_role('admin') or public.has_role('event_coordinator'));
create policy "raffles delete" on public.raffles for delete to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator'));

create policy "raffle_prizes select" on public.raffle_prizes for select to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator')
      or public.has_role('finance') or public.has_role('volunteer'));
create policy "raffle_prizes insert" on public.raffle_prizes for insert to authenticated
  with check (public.has_role('admin') or public.has_role('event_coordinator'));
create policy "raffle_prizes update" on public.raffle_prizes for update to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator'))
  with check (public.has_role('admin') or public.has_role('event_coordinator'));
create policy "raffle_prizes delete" on public.raffle_prizes for delete to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator'));

create policy "raffle_winners select" on public.raffle_winners for select to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator')
      or public.has_role('finance') or public.has_role('volunteer'));
create policy "raffle_winners insert" on public.raffle_winners for insert to authenticated
  with check (public.has_role('admin') or public.has_role('event_coordinator'));
create policy "raffle_winners update" on public.raffle_winners for update to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator'))
  with check (public.has_role('admin') or public.has_role('event_coordinator'));
create policy "raffle_winners delete" on public.raffle_winners for delete to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator'));

-- event_expenses backs two matrix rows against the same table: "Events —
-- event-level expenses" (admin/event_coordinator manage, finance view) and
-- "Finance — donations, expenses, reimbursements, reports" (admin/finance
-- manage). finance's overall capability is the union: manage. board and
-- volunteer have no access either way.
create policy "event_expenses select" on public.event_expenses for select to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator') or public.has_role('finance'));
create policy "event_expenses insert" on public.event_expenses for insert to authenticated
  with check (public.has_role('admin') or public.has_role('event_coordinator') or public.has_role('finance'));
create policy "event_expenses update" on public.event_expenses for update to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator') or public.has_role('finance'))
  with check (public.has_role('admin') or public.has_role('event_coordinator') or public.has_role('finance'));
create policy "event_expenses delete" on public.event_expenses for delete to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator') or public.has_role('finance'));
