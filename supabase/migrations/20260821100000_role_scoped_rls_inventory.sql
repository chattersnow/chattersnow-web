-- Replace the blanket "authenticated full access" policy on people,
-- donations, and inventory with role-scoped policies matching the
-- entitlement matrix in docs/technical-spec.md §5.3.
--
-- people: admin manages the directory; event_coordinator/finance view it;
-- event_coordinator and volunteer also get insert-only access so their
-- sanctioned embedded workflows (sponsor inline-create, donation-intake
-- donor creation) keep working without granting them the People directory's
-- edit/delete UI.
--
-- donations/inventory_items/inventory_movements: admin manages; finance
-- views (reconciliation / valuation reports); volunteer gets insert (and,
-- for inventory_items, update — the distribution RPC flips item status) to
-- cover "add donations + edit distribution" without granting Inventory
-- reports or general item management.

drop policy "authenticated full access" on public.people;
drop policy "authenticated full access" on public.donations;
drop policy "authenticated full access" on public.inventory_items;
drop policy "authenticated full access" on public.inventory_movements;

create policy "people select" on public.people for select to authenticated
  using (public.has_role('admin') or public.has_role('event_coordinator') or public.has_role('finance'));
create policy "people insert" on public.people for insert to authenticated
  with check (public.has_role('admin') or public.has_role('event_coordinator') or public.has_role('volunteer'));
create policy "people update" on public.people for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "people delete" on public.people for delete to authenticated
  using (public.has_role('admin'));

create policy "donations select" on public.donations for select to authenticated
  using (public.has_role('admin') or public.has_role('finance'));
create policy "donations insert" on public.donations for insert to authenticated
  with check (public.has_role('admin') or public.has_role('finance') or public.has_role('volunteer'));
create policy "donations update" on public.donations for update to authenticated
  using (public.has_role('admin') or public.has_role('finance'))
  with check (public.has_role('admin') or public.has_role('finance'));
create policy "donations delete" on public.donations for delete to authenticated
  using (public.has_role('admin'));

create policy "inventory_items select" on public.inventory_items for select to authenticated
  using (public.has_role('admin') or public.has_role('finance'));
create policy "inventory_items insert" on public.inventory_items for insert to authenticated
  with check (public.has_role('admin') or public.has_role('volunteer'));
create policy "inventory_items update" on public.inventory_items for update to authenticated
  using (public.has_role('admin') or public.has_role('volunteer'))
  with check (public.has_role('admin') or public.has_role('volunteer'));
create policy "inventory_items delete" on public.inventory_items for delete to authenticated
  using (public.has_role('admin'));

create policy "inventory_movements select" on public.inventory_movements for select to authenticated
  using (public.has_role('admin') or public.has_role('finance'));
create policy "inventory_movements insert" on public.inventory_movements for insert to authenticated
  with check (public.has_role('admin') or public.has_role('volunteer'));
create policy "inventory_movements update" on public.inventory_movements for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "inventory_movements delete" on public.inventory_movements for delete to authenticated
  using (public.has_role('admin'));
