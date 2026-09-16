-- #1122: create_donation_with_items accepted a blank item description.
--
-- parseDonationInput (src/app/portal/(app)/home/donation-form.ts) rejects an
-- item whose description is empty or whitespace, so the portal never sends
-- one -- but nothing below the TypeScript stopped it. The #1082 Phase 0 spike
-- compared every case that parser rejects against what the RPC does with the
-- same input: unknown source type, unknown condition, unknown intended use and
-- an empty item array are all refused by the database too (check constraints on
-- `people` and `inventory_items`, and the RPC's own `At least one item is
-- required`). A blank description was the one case enforced in a single place.
--
-- It matters because `description` is what an item is identified by everywhere
-- it appears -- the gear library, the distribution picker, the donations list
-- -- so a blank one is a row nobody can act on. And the write path is reachable
-- on its own: create_donation_with_items is `security definer`, granted to
-- `authenticated`, and #1082 Phase 1 made the same write callable with an
-- already-authenticated client from outside this app.
--
-- Not a tenant-scoped migration: this constrains a platform column and repairs
-- rows wherever they are, so it deliberately does not name a tenant
-- (docs/tenants.md, "Writing migrations on a multi-tenant database" -- that
-- rule is about seed *inserts* into tenant tables, which this is not).

-- Existing rows first: the constraint fails on them otherwise. Keep the item
-- rather than delete it -- it is a real donated asset with movements, and
-- possibly a distribution, hanging off it. Fall back to whatever else names it:
-- the free-text `type` the intake form collected before categories (#667), then
-- the category's own label, then a placeholder that at least reads as an item
-- somebody has to go and look at.
update public.inventory_items i
set description = coalesce(
      nullif(btrim(i.type), ''),
      (
        select nullif(btrim(c.label), '')
        from public.inventory_categories c
        where c.id = i.category_id
      ),
      'Untitled item'
    )
where length(btrim(i.description)) = 0;

alter table public.inventory_items
  add constraint inventory_items_description_not_blank
  check (length(btrim(description)) > 0);

comment on constraint inventory_items_description_not_blank on public.inventory_items is
  'An item must be identifiable. The app parser already refuses a blank description; this refuses it for callers that reach create_donation_with_items or the table directly (#1122).';
