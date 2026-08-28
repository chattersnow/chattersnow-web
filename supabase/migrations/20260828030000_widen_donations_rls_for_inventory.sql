-- Issue #351: the Inventory Donations page (src/app/portal/(app)/inventory/
-- donations) gates its route on inventory:view OR inventory_intake:manage
-- (layout.tsx), matching how inventory_items/inventory_movements select
-- already treats those levels. But donations select was still finance:view
-- only (20260822100000), so a volunteer (inventory_intake:manage only, no
-- finance access) could reach the page and even insert a donation via that
-- carve-out, yet could never read donations back -- the page would always
-- render empty/denied for them. Widen select to also admit inventory:manage
-- and inventory_intake:manage, matching the route gate.
--
-- Update was finance:manage only, which also excludes inventory managers
-- (admin aside, who already has finance:manage) from editing a donation
-- record from the Inventory Donations page. Widen to also admit
-- inventory:manage -- not inventory_intake:manage, since that carve-out is
-- for recording new intake, not revising existing records (mirrors how
-- inventory_movements keeps update at inventory:manage only, above its
-- broader insert carve-out).
--
-- insert/delete are unchanged.

drop policy "donations select" on public.donations;
drop policy "donations update" on public.donations;

create policy "donations select" on public.donations for select to authenticated
  using (
    public.has_permission('finance', 'view')
    or public.has_permission('inventory', 'manage')
    or public.has_permission('inventory_intake', 'manage')
  );

create policy "donations update" on public.donations for update to authenticated
  using (public.has_permission('finance', 'manage') or public.has_permission('inventory', 'manage'))
  with check (public.has_permission('finance', 'manage') or public.has_permission('inventory', 'manage'));
