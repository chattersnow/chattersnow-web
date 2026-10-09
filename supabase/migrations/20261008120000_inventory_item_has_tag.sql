-- Find the items that have no tag (#1420, #1444).
--
-- Intake gives every new item an asset-tag code, but an item entered before
-- tags existed, or one whose code was never printed and stuck on, has nothing
-- a scanner can find. The items list filters on this to show them.
--
-- A computed field rather than a view column: the view selects ii.*, expanded
-- when it was created, so a new column means a drop and recreate. PostgREST
-- exposes a function that takes the view's row type as a column it can filter
-- on, without touching the view.
--
-- Any tag counts -- asset tag, numbered code, barcode or NFC serial -- since
-- each one identifies the item when scanned. security invoker, so a reader
-- sees only the tags RLS already lets them see.
create function public.has_tag(public.inventory_items_with_category)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.inventory_item_tags t
    where t.item_id = $1.id
  );
$$;

comment on function public.has_tag(public.inventory_items_with_category) is
  'Computed field on inventory_items_with_category: whether any inventory_item_tags row (asset tag, numbered code, barcode or NFC) points at the item. The items list filters on it to find untagged items.';

revoke execute on function public.has_tag(public.inventory_items_with_category) from public, anon;
grant execute on function public.has_tag(public.inventory_items_with_category) to authenticated;
