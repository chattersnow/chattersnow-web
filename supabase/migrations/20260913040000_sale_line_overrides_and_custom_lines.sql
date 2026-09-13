-- #1015: a line's price may be overridden, and a sale may carry an item that is
-- not in the catalog at all (§5.22) -- part 1 of 2, the table.
--
-- Until now every line of a sale was a catalog line: `product_variant_id` was
-- mandatory, and `unit_price` was whatever `product_variants.price` said at the
-- moment of sale. Two things a cashier does at a real merch table did not fit:
-- selling a damaged shirt at half price, and ringing up a donated one-off or a
-- coffee that was never a product.
--
-- The trust boundary moves; it does not disappear. `list_price` is the catalog
-- price the RPC looked up itself, snapshotted beside the price actually
-- charged, so "this line was overridden" stays *derived* (`unit_price <>
-- list_price`) rather than a flag a client could set. A custom line has no
-- catalog to look anything up in, so its `list_price` is null and its
-- `unit_price` and `description` come from the cashier -- validated by part 2
-- (20260913050000), which is still the only thing that may write this table.
--
-- **`void_product_sale` needs no change**, which is worth stating because it
-- looks like it should. Its lock is `v.id in (select li.product_variant_id
-- ...)`: a null in that subquery makes the predicate null rather than true, so
-- a custom line never matches a variant. Its stock restore is an inner join on
-- `v.id = li.product_variant_id`, so null lines fall out on their own. A void
-- of a mixed sale therefore returns exactly the catalog units and moves nothing
-- for the custom ones, which is correct: a custom line never took stock.
--
-- Nothing here touches a policy or a grant, so the two self-checks at the end
-- of 20260911040000 -- every sales policy names `tenant_id`, and this table
-- carries select and nothing else -- still hold. `sale_line_items` is in
-- `audited_tables` with nothing redacted, so `list_price` joins the audit
-- snapshot on its own; it is money, not personal data.

-- A custom line has no variant. The composite foreign key to
-- `product_variants` and its `on delete restrict` stay exactly as they were:
-- a foreign key is MATCH SIMPLE by default, so a row with a null
-- `product_variant_id` is simply not checked against it, while every catalog
-- line still is.
alter table public.sale_line_items
  alter column product_variant_id drop not null;

-- `unique (sale_id, product_variant_id)` is deliberately left alone, and the
-- design relies on what it now means: Postgres treats nulls as distinct in a
-- unique constraint, so one sale may hold any number of custom lines while
-- still holding at most one line per variant. That one-line-per-variant rule is
-- what keeps the void restore a one-row-per-variant join.
comment on constraint sale_line_items_sale_id_product_variant_id_key
  on public.sale_line_items is
  'One line per variant per sale. Custom lines (#1015) have a null product_variant_id, which a unique constraint treats as distinct, so a sale may hold many of them.';

alter table public.sale_line_items
  add column list_price numeric(10,2) check (list_price >= 0);

-- Every row that exists was priced from the catalog, so its charged price was
-- its list price. Done before the constraint below so the backfill cannot be
-- refused by it.
update public.sale_line_items set list_price = unit_price;

alter table public.sale_line_items
  add constraint sale_line_items_custom_lines_have_no_list_price
    check (product_variant_id is not null or list_price is null);

-- Only custom lines are capped, because only their text comes from a client. A
-- catalog line's description is `products.name || ' — ' || product_variants.label`
-- and neither column carries a length limit, so a blanket cap here would
-- invent one for the catalog -- and could refuse a legitimate sale of a
-- long-named product. What the cap is actually for is stopping a cashier from
-- typing a paragraph onto a receipt.
alter table public.sale_line_items
  add constraint sale_line_items_custom_description_length
    check (
      product_variant_id is not null
      or char_length(btrim(description)) <= 120
    );

comment on column public.sale_line_items.product_variant_id is
  'The variant sold, or null for a custom line rung up at the register (#1015). A custom line moves no stock and is skipped by void_product_sale''s restore.';

comment on column public.sale_line_items.list_price is
  'The catalog price at the moment of sale, snapshotted beside the price charged (#1015). Null for a custom line. unit_price <> list_price is what "the cashier overrode this line" means; there is no flag.';

comment on column public.sale_line_items.unit_price is
  'What was actually charged per unit: the catalog price by default, or the cashier''s override (#1015). A snapshot either way -- a reprice next season must not rewrite a past receipt.';
