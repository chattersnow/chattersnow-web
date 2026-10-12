-- Issue #1572: an event's Donations card lists the in-kind items donated at
-- it, which is inventory as much as it is finance. The card and
-- listEventDonationsAction were finance:view only, so an event coordinator
-- given the inventory side of an event saw Distributions (stock going out)
-- but not the donations that supplied it, and a tenant without the Finance
-- module lost the card entirely.
--
-- The card now accepts the same inventory checks as the Distributions card
-- beside it -- inventory:manage or inventory_reports:view -- alongside
-- finance:view. Its query embeds inventory_items in donations, so both tables
-- have to admit the reader:
--
-- - inventory_items select already admits inventory:manage and
--   inventory_reports:view (20260822100000); unchanged.
-- - donations select admits finance:view, inventory:manage and
--   inventory_intake:manage (20260828030000) but not inventory_reports:view.
--   Widen it to that one more level. A donations row carries no amount --
--   monetary gifts live in monetary_donations, which stays behind finance --
--   so this adds nothing a finance grant was protecting.
--
-- The donor's name is embedded from people, whose policy is unchanged: a
-- reader without people access sees the item and not who gave it.
--
-- Recreated with the tenant predicate in front, as 20260906070000 left every
-- policy on a tenant table.

drop policy "donations select" on public.donations;

create policy "donations select" on public.donations for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (
      public.has_permission('finance', 'view')
      or public.has_permission('inventory', 'manage')
      or public.has_permission('inventory_intake', 'manage')
      or public.has_permission('inventory_reports', 'view')
    )
  );
