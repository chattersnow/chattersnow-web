-- Filter items by which kinds of tag they carry (#1444).
--
-- has_tag (20261008120000) answered only "any tag or none". A tenant that
-- labels with reusable numbered codes needs more: an item intake gave a random
-- asset-tag code, because nothing was scanned for it, still needs a numbered
-- code, and "any tag" counts it as done. This returns the kinds instead, so the
-- items list can ask for "no numbered code" or "asset-tag code only".
--
-- A computed field for the same reason has_tag was: the view selects ii.*, so
-- a new column means a drop and recreate. It replaces has_tag, which the list
-- no longer reads -- `'{}'` is "no tag at all".
--
-- security invoker, so a reader sees only the tags RLS already lets them see.
create function public.tag_kinds(public.inventory_items_with_category)
returns text[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(distinct t.kind order by t.kind), '{}')
  from public.inventory_item_tags t
  where t.item_id = $1.id;
$$;

comment on function public.tag_kinds(public.inventory_items_with_category) is
  'Computed field on inventory_items_with_category: the distinct kinds of inventory_item_tags (asset_tag, barcode, nfc, numbered) on the item, sorted; empty when it has none. The items list''s Tag filter reads it.';

revoke execute on function public.tag_kinds(public.inventory_items_with_category) from public, anon;
grant execute on function public.tag_kinds(public.inventory_items_with_category) to authenticated;

drop function public.has_tag(public.inventory_items_with_category);
